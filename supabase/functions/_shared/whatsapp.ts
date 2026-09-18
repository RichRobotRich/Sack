/**
 * WhatsApp Cloud API von Meta.
 *
 * Nur das, was der Assistent braucht: Signatur prüfen, eingehende Meldungen
 * lesbar machen, Medien holen, antworten.
 *
 * Umgebungsvariablen:
 *   WHATSAPP_VERIFY_TOKEN     frei gewähltes Wort; Meta ruft damit einmalig
 *                             den Webhook zur Bestätigung auf
 *   WHATSAPP_APP_SECRET       App-Geheimnis; prüft die Signatur jeder Meldung
 *   WHATSAPP_TOKEN            Zugriffstoken für Medien und Antworten
 *   WHATSAPP_PHONE_NUMBER_ID  Absendernummer (die ID, nicht die Rufnummer)
 *
 * Zum 24-Stunden-Fenster: Meta erlaubt freie Antworten nur binnen 24 Stunden
 * nach der letzten Nachricht des Nutzers. Alles hier ist eine Antwort auf eine
 * eingegangene Nachricht und damit unkritisch. Von sich aus anfangen dürfte
 * der Bot nur mit genehmigten Vorlagen.
 */

const GRAPH_ROOT = 'https://graph.facebook.com/v21.0';

const env = (name: string) => Deno.env.get(name);

export const isConfigured = () =>
  Boolean(env('WHATSAPP_TOKEN') && env('WHATSAPP_PHONE_NUMBER_ID') && env('WHATSAPP_APP_SECRET'));

// ---------------------------------------------------------------------------
// Signatur
// ---------------------------------------------------------------------------

/**
 * Prüft X-Hub-Signature-256.
 *
 * Der Webhook ist öffentlich erreichbar - ohne diese Prüfung könnte jeder
 * Nachrichten im Namen beliebiger Monteure einliefern. Verglichen wird in
 * fester Zeit, damit sich die Signatur nicht Zeichen für Zeichen erraten
 * lässt.
 *
 * Wichtig: es muss der rohe Text sein. JSON.parse und erneutes stringify
 * ändert Reihenfolge und Leerzeichen, und die Signatur stimmt nicht mehr.
 */
export const verifySignature = async (rawBody: string, header: string | null): Promise<boolean> => {
  const secret = env('WHATSAPP_APP_SECRET');
  if (!secret || !header?.startsWith('sha256=')) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  const received = header.slice('sha256='.length);
  if (received.length !== expected.length) return false;

  let difference = 0;
  for (let index = 0; index < expected.length; index++) {
    difference |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  }
  return difference === 0;
};

/** Bestätigung des Webhooks beim Einrichten (GET mit hub.*-Parametern). */
export const verifyChallenge = (url: URL): string | null => {
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token && token === env('WHATSAPP_VERIFY_TOKEN')) return challenge;
  return null;
};

// ---------------------------------------------------------------------------
// Eingehende Meldungen
// ---------------------------------------------------------------------------

export type ParsedMessage = {
  providerMessageId: string;
  phone: string;
  kind: 'text' | 'audio' | 'image' | 'document' | 'video' | 'interactive' | 'unsupported';
  body: string | null;
  mediaId: string | null;
  mimeType: string | null;
  /** Bei Antwort auf eine Auswahlliste: die gewählte Kennung. */
  replyId: string | null;
  profileName: string | null;
  raw: unknown;
};

/**
 * Zieht die Nachrichten aus der Meldung.
 *
 * Meta schickt auch Zustellbestätigungen der eigenen Antworten (statuses).
 * Die sind hier nicht gemeint und fallen unter den Tisch - sonst entstünde
 * aus jeder Antwort eine neue Nachricht.
 */
