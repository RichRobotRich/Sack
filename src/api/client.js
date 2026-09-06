/**
 * Datenzugriff der App – gestützt auf Supabase.
 *
 * Die Oberfläche ist bewusst identisch zu der, die vorher das Base44-SDK
 * geliefert hat (entities / auth / integrations / functions). Dadurch musste
 * beim Umzug in den 50 Seiten- und Komponenten-Dateien nur der Import
 * getauscht werden, statt jeden Aufruf umzuschreiben.
 *
 *   import { api } from '@/api/client';
 *   const employees = await api.entities.Employee.filter({ is_active: true });
 */

import { supabase } from '@/api/supabase';

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/** Employee -> employee, LeaveRequest -> leave_request (wie in der Migration). */
const toTableName = (entityName) =>
  entityName.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

// Die User-Entity heißt in der Datenbank profiles und hängt an auth.users.
const TABLE_OVERRIDES = { User: 'profiles' };

const tableFor = (entityName) => TABLE_OVERRIDES[entityName] ?? toTableName(entityName);

/**
 * Sortier-Argumente kommen im Base44-Format: 'feld' aufsteigend,
 * '-feld' absteigend.
 */
const applySort = (query, sort) => {
  if (!sort) return query;
  const descending = sort.startsWith('-');
  const column = descending ? sort.slice(1) : sort;
  return query.order(column, { ascending: !descending });
};

/**
 * Supabase meldet Fehler im Ergebnis statt per Exception. Der aufrufende Code
 * erwartet aber durchgehend ein Promise, das im Fehlerfall wirft.
 */
const unwrap = ({ data, error }, context) => {
  if (error) {
    const failure = new Error(`${context}: ${error.message}`);
    failure.cause = error;
    failure.status = error.code;
    throw failure;
  }
  return data;
};

/** E-Mail des angemeldeten Kontos – füllt created_by wie früher Base44. */
const currentUserEmail = async () => {
  const { data } = await supabase.auth.getUser();
  return data?.user?.email ?? null;
};

const createEntityApi = (entityName) => {
  const table = tableFor(entityName);

  return {
    /** Alle Datensätze, optional sortiert ('-created_date'). */
    async list(sort) {
      const query = applySort(supabase.from(table).select('*'), sort);
      return unwrap(await query, `${entityName}.list`) ?? [];
    },

    /**
     * Datensätze mit Gleichheitsbedingungen. Die App nutzt ausschließlich
     * einfache Feld/Wert-Vergleiche; null bedeutet dabei "Feld ist leer".
     */
    async filter(criteria = {}, sort) {
      let query = supabase.from(table).select('*');
      for (const [column, value] of Object.entries(criteria)) {
        query = value === null ? query.is(column, null) : query.eq(column, value);
      }
      return unwrap(await applySort(query, sort), `${entityName}.filter`) ?? [];
    },

    async get(id) {
      const result = await supabase.from(table).select('*').eq('id', id).single();
      return unwrap(result, `${entityName}.get`);
    },

    async create(values) {
      const row = { ...values, created_by: values.created_by ?? (await currentUserEmail()) };
      const result = await supabase.from(table).insert(row).select().single();
      return unwrap(result, `${entityName}.create`);
    },

    async bulkCreate(rows) {
      if (!rows?.length) return [];
      const createdBy = await currentUserEmail();
      const payload = rows.map((row) => ({ ...row, created_by: row.created_by ?? createdBy }));
      const result = await supabase.from(table).insert(payload).select();
      return unwrap(result, `${entityName}.bulkCreate`) ?? [];
    },

    async update(id, values) {
      const result = await supabase.from(table).update(values).eq('id', id).select().single();
      return unwrap(result, `${entityName}.update`);
    },

    async delete(id) {
      const result = await supabase.from(table).delete().eq('id', id);
      unwrap(result, `${entityName}.delete`);
      return { id };
    },
  };
};

// Muss zu den Tabellen aus supabase/migrations/0001_initial_schema.sql passen.
const ENTITY_NAMES = [
  'Assignment',
  'BridgeDay',
  'CellInfo',
  'ClothingDelivery',
  'ClothingIssue',
  'ClothingItem',
  'ClothingRequest',
  'ClothingReturn',
  'Crew',
  'EmailRecipient',
  'Employee',
  'LeaveApprovalRule',
  'LeaveRequest',
  'News',
  'Poll',
  'Project',
  'ProjectComment',
  'Role',
  'TempAssignment',
  'TempWorker',
  'TempWorkerProjectRow',
  'User',
  'Vehicle',
  'WeeklyReport',
  'WorkshopTask',
];

const entities = Object.fromEntries(
  ENTITY_NAMES.map((name) => [name, createEntityApi(name)]),
);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const LOGIN_PATH = '/login';

