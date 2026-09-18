# Baustellen-Assistent – Architektur und Umsetzungsplan

Erweiterung der bestehenden App *Leniger Planung* um einen Eingangskanal über
WhatsApp, automatisch erzeugte Einträge (Protokoll, Bericht, Notiz, ToDo) und
eine Fragefunktion auf firmeninterne Dokumente.

## Entscheidungen

| Frage | Entscheidung |
| --- | --- |
| Abgrenzung | Integration in die bestehende App – gleiches Repo, gleiche Supabase-Instanz |
| Eingangskanal | WhatsApp Cloud API (Meta) direkt |
| Projektzuordnung | Kostenträger-Nummer im Text → `#`-Befehl (Sitzung) → KI-Vorschlag mit Rückfrage |
| Datenverarbeitung | ausschließlich EU-Region |
| Wissensdatenbank | großer Bestand aus vorhandenem Ablageort (OneDrive/SharePoint) |
| Nutzer | Start mit 10–30, ausgelegt auf 200 |
| ERP | keines – die App bleibt führende Quelle |
| Eintragsarten im MVP | Protokoll, Bericht, Notiz, ToDo |

Warum Integration statt Neubau: Die bestehende App bringt alles mit, was das
neue Tool sonst nachbauen müsste – `project` inklusive `cost_center_number`,
`employee` inklusive `phone`, `profiles`/`role` als Benutzer- und
Rechteverwaltung, Anmeldung, Row Level Security, Storage, Edge Functions,
E-Mail-Versand und eine installierbare PWA. Ein eigenständiges Projekt würde
Stammdaten doppelt pflegen, ohne dafür etwas zu gewinnen.

## Tech-Stack

| Baustein | Wahl | Begründung |
| --- | --- | --- |
| Frontend | React 18 + Vite + Tailwind + shadcn/ui | bereits im Einsatz; neue Seiten fügen sich über `src/lib/allPages.js` in Navigation **und** Rollenverwaltung ein |
| Backend | Supabase Edge Functions (Deno, TypeScript) | bereits im Einsatz; kein zusätzlicher Server, kein zusätzlicher Hoster |
| Datenbank | Supabase Postgres 17, `eu-west-1` (Irland) | bereits vorhanden, EU-Region erfüllt die Vorgabe |
| Vektorsuche | `pgvector` in derselben Datenbank | keine zweite Datenbank, keine zweite Rechnung, keine Synchronisation; für die erwartete Dokumentmenge mehr als ausreichend |
| Suchverfahren | Hybrid: Cosinus-Ähnlichkeit **und** deutsche Volltextsuche, zusammengeführt per Reciprocal Rank Fusion | reine Vektorsuche verliert bei Typenbezeichnungen und Artikelnummern („Vitodens 200-W", „DN 32"); die Volltextsuche fängt genau das auf |
| Sprache → Text | Azure AI (`whisper` / `gpt-4o-transcribe`), Region Schweden oder Westeuropa | EU-Region, gute Erkennung bei deutscher Umgangssprache und Baustellenlärm |
| Textmodell | Azure OpenAI, gleiche Region | **eine** Region, **ein** Vertrag, **ein** Schlüssel für Transkription, Einbettung und Textmodell |
| Dateiablage | Supabase Storage, privater Bucket `assistant` | Sprachnachrichten und Dokumente dürfen nicht öffentlich erreichbar sein (anders als der bestehende Bucket `uploads`) |
| Warteschlange | Tabelle `ingest_job` + `pg_cron` + `pg_net` | der WhatsApp-Webhook muss Meta binnen Sekunden bestätigen; die eigentliche Arbeit läuft danach |
| PDF-Ausgabe | `jspdf` | bereits als Abhängigkeit vorhanden |
| E-Mail | Resend | bereits eingerichtet |

### Warum Azure und nicht ein anderer Anbieter

