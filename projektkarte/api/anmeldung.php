<?php
/**
 * Anmeldung am Adminbereich.
 *
 * Ein Kennwort für alle - wie bisher, nur liegt es jetzt als Hash in der
 * Datenbank und wird auf dem Server geprüft, nicht mehr im Browser. Die
 * Sitzung läuft über ein HttpOnly-Cookie; schreibende Aufrufe brauchen
 * zusätzlich den Sitzungsschlüssel im Kopf X-Sitzungsschluessel, damit eine
 * fremde Seite nicht im Namen eines angemeldeten Browsers schreiben kann.
 */

declare(strict_types=1);

const VERSUCHE_MAX = 10;          // Fehlversuche je Adresse
const VERSUCHE_FENSTER = 900;     // in diesem Zeitraum (Sekunden)

function sitzungStarten(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => basispfad(),
        'secure'   => istHttps(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_name('projektkarte');
    session_start();
}

/** Der Pfad, unter dem die Anwendung liegt - damit das Cookie auch in Unterordnern gilt. */
function basispfad(): string
{
    $skript = $_SERVER['SCRIPT_NAME'] ?? '/api/index.php';
    $pfad = rtrim(str_replace('\\', '/', dirname(dirname($skript))), '/');
    return $pfad === '' ? '/' : $pfad . '/';
}

function istHttps(): bool
{
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        return true;
    }
    return ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
}

function istAngemeldet(): bool
{
    sitzungStarten();
    return !empty($_SESSION['angemeldet']);
}

function sitzungsschluessel(): string
{
    sitzungStarten();
    if (empty($_SESSION['schluessel'])) {
        $_SESSION['schluessel'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['schluessel'];
}

function anmelden(string $kennwort): bool
{
    sitzungStarten();
    $hash = einstellung('kennwort');
    if ($hash === '' || !password_verify($kennwort, $hash)) {
        versuchMerken();
        return false;
    }
    // Hash bei Bedarf auf ein neueres Verfahren heben.
    if (password_needs_rehash($hash, PASSWORD_DEFAULT)) {
        einstellungSetzen('kennwort', password_hash($kennwort, PASSWORD_DEFAULT));
    }
    session_regenerate_id(true);
    $_SESSION['angemeldet'] = true;
    $_SESSION['schluessel'] = bin2hex(random_bytes(32));
    versucheLoeschen();
    return true;
}

function abmelden(): void
{
    sitzungStarten();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires'  => time() - 42000,
            'path'     => $p['path'],
            'secure'   => $p['secure'],
            'httponly' => $p['httponly'],
            'samesite' => $p['samesite'],
        ]);
    }
    session_destroy();
}

function kennwortSetzen(string $neu): void
{
    einstellungSetzen('kennwort', password_hash($neu, PASSWORD_DEFAULT));
    einstellungSetzen('kennwort_standard', '0');
}

/* ---- Bremse gegen das Durchprobieren von Kennwörtern ------------------- */

function adresse(): string
{
    return (string) ($_SERVER['REMOTE_ADDR'] ?? 'unbekannt');
}

function zuVieleVersuche(): bool
{
    $sql = db()->prepare('SELECT COUNT(*) FROM anmeldeversuche WHERE ip = ? AND zeit > ?');
    $sql->execute([adresse(), time() - VERSUCHE_FENSTER]);
    return (int) $sql->fetchColumn() >= VERSUCHE_MAX;
}

function versuchMerken(): void
{
    db()->prepare('DELETE FROM anmeldeversuche WHERE zeit < ?')
        ->execute([time() - VERSUCHE_FENSTER]);
    db()->prepare('INSERT INTO anmeldeversuche (ip, zeit) VALUES (?, ?)')
        ->execute([adresse(), time()]);
}

function versucheLoeschen(): void
{
    db()->prepare('DELETE FROM anmeldeversuche WHERE ip = ?')->execute([adresse()]);
}