/**
 * Konto und zugehöriges Profil zu einem Objekt zusammenführen. Der bestehende
 * Code liest user.email und user.full_name direkt neben Profilfeldern wie
 * user.role_id – deshalb bleibt es eine flache Struktur.
 */
const mergeUserAndProfile = (authUser, profile) => ({
  ...profile,
  id: authUser.id,
  email: authUser.email,
  full_name: profile?.full_name ?? authUser.user_metadata?.full_name ?? null,
});

const auth = {
  /** Aktuell angemeldeter Benutzer inklusive Profil. Wirft, wenn niemand angemeldet ist. */
  async me() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) {
      const failure = new Error('Nicht angemeldet');
      failure.status = 401;
      throw failure;
    }
    const profile = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();
    return mergeUserAndProfile(data.user, unwrap(profile, 'auth.me'));
  },

  /** Eigene Profilfelder ändern (Anzeigename, gespeicherte Sortierung, ...). */
  async updateMe(values) {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) throw new Error('Nicht angemeldet');
    const result = await supabase
      .from('profiles')
      .update(values)
      .eq('id', data.user.id)
      .select()
      .single();
    return mergeUserAndProfile(data.user, unwrap(result, 'auth.updateMe'));
  },

  async isAuthenticated() {
    const { data } = await supabase.auth.getSession();
    return Boolean(data?.session);
  },

  async updatePassword(password) {
    return unwrap(await supabase.auth.updateUser({ password }), 'auth.updatePassword');
  },

  async updateEmail(email) {
    return unwrap(await supabase.auth.updateUser({ email }), 'auth.updateEmail');
  },

  /**
   * Abmelden. Das Base44-SDK nahm hier eine Ziel-URL entgegen und sprang
   * dorthin; diese Signatur bleibt erhalten, damit die Aufrufer unverändert
   * funktionieren.
   */
  async logout(redirectTo) {
    await supabase.auth.signOut();
    if (redirectTo !== undefined && typeof window !== 'undefined') {
      window.location.href = LOGIN_PATH;
    }
  },

  /** Zur Anmeldeseite wechseln und den bisherigen Ort als Rücksprungziel merken. */
  redirectToLogin(returnTo) {
    if (typeof window === 'undefined') return;
    const target = returnTo ?? window.location.href;
    window.location.href = `${LOGIN_PATH}?redirect=${encodeURIComponent(target)}`;
  },

  /**
   * Löscht das eigene Konto. Das kann der Browser-Client nicht selbst, weil
   * dafür Service-Role-Rechte nötig sind – erledigt die Edge Function.
   */
  async deleteAccount() {
    const result = await supabase.functions.invoke('delete-account');
    if (result.error) throw result.error;
    await supabase.auth.signOut();
    return result.data;
  },
};

// ---------------------------------------------------------------------------
// Integrationen (früher base44.integrations.Core)
// ---------------------------------------------------------------------------

const UPLOAD_BUCKET = 'uploads';

const integrations = {
  Core: {
    /** Versand über die Edge Function send-email. */
    async SendEmail({ to, subject, body, from_name }) {
      const result = await supabase.functions.invoke('send-email', {
        body: { to, subject, body, from_name },
      });
      if (result.error) throw result.error;
      return result.data;
    },

    /**
     * Datei in den Storage-Bucket legen. Rückgabe ist { file_url }, genau wie
     * beim alten SDK – die Aufrufer destrukturieren das direkt.
     */
    async UploadFile({ file }) {
      const extension = file.name?.includes('.') ? `.${file.name.split('.').pop()}` : '';
      const path = `${crypto.randomUUID()}${extension}`;
      const upload = await supabase.storage
        .from(UPLOAD_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upload.error) throw upload.error;
      const { data } = supabase.storage.from(UPLOAD_BUCKET).getPublicUrl(upload.data.path);
      return { file_url: data.publicUrl };
    },
  },
};

// ---------------------------------------------------------------------------
// Edge Functions
// ---------------------------------------------------------------------------

// Im Frontend genutzte Funktionen, übersetzt auf die Namen der Edge Functions.
const FUNCTION_NAMES = {
  listAllUsers: 'list-all-users',
  getUserCount: 'get-user-count',
  updateUser: 'update-user',
  sendDailyViewPDFEmail: 'send-daily-view-pdf-email',
  downloadWeeklyReport: 'download-weekly-report',
};

const functions = {
  /**
   * Die Aufrufer lesen das Ergebnis als response.data – deshalb wird hier die
   * gleiche Hülle zurückgegeben, die das alte SDK geliefert hat.
   */
  async invoke(name, payload = {}, options = {}) {
    const functionName = FUNCTION_NAMES[name] ?? name;
    const result = await supabase.functions.invoke(functionName, {
      body: payload,
      ...options,
    });
    if (result.error) throw result.error;
    return { data: result.data };
  },
};

export const api = { entities, auth, integrations, functions };
export { supabase };