Ausschlaggebend ist nicht die Modellqualität, sondern dass im Repo bereits
`MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` und `MS_REFRESH_TOKEN`
vorgesehen sind: es gibt also schon einen Microsoft-Tenant. Damit ist der
Auftragsverarbeitungsvertrag bereits geschlossen, die Dokumente liegen ohnehin
in OneDrive/SharePoint, und Transkription, Einbettung und Textmodell kommen aus
demselben Dienst in derselben EU-Region.

Die Alternative wäre Amazon Bedrock in Frankfurt (`eu-central-1`) mit
Claude-Modellen – sprachlich beim Strukturieren deutscher Freitexte spürbar
stärker, dafür ein zweiter Anbieter, ein zweiter Vertrag und SigV4-Signierung
im Edge-Function-Code.

Damit die Entscheidung nicht zementiert ist, läuft **jeder** KI-Aufruf über
`supabase/functions/_shared/ai.ts`. Dort sind genau drei Funktionen
definiert – `chat`, `embed`, `transcribe`. Ein Anbieterwechsel ist eine
Änderung in einer Datei, nicht im ganzen Projekt.

## Was „nur aus der Wissensdatenbank" technisch bedeutet

Die Zusage, dass Antworten ausschließlich aus hinterlegten Dokumenten stammen,
hängt nicht am Prompt allein. Drei Sperren greifen nacheinander:

1. **Abruf-Schwelle.** `match_knowledge_chunks()` liefert nur Abschnitte über
   einer Mindestähnlichkeit oder mit wörtlichem Treffer. Kommt nichts zurück,
   wird das Modell gar nicht erst gefragt – die Antwort lautet unmittelbar
   „Keine passenden Informationen gefunden."
2. **Bindung an den Kontext.** Das Modell bekommt ausschließlich die gefundenen
   Abschnitte, jeweils mit Kennung, und die Anweisung, jede Aussage mit einer
   dieser Kennungen zu belegen und andernfalls die Standardantwort zu geben.
3. **Prüfung danach.** Jede zitierte Kennung wird gegen die tatsächlich
   übergebenen Abschnitte geprüft. Erfindet das Modell eine Quelle oder belegt
   es gar nicht, wird die Antwort verworfen und durch die Standardantwort
   ersetzt.

Jede Frage samt Antwort, Quellen und Höchstwert der Ähnlichkeit landet in
`knowledge_query` – nachvollziehbar, und auswertbar, welche Fragen regelmäßig
unbeantwortet bleiben (das sind die Lücken in der Dokumentenablage).

## Projektzuordnung

Kaskade, erster Treffer gewinnt:

1. **Kostenträger-Nummer im Text.** Wird in der Nachricht eine Zeichenfolge
   gefunden, die zu `project.cost_center_number` passt, ist die Sache
   entschieden (`project_match_method = 'kostentraeger'`).
2. **Aktive Sitzung.** Hat der Absender vorher `#baustelle Musterstraße`
   geschrieben, gilt dieses Projekt, bis er umschaltet
   (`whatsapp_session`, `project_match_method = 'sitzung'`).
3. **KI-Vorschlag.** Das Modell vergleicht Baustellenname, Ort und Adresse
   aktiver Projekte mit dem Nachrichtentext. Bei hoher Sicherheit wird direkt
   zugeordnet, sonst fragt der Bot per WhatsApp zurück
   (`project_match_method = 'ki'`).
4. **Ohne Zuordnung.** Der Eintrag entsteht trotzdem, landet aber im Eingang
   „Ohne Projekt" und wartet auf Zuordnung von Hand. Eine Nachricht geht nie
   verloren.

Nicht umgesetzt, aber jederzeit nachrüstbar: Die Tabelle `assignment` weiß
bereits, welcher Monteur heute auf welcher Baustelle ist. Das wäre die
Zuordnung ganz ohne Zutun des Monteurs und die natürliche Ergänzung, sobald
sich zeigt, wie oft Stufe 3 und 4 greifen.

## Datenmodell (neu)

