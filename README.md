# Leniger Planung

Einsatzplanung für Baustellen: Wocheneinteilung, Tagesansicht, Fahrzeuge,
Urlaub und Krankmeldungen, Arbeitskleidung, Wochenberichte und Werkstatt.

React + Vite im Frontend, Supabase als Backend (Postgres, Anmeldung, Storage,
Edge Functions).

## Einrichtung

### 1. Supabase-Projekt anlegen

Auf [supabase.com](https://supabase.com) ein Projekt erstellen und die
Migrationen einspielen – entweder im SQL-Editor nacheinander:

```
supabase/migrations/0001_initial_schema.sql
supabase/migrations/0002_storage.sql
```

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

```bash
SUPABASE_URL=https://<projekt>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
node scripts/seed.mjs
```

Legt Rollen, Mitarbeiter, Fahrzeuge, Baustellen und eine Wocheneinteilung an.
Das Skript **leert die betroffenen Tabellen vorher** – nur auf einer
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
assets/logo-source.png   Vorlage für Logo und Symbole
scripts/                 Generatoren (Schema, Symbole) und Seed
```

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

### Noch offen

Diese Base44-Funktionen liegen unter `base44/functions/` und sind **nicht**
portiert, weil sie das Frontend nicht aufruft:

| Funktion | Zweck | Bewertung |
| --- | --- | --- |
| `dataApi` | Lesezugriff für die PlanPro-App per API-Key/JWT | wird gebraucht, sobald PlanPro wieder anbinden soll |
| `generateAuthToken` | Token für ebendiese Schnittstelle | gehört zu `dataApi` |
| `webhookPlanProSync_fix` | einmaliges Reparaturskript | dürfte hinfällig sein |
| `clearFutureVehicles` | Aufräumaktion für Fahrzeugzuordnungen | bei Bedarf portieren |


### Logo und Symbole

Alle Bildformate entstehen aus einer Vorlage:

```bash
node scripts/generate-icons.mjs
```

Neues Logo? `assets/logo-source.png` austauschen (quadratisch, 1024x1024, mit
transparenten Ecken) und das Skript laufen lassen. Es erzeugt das
freigestellte Zeichen für die Kopfzeile sowie die Symbole für Android, iOS und
den Browser-Tab – die drei Formate haben unterschiedliche Anforderungen
(Transparenz, randlos, deckend), deshalb lohnt der Generator.

## Befehle

```bash
npm run dev        # Entwicklungsserver
npm run build      # Produktions-Build nach dist/
npm run preview    # Build lokal ansehen
npm run lint       # ESLint
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
