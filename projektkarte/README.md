# Projektkarte

Eine Deutschlandkarte mit allen Projekten und den Betriebssitzen. Weiße Karte,
blaue Standorte, zoom- und verschiebbar. Ein Klick auf einen Standort öffnet
eine Seitentafel mit Titelbild, Eckdaten, Beschreibung und weiteren Bildern.

Die Seite ist reines HTML, CSS und JavaScript – kein Build, kein Server, keine
fremden Dienste. `projektkarte/index.html` lässt sich direkt im Browser öffnen.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `index.html` | Grundgerüst der Seite |
| `karte.css` | Gestaltung |
| `app.js` | Karte, Zoom, Detailtafel und Mitarbeiterbereich |
| `geo-deutschland.js` | Umrisse der 16 Bundesländer als SVG-Pfade |

Die Umrisse stammen aus den offenen Daten von
[deutschlandGeoJSON](https://github.com/isellsoap/deutschlandGeoJSON)
(Grundlage: Bundesamt für Kartographie und Geodäsie), mercator-projiziert und
vereinfacht. `app.js` rechnet Längen- und Breitengrad mit denselben Parametern
in Kartenkoordinaten um – neue Standorte lassen sich deshalb einfach über ihre
Koordinaten oder per Klick auf die Karte setzen.

## Bedienung

* **Zoomen** – Mausrad, die Knöpfe unten rechts, Doppelklick oder zwei Finger.
* **Verschieben** – ziehen.
* **Standort öffnen** – auf einen Marker klicken, oder über die **Lupe** oben
  links: bei leerem Suchfeld stehen dort alle Betriebssitze und Projekte,
  Tippen filtert sie. Mit den Pfeiltasten durch die Treffer, mit Enter öffnen,
  mit Escape oder einem Klick auf die Karte wieder schließen.
* **Zurück zur Gesamtansicht** – der Knopf mit dem Pfeil unten rechts.

## Mitarbeiterbereich

Oben rechts, geschützt durch ein Kennwort. Das Standardkennwort ist
`leniger` und sollte unter *Einstellungen* geändert werden.

Dort lassen sich

* Projekte und Betriebssitze anlegen, bearbeiten und löschen,
* die Position per Klick auf die Karte setzen,
* ein Titelbild und beliebig viele weitere Bilder hochladen
  (werden automatisch auf 1600 px bzw. 1400 px verkleinert),
* **Eckdaten frei zusammenstellen** – Bezeichnung und Wert sind Freitext,
  Zeilen lassen sich hinzufügen, sortieren und entfernen. Neue Betriebssitze
  starten mit Grundstücksfläche, Lagerbereich, Mitarbeiterzahl, Monteure,
  Kundendienst und Fahrzeuge, Projekte mit Bauherr, Fertigstellung, Bauzeit
  und Gewerk. Beides ist nur ein Vorschlag und vollständig änderbar,
* die Überschrift der Seite ändern,
* das Kennwort ändern,
* alle Daten als JSON sichern und wieder einlesen.

Die Anmeldung gilt bis zum Schließen des Browsertabs.

### Zum Schutz

Das Kennwort wird als SHA-256-Hash im Browser abgelegt und dort geprüft. Das
hält Besucher der Seite zuverlässig aus der Verwaltung heraus, ist aber kein
Ersatz für eine echte Anmeldung: Wer die Seite mit den Entwicklerwerkzeugen
auseinandernimmt, kommt an die gespeicherten Daten. Sobald die Karte öffentlich
erreichbar sein soll und dort vertrauliche Angaben stehen, gehört der
Mitarbeiterbereich hinter eine serverseitige Anmeldung – zum Beispiel über die
Supabase-Anmeldung der übrigen Anwendung.

## Datenhaltung

Alle Einträge liegen im `localStorage` des Browsers (Schlüssel
`projektkarte.v1`), Bilder als Data-URL. Das heißt:

* Die Daten hängen an **einem** Browser auf **einem** Rechner.
* Der Platz ist auf etwa 5 MB begrenzt; der Füllstand steht in den
  Einstellungen.
* Für die Übertragung auf einen anderen Rechner oder als Sicherung dient der
  Export als JSON-Datei.

Sollen mehrere Leute gemeinsam pflegen, ist der nächste Schritt, Projekte und
Betriebssitze in Supabase abzulegen (Tabellen plus Storage für die Bilder) und
`app.js` statt auf den `localStorage` auf die Datenbank zugreifen zu lassen.
Der Aufbau der Daten ist bereits darauf ausgelegt – jeder Eintrag hat eine
eigene `id`, die Eckdaten sind eine Liste aus Bezeichnung und Wert.

## Eine einzige Datei zum Weitergeben

`projektkarte-komplett.html` ist die ganze Karte in einer Datei – Stil, Skript,
Kartendaten und Logo stecken darin. Sie lässt sich per Doppelklick öffnen, auf
einen USB-Stick legen oder verschicken, ohne dass etwas fehlt. Neu gebaut wird
sie nach Änderungen mit

```bash
node projektkarte/build-einzeldatei.mjs
```

## Auf einen Server stellen

Den Ordner `projektkarte/` unverändert auf einen beliebigen Webspace kopieren,
er ist eigenständig. Für einen lokalen Test genügt

```bash
npx serve projektkarte
```
