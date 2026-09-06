/**
 * E-Mail-Versand.
 *
 * Base44 brachte integrations.Core.SendEmail als fertigen Dienst mit. Hier
 * übernimmt das Resend (https://resend.com) über die HTTP-API – kein
 * zusätzliches Paket nötig. Für einen anderen Anbieter genügt es, sendEmail()
 * auszutauschen; alle Aufrufer gehen über diese Funktion.
 *
 * Nötige Umgebungsvariablen der Edge Function:
 *   RESEND_API_KEY  – API-Schlüssel
 *   MAIL_FROM       – Absender, z. B. "Leniger <planung@example.de>"
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export type SendEmailInput = {
  to: string;
  subject: string;
  body: string;
  from_name?: string;
};

export const sendEmail = async ({ to, subject, body, from_name }: SendEmailInput) => {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const defaultFrom = Deno.env.get('MAIL_FROM');

  if (!apiKey || !defaultFrom) {
    throw new Error('RESEND_API_KEY oder MAIL_FROM ist nicht gesetzt');
  }

  // from_name darf nur den Anzeigenamen ändern, nicht die Absenderadresse –
  // sonst könnte ein Aufrufer im Namen einer fremden Domain versenden.
  const address = defaultFrom.includes('<')
    ? defaultFrom.slice(defaultFrom.indexOf('<'))
    : `<${defaultFrom}>`;
  const from = from_name ? `${from_name} ${address}` : defaultFrom;

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, text: body }),
  });

  if (!response.ok) {
    throw new Error(`E-Mail-Versand fehlgeschlagen (${response.status}): ${await response.text()}`);
  }
  return await response.json();
};