```
whatsapp_contact    freigegebene Rufnummern -> employee
whatsapp_session    aktiver Projektkontext und offene Rückfrage je Rufnummer
inbound_message     Rohnachrichten von Meta, idempotent über die Meta-Kennung
ingest_job          Warteschlange für die Verarbeitung
entry               Protokoll | Bericht | Notiz | ToDo, mit Projektbezug
entry_attachment    Fotos, Sprachnachrichten (mit Transkript), Dokumente
knowledge_source    Herkunft der Dokumente (Upload, OneDrive, SharePoint)
knowledge_document  einzelnes Dokument mit Status der Indizierung
knowledge_chunk     Textabschnitt mit Einbettung und deutschem Volltext-Index
knowledge_query     jede Frage mit Antwort und Quellen (Nachweis)
```

Zugriffssteuerung wie im Bestand über `is_approved_user()`; für Freigaben und
Dokumentenquellen zusätzlich `is_admin_user()`.

## Phasen

Jede Phase endet in einem Zustand, der für sich benutzbar ist.

### Phase 0 – Fundament
Datenmodell, Zugriffssteuerung, Dateiablage, KI-Abstraktion, Dokumentation.
Noch keine Oberfläche. *(erledigt)*

### Phase 1 – Eingang und Einträge (MVP)

* **1a Weberfassung.** Erfassen in der PWA: Text, Foto, Sprachaufnahme direkt im
  Browser. Verarbeitung, Projektzuordnung, Eintragsliste, Detailansicht,
  Bearbeiten, Freigeben. **Bewusst zuerst** – damit ist das System vollständig
  nutzbar und testbar, bevor die Freischaltung bei Meta durch ist.
* **1b WhatsApp-Eingang.** Webhook mit Signaturprüfung, Medien-Download,
  Transkription, Bestätigungsnachricht an den Absender.
* **1c Projektzuordnung.** Kostenträger-Erkennung, `#`-Befehl, KI-Vorschlag,
  Rückfrage per WhatsApp.

### Phase 2 – Wissensdatenbank und Fragefunktion

* **2a Fragen im Web.** Upload, Textextraktion (PDF, Word, Excel), Zerlegung,
  Einbettung, Hybrid-Suche, belegte Antwort, Seite „Fragen".
* **2b Fragen per WhatsApp.** Gleiche Antwortlogik über den Chat.
* **2c Anbindung OneDrive/SharePoint.** Abgleich über Microsoft Graph, damit
  der bestehende Ablageort die Quelle bleibt und niemand doppelt pflegt.

### Phase 3 – Verwaltung und Rechte
Freigabe von Rufnummern, neue Seiten in der Rollenverwaltung, Rechte je
Projekt, Protokoll der Zugriffe.

### Phase 4 – Weiterverarbeitung
PDF-Ausgabe, Versand per E-Mail, ToDos in die Werkstattliste, Mängelbericht
mit Fristen.

## Offene Punkte

* **Ablageort der Dokumente** – OneDrive, SharePoint oder Netzlaufwerk? Danach
  richtet sich Phase 2c. Bis dahin ist der Upload der Weg.
* **Gescannte PDFs** brauchen Texterkennung (Azure Document Intelligence,
  EU-Region). Erst klären, wenn klar ist, wie groß der Anteil ist.
* **Datenschutz WhatsApp.** Der kritische Punkt ist nicht das KI-Modell,
  sondern WhatsApp selbst: Meta Ireland verarbeitet Verkehrsdaten. Zu klären
  sind Nutzerinformation, Verzeichnis der Verarbeitungstätigkeiten und die
  Ansage, dass Gesundheitsdaten und personenbezogene Kundendaten nicht über
  diesen Weg gehen.
* **24-Stunden-Fenster.** Meta erlaubt freie Antworten nur binnen 24 Stunden
  nach der letzten Nachricht des Nutzers. Für Rückfragen zur Projektzuordnung
  reicht das; für alles Angestoßene braucht es genehmigte Vorlagen.
