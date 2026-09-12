<?php
/**
 * REST-Schnittstelle der Projektkarte.
 *
 * Lesend ist alles offen - die Karte braucht keine Anmeldung. Alles, was
 * ändert, verlangt eine Sitzung aus dem Adminbereich.
 *
 *   GET    /api/standorte             alle Standorte mit Eckdaten und Bildliste
 *   GET    /api/standorte/{id}        ein Standort
 *   POST   /api/standorte             anlegen                        (Admin)
 *   PUT    /api/standorte/{id}        ändern                         (Admin)
 *   DELETE /api/standorte/{id}        löschen                        (Admin)
 *
 *   GET    /api/bilder/{id}           das Bild selbst (aus der Datenbank)
 *   POST   /api/bilder                hochladen, multipart           (Admin)
 *   PUT    /api/bilder/{id}           Unterschrift und Reihenfolge   (Admin)
 *   DELETE /api/bilder/{id}           löschen                        (Admin)
 *
 *   GET    /api/einstellungen         Titel, Ruhezeit, Kachelquelle
 *   PUT    /api/einstellungen         ändern                         (Admin)
 *
 *   GET    /api/sitzung               Status und Sitzungsschlüssel
 *   POST   /api/sitzung               anmelden
 *   DELETE /api/sitzung               abmelden
 *   PUT    /api/kennwort              Kennwort ändern                (Admin)
 *
 *   GET    /api/sicherung             alles als JSON, Bilder einbegriffen (Admin)
 *   POST   /api/sicherung             Sicherung einlesen             (Admin)
 */

declare(strict_types=1);

require __DIR__ . '/datenbank.php';
require __DIR__ . '/anmeldung.php';

const BILD_MAX = 8388608;   // 8 MB je Bild
const BILD_TYPEN = ['image/jpeg' => 'jpg', 'image/png' => 'png',
                    'image/webp' => 'webp', 'image/gif' => 'gif'];

/* ---- Antworten --------------------------------------------------------- */

