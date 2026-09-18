/**
 * Rufnummern auf E.164 bringen.
 *
 * Muss mit public.normalize_phone() aus 0004_assistant_schema.sql
 * übereinstimmen: die Datenbank vergleicht die Nummer von Meta
 * ("4917012345678") mit der hier gespeicherten. Weichen die Regeln
 * voneinander ab, findet der Abgleich nichts.
 *
 * Ohne Landesvorwahl wird Deutschland angenommen.
 */
export function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^0-9]/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith('0')) return `+49${digits.slice(1)}`;
  return `+${digits}`;
}

/** Lesbare Fassung für die Anzeige: +49 170 1234567 */
export function formatPhone(e164) {
  if (!e164?.startsWith('+49')) return e164 ?? '';
  const rest = e164.slice(3);
  if (rest.length < 6) return e164;
  return `+49 ${rest.slice(0, 3)} ${rest.slice(3)}`;
}
