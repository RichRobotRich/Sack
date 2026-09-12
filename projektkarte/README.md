# Projektkarte

Eine Deutschlandkarte mit allen Projekten, den Betriebssitzen und den
Fernaufschaltungen. Weiße Karte, farbige Standorte, zoom- und verschiebbar; ab
mittlerer Zoomstufe legt sich eine Straßenkarte darunter. Ein Klick auf einen
Standort öffnet eine Seitentafel mit Titelbild, Eckdaten, Beschreibung und
weiteren Bildern.

Die Anwendung läuft auf einem gewöhnlichen Webserver mit PHP und SQLite. Kein
Build, keine Abhängigkeiten, kein Paketmanager – die Dateien hochladen genügt.

```
index.html          die Karte (liest nur)
karte.css           Gestaltung, von Karte und Verwaltung gemeinsam genutzt
karte.js            Karte, Zoom, Suche, Detailtafel
geo-deutschland.js  Umrisse der 16 Bundesländer als SVG-Pfade

api/                die REST-Schnittstelle
  index.php         Verteiler, alle Endpunkte
  datenbank.php     Verbindung, Schema, Beispieldaten
  anmeldung.php     Sitzung, Kennwort, Bremse gegen Durchprobieren

admin/              die Verwaltung, erreichbar unter /admin
  index.php         Grundgerüst und Anmeldemaske
  admin.css
  admin.js

daten/              hier entsteht projektkarte.sqlite
konfig-beispiel.php Vorlage, um die Datenbank woanders abzulegen
router.php          nur für den eingebauten PHP-Server zum Ausprobieren
```

## Einrichten

**Voraussetzungen:** PHP 8.0 oder neuer mit `pdo_sqlite` – das ist bei nahezu
jedem Hoster dabei.

1. Den gesamten Ordner auf den Webserver legen.
2. Dafür sorgen, dass `daten/` für den Webserver beschreibbar ist
   (`chmod 775 daten` und der Gruppe des Webservers zuordnen). Die
   Datenbank legt sich beim ersten Aufruf selbst an, mitsamt Beispieldaten.
3. Die Karte aufrufen – sie sollte erscheinen.
4. `/admin` aufrufen, mit dem Standardkennwort **`leniger`** anmelden und es
   sofort unter *Einstellungen* ändern. Die Verwaltung weist darauf hin,
   solange es noch gilt.

### Zum Ausprobieren ohne Webserver

```bash
php -S localhost:8000 -t . router.php
```

Dann `http://localhost:8000/` für die Karte und `http://localhost:8000/admin`
für die Verwaltung. `router.php` übernimmt dabei, was sonst die `.htaccess`
macht, und gehört nicht auf den richtigen Server.

## Die Datenbank gehört geschützt

In der Datenbank stehen alle Daten **und** der Hash des Kennworts. Sie darf
nicht über den Browser abrufbar sein.

* **Apache** erledigt das mit der mitgelieferten `daten/.htaccess` – sofern
  `AllowOverride` es zulässt.
* **nginx** kennt keine `.htaccess`. Dort gehört in den Server-Block:

  ```nginx
  location ^~ /daten/ { deny all; return 404; }
  ```

* **Am besten** liegt die Datei überhaupt nicht im Webverzeichnis:
  `konfig-beispiel.php` nach `konfig.php` kopieren und darin `DB_PFAD` auf
  einen Ordner oberhalb setzen.

Die Verwaltung prüft beim Anmelden selbst, ob die Datei über das Netz
erreichbar ist, und warnt deutlich, falls ja.

## Die Schnittstelle

Alles unter `/api/`. Lesen ist offen – die Karte braucht keine Anmeldung.
Schreiben verlangt eine Sitzung aus der Verwaltung *und* den Sitzungsschlüssel
im Kopf `X-Sitzungsschluessel`; beides zusammen, damit eine fremde Seite nicht
im Namen eines angemeldeten Browsers schreiben kann.

| Verb | Pfad | Wirkung |
| --- | --- | --- |
| GET | `/api/standorte` | alle Standorte mit Eckdaten und Bildliste |
| GET | `/api/standorte/{id}` | ein Standort |
| POST | `/api/standorte` | anlegen · Admin |
| PUT | `/api/standorte/{id}` | ändern · Admin |
| DELETE | `/api/standorte/{id}` | löschen · Admin |
| GET | `/api/bilder/{id}` | das Bild selbst, mit ETag |
| POST | `/api/bilder` | hochladen (multipart, Feld `bild`) · Admin |
| PUT | `/api/bilder/{id}` | Unterschrift und Reihenfolge · Admin |
| DELETE | `/api/bilder/{id}` | löschen · Admin |
| GET | `/api/einstellungen` | Titel, Ruhezeit, Kacheladresse |
| PUT | `/api/einstellungen` | ändern · Admin |
| GET | `/api/sitzung` | Status und Sitzungsschlüssel |
| POST | `/api/sitzung` | anmelden |
| DELETE | `/api/sitzung` | abmelden |
| PUT | `/api/kennwort` | Kennwort ändern · Admin |
| GET | `/api/sicherung` | alles als JSON, Bilder einbegriffen · Admin |
| POST | `/api/sicherung` | Sicherung einlesen · Admin |

