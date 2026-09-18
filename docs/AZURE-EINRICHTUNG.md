# Azure OpenAI einrichten – Schritt für Schritt

Der Assistent braucht drei Dinge: Sprache in Text wandeln, Text strukturieren
und Text durchsuchbar machen. Alle drei kommen aus **einem** Dienst in
**einer** EU-Region. Warum Azure und nicht ein anderer Anbieter, steht in
[ARCHITEKTUR.md](ARCHITEKTUR.md).

Zeitbedarf: 20 Minuten, plus gegebenenfalls ein bis zwei Tage Wartezeit auf
die Freischaltung.

---

## Schritt 1: Zugang beantragen

Azure OpenAI ist nicht für jedes Abo sofort nutzbar. Prüfen:

1. [portal.azure.com](https://portal.azure.com) → oben nach **Azure OpenAI**
   suchen → **Erstellen**.
2. Kommt der Hinweis, dass der Zugang beantragt werden muss, das verlinkte
   Formular ausfüllen. Antwort meist innerhalb von ein bis zwei Werktagen.
3. Lässt sich die Ressource direkt anlegen, ist alles frei – weiter mit
   Schritt 2.

## Schritt 2: Ressource anlegen

| Feld | Wert |
| --- | --- |
| Abonnement | euer Abo |
| Ressourcengruppe | neu, z. B. `leniger-assistent` |
| Region | **Sweden Central** oder **West Europe** |
| Name | z. B. `leniger-openai` |
| Tarif | Standard S0 |

Die Region ist die eine Entscheidung, die man später nicht mehr ändern kann.
Beide genannten liegen in der EU; Sweden Central hat meist die besseren
Kontingente.

## Schritt 3: Drei Bereitstellungen anlegen

Nach dem Anlegen: **Zu Ressource wechseln** → **Azure AI Foundry Portal
öffnen** → links **Bereitstellungen** (Deployments) → **Modell bereitstellen**.

Dreimal, einzeln:

| Modell | Wofür | Name merken für |
| --- | --- | --- |
| `gpt-4o` | Text strukturieren, Fragen beantworten | `AZURE_OPENAI_CHAT_DEPLOYMENT` |
| `text-embedding-3-large` | Dokumente durchsuchbar machen | `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` |
| `whisper` | Sprachnachrichten abtippen | `AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT` |

**Den Namen vergibst du selbst.** Er muss nicht dem Modellnamen entsprechen –
deshalb wird er gleich abgefragt. Am einfachsten ist es, ihn gleich zu
lassen: `gpt-4o`, `text-embedding-3-large`, `whisper`.

Steht `whisper` in deiner Region nicht zur Auswahl, geht auch
`gpt-4o-transcribe`. Beide können, was gebraucht wird.

## Schritt 4: Endpunkt und Schlüssel

Zurück im Azure-Portal, bei der Ressource: **Schlüssel und Endpunkt**.

* **Endpunkt** – sieht aus wie `https://leniger-openai.openai.azure.com/`
* **Schlüssel 1** – lange Zeichenfolge

## Schritt 5: In Supabase eintragen

Supabase → Projekt → **Edge Functions** → **Secrets**:

| Name | Wert |
| --- | --- |
| `AZURE_OPENAI_ENDPOINT` | Endpunkt aus Schritt 4 |
| `AZURE_OPENAI_API_KEY` | Schlüssel 1 aus Schritt 4 |
| `AZURE_OPENAI_CHAT_DEPLOYMENT` | Name aus Schritt 3 |
| `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` | Name aus Schritt 3 |
| `AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT` | Name aus Schritt 3 |

## Schritt 6: Prüfen

In der App unter **Erfassen** einen Satz eintippen und senden. Entsteht ein
Eintrag mit sinnvollem Titel, läuft das Textmodell. Dann eine Sprachaufnahme
– taucht im Eintrag der abgetippte Text auf, läuft auch die Transkription.

Fehlt etwas, meldet die App das ausdrücklich („Die KI-Dienste sind nicht
eingerichtet"), statt still nichts zu tun.

---

## Was es kostet

Grobe Hausnummer für 30 Monteure mit je 3 Meldungen am Tag:

| Posten | Menge | Kosten |
| --- | --- | --- |
| Sprachnachrichten abtippen | ~90/Tag à 45 Sek. | ~7 €/Monat |
| Meldungen strukturieren | ~90/Tag | ~10 €/Monat |
| Dokumente einlesen | einmalig, 1000 Seiten | ~1 € |
| Fragen beantworten | ~30/Tag | ~5 €/Monat |

Also grob **20–25 € im Monat**. Die Abrechnung erfolgt nach tatsächlicher
Nutzung; es gibt keine Grundgebühr.

## Ein Anbieterwechsel bleibt möglich

Alle KI-Aufrufe laufen über `supabase/functions/_shared/ai.ts` mit genau drei
Funktionen. Ein Wechsel – etwa zu Amazon Bedrock in Frankfurt – ist eine
Änderung in dieser einen Datei, nicht im ganzen Projekt. Einzige Bedingung:
der Ersatz muss Einbettungen mit **1536 Dimensionen** liefern, sonst passen
die gespeicherten Vektoren nicht mehr.
