/**
 * Prüfung der WhatsApp-Anbindung ohne Netz und ohne Deno.
 *
 *   npm run test:whatsapp
 *
 * Geprüft wird das, was sicherheitsrelevant ist oder still falsch laufen
 * kann: die Signaturprüfung und das Auslesen der Meldungen von Meta.
 * Deno.env wird vorher gestubbt, damit das Modul in Node lädt.
 */

const SECRET = 'test-app-secret';

(globalThis as unknown as { Deno: unknown }).Deno = {
  env: {
    get: (name: string) => ({
      WHATSAPP_APP_SECRET: SECRET,
      WHATSAPP_VERIFY_TOKEN: 'geheimes-wort',
      WHATSAPP_TOKEN: 'token',
      WHATSAPP_PHONE_NUMBER_ID: '123',
    } as Record<string, string>)[name],
  },
};

const { verifySignature, verifyChallenge, parseWebhook } =
  await import('../supabase/functions/_shared/whatsapp.ts');

let failures = 0;
let checks = 0;

const check = (label: string, actual: unknown, expected: unknown) => {
  checks++;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.log(`FEHLER  ${label}\n        erwartet: ${JSON.stringify(expected)}\n        erhalten: ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok      ${label}`);
  }
};

const signiere = async (body: string, secret = SECRET) => {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return 'sha256=' + Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

console.log('--- Signatur ---');
const body = '{"object":"whatsapp_business_account","entry":[]}';
check('gültige Signatur', await verifySignature(body, await signiere(body)), true);
check('fremdes Geheimnis', await verifySignature(body, await signiere(body, 'falsch')), false);
check('veränderter Text', await verifySignature(body + ' ', await signiere(body)), false);
check('kein Kopfzeilenwert', await verifySignature(body, null), false);
check('falsches Präfix', await verifySignature(body, 'sha1=abc'), false);
check('zu kurze Signatur', await verifySignature(body, 'sha256=abc'), false);

console.log('\n--- Bestätigung beim Einrichten ---');
check('richtiges Wort',
  verifyChallenge(new URL('https://x/?hub.mode=subscribe&hub.verify_token=geheimes-wort&hub.challenge=4711')),
  '4711');
check('falsches Wort',
  verifyChallenge(new URL('https://x/?hub.mode=subscribe&hub.verify_token=falsch&hub.challenge=4711')),
  null);

console.log('\n--- Meldungen von Meta ---');
const meldung = (messages: unknown[], extra: Record<string, unknown> = {}) => ({
  entry: [{ changes: [{ value: { contacts: [{ profile: { name: 'Max Muster' } }], messages, ...extra } }] }],
});

const text = parseWebhook(meldung([
  { id: 'wamid.1', from: '4917012345678', type: 'text', text: { body: 'Steigleitung fertig' } },
]));
check('Text: Anzahl', text.length, 1);
check('Text: Rufnummer bekommt ein Plus', text[0].phone, '+4917012345678');
check('Text: Inhalt', text[0].body, 'Steigleitung fertig');
check('Text: Absendername', text[0].profileName, 'Max Muster');

const audio = parseWebhook(meldung([
  { id: 'wamid.2', from: '4917012345678', type: 'audio', audio: { id: 'media-1', mime_type: 'audio/ogg; codecs=opus' } },
]));
check('Sprachnachricht: Art', audio[0].kind, 'audio');
check('Sprachnachricht: Medien-Kennung', audio[0].mediaId, 'media-1');

const foto = parseWebhook(meldung([
  { id: 'wamid.3', from: '4917012345678', type: 'image', image: { id: 'media-2', mime_type: 'image/jpeg', caption: 'Riss im Estrich' } },
]));
check('Foto: Bildunterschrift wird Inhalt', foto[0].body, 'Riss im Estrich');

const auswahl = parseWebhook(meldung([
  { id: 'wamid.4', from: '4917012345678', type: 'interactive',
    interactive: { type: 'list_reply', list_reply: { id: 'proj:abc', title: 'Klinikum' } } },
]));
check('Auswahl: gewählte Kennung', auswahl[0].replyId, 'proj:abc');

// Der wichtigste Fall: Meta meldet auch die Zustellung der eigenen Antworten.
// Würden die als Nachricht gelten, entstünde eine Endlosschleife.
check('Zustellbestätigung ist keine Nachricht',
  parseWebhook({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'delivered' }] } }] }] }).length,
  0);
check('leere Meldung', parseWebhook({}).length, 0);

const mehrere = parseWebhook(meldung([
  { id: 'wamid.5', from: '4917012345678', type: 'text', text: { body: 'eins' } },
  { id: 'wamid.6', from: '4917012345678', type: 'text', text: { body: 'zwei' } },
]));
check('mehrere Nachrichten in einer Meldung', mehrere.length, 2);

console.log(`\n${checks - failures} von ${checks} bestanden.`);
if (failures > 0) process.exit(1);
