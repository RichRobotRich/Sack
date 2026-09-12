<?php
/**
 * Datenbank: Verbindung, Schema und Erststart.
 *
 * Alles liegt in einer SQLite-Datei unter daten/ - auch die hochgeladenen
 * Bilder, die als BLOB in der Tabelle `bilder` stehen. Eine Sicherung der
 * Anwendung ist damit das Kopieren einer einzigen Datei.
 */

declare(strict_types=1);

// Wo die Datenbank liegt. Am sichersten ist ein Ordner außerhalb des
// Webverzeichnisses - dafür konfig.php anlegen (Vorlage: konfig-beispiel.php)
// und dort DB_PFAD setzen. Ohne konfig.php liegt sie in daten/, das der
// Webserver über die mitgelieferte .htaccess sperrt.
if (is_file(__DIR__ . '/../konfig.php')) {
    require_once __DIR__ . '/../konfig.php';
}
define('DB_DATEI', defined('DB_PFAD') ? DB_PFAD : __DIR__ . '/../daten/projektkarte.sqlite');

const STANDARD_KENNWORT = 'leniger';

/** Die Arten von Standorten, die es gibt. */
const ARTEN = ['sitz', 'projekt', 'fernaufschaltung'];

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $ordner = dirname(DB_DATEI);
    if (!is_dir($ordner) && !@mkdir($ordner, 0775, true) && !is_dir($ordner)) {
        throw new RuntimeException('Der Ordner daten/ lässt sich nicht anlegen.');
    }
    if (!is_writable($ordner)) {
        throw new RuntimeException('Der Ordner daten/ ist für den Webserver nicht beschreibbar.');
    }

    $neu = !file_exists(DB_DATEI);
    $pdo = new PDO('sqlite:' . DB_DATEI, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    // WAL hält Lesen und Schreiben auseinander, der Wartezeit-Wert verhindert
    // "database is locked", wenn zwei Leute gleichzeitig speichern.
    $pdo->exec('PRAGMA journal_mode = WAL');
    $pdo->exec('PRAGMA busy_timeout = 5000');
    $pdo->exec('PRAGMA foreign_keys = ON');

    schemaAnlegen($pdo);
    if ($neu) {
        @chmod(DB_DATEI, 0660);
        beispieldatenAnlegen($pdo);
    }
    return $pdo;
}

