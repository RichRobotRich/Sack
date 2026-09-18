# WhatsApp einrichten – Schritt für Schritt

Zeitbedarf: etwa eine Stunde für die Technik. Dazu kommt die Prüfung durch
Meta, die ein bis mehrere Tage dauern kann und auf die niemand Einfluss hat.

Du brauchst vorab:

* eine **Firmen-Rufnummer, die noch nicht bei WhatsApp registriert ist**.
  Eine Nummer, die schon in der normalen WhatsApp- oder WhatsApp-Business-App
  benutzt wird, geht **nicht**. Festnetz ist möglich, wenn die Nummer einen
  Anruf entgegennehmen kann.
* Zugang zu einem Facebook-Konto (privat reicht zum Anlegen).
* die Firmendaten: Name, Anschrift, Website, Umsatzsteuer-ID.

> Meta ändert die Beschriftungen in der Konsole regelmäßig. Wenn ein Menüpunkt
> anders heißt, ist er meist nur umbenannt oder verschoben – die Reihenfolge
> der Schritte bleibt.

---

## Teil 1 – Meta-Konten anlegen

### Schritt 1: Meta-Unternehmenskonto

1. [business.facebook.com](https://business.facebook.com) öffnen und anmelden.
2. **Unternehmenskonto erstellen**, Firmenname und Geschäfts-E-Mail eintragen.
3. Die Bestätigungsmail anklicken.

### Schritt 2: Unternehmensverifizierung starten

Das dauert am längsten – deshalb **jetzt** anstoßen, nicht am Ende.

1. In den **Unternehmenseinstellungen** → **Unternehmensinfo**.
2. **Verifizierung starten** und die Firmendaten eintragen.
3. Als Nachweis genügt meist ein Handelsregisterauszug oder ein
   Gewerbeschein. Wichtig: Name und Anschrift müssen **exakt** mit dem
   Dokument übereinstimmen – ein abgekürztes „GmbH" statt „Gesellschaft mit
   beschränkter Haftung" führt zur Ablehnung.

Ohne Verifizierung darfst du nur an **fünf** Testnummern schreiben. Zum
Ausprobieren reicht das; für 10–30 Monteure nicht.

### Schritt 3: Entwickler-App anlegen

1. [developers.facebook.com](https://developers.facebook.com) → **Meine Apps**
   → **App erstellen**.
2. Anwendungsfall: **Andere** → App-Typ: **Business**.
3. Name vergeben (z. B. „Leniger Assistent"), das Unternehmenskonto aus
   Schritt 1 auswählen.

### Schritt 4: WhatsApp hinzufügen

1. In der App unter **Produkt hinzufügen** bei **WhatsApp** auf
   **Einrichten**.
2. Meta legt automatisch ein *WhatsApp Business Account* und eine
   **Testnummer** an.

An dieser Stelle kannst du schon alles ausprobieren – mit der Testnummer und
bis zu fünf Empfängern.

---

## Teil 2 – Die vier Geheimnisse einsammeln

Diese vier Werte kommen später nach Supabase. **Nirgendwo sonst hinschreiben**,
schon gar nicht in eine Chat-Nachricht oder eine Datei im Projekt.

### Schritt 5: App-Geheimnis (`WHATSAPP_APP_SECRET`)

**App-Einstellungen → Grundlegendes → App-Geheimnis → Anzeigen**

Damit prüft die App, dass eine eingehende Meldung wirklich von Meta kommt.
Ohne diesen Wert weist der Webhook alles ab.

### Schritt 6: Rufnummern-Kennung (`WHATSAPP_PHONE_NUMBER_ID`)

**WhatsApp → API-Einrichtung**, dort steht unter „Von" die
**Telefonnummer-ID**. Das ist eine lange Zahl – **nicht** die Rufnummer
selbst.

Gleich daneben steht die **WhatsApp Business Account-ID**. Die brauchst du in
Schritt 7.

### Schritt 7: Dauerhaftes Zugriffstoken (`WHATSAPP_TOKEN`)

Das Token auf der Seite „API-Einrichtung" läuft nach **24 Stunden** ab. Für
den Dauerbetrieb brauchst du ein Systembenutzer-Token:

1. **Unternehmenseinstellungen** → **Nutzer** → **Systembenutzer** →
   **Hinzufügen**.
2. Name z. B. „Assistent", Rolle **Admin**.
3. Beim neuen Systembenutzer auf **Assets hinzufügen** → **Apps** → deine App
   auswählen → **Vollzugriff verwalten**.
4. Nochmal: **Assets hinzufügen** → **WhatsApp-Konten** → dein WhatsApp
   Business Account → **Vollzugriff**.
5. **Token generieren** → App auswählen → Ablauf: **Nie** → diese zwei
   Berechtigungen anhaken:
   * `whatsapp_business_messaging`
   * `whatsapp_business_management`
6. **Das Token wird genau einmal angezeigt.** Sofort kopieren.

### Schritt 8: Bestätigungswort (`WHATSAPP_VERIFY_TOKEN`)

Das denkst du dir selbst aus – irgendeine zufällige Zeichenfolge, z. B.
`leniger-webhook-7f3a9c2e`. Meta schickt es beim Einrichten einmal an den
Webhook zurück, damit der prüfen kann, dass die Anfrage erwartet war.

---

## Teil 3 – Mit der App verbinden

### Schritt 9: Geheimnisse in Supabase hinterlegen

Supabase → dein Projekt → **Edge Functions** → **Secrets** → **Add new secret**

| Name | Wert aus |
| --- | --- |
| `WHATSAPP_APP_SECRET` | Schritt 5 |
| `WHATSAPP_PHONE_NUMBER_ID` | Schritt 6 |
| `WHATSAPP_TOKEN` | Schritt 7 |
| `WHATSAPP_VERIFY_TOKEN` | Schritt 8 |

Die Azure-Werte aus `docs/AZURE-EINRICHTUNG.md` gehören an dieselbe Stelle.

### Schritt 10: Funktionen bereitstellen

Am Rechner, im Projektordner:

```bash
supabase link --project-ref qsssrzsniwdrmgedaveg
supabase functions deploy
```

Braucht die [Supabase CLI](https://supabase.com/docs/guides/cli).

### Schritt 11: Webhook bei Meta eintragen

1. **WhatsApp → Konfiguration** → bei „Webhook" auf **Bearbeiten**.
2. Eintragen:

   **Callback-URL**
   ```
   https://qsssrzsniwdrmgedaveg.supabase.co/functions/v1/whatsapp-webhook
   ```

   **Verifizierungstoken**: dein Wort aus Schritt 8.

3. **Überprüfen und speichern**.

   Kommt hier ein Fehler, stimmt entweder das Wort nicht mit
   `WHATSAPP_VERIFY_TOKEN` überein, oder die Funktion ist noch nicht
   bereitgestellt.

4. Danach in der Liste darunter bei **messages** auf **Abonnieren**.

   Nur `messages` – die anderen Felder braucht der Assistent nicht.

### Schritt 12: Nummern freigeben

In der App: **Verwaltung → WhatsApp-Nummern**

1. **Aus Mitarbeitern** übernimmt alle hinterlegten Telefonnummern.
2. Jede Nummer einzeln mit dem Schalter **freigeben**.

Das ist kein Formalismus: Der Webhook ist öffentlich erreichbar. Wer nicht
freigegeben ist, wird abgewiesen – das ist die einzige Zugangskontrolle des
Kanals.

---

## Teil 4 – Ausprobieren

### Schritt 13: Erster Test

Von einer freigegebenen Nummer an die Testnummer schreiben:

```
#hilfe
```

Kommt eine Antwort, steht die Verbindung in beide Richtungen.

Dann der eigentliche Test – eine Sprachnachricht:

> „Heute auf der Baustelle Musterstraße die Steigleitung im zweiten
> Obergeschoss fertig gemacht, DN 32. Zwei Absperrventile fehlen noch,
> die müssen bestellt werden."

Erwartet: eine Bestätigung mit Titel, und in der App unter **Einträge** ein
Protokoll **plus** eine Aufgabe „Absperrventile bestellen".

### Wenn nichts passiert

| Symptom | Ursache |
| --- | --- |
| gar keine Antwort | Nummer nicht freigegeben, oder Webhook nicht abonniert |
| „Diese Nummer ist nicht freigegeben" | Schritt 12 fehlt |
| Antwort kommt, aber kein Eintrag | Azure-Geheimnisse fehlen oder sind falsch |
| Meta zeigt Fehler beim Speichern | Verifizierungstoken stimmt nicht |

Was tatsächlich ankam, steht in Supabase in der Tabelle `inbound_message` –
mit Status und Fehlertext. Die Protokolle der Funktion stehen unter
**Edge Functions → whatsapp-webhook → Logs**.

---

## Teil 5 – In den Echtbetrieb

### Schritt 14: Eigene Rufnummer

Erst wenn die Verifizierung aus Schritt 2 durch ist.

1. **WhatsApp → API-Einrichtung** → **Telefonnummer hinzufügen**.
2. Anzeigename eingeben – der wird von Meta geprüft und muss zum
   Firmennamen passen. „Leniger Planung" geht, „Baustellen-Bot" nicht.
3. Nummer per SMS oder Anruf bestätigen.
4. **Die Telefonnummer-ID ändert sich dadurch.** Den neuen Wert in Supabase
   unter `WHATSAPP_PHONE_NUMBER_ID` eintragen, sonst antwortet der Assistent
   weiter über die Testnummer.

### Schritt 15: Was es kostet

Antworten innerhalb von 24 Stunden nach einer Nachricht des Nutzers sind
**kostenlos**. Genau so arbeitet der Assistent: er antwortet nur, er fängt
nie von sich aus an. Bei 30 Monteuren ist mit keinen nennenswerten Kosten zu
rechnen.

Kosten entstünden erst, wenn der Assistent von sich aus schreiben soll – dann
braucht es von Meta genehmigte Vorlagen, und jede kostet.

---

## Was die Monteure wissen müssen

Das reicht als Aushang:

> **Sprich einfach drauf.** Sag dazu, auf welcher Baustelle du bist –
> am besten mit der Kostenträger-Nummer.
>
> Aufgaben („muss noch bestellt werden") werden automatisch als solche
> erkannt. Fotos gehen auch, gern mit einem gesprochenen Satz dazu.
>
> Wenn du den ganzen Tag auf derselben Baustelle bist:
> `#baustelle Musterstraße` einmal schreiben, dann ist das für 12 Stunden
> gesetzt. `#ende` hebt es auf, `#hilfe` erklärt es nochmal.

## Datenschutz – kurz und ehrlich

Der kritische Punkt ist nicht die KI, sondern WhatsApp selbst. Meta Ireland
verarbeitet die Verkehrsdaten. Vor dem Ausrollen zu klären:

* Die Mitarbeiter informieren, dass dienstliche Meldungen über WhatsApp
  laufen und was damit passiert.
* Eintrag im Verzeichnis der Verarbeitungstätigkeiten.
* Klare Ansage: **keine** Gesundheitsdaten (Krankmeldungen!) und keine
  personenbezogenen Kundendaten über diesen Weg. Dafür gibt es die App.
* Gibt es einen Betriebsrat, gehört das Thema vorher dorthin – ein Kanal, über
  den Arbeitsleistung dokumentiert wird, ist mitbestimmungspflichtig.