export const parseWebhook = (payload: Record<string, unknown>): ParsedMessage[] => {
  const result: ParsedMessage[] = [];

  for (const entry of (payload?.entry as Record<string, unknown>[]) ?? []) {
    for (const change of (entry?.changes as Record<string, unknown>[]) ?? []) {
      const value = change?.value as Record<string, unknown> | undefined;
      const contacts = (value?.contacts as Record<string, unknown>[]) ?? [];
      const profileName =
        ((contacts[0]?.profile as Record<string, unknown>)?.name as string) ?? null;

      for (const message of (value?.messages as Record<string, unknown>[]) ?? []) {
        const type = message.type as string;
        const base = {
          providerMessageId: message.id as string,
          phone: `+${message.from as string}`,
          body: null as string | null,
          mediaId: null as string | null,
          mimeType: null as string | null,
          replyId: null as string | null,
          profileName,
          raw: message,
        };

        if (type === 'text') {
          result.push({
            ...base,
            kind: 'text',
            body: ((message.text as Record<string, unknown>)?.body as string) ?? null,
          });
        } else if (type === 'audio' || type === 'image' || type === 'document' || type === 'video') {
          const media = message[type] as Record<string, unknown>;
          result.push({
            ...base,
            kind: type,
            mediaId: (media?.id as string) ?? null,
            mimeType: (media?.mime_type as string) ?? null,
            // Bildunterschriften sind oft der eigentliche Inhalt.
            body: (media?.caption as string) ?? null,
          });
        } else if (type === 'interactive') {
          const interactive = message.interactive as Record<string, unknown>;
          const reply = (interactive?.list_reply ?? interactive?.button_reply) as
            Record<string, unknown> | undefined;
          result.push({
            ...base,
            kind: 'interactive',
            replyId: (reply?.id as string) ?? null,
            body: (reply?.title as string) ?? null,
          });
        } else {
          result.push({ ...base, kind: 'unsupported', body: `(${type})` });
        }
      }
    }
  }

  return result;
};

// ---------------------------------------------------------------------------
// Medien
// ---------------------------------------------------------------------------

/**
 * Lädt eine Sprachnachricht oder ein Foto herunter.
 *
 * Zwei Schritte, weil Meta die eigentliche Adresse erst auf Nachfrage
 * herausgibt - und sie gilt nur wenige Minuten. Deshalb wird sofort geladen
 * und in den eigenen Bucket gelegt, nicht erst bei der Verarbeitung.
 */
export const downloadMedia = async (mediaId: string): Promise<{ blob: Blob; mimeType: string }> => {
  const token = env('WHATSAPP_TOKEN');
  if (!token) throw new Error('WHATSAPP_TOKEN ist nicht gesetzt');

  const lookup = await fetch(`${GRAPH_ROOT}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!lookup.ok) {
    throw new Error(`Medien-Adresse nicht erhalten (${lookup.status}): ${await lookup.text()}`);
  }
  const { url, mime_type } = await lookup.json();

  const download = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!download.ok) {
    throw new Error(`Medium nicht geladen (${download.status})`);
  }

  return { blob: await download.blob(), mimeType: mime_type ?? 'application/octet-stream' };
};

// ---------------------------------------------------------------------------
// Antworten
// ---------------------------------------------------------------------------

const send = async (payload: Record<string, unknown>) => {
  const token = env('WHATSAPP_TOKEN');
  const phoneNumberId = env('WHATSAPP_PHONE_NUMBER_ID');
  if (!token || !phoneNumberId) throw new Error('WhatsApp-Zugang ist nicht vollständig eingerichtet');

  const response = await fetch(`${GRAPH_ROOT}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  });

  if (!response.ok) {
    throw new Error(`Antwort nicht zugestellt (${response.status}): ${await response.text()}`);
  }
  return await response.json();
};

export const sendText = (to: string, text: string) =>
  send({ to, type: 'text', text: { body: text, preview_url: false } });

export type ChoiceOption = { id: string; title: string; description?: string };

/**
 * Auswahlliste, etwa zur Rückfrage nach der Baustelle.
 *
 * Meta erlaubt höchstens 10 Einträge, 24 Zeichen Titel und 72 Zeichen
 * Beschreibung. Längeres wird nicht etwa gekürzt, sondern die ganze Nachricht
 * abgelehnt - deshalb wird hier geschnitten.
 */
export const sendChoice = (
  to: string,
  bodyText: string,
  options: ChoiceOption[],
  buttonLabel = 'Auswählen',
) =>
  send({
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText.slice(0, 1024) },
      action: {
        button: buttonLabel.slice(0, 20),
        sections: [{
          rows: options.slice(0, 10).map((option) => ({
            id: option.id.slice(0, 200),
            title: option.title.slice(0, 24),
            ...(option.description ? { description: option.description.slice(0, 72) } : {}),
          })),
        }],
      },
    },
  });