Ohne `mod_rewrite` läuft dieselbe Schnittstelle auch als
`api/index.php?pfad=standorte/5` oder `api/index.php/standorte/5`.

## Datenhaltung

Eine einzige SQLite-Datei, Tabellen `standorte`, `eckdaten`, `bilder`,
`einstellungen` und `anmeldeversuche`. **Auch die Bilder liegen darin**, als
BLOB in `bilder.daten` – eine Sicherung der ganzen Anwendung ist damit das
Kopieren einer Datei. Ausgeliefert werden sie über `/api/bilder/{id}` mit
einem ETag, sodass der Browser jedes Bild nur einmal holt.

Beim Hochladen verkleinert die Verwaltung jedes Bild im Browser auf 1600 Pixel
und schickt es als JPEG; der Server prüft danach noch einmal Typ und Größe
(höchstens 8 MB). Bilder, die beim Anlegen hochgeladen und dann nie gespeichert
wurden, räumt die nächste Anmeldung weg.

## Die drei Arten von Standorten

| Art | Marker | Eckdaten, mit denen ein neuer Eintrag startet |
| --- | --- | --- |
| Betriebssitz | dunkles Haus | Grundstücksfläche, Lagerbereich, Mitarbeiterzahl, Monteure, Kundendienst, Fahrzeuge |
| Projekt | blauer Stift | Bauherr, Fertigstellung, Bauzeit, Gewerk |
| Fernaufschaltung | roter Stift mit Funkzeichen | Anlagenart, Aufgeschaltet seit, Verbindung, Leitsystem, Störmeldung an, Wartungsvertrag |

Fernaufschaltungen sind die Standorte, deren Anlagen wir aus der Ferne einsehen
und steuern. Die vorgeschlagenen Eckdaten sind nur ein Anfang: Bezeichnung und
Wert sind Freitext, Zeilen lassen sich ergänzen, sortieren und entfernen.

## Straßen ab einer gewissen Zoomstufe

Bis etwa zur Regionalebene bleibt es bei der weißen Karte aus den eingebauten
Umrissen. Wird weiter hineingezoomt, legt sich darüber eine Straßenkarte aus
Kartenkacheln, und von den Bundesländern bleiben nur die Grenzlinien. Zoomen
lässt sich bis auf Straßenebene.

Das geht auf, weil die eingebauten Umrisse mercator-projiziert sind – dasselbe
Koordinatensystem, das Kartenkacheln benutzen.

Die Adresse der Kacheln steht in den Einstellungen der Verwaltung. Dazu drei
Dinge:

* Die [Nutzungsbedingungen von OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/)
  erlauben nur leichte Nutzung. Für eine Karte, die dauerhaft öffentlich läuft,
  gehört dort ein eigener Anbieter hinein.
* Der Hinweis auf die Kartendaten unten links ist Bedingung der Lizenz.
* Kommt keine Kachel an, bleibt es bei der weißen Karte, und ein Hinweis
  erklärt, warum keine Straßen erscheinen. Leeres Feld heißt: gar keine
  Straßenkarte.

## Bedienung der Karte

* **Zoomen** – Mausrad, die Knöpfe unten rechts, Doppelklick oder zwei Finger.
* **Verschieben** – ziehen.
* **Standort öffnen** – auf einen Marker klicken, oder über die **Lupe** oben
  links: bei leerem Suchfeld stehen dort alle Standorte, Tippen filtert sie.
  Pfeiltasten wählen, Enter öffnet, Escape schließt.
* **Zurück zur Gesamtansicht** – der Knopf mit dem Pfeil unten rechts. Wird die
  Karte 20 Sekunden nicht bedient, stellt sie sich von selbst zurück – gedacht
  für einen Bildschirm, an dem Leute vorbeikommen. Die Zeit steht in den
  Einstellungen, `0` schaltet es ab.

Von der Karte führt bewusst kein Weg in die Verwaltung. Wer dorthin will, ruft
`/admin` auf.

## Sicherung und Umzug

*Einstellungen → Sicherung herunterladen* schreibt alles in eine JSON-Datei,
die Bilder eingebettet. Eingelesen wird sowohl diese Sicherung als auch der
Export der früheren Fassung, die noch im Browser gespeichert hat – vorhandene
Einträge gehen beim Umstieg also nicht verloren.

Genauso gut lässt sich die SQLite-Datei kopieren. Dabei gehören die Dateien
`projektkarte.sqlite-wal` und `-shm` dazu, wenn sie vorhanden sind, oder die
Kopie wird im laufenden Betrieb gezogen (`sqlite3 projektkarte.sqlite ".backup
sicherung.sqlite"`).
