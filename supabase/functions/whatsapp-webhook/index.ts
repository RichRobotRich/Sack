/**
 * Eingang von WhatsApp.
 *
 * Diese Funktion ist öffentlich erreichbar – Meta kann kein Anmeldetoken
 * mitschicken (verify_jwt = false in config.toml). Geschützt wird sie durch
 * zwei Dinge: die Signaturprüfung hier und die Freigabe der Rufnummer im
 * Handler.
 *
 * Meta erwartet die Bestätigung binnen weniger Sekunden und stellt sonst
 * erneut zu. Deshalb: entgegennehmen, wegschreiben, 200 melden – und die
 * eigentliche Arbeit danach im Hintergrund.
 */

import { serviceRoleClient } from '../_shared/context.ts';
import { isConfigured, parseWebhook, verifyChallenge, verifySignature } from '../_shared/whatsapp.ts';
import { handleInboundMessage } from '../_shared/whatsapp-handler.ts';

// EdgeRuntime ist in den Typen von Deno nicht enthalten.
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void } | undefined;

const background = (work: Promise<unknown>) => {
  if (typeof EdgeRuntime !== 'undefined') {
    EdgeRuntime.waitUntil(work);
  } else {
    // Ohne EdgeRuntime (lokal) wenigstens die Fehler sehen.
    work.catch((error) => console.error('Hintergrundarbeit fehlgeschlagen:', error));
  }
};

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Einmalige Bestätigung beim Einrichten des Webhooks bei Meta.
  if (req.method === 'GET') {
    const challenge = verifyChallenge(url);
    return challenge
      ? new Response(challenge, { status: 200 })
      : new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  if (!isConfigured()) {
    console.error('WhatsApp ist nicht eingerichtet – Meldung verworfen.');
    return new Response('ok', { status: 200 });
  }

  // Der rohe Text, nicht das geparste Objekt: erneutes Serialisieren ändert
  // Reihenfolge und Leerzeichen, und die Signatur stimmt nicht mehr.
  const rawBody = await req.text();

  if (!await verifySignature(rawBody, req.headers.get('x-hub-signature-256'))) {
    console.error('Signatur stimmt nicht – Meldung verworfen.');
    return new Response('Forbidden', { status: 403 });
  }

  let messages;
  try {
    messages = parseWebhook(JSON.parse(rawBody));
  } catch (error) {
    console.error('Meldung nicht lesbar:', error);
    return new Response('ok', { status: 200 });
  }

  // Zustellbestätigungen der eigenen Antworten enthalten keine Nachrichten.
  if (messages.length === 0) return new Response('ok', { status: 200 });

  const admin = serviceRoleClient();
  const angenommen: { id: string }[] = [];

  for (const message of messages) {
    // onConflict statt insert: Meta stellt bei ausbleibender Bestätigung
    // erneut zu. Ohne das entstünde aus einer Sprachnachricht ein zweites
    // Protokoll.
    const { data, error } = await admin
      .from('inbound_message')
      .upsert({
        channel: 'whatsapp',
        provider_message_id: message.providerMessageId,
        phone: message.phone,
        kind: message.kind,
        body: message.body,
        media_id: message.mediaId,
        mime_type: message.mimeType,
        raw: message.raw,
      }, { onConflict: 'provider_message_id', ignoreDuplicates: true })
      .select('id');

    if (error) {
      console.error('Nachricht nicht gespeichert:', error.message);
      continue;
    }
    // Leeres Ergebnis heißt: schon einmal zugestellt, nichts weiter zu tun.
    if (data?.[0]) angenommen.push(data[0]);
  }

  background((async () => {
    for (const row of angenommen) {
      const { data: message } = await admin
        .from('inbound_message')
        .select('*')
        .eq('id', row.id)
        .single();
      if (!message) continue;

      try {
        await handleInboundMessage(admin, message);
      } catch (error) {
        console.error('Verarbeitung fehlgeschlagen:', error);
        await admin
          .from('inbound_message')
          .update({ status: 'fehler', error: (error as Error).message })
          .eq('id', row.id);
        // Für den Nacharbeiter vormerken.
        await admin.from('ingest_job').upsert({
          kind: 'inbound_message',
          ref_id: row.id,
          status: 'wartend',
          run_after: new Date(Date.now() + 60_000).toISOString(),
        }, { onConflict: 'kind,ref_id', ignoreDuplicates: true });
      }
    }
  })());

  return new Response('ok', { status: 200 });
});