function schemaAnlegen(PDO $pdo): void
{
    $pdo->exec('
        CREATE TABLE IF NOT EXISTS standorte (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            art           TEXT    NOT NULL,
            name          TEXT    NOT NULL,
            ort           TEXT    NOT NULL DEFAULT "",
            lat           REAL    NOT NULL,
            lon           REAL    NOT NULL,
            beschreibung  TEXT    NOT NULL DEFAULT "",
            titelbild_id  INTEGER,
            erstellt_am   TEXT    NOT NULL,
            geaendert_am  TEXT    NOT NULL
        )');

    $pdo->exec('
        CREATE TABLE IF NOT EXISTS eckdaten (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            standort_id  INTEGER NOT NULL REFERENCES standorte(id) ON DELETE CASCADE,
            bezeichnung  TEXT    NOT NULL DEFAULT "",
            wert         TEXT    NOT NULL DEFAULT "",
            position     INTEGER NOT NULL DEFAULT 0
        )');

    // Die Bilddaten stehen als BLOB in der Datenbank, nicht im Dateisystem.
    $pdo->exec('
        CREATE TABLE IF NOT EXISTS bilder (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            standort_id     INTEGER REFERENCES standorte(id) ON DELETE CASCADE,
            daten           BLOB    NOT NULL,
            typ             TEXT    NOT NULL,
            breite          INTEGER NOT NULL DEFAULT 0,
            hoehe           INTEGER NOT NULL DEFAULT 0,
            groesse         INTEGER NOT NULL DEFAULT 0,
            pruefsumme      TEXT    NOT NULL DEFAULT "",
            unterschrift    TEXT    NOT NULL DEFAULT "",
            position        INTEGER NOT NULL DEFAULT 0,
            hochgeladen_am  TEXT    NOT NULL
        )');

    $pdo->exec('
        CREATE TABLE IF NOT EXISTS einstellungen (
            schluessel  TEXT PRIMARY KEY,
            wert        TEXT NOT NULL
        )');

    $pdo->exec('
        CREATE TABLE IF NOT EXISTS anmeldeversuche (
            id     INTEGER PRIMARY KEY AUTOINCREMENT,
            ip     TEXT    NOT NULL,
            zeit   INTEGER NOT NULL
        )');

    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_eckdaten_standort ON eckdaten(standort_id, position)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_bilder_standort   ON bilder(standort_id, position)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_versuche_zeit     ON anmeldeversuche(zeit)');

    // Voreinstellungen, die beim Erststart gesetzt werden.
    $vorgabe = [
        'seitentitel'       => 'Unsere Projekte in Deutschland',
        'ruhe_sekunden'     => '20',
        'kachel_quelle'     => 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        'kennwort'          => password_hash(STANDARD_KENNWORT, PASSWORD_DEFAULT),
        'kennwort_standard' => '1',
    ];
    $einfuegen = $pdo->prepare('INSERT OR IGNORE INTO einstellungen (schluessel, wert) VALUES (?, ?)');
    foreach ($vorgabe as $schluessel => $wert) {
        $einfuegen->execute([$schluessel, $wert]);
    }
}

function einstellung(string $schluessel, string $ersatz = ''): string
{
    $sql = db()->prepare('SELECT wert FROM einstellungen WHERE schluessel = ?');
    $sql->execute([$schluessel]);
    $wert = $sql->fetchColumn();
    return $wert === false ? $ersatz : (string) $wert;
}

function einstellungSetzen(string $schluessel, string $wert): void
{
    $sql = db()->prepare('
        INSERT INTO einstellungen (schluessel, wert) VALUES (?, ?)
        ON CONFLICT(schluessel) DO UPDATE SET wert = excluded.wert');
    $sql->execute([$schluessel, $wert]);
}

/** Ein paar Beispieleinträge, damit die Karte beim Erststart nicht leer ist. */
function beispieldatenAnlegen(PDO $pdo): void
{
    $beispiele = [
        ['sitz', 'Betriebssitz Paderborn', 'Paderborn, Nordrhein-Westfalen', 51.7189, 8.7575,
            "Der Stammsitz in Paderborn vereint Verwaltung, Lager und Werkstatt an einem Ort. " .
            "Von hier aus werden die Baustellen in Nordrhein-Westfalen und Niedersachsen disponiert.\n\n" .
            "Die Eckdaten sind Beispielwerte und lassen sich im Adminbereich anpassen.",
            [['Grundstücksfläche', '12.000 m²'], ['Lagerbereich', '2.400 m²'],
             ['Mitarbeiterzahl', '85'], ['Monteure', '54'],
             ['Kundendienst', '9 Teams'], ['Fahrzeuge', '46']]],
        ['sitz', 'Betriebssitz Erfurt', 'Erfurt, Thüringen', 50.9787, 11.0328,
            "Der Standort Erfurt betreut die Projekte in Thüringen, Sachsen und Sachsen-Anhalt.\n\n" .
            "Die Eckdaten sind Beispielwerte und lassen sich im Adminbereich anpassen.",
            [['Grundstücksfläche', '7.500 m²'], ['Lagerbereich', '1.300 m²'],
             ['Mitarbeiterzahl', '42'], ['Monteure', '28'],
             ['Kundendienst', '5 Teams'], ['Fahrzeuge', '23']]],
    ];

    $projekte = [
        ['Wohnquartier Nordpark', 'Hamburg', 53.5511, 9.9937, '2024'],
        ['Verwaltungsgebäude Mitte', 'Berlin', 52.5200, 13.4050, '2023'],
        ['Logistikzentrum West', 'Köln', 50.9375, 6.9603, '2024'],
        ['Klinikerweiterung', 'Leipzig', 51.3397, 12.3731, '2022'],
        ['Produktionshalle Süd', 'München', 48.1372, 11.5755, '2025'],
        ['Schulzentrum am Wall', 'Kassel', 51.3127, 9.4797, '2023'],
        ['Rathaus-Sanierung', 'Bielefeld', 52.0302, 8.5325, '2024'],
    ];
    foreach ($projekte as [$name, $ort, $lat, $lon, $jahr]) {
        $beispiele[] = ['projekt', $name, $ort, $lat, $lon,
            'Beispielprojekt. Beschreibung, Titelbild, Eckdaten und weitere Bilder werden im ' .
            'Adminbereich gepflegt.',
            [['Bauherr', 'Beispiel GmbH'], ['Fertigstellung', $jahr],
             ['Bauzeit', '14 Monate'], ['Gewerk', 'Heizung, Lüftung, Sanitär']]];
    }

    $aufschaltungen = [
        ['Heizzentrale Nordstadt', 'Göttingen', 51.5413, 9.9158],
        ['Lüftung Stadthalle', 'Detmold', 51.9375, 8.8785],
        ['Kälteanlage Rechenzentrum', 'Hannover', 52.3759, 9.7320],
    ];
    foreach ($aufschaltungen as [$name, $ort, $lat, $lon]) {
        $beispiele[] = ['fernaufschaltung', $name, $ort, $lat, $lon,
            'Beispiel-Fernaufschaltung. Die Anlage lässt sich aus der Ferne einsehen und steuern. ' .
            'Beschreibung, Titelbild und Eckdaten werden im Adminbereich gepflegt.',
            [['Anlagenart', 'Heizung und Lüftung'], ['Aufgeschaltet seit', '2023'],
             ['Verbindung', 'VPN über Mobilfunk'], ['Leitsystem', 'Beispiel-GLT'],
             ['Störmeldung an', 'Kundendienst Paderborn'], ['Wartungsvertrag', 'ja']]];
    }

    $jetzt = gmdate('c');
    $standort = $pdo->prepare('
        INSERT INTO standorte (art, name, ort, lat, lon, beschreibung, erstellt_am, geaendert_am)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    $eckdatum = $pdo->prepare('
        INSERT INTO eckdaten (standort_id, bezeichnung, wert, position) VALUES (?, ?, ?, ?)');

    foreach ($beispiele as [$art, $name, $ort, $lat, $lon, $text, $fakten]) {
        $standort->execute([$art, $name, $ort, $lat, $lon, $text, $jetzt, $jetzt]);
        $id = (int) $pdo->lastInsertId();
        foreach ($fakten as $i => [$bezeichnung, $wert]) {
            $eckdatum->execute([$id, $bezeichnung, $wert, $i]);
        }
    }
}