function antwort(mixed $daten, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($daten, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fehler(string $text, int $status = 400): never
{
    antwort(['fehler' => $text], $status);
}

function koerper(): array
{
    $roh = file_get_contents('php://input');
    if ($roh === '' || $roh === false) {
        return [];
    }
    $daten = json_decode($roh, true);
    if (!is_array($daten)) {
        fehler('Der Inhalt der Anfrage ist kein gültiges JSON.');
    }
    return $daten;
}

/** Schreibende Aufrufe: angemeldet sein und den Sitzungsschlüssel mitschicken. */
function nurAdmin(): void
{
    if (!istAngemeldet()) {
        fehler('Nicht angemeldet.', 401);
    }
    $mitgeschickt = $_SERVER['HTTP_X_SITZUNGSSCHLUESSEL'] ?? '';
    if (!hash_equals(sitzungsschluessel(), (string) $mitgeschickt)) {
        fehler('Sitzungsschlüssel fehlt oder passt nicht. Bitte neu anmelden.', 403);
    }
}

/* ---- Standorte lesen --------------------------------------------------- */

function standortLesen(int $id): ?array
{
    $sql = db()->prepare('SELECT * FROM standorte WHERE id = ?');
    $sql->execute([$id]);
    $zeile = $sql->fetch();
    return $zeile === false ? null : standortAufbauen($zeile);
}

function standorteLesen(): array
{
    $zeilen = db()->query('SELECT * FROM standorte ORDER BY art, name COLLATE NOCASE')->fetchAll();
    return array_map('standortAufbauen', $zeilen);
}

function standortAufbauen(array $zeile): array
{
    $eckdaten = db()->prepare('
        SELECT bezeichnung, wert FROM eckdaten WHERE standort_id = ? ORDER BY position, id');
    $eckdaten->execute([$zeile['id']]);

    // Die Bilddaten selbst bleiben draußen - die holt der Browser einzeln.
    $bilder = db()->prepare('
        SELECT id, unterschrift, breite, hoehe FROM bilder
        WHERE standort_id = ? ORDER BY position, id');
    $bilder->execute([$zeile['id']]);

    return [
        'id'           => (int) $zeile['id'],
        'art'          => $zeile['art'],
        'name'         => $zeile['name'],
        'ort'          => $zeile['ort'],
        'lat'          => (float) $zeile['lat'],
        'lon'          => (float) $zeile['lon'],
        'beschreibung' => $zeile['beschreibung'],
        'titelbildId'  => $zeile['titelbild_id'] === null ? null : (int) $zeile['titelbild_id'],
        'eckdaten'     => $eckdaten->fetchAll(),
        'bilder'       => array_map(static fn ($b) => [
            'id'           => (int) $b['id'],
            'unterschrift' => $b['unterschrift'],
            'breite'       => (int) $b['breite'],
            'hoehe'        => (int) $b['hoehe'],
        ], $bilder->fetchAll()),
    ];
}

/* ---- Standorte schreiben ----------------------------------------------- */

function standortPruefen(array $d, bool $neu): array
{
    $art = (string) ($d['art'] ?? '');
    if (!in_array($art, ARTEN, true)) {
        fehler('Unbekannte Art. Erlaubt sind: ' . implode(', ', ARTEN) . '.');
    }
    $name = trim((string) ($d['name'] ?? ''));
    if ($name === '') {
        fehler('Ohne Namen geht es nicht.');
    }
    $lat = (float) ($d['lat'] ?? 0);
    $lon = (float) ($d['lon'] ?? 0);
    if ($lat < -85 || $lat > 85 || $lon < -180 || $lon > 180) {
        fehler('Die Koordinaten liegen außerhalb des Gültigen.');
    }
    return [
        'art'          => $art,
        'name'         => mb_substr($name, 0, 200),
        'ort'          => mb_substr(trim((string) ($d['ort'] ?? '')), 0, 200),
        'lat'          => $lat,
        'lon'          => $lon,
        'beschreibung' => (string) ($d['beschreibung'] ?? ''),
    ];
}

/** Eckdaten und Bildzuordnung werden bei jedem Speichern neu gesetzt. */
function unterlagenSchreiben(int $id, array $d): void
{
    db()->prepare('DELETE FROM eckdaten WHERE standort_id = ?')->execute([$id]);
    $einfuegen = db()->prepare('
        INSERT INTO eckdaten (standort_id, bezeichnung, wert, position) VALUES (?, ?, ?, ?)');
    foreach ((array) ($d['eckdaten'] ?? []) as $i => $eck) {
        $bezeichnung = mb_substr(trim((string) ($eck['bezeichnung'] ?? '')), 0, 120);
        $wert = mb_substr(trim((string) ($eck['wert'] ?? '')), 0, 400);
        if ($bezeichnung === '' && $wert === '') {
            continue;
        }
        $einfuegen->execute([$id, $bezeichnung, $wert, $i]);
    }

    // Bilder, die der Editor mitschickt, gehören ab jetzt zu diesem Standort.
    $bildIds = [];
    $zuordnen = db()->prepare('
        UPDATE bilder SET standort_id = ?, unterschrift = ?, position = ?
        WHERE id = ? AND (standort_id IS NULL OR standort_id = ?)');
    foreach ((array) ($d['bilder'] ?? []) as $i => $bild) {
        $bildId = (int) ($bild['id'] ?? 0);
        if ($bildId <= 0) {
            continue;
        }
        $zuordnen->execute([$id, mb_substr((string) ($bild['unterschrift'] ?? ''), 0, 300), $i, $bildId, $id]);
        $bildIds[] = $bildId;
    }

    // Bilder, die im Editor entfernt wurden, verschwinden auch aus der Datenbank.
    $behalten = $bildIds === [] ? '0' : implode(',', array_map('intval', $bildIds));
    db()->exec('DELETE FROM bilder WHERE standort_id = ' . $id . ' AND id NOT IN (' . $behalten . ')');

    $titelbild = isset($d['titelbildId']) ? (int) $d['titelbildId'] : 0;
    if ($titelbild > 0 && !in_array($titelbild, $bildIds, true)) {
        $titelbild = 0;   // zeigt auf ein Bild, das nicht (mehr) dazugehört
    }
    db()->prepare('UPDATE standorte SET titelbild_id = ? WHERE id = ?')
        ->execute([$titelbild > 0 ? $titelbild : null, $id]);
}

/* ---- Bilder ------------------------------------------------------------ */

function bildAusliefern(int $id): never
{
    $sql = db()->prepare('SELECT daten, typ, pruefsumme FROM bilder WHERE id = ?');
    $sql->execute([$id]);
    $bild = $sql->fetch();
    if ($bild === false) {
        fehler('Bild nicht gefunden.', 404);
    }

    $marke = '"' . $bild['pruefsumme'] . '"';
    header('Content-Type: ' . $bild['typ']);
    header('Cache-Control: public, max-age=31536000, immutable');
    header('ETag: ' . $marke);

    // Kennt der Browser das Bild schon, sparen wir uns die Übertragung.
    if (trim((string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $marke) {
        http_response_code(304);
        exit;
    }
    header('Content-Length: ' . strlen($bild['daten']));
    echo $bild['daten'];
    exit;
}

function bildSpeichern(string $rohdaten, string $unterschrift = '', ?int $standortId = null): array
{
    if (strlen($rohdaten) > BILD_MAX) {
        fehler('Das Bild ist größer als ' . (BILD_MAX / 1048576) . ' MB.', 413);
    }
    $masse = @getimagesizefromstring($rohdaten);
    if ($masse === false || !isset(BILD_TYPEN[$masse['mime']])) {
        fehler('Das ist keine Bilddatei in einem der Formate JPEG, PNG, WebP oder GIF.', 415);
    }

    $sql = db()->prepare('
        INSERT INTO bilder (standort_id, daten, typ, breite, hoehe, groesse, pruefsumme,
                            unterschrift, position, hochgeladen_am)
        VALUES (:standort, :daten, :typ, :breite, :hoehe, :groesse, :pruefsumme,
                :unterschrift, 0, :zeit)');
    $sql->bindValue(':standort', $standortId, $standortId === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
    $sql->bindValue(':daten', $rohdaten, PDO::PARAM_LOB);
    $sql->bindValue(':typ', $masse['mime']);
    $sql->bindValue(':breite', (int) $masse[0], PDO::PARAM_INT);
    $sql->bindValue(':hoehe', (int) $masse[1], PDO::PARAM_INT);
    $sql->bindValue(':groesse', strlen($rohdaten), PDO::PARAM_INT);
    $sql->bindValue(':pruefsumme', substr(hash('sha256', $rohdaten), 0, 32));
    $sql->bindValue(':unterschrift', mb_substr($unterschrift, 0, 300));
    $sql->bindValue(':zeit', gmdate('c'));
    $sql->execute();

    return [
        'id'     => (int) db()->lastInsertId(),
        'breite' => (int) $masse[0],
        'hoehe'  => (int) $masse[1],
        'typ'    => $masse['mime'],
    ];
}

/** Bilder, die beim Anlegen hochgeladen und dann nie gespeichert wurden. */
function verwaisteBilderAufraeumen(): void
{
    db()->prepare('DELETE FROM bilder WHERE standort_id IS NULL AND hochgeladen_am < ?')
        ->execute([gmdate('c', time() - 86400)]);
}

/* ---- Sicherung --------------------------------------------------------- */

function sicherungErzeugen(): array
{
    $standorte = [];
    foreach (standorteLesen() as $standort) {
        $bilder = db()->prepare('
            SELECT id, daten, typ, unterschrift FROM bilder
            WHERE standort_id = ? ORDER BY position, id');
        $bilder->execute([$standort['id']]);
        $standort['bilder'] = array_map(static fn ($b) => [
            'id'           => (int) $b['id'],
            'unterschrift' => $b['unterschrift'],
            'inhalt'       => 'data:' . $b['typ'] . ';base64,' . base64_encode($b['daten']),
        ], $bilder->fetchAll());
        $standorte[] = $standort;
    }

    return [
        'fassung'       => 2,
        'erzeugt_am'    => gmdate('c'),
        'einstellungen' => [
            'seitentitel'   => einstellung('seitentitel'),
            'ruheSekunden'  => (int) einstellung('ruhe_sekunden', '20'),
            'kachelQuelle'  => einstellung('kachel_quelle'),
        ],
        'standorte'     => $standorte,
    ];
}

/**
 * Liest sowohl die neue Sicherung als auch den Export der alten Fassung, die
 * noch im Browser gespeichert hat - damit vorhandene Einträge nicht verloren
 * gehen.
 */
function sicherungEinlesen(array $daten): int
{
    $standorte = [];

    if (isset($daten['standorte']) && is_array($daten['standorte'])) {
        $standorte = $daten['standorte'];
    } else {
        // Alte Fassung: getrennte Listen, Bilder als Data-URL unter "src".
        $listen = ['sitze' => 'sitz', 'projekte' => 'projekt', 'fernaufschaltungen' => 'fernaufschaltung'];
        foreach ($listen as $feld => $art) {
            foreach ((array) ($daten[$feld] ?? []) as $alt) {
                $standorte[] = [
                    'art'          => $art,
                    'name'         => $alt['name'] ?? '',
                    'ort'          => $alt['ort'] ?? '',
                    'lat'          => $alt['lat'] ?? 51.2,
                    'lon'          => $alt['lon'] ?? 10.4,
                    'beschreibung' => $alt['text'] ?? '',
                    'eckdaten'     => array_map(static fn ($f) => [
                        'bezeichnung' => $f['label'] ?? '',
                        'wert'        => $f['wert'] ?? '',
                    ], (array) ($alt['fakten'] ?? [])),
                    'titelbild'    => $alt['titelbild'] ?? '',
                    'bilder'       => array_map(static fn ($b) => [
                        'unterschrift' => $b['text'] ?? '',
                        'inhalt'       => $b['src'] ?? '',
                    ], (array) ($alt['bilder'] ?? [])),
                ];
            }
        }
    }

    db()->beginTransaction();
    try {
        db()->exec('DELETE FROM bilder');
        db()->exec('DELETE FROM eckdaten');
        db()->exec('DELETE FROM standorte');

        $jetzt = gmdate('c');
        $einfuegen = db()->prepare('
            INSERT INTO standorte (art, name, ort, lat, lon, beschreibung, erstellt_am, geaendert_am)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

        $anzahl = 0;
        foreach ($standorte as $s) {
            $art = in_array($s['art'] ?? '', ARTEN, true) ? $s['art'] : 'projekt';
            $name = trim((string) ($s['name'] ?? ''));
            if ($name === '') {
                continue;
            }
            $einfuegen->execute([$art, mb_substr($name, 0, 200),
                mb_substr((string) ($s['ort'] ?? ''), 0, 200),
                (float) ($s['lat'] ?? 51.2), (float) ($s['lon'] ?? 10.4),
                (string) ($s['beschreibung'] ?? ''), $jetzt, $jetzt]);
            $id = (int) db()->lastInsertId();
            $anzahl++;

            $eckdatum = db()->prepare('
                INSERT INTO eckdaten (standort_id, bezeichnung, wert, position) VALUES (?, ?, ?, ?)');
            foreach ((array) ($s['eckdaten'] ?? []) as $i => $eck) {
                $eckdatum->execute([$id, mb_substr((string) ($eck['bezeichnung'] ?? ''), 0, 120),
                    mb_substr((string) ($eck['wert'] ?? ''), 0, 400), $i]);
            }

            // Das Titelbild der alten Fassung steckte direkt im Eintrag.
            $titelbildId = null;
            $titel = (string) ($s['titelbild'] ?? '');
            if ($titel !== '' && ($roh = datenUrlLesen($titel)) !== null) {
                $titelbildId = bildSpeichern($roh, '', $id)['id'];
            }

            $position = 0;
            foreach ((array) ($s['bilder'] ?? []) as $bild) {
                $roh = datenUrlLesen((string) ($bild['inhalt'] ?? ''));
                if ($roh === null) {
                    continue;
                }
                $neu = bildSpeichern($roh, (string) ($bild['unterschrift'] ?? ''), $id);
                db()->prepare('UPDATE bilder SET position = ? WHERE id = ?')
                    ->execute([$position++, $neu['id']]);
                if ($titelbildId === null) {
                    $titelbildId = $neu['id'];
                }
            }
            if ($titelbildId !== null) {
                db()->prepare('UPDATE standorte SET titelbild_id = ? WHERE id = ?')
                    ->execute([$titelbildId, $id]);
            }
        }

        if (isset($daten['einstellungen']) && is_array($daten['einstellungen'])) {
            $e = $daten['einstellungen'];
            if (!empty($e['seitentitel'])) {
                einstellungSetzen('seitentitel', mb_substr((string) $e['seitentitel'], 0, 200));
            }
            if (isset($e['ruheSekunden'])) {
                einstellungSetzen('ruhe_sekunden', (string) max(0, min(3600, (int) $e['ruheSekunden'])));
            }
            if (!empty($e['kachelQuelle'])) {
                einstellungSetzen('kachel_quelle', (string) $e['kachelQuelle']);
            }
        }

        db()->commit();
        return $anzahl;
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
}

function datenUrlLesen(string $wert): ?string
{
    if (!preg_match('#^data:([\w/+.-]+);base64,#', $wert, $treffer)) {
        return null;
    }
    $roh = base64_decode(substr($wert, strlen($treffer[0])), true);
    return $roh === false || $roh === '' ? null : $roh;
}

/* ---- Verteiler --------------------------------------------------------- */

$verb = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Der Pfad kommt über die Umschreibung im Webserver, sonst über PATH_INFO
// oder als ?pfad= - damit die Schnittstelle auch ohne mod_rewrite läuft.
$pfad = $_GET['pfad'] ?? ltrim((string) ($_SERVER['PATH_INFO'] ?? ''), '/');
$teile = array_values(array_filter(explode('/', trim((string) $pfad, '/')), 'strlen'));
$mittel = $teile[0] ?? '';
$kennung = isset($teile[1]) ? (int) $teile[1] : 0;

try {
    switch ($mittel) {

        case 'standorte':
            if ($verb === 'GET') {
                antwort($kennung > 0
                    ? (standortLesen($kennung) ?? fehler('Standort nicht gefunden.', 404))
                    : standorteLesen());
            }
            nurAdmin();
            $eingabe = koerper();

            if ($verb === 'POST') {
                $werte = standortPruefen($eingabe, true);
                $jetzt = gmdate('c');
                db()->prepare('
                    INSERT INTO standorte (art, name, ort, lat, lon, beschreibung, erstellt_am, geaendert_am)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
                    ->execute([$werte['art'], $werte['name'], $werte['ort'], $werte['lat'],
                        $werte['lon'], $werte['beschreibung'], $jetzt, $jetzt]);
                $id = (int) db()->lastInsertId();
                unterlagenSchreiben($id, $eingabe);
                antwort(standortLesen($id), 201);
            }

            if ($verb === 'PUT') {
                if ($kennung <= 0 || standortLesen($kennung) === null) {
                    fehler('Standort nicht gefunden.', 404);
                }
                $werte = standortPruefen($eingabe, false);
                db()->prepare('
                    UPDATE standorte SET art = ?, name = ?, ort = ?, lat = ?, lon = ?,
                           beschreibung = ?, geaendert_am = ? WHERE id = ?')
                    ->execute([$werte['art'], $werte['name'], $werte['ort'], $werte['lat'],
                        $werte['lon'], $werte['beschreibung'], gmdate('c'), $kennung]);
                unterlagenSchreiben($kennung, $eingabe);
                antwort(standortLesen($kennung));
            }

            if ($verb === 'DELETE') {
                if ($kennung <= 0) {
                    fehler('Welcher Standort?');
                }
                db()->prepare('DELETE FROM standorte WHERE id = ?')->execute([$kennung]);
                antwort(['geloescht' => $kennung]);
            }
            fehler('Diese Methode gibt es hier nicht.', 405);

        case 'bilder':
            if ($verb === 'GET') {
                if ($kennung <= 0) {
                    fehler('Welches Bild?');
                }
                bildAusliefern($kennung);
            }
            nurAdmin();

            if ($verb === 'POST') {
                if (!isset($_FILES['bild']) || $_FILES['bild']['error'] !== UPLOAD_ERR_OK) {
                    fehler('Es kam keine Datei an. Möglicherweise war sie größer, als der ' .
                           'Server erlaubt (upload_max_filesize).');
                }
                $roh = file_get_contents($_FILES['bild']['tmp_name']);
                if ($roh === false) {
                    fehler('Die hochgeladene Datei ließ sich nicht lesen.', 500);
                }
                antwort(bildSpeichern($roh, (string) ($_POST['unterschrift'] ?? '')), 201);
            }

            if ($verb === 'PUT') {
                $eingabe = koerper();
                db()->prepare('UPDATE bilder SET unterschrift = ?, position = ? WHERE id = ?')
                    ->execute([mb_substr((string) ($eingabe['unterschrift'] ?? ''), 0, 300),
                        (int) ($eingabe['position'] ?? 0), $kennung]);
                antwort(['gespeichert' => $kennung]);
            }

            if ($verb === 'DELETE') {
                db()->prepare('DELETE FROM bilder WHERE id = ?')->execute([$kennung]);
                antwort(['geloescht' => $kennung]);
            }
            fehler('Diese Methode gibt es hier nicht.', 405);

        case 'einstellungen':
            if ($verb === 'GET') {
                antwort([
                    'seitentitel'  => einstellung('seitentitel'),
                    'ruheSekunden' => (int) einstellung('ruhe_sekunden', '20'),
                    'kachelQuelle' => einstellung('kachel_quelle'),
                ]);
            }
            if ($verb === 'PUT') {
                nurAdmin();
                $eingabe = koerper();
                if (isset($eingabe['seitentitel'])) {
                    $titel = trim((string) $eingabe['seitentitel']);
                    einstellungSetzen('seitentitel', mb_substr($titel !== '' ? $titel
                        : 'Unsere Projekte in Deutschland', 0, 200));
                }
                if (isset($eingabe['ruheSekunden'])) {
                    einstellungSetzen('ruhe_sekunden',
                        (string) max(0, min(3600, (int) $eingabe['ruheSekunden'])));
                }
                if (isset($eingabe['kachelQuelle'])) {
                    $quelle = trim((string) $eingabe['kachelQuelle']);
                    if ($quelle !== '' && !preg_match('#^https?://#', $quelle)) {
                        fehler('Die Kacheladresse muss mit http:// oder https:// beginnen.');
                    }
                    einstellungSetzen('kachel_quelle', mb_substr($quelle, 0, 500));
                }
                antwort(['gespeichert' => true]);
            }
            fehler('Diese Methode gibt es hier nicht.', 405);

        case 'sitzung':
            if ($verb === 'GET') {
                antwort([
                    'angemeldet'        => istAngemeldet(),
                    'schluessel'        => istAngemeldet() ? sitzungsschluessel() : null,
                    'kennwortStandard'  => einstellung('kennwort_standard') === '1',
                ]);
            }
            if ($verb === 'POST') {
                if (zuVieleVersuche()) {
                    fehler('Zu viele Fehlversuche. Bitte in einer Viertelstunde noch einmal.', 429);
                }
                $eingabe = koerper();
                if (!anmelden((string) ($eingabe['kennwort'] ?? ''))) {
                    usleep(400000);   // macht das Durchprobieren zäh
                    fehler('Kennwort stimmt nicht.', 401);
                }
                verwaisteBilderAufraeumen();
                antwort([
                    'angemeldet'       => true,
                    'schluessel'       => sitzungsschluessel(),
                    'kennwortStandard' => einstellung('kennwort_standard') === '1',
                ]);
            }
            if ($verb === 'DELETE') {
                abmelden();
                antwort(['angemeldet' => false]);
            }
            fehler('Diese Methode gibt es hier nicht.', 405);

        case 'kennwort':
            if ($verb !== 'PUT') {
                fehler('Diese Methode gibt es hier nicht.', 405);
            }
            nurAdmin();
            $eingabe = koerper();
            $alt = (string) ($eingabe['alt'] ?? '');
            $neu = (string) ($eingabe['neu'] ?? '');
            if (!password_verify($alt, einstellung('kennwort'))) {
                fehler('Das bisherige Kennwort stimmt nicht.', 403);
            }
            if (mb_strlen($neu) < 8) {
                fehler('Das neue Kennwort muss mindestens 8 Zeichen haben.');
            }
            kennwortSetzen($neu);
            antwort(['gespeichert' => true]);

        case 'sicherung':
            nurAdmin();
            if ($verb === 'GET') {
                antwort(sicherungErzeugen());
            }
            if ($verb === 'POST') {
                $anzahl = sicherungEinlesen(koerper());
                antwort(['eingelesen' => $anzahl]);
            }
            fehler('Diese Methode gibt es hier nicht.', 405);

        case '':
            antwort([
                'name'  => 'Projektkarte',
                'mittel' => ['standorte', 'bilder', 'einstellungen', 'sitzung', 'kennwort', 'sicherung'],
            ]);

        default:
            fehler('Diesen Teil der Schnittstelle gibt es nicht: ' . $mittel, 404);
    }
} catch (Throwable $e) {
    error_log('Projektkarte: ' . $e->getMessage());
    fehler('Auf dem Server ist etwas schiefgegangen.', 500);
}
