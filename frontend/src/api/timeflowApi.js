// frontend/src/api/timeflowApi.js

const MODULE_AJAX_URL = (typeof window !== 'undefined' && (window.TIMEFLOW_AJAX_URL || window.DOL_URL_ROOT))
  ? (window.TIMEFLOW_AJAX_URL || `${window.DOL_URL_ROOT.replace(/\/$/, '')}/custom/timeflow/ajax/timeentry.php`)
  : '/custom/timeflow/ajax/timeentry.php';
const TIMEFLOW_TOKEN = (typeof window !== 'undefined' && window.TIMEFLOW_TOKEN) || '';
const API_MODE = import.meta.env.VITE_API_MODE || 'real';

let mockActiveTimer = null;
let mockDailyReports = [];
const mockEntries = [
  {
    id: 101,
    fk_project: 1,
    note: 'Analyse du module TimeFlow',
    duration: 5400,
    status: 1,
    date_start: '2026-07-22T09:00:00Z',
  },
  {
    id: 102,
    fk_project: 2,
    note: 'Mise à jour de la vue temps',
    duration: 3600,
    status: 0,
    date_start: '2026-07-21T14:30:00Z',
  },
];

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return entry;
  }
  return {
    ...entry,
    id: entry.id ?? entry.rowid ?? null,
    rowid: entry.rowid ?? entry.id ?? null,
    tags: entry.tags ?? '',
    project_label: entry.project_label ?? entry.project_name ?? entry.project?.title ?? entry.project?.label ?? entry.project?.name ?? '',
    // This capability comes from the server; never infer it from UI state.
    delete_allowed: entry.delete_allowed === true || Number(entry.delete_allowed) === 1,
    delete_requires_strong_confirmation: entry.delete_requires_strong_confirmation === true || Number(entry.delete_requires_strong_confirmation) === 1,
    // Soft-delete flag provided by the server; fallback to presence of date_delete.
    is_deleted: entry.is_deleted === true || Number(entry.is_deleted) === 1 || (entry.date_delete && entry.date_delete !== ''),
  };
}

function normalizeEntries(payload) {
  if (Array.isArray(payload)) {
    return payload.map(normalizeEntry);
  }
  const rows = Array.isArray(payload?.rows)
    ? payload.rows
    : Array.isArray(payload?.data)
    ? payload.data
    : [];
  return rows.map(normalizeEntry);
}

