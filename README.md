# Leniger Planung

Einsatzplanung für Baustellen: Wocheneinteilung, Tagesansicht, Fahrzeuge,
Urlaub und Krankmeldungen, Arbeitskleidung, Wochenberichte und Werkstatt.

Dazu der **Baustellen-Assistent**: Nachrichten aus WhatsApp werden zu
Protokollen, Berichten, Notizen und ToDos, automatisch einer Baustelle
zugeordnet; fachliche Fragen werden ausschließlich aus hinterlegten
Firmenunterlagen beantwortet. Aufbau und Umsetzungsplan stehen in
[docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md).

React + Vite im Frontend, Supabase als Backend (Postgres, Anmeldung, Storage,
Edge Functions).

## Einrichtung

### 1. Supabase-Projekt anlegen

Auf [supabase.com](https://supabase.com) ein Projekt erstellen und die
Migrationen einspielen – entweder im SQL-Editor nacheinander:

```
supabase/migrations/0001_initial_schema.sql
supabase/migrations/0002_storage.sql
supabase/migrations/0003_harden_function_privileges.sql
supabase/migrations/0004_assistant_schema.sql
supabase/migrations/0005_assistant_storage.sql
```

`0004` legt die Erweiterung `pgvector` an. Sie ist bei Supabase vorhanden und
muss nur eingeschaltet werden – die Migration erledigt das selbst.

oder mit der CLI:

```bash
supabase link --project-ref <projekt-ref>
supabase db push
```

### 2. Frontend konfigurieren

```bash
cp .env.example .env.local
```

In `.env.local` `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` eintragen
(Supabase → Project Settings → API).

```bash
npm install
npm run dev
```

### 3. Erstes Konto freischalten

Neue Konten werden bewusst **nicht** automatisch freigegeben. Nach der
Registrierung über die Anmeldeseite in Supabase in der Tabelle `profiles`
beim eigenen Datensatz setzen:

```sql
update public.profiles
set is_approved = true, role = 'admin'
where email = 'deine@adresse.de';
```

Danach lassen sich alle weiteren Benutzer in der App unter *Benutzer*
freigeben.

### 4. Beispieldaten (optional)

Am einfachsten `supabase/seed.sql` im SQL-Editor von Supabase einfügen und
ausführen – dafür wird nichts installiert.

Alternativ mit Node:

```bash
SUPABASE_URL=https://<projekt>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
node scripts/seed.mjs
```

Beide Wege legen dasselbe an: Rollen, Mitarbeiter, Fahrzeuge, Baustellen und
eine Wocheneinteilung. Die SQL-Datei wird aus dem Skript erzeugt
(`node scripts/generate-seed-sql.mjs > supabase/seed.sql`), damit beide nicht
auseinanderlaufen.

**Beide leeren die betroffenen Tabellen vorher** – nur auf einer
Entwicklungsdatenbank ausführen.

### 5. Edge Functions

```bash
supabase functions deploy
```

Benötigte Secrets (Supabase → Edge Functions → Secrets):

| Variable | Wofür | Pflicht |
| --- | --- | --- |
| `RESEND_API_KEY` | E-Mail-Versand über [Resend](https://resend.com) | ja |
| `MAIL_FROM` | Absender, z. B. `Leniger <planung@example.de>` | ja |
| `APP_ORIGIN` | Erlaubte Herkunft für CORS | empfohlen |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_REFRESH_TOKEN` | OneDrive-Ablage der Tageseinteilung | nur für das Hallendisplay |
| `SECONDARY_APP_WEBHOOK_URL`, `SECONDARY_APP_API_KEY` | Benachrichtigung der PlanPro-App bei geändertem Zugriff | optional |
| `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY` | KI-Dienste des Assistenten (EU-Region) | für den Assistenten |
| `AZURE_OPENAI_CHAT_DEPLOYMENT` | Bereitstellung für Textmodell | für den Assistenten |
| `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` | Bereitstellung für Einbettungen, 1536 Dimensionen | für die Fragefunktion |
| `AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT` | Bereitstellung für Sprachnachrichten | für Sprachnachrichten |
| `WHATSAPP_VERIFY_TOKEN` | frei gewähltes Wort, mit dem Meta den Webhook prüft | für WhatsApp |
| `WHATSAPP_APP_SECRET` | prüft die Signatur eingehender Meldungen | für WhatsApp |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Medien laden und Antworten senden | für WhatsApp |

Fehlen die `MS_*`-Variablen, wird die OneDrive-Ablage übersprungen; die
E-Mails gehen trotzdem raus.

## Aufbau

```
src/api/client.js        Datenzugriff (Entities, Auth, Integrationen, Functions)
src/api/supabase.js      Supabase-Client
src/pages/               eine Datei je Seite, geroutet über src/pages.config.js
src/components/          gemeinsame Komponenten, ui/ ist shadcn/ui
src/lib/allPages.js      zentrale Seitenliste für Navigation und Rollen
supabase/migrations/     Datenbankschema
supabase/functions/      Edge Functions
supabase/functions/_shared/ai.ts            KI-Zugang (chat, embed, transcribe)
supabase/functions/_shared/project-match.ts Zuordnung Nachricht -> Baustelle
docs/ARCHITEKTUR.md      Aufbau und Umsetzungsplan des Assistenten
assets/logo-source.png   Vorlage für Logo und Symbole
scripts/                 Generatoren (Schema, Symbole) und Seed
```

### Baustellen-Assistent

Zwei Seiten in der Gruppe *Assistent*: **Erfassen** nimmt Sprachaufnahme, Text
und Fotos entgegen, **Einträge** zeigt, was daraus geworden ist. Die Ablage
liegt im privaten Bucket `assistant` und wird über `api.assistant` angesprochen
– nicht über `integrations.Core.UploadFile`, das den öffentlichen Bucket
`uploads` bedient.

Die Verarbeitung läuft in der Edge Function `process-entry`; die eigentliche
Logik steht in `_shared/entry-pipeline.ts`, damit der WhatsApp-Eingang später
denselben Weg nimmt.

### Datenzugriff

Alle Seiten gehen über `src/api/client.js`:

```js
import { api } from '@/api/client';

const employees = await api.entities.Employee.filter({ is_active: true });
const requests  = await api.entities.LeaveRequest.list('-created_date');
await api.entities.Assignment.create({ date: '2026-01-07', employee_id: id });
```

`filter()` vergleicht auf Gleichheit, das Sortierargument ist ein Feldname mit
optionalem `-` für absteigend.

### Schema ändern

Die Tabellen in `0001_initial_schema.sql` sind aus den Entity-Schemas in
`base44/entities/*.jsonc` erzeugt. Für strukturelle Änderungen dort ansetzen
und neu generieren:

```bash
node scripts/generate-schema.mjs > supabase/migrations/0001_initial_schema.sql
```

Ist die Datenbank bereits im Einsatz, stattdessen eine neue Migration
`000X_....sql` anlegen – ein neu erzeugtes Grundschema lässt sich nicht über
eine bestehende Datenbank spielen.

### Zugriffsrechte

Zwei Ebenen:

- **Row Level Security** in der Datenbank: lesen und schreiben darf nur, wessen
  Profil `is_approved = true` hat. Das gilt unabhängig vom Frontend.
- **Rollen** in der App (`role`-Tabelle, `allowed_pages`): steuern, welche
  Seiten jemand sieht. Rein an der Oberfläche, kein Ersatz für die erste Ebene.

Was ein normales Konto nicht selbst darf – fremde Profile lesen oder ändern,
Konten löschen –, läuft über Edge Functions, die die Rechte des Aufrufers
prüfen.

## Herkunft: Migration von Base44

Die App entstand ursprünglich in [Base44](https://base44.com) und wurde von
dort abgelöst. Was das für den Code bedeutet:

- `base44/entities/*.jsonc` sind die exportierten Schemas. Sie werden zur
  Laufzeit **nicht** mehr gelesen, sind aber die Vorlage des Generators und
  damit weiterhin die maßgebliche Beschreibung des Datenmodells.
- `src/api/client.js` hat bewusst dieselbe Form wie das frühere Base44-SDK.
  Deshalb konnten die rund 50 Seiten unverändert bleiben.
- IDs stehen in normalen Textspalten statt in Fremdschlüsseln, weil der
  bestehende Code sie so behandelt. Referenzen sind dadurch nicht auf
  Datenbankebene abgesichert.

### Nicht übernommen

Diese Base44-Funktionen liegen weiterhin unter `base44/functions/`, sind aber
bewusst nicht portiert: `dataApi`, `generateAuthToken` und
`webhookPlanProSync_fix` bedienten die PlanPro-Anbindung, die nicht
fortgeführt wird. `clearFutureVehicles` war eine einmalige Aufräumaktion.

Die Felder `planpro` (Benutzer) und `is_planpro` (Baustelle) sind in Schema
und Oberfläche noch vorhanden. Sie stören nicht und lassen sich später
entfernen, wenn feststeht, dass sie niemand mehr braucht.

## Befehle

```bash
npm run dev        # Entwicklungsserver
npm run build      # Produktions-Build nach dist/
npm run preview    # Build lokal ansehen
npm run lint       # ESLint
npm run test:match # Projektzuordnung prüfen (ohne Netz, ohne Modell)
```

## Installation auf den Geräten

Die App ist eine installierbare PWA – am Rechner wie am Telefon dieselbe
Anwendung, ohne getrennte Codebasis.

| Gerät | Weg |
| --- | --- |
| Windows / macOS (Chrome, Edge) | Installationssymbol in der Adressleiste |
| Android | „App installieren" im Browsermenü |
| iPhone / iPad | Safari öffnen → Teilen → „Zum Home-Bildschirm" |

Danach startet die App im eigenen Fenster ohne Browserleiste. Erscheint eine
neue Version, meldet sich unten ein Hinweis mit „Jetzt aktualisieren"; der
Neustart passiert bewusst erst auf Klick, damit er keine laufende Eingabe
abbricht.

Voraussetzung ist HTTPS – über `localhost` funktioniert es zum Testen auch.

Planungsdaten werden **nicht** zwischengespeichert: Aufrufe an Datenbank und
Anmeldung laufen immer übers Netz. Eine veraltete Einteilung anzuzeigen wäre
schlimmer als eine Fehlermeldung. Zwischengespeichert wird nur die Programm-
hülle, damit der Start schnell ist.

### App Store

Ein Eintrag im App Store ist damit **nicht** abgedeckt: Apple nimmt keine
Web-Apps auf. Dafür bräuchte es eine native Hülle (z. B.
[Capacitor](https://capacitorjs.com), das denselben Code weiterverwendet) und
ein Apple-Developer-Konto. Für eine reine Firmen-App ist die Installation über
Safari meist der einfachere Weg – kein Prüfverfahren, keine Jahresgebühr,
Updates sind sofort bei allen aktiv.
