/**
 * OneDrive-Anbindung für das Hallendisplay.
 *
 * Base44 hielt die OAuth-Tokens in einem eigenen Connector-Dienst vor
 * (connectors.getConnection('one_drive')). Dafür gibt es bei Supabase kein
 * Gegenstück, deshalb holt sich diese Datei das Zugriffstoken selbst über den
 * Refresh-Token-Ablauf von Microsoft Entra ID.
 *
 * Einmalige Einrichtung:
 *   1. App-Registrierung in Microsoft Entra ID anlegen.
 *   2. Delegierte Berechtigungen Files.ReadWrite und offline_access erteilen
 *      (dieselben Scopes wie im alten Connector, base44/connectors/one_drive.jsonc).
 *   3. Einmal interaktiv anmelden und den Refresh-Token abgreifen.
 *
 * Umgebungsvariablen der Edge Function:
 *   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_REFRESH_TOKEN
 *
 * Fehlt eine davon, meldet isConfigured() false: der Versand läuft dann ohne
 * OneDrive weiter, statt komplett zu scheitern.
 */

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
export const ONEDRIVE_FOLDER = 'Tageseinteilung';

const env = (name: string) => Deno.env.get(name);

export const isConfigured = () =>
  Boolean(env('MS_TENANT_ID') && env('MS_CLIENT_ID') && env('MS_CLIENT_SECRET') && env('MS_REFRESH_TOKEN'));

/** Tauscht den langlebigen Refresh-Token gegen ein kurzlebiges Zugriffstoken. */
export const getAccessToken = async (): Promise<string> => {
  const response = await fetch(
    `https://login.microsoftonline.com/${env('MS_TENANT_ID')}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env('MS_CLIENT_ID')!,
        client_secret: env('MS_CLIENT_SECRET')!,
        refresh_token: env('MS_REFRESH_TOKEN')!,
        grant_type: 'refresh_token',
        scope: 'https://graph.microsoft.com/.default',
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`OneDrive-Anmeldung fehlgeschlagen (${response.status}): ${await response.text()}`);
  }
  const { access_token } = await response.json();
  return access_token;
};

/** Leert den Zielordner, damit auf dem Display nur die aktuelle Einteilung liegt. */
export const clearFolder = async (accessToken: string) => {
  const listResponse = await fetch(`${GRAPH_ROOT}/me/drive/root:/${ONEDRIVE_FOLDER}:/children`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listResponse.ok) return; // Ordner existiert noch nicht – nichts zu löschen

  const { value: items = [] } = await listResponse.json();
  await Promise.all(
    items.map((item: { id: string }) =>
      fetch(`${GRAPH_ROOT}/items/${item.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ),
  );
};

export const uploadFile = async (accessToken: string, fileName: string, content: ArrayBuffer) => {
  // Ordner anlegen, falls er fehlt.
  const folderResponse = await fetch(`${GRAPH_ROOT}/me/drive/root:/${ONEDRIVE_FOLDER}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!folderResponse.ok) {
    await fetch(`${GRAPH_ROOT}/me/drive/root/children`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: ONEDRIVE_FOLDER,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'replace',
      }),
    });
  }

  const uploadResponse = await fetch(
    `${GRAPH_ROOT}/me/drive/root:/${ONEDRIVE_FOLDER}/${fileName}:/content`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/pdf' },
      body: content,
    },
  );

  if (!uploadResponse.ok) {
    throw new Error(`OneDrive-Upload fehlgeschlagen (${uploadResponse.status}): ${await uploadResponse.text()}`);
  }
  const result = await uploadResponse.json();
  return result.webUrl ?? null;
};