function getApiHeaders(body) {
  const headers = { Accept: 'application/json' };
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

export function buildApiUrl(action, baseUrl = MODULE_AJAX_URL) {
  const url = new URL(baseUrl, 'http://localhost');
  url.searchParams.set('action', action);
  return `${url.pathname}${url.search}`;
}

async function moduleTimerRequest(action, body = null) {
  if (API_MODE === 'mock') {
    return handleMockRequest(action, body);
  }

  const url = `${buildApiUrl(action)}&token=${encodeURIComponent(TIMEFLOW_TOKEN)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: getApiHeaders(body),
    credentials: 'include',
    body: body ? JSON.stringify(body) : null,
  });

  const responseText = await response.text();
  let data = null;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    throw new Error(responseText || 'Réponse invalide du serveur.');
  }

  if (!response.ok || data?.status === 'error') {
    throw new Error(data?.message || data?.error || `Erreur du chrono (${response.status})`);
  }

  return data;
}

function handleMockRequest(action, body) {
  switch (action) {
    case 'getActiveTimer':
      return Promise.resolve({ status: 'success', data: mockActiveTimer });
    case 'startTimer': {
      const entry = {
        id: Date.now(),
        fk_project: body?.fk_project ?? 0,
        note: body?.note ?? '',
        duration: 0,
        status: 0,
        billable: Number(body?.billable || 0),
        tags: body?.tags ?? '',
        date_start: new Date().toISOString(),
      };
      mockActiveTimer = entry;
      mockEntries.unshift(entry);
      return Promise.resolve({ status: 'success', id: entry.id });
    }
    case 'stopTimer':
      if (!mockActiveTimer) {
        return Promise.reject(new Error('Aucun chrono actif à arrêter.'));
      }
      mockActiveTimer = null;
      return Promise.resolve({ status: 'success', data: {} });
    case 'getTimeEntries':
      return Promise.resolve({ status: 'success', data: mockEntries });
    case 'restartTimer': {
      const entry = mockEntries.find((item) => item.id === Number(body?.id));
      if (!entry) return Promise.reject(new Error('Entrée introuvable.'));
      entry.date_start = new Date().toISOString();
      entry.date_end = null;
      entry.status = 0;
      return Promise.resolve({ status: 'success', data: entry });
    }
    case 'deleteTimeEntry': {
      const id = Number(body?.id);
      const index = mockEntries.findIndex((item) => item.id === id);
      if (index < 0) return Promise.reject(new Error('Entrée introuvable.'));
      if (Number(mockEntries[index].status) !== 0) {
        return Promise.reject(new Error('Suppression refusée : une entrée soumise, validée ou refusée est immuable pour un utilisateur normal'));
      }
      mockEntries.splice(index, 1);
      if (mockActiveTimer?.id === id) mockActiveTimer = null;
      return Promise.resolve({ status: 'success', data: { id } });
    }
    case 'hardDeleteTimeEntry': {
      const id = Number(body?.id);
      if (!Number.isFinite(id) || id <= 0) return Promise.reject(new Error('Entrée introuvable.'));
      const index = mockEntries.findIndex((item) => item.id === id);
      if (index >= 0) mockEntries.splice(index, 1);
      return Promise.resolve({ status: 'success', data: { id, deleted: true } });
    }
    case 'hardDeleteTimeEntries': {
      const ids = Array.isArray(body?.ids) ? body.ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0) : [];
      if (!ids.length) return Promise.reject(new Error('Aucune entrée sélectionnée.'));
      for (const id of ids) {
        const index = mockEntries.findIndex((entry) => entry.id === id);
        if (index >= 0) mockEntries.splice(index, 1);
      }
      return Promise.resolve({ status: 'success', data: { deleted: ids.length, ids } });
    }
    case 'getValidationEntries':
      return Promise.resolve({ status: 'success', data: mockEntries.filter((entry) => Number(entry.status) === 1) });
    case 'getUpdateMarker':
      return Promise.resolve({ status: 'success', data: { marker: mockEntries.map((entry) => `${entry.id}:${entry.status}`).join('|') } });
    case 'getTimeEntryUpdates': {
      const marker = mockEntries.map((entry) => `${entry.id}:${entry.date_end || ''}:${entry.duration}:${entry.status}`).join('|');
      const scope = body?.scope === 'validation' ? 'validation' : 'entries';
      const entries = scope === 'validation' ? mockEntries.filter((entry) => Number(entry.status) === 1) : mockEntries;
      return Promise.resolve({ status: 'success', data: { marker, changed: Boolean(body?.marker) && body.marker !== marker, entries } });
    }
    case 'validateEntry': {
      const entry = mockEntries.find((item) => item.id === Number(body?.id));
      if (entry) entry.status = 2;
      return Promise.resolve({ status: 'success', data: entry || {} });
    }
    case 'rejectEntry': {
      const entry = mockEntries.find((item) => item.id === Number(body?.id));
      if (entry) entry.status = 9;
      return Promise.resolve({ status: 'success', data: entry || {} });
    }
    case 'getProjects':
      return Promise.resolve({
        status: 'success',
        data: [
          { id: 1, title: 'Projet Alpha' },
          { id: 2, title: 'Projet Beta' },
        ],
      });
    case 'getTasks':
      return Promise.resolve({
        status: 'success',
        data: [
          { id: 1, title: 'Tâche analyse' },
          { id: 2, title: 'Tâche corrective' },
        ],
      });
    case 'createManualEntry':
      {
        const startMs = new Date(body?.date_start).getTime();
        const endMs = new Date(body?.date_end).getTime();
        return Promise.resolve({
          status: 'success',
          data: normalizeEntry({
            id: Date.now(),
            fk_project: body?.fk_project ?? 0,
            fk_task: body?.fk_task ?? 0,
            note: body?.note ?? '',
            tags: body?.tags ?? '',
            billable: body?.billable ? 1 : 0,
            duration: Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, (endMs - startMs) / 1000) : 0,
            status: 2,
            date_start: body?.date_start,
            date_end: body?.date_end,
          }),
        });
      }
    case 'submitEntry':
      return Promise.resolve({ status: 'success', data: { ...(body || {}), status: 1 } });
    case 'correctTimeEntry': {
      const entry = mockEntries.find((item) => item.id === Number(body?.id));
      if (!entry) return Promise.reject(new Error('Entrée introuvable.'));
      const startMs = new Date(body?.date_start).getTime();
      const endMs = new Date(body?.date_end).getTime();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        return Promise.reject(new Error('Les heures de début et de fin sont invalides.'));
      }
      Object.assign(entry, {
        date_start: body.date_start,
        date_end: body.date_end,
        duration: Math.round((endMs - startMs) / 1000),
        manual_modified: true,
        manual_reason: body?.reason || 'Correction mineure (15 minutes ou moins).',
      });
      return Promise.resolve({ status: 'success', data: entry });
    }
    case 'getWeeklyTimesheet':
      return Promise.resolve({ status: 'success', data: { weekStart: '2026-07-28', weekEnd: '2026-08-04', rows: mockEntries.map(normalizeEntry) } });
    case 'getSummaryReports':
      return Promise.resolve({ status: 'success', data: { total_seconds: mockEntries.reduce((sum, entry) => sum + Number(entry.duration || 0), 0), billable_seconds: 0, non_billable_seconds: 0, by_project: {}, by_tag: {}, by_status: {} } });
    case 'generateInvoiceLines':
      return Promise.resolve({ status: 'success', data: [] });

    case 'saveDailyReport': {
      const report = { id: Date.now(), fk_user: 1, user_label: 'Utilisateur courant', date_report: body?.date_report, content: body?.content, is_read: false, read_at: null, date_creation: new Date().toISOString(), date_modification: new Date().toISOString() };
      mockDailyReports = [report, ...mockDailyReports];
      return Promise.resolve({ status: 'success', data: report });
    }
    case 'updateDailyReport': {
      mockDailyReports = mockDailyReports.map((report) => report.id === Number(body?.id) ? { ...report, content: body?.content, date_modification: new Date().toISOString() } : report);
      const updated = mockDailyReports.find((r) => r.id === Number(body?.id));
      return Promise.resolve({ status: 'success', data: updated || {} });
    }
    case 'deleteDailyReport': {
      mockDailyReports = mockDailyReports.filter((report) => report.id !== Number(body?.id));
      return Promise.resolve({ status: 'success' });
    }
    case 'getMyDailyReports':
      return Promise.resolve({ status: 'success', data: mockDailyReports });
    case 'getDailyReports':
      return Promise.resolve({ status: 'success', data: { reports: mockDailyReports, employees: [] } });
    case 'markDailyReportRead':
      mockDailyReports = mockDailyReports.map((report) => report.id === Number(body?.id) ? { ...report, is_read: true, read_at: new Date().toISOString() } : report);
      return Promise.resolve({ status: 'success' });

    case 'submitWeeklyApproval':
      return Promise.resolve({ status: 'success', data: [] });
    default:
      return Promise.resolve({ status: 'success', data: [] });
  }
}

export async function getActiveTimer() {
  const data = await moduleTimerRequest('getActiveTimer');
  return normalizeEntry(data?.data ?? null);
}

export async function startTimer(projectLabel = '', fkTask = 0, note = '') {
  const data = await moduleTimerRequest('startTimer', {
    fk_project: 0,
    fk_task: fkTask,
    note,
    project_label: projectLabel,
    // Explicit flag: caller started without selecting a project
    allow_no_project: projectLabel === '' ? true : false,
  });
  const payload = data?.data ?? data;
  const numericId = typeof payload === 'number' || (typeof payload === 'string' && /^\d+$/.test(payload.trim()));
  const entry = normalizeEntry(numericId ? { id: Number(payload) } : (payload?.id ? payload : { id: data?.id }));
  if (!entry?.id) {
    throw new Error('Le serveur n’a pas renvoyé l’identifiant du chrono créé.');
  }
  return entry;
}

export async function createManualEntry(payload) {
  const data = await moduleTimerRequest('createManualEntry', payload);
  return normalizeEntry(data?.data ?? data);
}

export async function submitEntry(id) {
  const data = await moduleTimerRequest('submitEntry', { id });
  return normalizeEntry(data?.data ?? data);
}

export async function stopTimer(id) {
  const data = await moduleTimerRequest('stopTimer', { id });
  return normalizeEntry(data?.data ?? data);
}

export async function restartTimer(id) {
  const data = await moduleTimerRequest('restartTimer', { id });
  return normalizeEntry(data?.data ?? data);
}

export async function deleteTimeEntry(id) {
  const data = await moduleTimerRequest('deleteTimeEntry', { id });
  return data?.data ?? data;
}

export async function hardDeleteTimeEntry(id) {
  const data = await moduleTimerRequest('hardDeleteTimeEntry', { id });
  return data?.data ?? data;
}

export async function hardDeleteTimeEntries(ids = []) {
  const data = await moduleTimerRequest('hardDeleteTimeEntries', { ids: Array.from(ids) });
  return data?.data ?? data;
}

export async function getTimeEntries(limit = 100) {
  const data = await moduleTimerRequest('getTimeEntries', { limit });
  return normalizeEntries(data?.data ?? data);
}

export async function getValidationEntries(limit = 100) {
  const data = await moduleTimerRequest('getValidationEntries', { limit });
  return normalizeEntries(data?.data ?? data);
}

export async function getProcessedHistory(filters = {}) {
  const data = await moduleTimerRequest('getProcessedHistory', filters);
  const payload = data?.data ?? data ?? {};
  return { ...payload, rows: normalizeEntries(payload.rows), employees: Array.isArray(payload.employees) ? payload.employees : [] };
}

export async function exportProcessedHistory(filters = {}) {
  const data = await moduleTimerRequest('exportProcessedHistory', filters);
  const payload = data?.data ?? data ?? {};
  return normalizeEntries(payload.rows);
}

export async function getUpdateMarker(scope = 'entries') {
  const data = await moduleTimerRequest('getUpdateMarker', { scope });
  return String(data?.data?.marker ?? data?.marker ?? '');
}

export async function getTimeEntryUpdates(scope = 'entries', marker = '') {
  const data = await moduleTimerRequest('getTimeEntryUpdates', { scope, marker });
  const payload = data?.data ?? data ?? {};
  return {
    marker: String(payload.marker ?? ''),
    changed: Boolean(payload.changed),
    entries: normalizeEntries(payload.entries),
  };
}

export async function approveTimeEntry(id) {
  const data = await moduleTimerRequest('validateEntry', { id });
  return normalizeEntry(data?.data ?? data);
}

export async function rejectTimeEntry(id) {
  const data = await moduleTimerRequest('rejectEntry', { id });
  return normalizeEntry(data?.data ?? data);
}

export async function getProjects() {
  const data = await moduleTimerRequest('getProjects');
  return normalizeProjects(data?.data ?? data);
}

export async function getTasks(projectId = 0, limit = 100) {
  const data = await moduleTimerRequest('getTasks', { projectId, limit });
  return normalizeTasks(data?.data ?? data);
}

export async function getWeeklyTimesheet(weekStart = '') {
  const data = await moduleTimerRequest('getWeeklyTimesheet', { weekStart });
  return data?.data ?? data;
}

export async function getSummaryReports(limit = 1000, dateFrom = '', dateTo = '') {
  const data = await moduleTimerRequest('getSummaryReports', { limit, date_from: dateFrom, date_to: dateTo });
  return data?.data ?? data;
}

export async function generateInvoiceLines(fkSoc = 0) {
  const data = await moduleTimerRequest('generateInvoiceLines', { fk_soc: fkSoc });
  return data?.data ?? data;
}

export async function saveDailyReport(dateReport, content) {
  const data = await moduleTimerRequest('saveDailyReport', { date_report: dateReport, content });
  return data?.data ?? data;
}

export async function updateDailyReport(id, content) {
  const data = await moduleTimerRequest('updateDailyReport', { id, content });
  return data?.data ?? data;
}

export async function deleteDailyReport(id) {
  const data = await moduleTimerRequest('deleteDailyReport', { id });
  return data?.data ?? data;
}

export async function getMyDailyReports(filters = {}) {
  const data = await moduleTimerRequest('getMyDailyReports', filters);
  return data?.data ?? [];
}

export async function getDailyReports(filters = {}) {
  const data = await moduleTimerRequest('getDailyReports', filters);
  return data?.data ?? { reports: [], employees: [] };
}

export async function markDailyReportRead(id) {
  return moduleTimerRequest('markDailyReportRead', { id });
}


export async function updateEntry(id, updates) {
  const data = await moduleTimerRequest('updateEntry', { id, ...updates });
  return normalizeEntry(data?.data ?? data);
}

/**
 * The only client-side entry point for changing an existing time range.
 * The server applies the employee tolerance policy and writes the audit log.
 */
export async function correctTimeEntry(id, updates) {
  const data = await moduleTimerRequest('correctTimeEntry', { id, ...updates });
  return normalizeEntry(data?.data ?? data);
}

export async function getModificationHistory(entryId) {
  const data = await moduleTimerRequest('getModificationHistory', { entryId });
  return data?.data ?? [];
}

export async function submitWeeklyApproval(ids = []) {
  const data = await moduleTimerRequest('submitWeeklyApproval', { ids });
  return data?.data ?? data;
}

export function normalizeProjects(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.rows)
    ? payload.rows
    : Array.isArray(payload?.data)
    ? payload.data
    : [];
  return rows.map((project) => ({
    id: project.id ?? project.rowid,
    title: project.title || project.name || project.label || project.ref || 'Projet',
    ref: project.ref || '',
    client: project.client || '',
  }));
}

export function normalizeTasks(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.rows)
    ? payload.rows
    : Array.isArray(payload?.data)
    ? payload.data
    : [];
  return rows.map((task) => ({
    id: task.id ?? task.rowid,
    title: task.title || task.label || task.name || 'Tâche',
  }));
}
