// frontend/src/api/timeflowApi.js

const MODULE_AJAX_URL = (typeof window !== 'undefined' && (window.TIMEFLOW_AJAX_URL || window.DOL_URL_ROOT))
  ? (window.TIMEFLOW_AJAX_URL || `${window.DOL_URL_ROOT.replace(/\/$/, '')}/custom/timeflow/ajax/timeentry.php`)
  : '/custom/timeflow/ajax/timeentry.php';
const TIMEFLOW_TOKEN = (typeof window !== 'undefined' && window.TIMEFLOW_TOKEN) || '';
const API_MODE = import.meta.env.VITE_API_MODE || 'real';

let mockActiveTimer = null;
let mockDailyReports = [];
let mockTimeFlowProjects = [
  { id: 1, rowid: 1, title: 'Projet Alpha', ref: 'CPJ-MOCK1', description: '', source: 'manual', fk_dolibarr_project: 0, fk_soc: 1, client: 'Client Test', entry_count: 2, assigned_user_ids: [], assigned_count: 0, date_creation: '2026-07-01T09:00:00Z' },
];
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
      // A resume never rewrites the previous entry — it creates a brand new
      // one with the same project/task/note, exactly like startTimer().
      const previous = mockEntries.find((item) => item.id === Number(body?.id));
      if (!previous) return Promise.reject(new Error('Entrée introuvable.'));
      const entry = {
        id: Date.now(),
        fk_project: previous.fk_project ?? 0,
        fk_task: previous.fk_task ?? 0,
        note: previous.note ?? '',
        duration: 0,
        status: 0,
        billable: Number(previous.billable || 0),
        tags: previous.tags ?? '',
        date_start: new Date().toISOString(),
        date_end: null,
      };
      mockActiveTimer = entry;
      mockEntries.unshift(entry);
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
      return Promise.resolve({ status: 'success', data: { total_seconds: mockEntries.reduce((sum, entry) => sum + Number(entry.duration || 0), 0), billable_seconds: 0, non_billable_seconds: 0, by_project: {}, project_labels: {}, by_client: {}, client_labels: {}, by_user: {}, user_labels: {}, by_group: {}, group_labels: {}, by_tag: {}, by_status: {} } });
    case 'generateInvoiceLines':
      return Promise.resolve({ status: 'success', data: [] });

    case 'saveDailyReport': {
      const requestedStatus = Number(body?.status ?? 1);
      const report = {
        id: Date.now(),
        fk_user: 1,
        user_label: 'Utilisateur courant',
        date_report: body?.date_report,
        content: body?.content,
        status: Number.isFinite(requestedStatus) ? requestedStatus : 1,
        is_read: false,
        read_at: null,
        date_creation: new Date().toISOString(),
        date_modification: new Date().toISOString(),
      };
      mockDailyReports = [report, ...mockDailyReports];
      return Promise.resolve({ status: 'success', data: report });
    }
    case 'updateDailyReport': {
      const requestedStatus = body?.status == null ? null : Number(body.status);
      mockDailyReports = mockDailyReports.map((report) => report.id === Number(body?.id)
        ? {
            ...report,
            content: body?.content,
            status: requestedStatus == null ? report.status : requestedStatus,
            date_modification: new Date().toISOString(),
            date_last_content_edit: new Date().toISOString(),
          }
        : report);
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
    case 'validateDailyReport': {
      mockDailyReports = mockDailyReports.map((report) => report.id === Number(body?.id) ? { ...report, status: 2, is_read: true, read_at: new Date().toISOString() } : report);
      return Promise.resolve({ status: 'success', data: { id: Number(body?.id), status: 2 } });
    }
    case 'rejectDailyReport': {
      mockDailyReports = mockDailyReports.map((report) => report.id === Number(body?.id) ? { ...report, status: 9, is_read: true, read_at: new Date().toISOString() } : report);
      return Promise.resolve({ status: 'success', data: { id: Number(body?.id), status: 9 } });
    }

    case 'submitWeeklyApproval':
      return Promise.resolve({ status: 'success', data: [] });

    case 'listActiveUsers':
      return Promise.resolve({
        status: 'success',
        data: [
          { id: 1, login: 'jdupont', firstname: 'Jean', lastname: 'Dupont', label: 'Jean Dupont' },
          { id: 2, login: 'msmith', firstname: 'Mary', lastname: 'Smith', label: 'Mary Smith' },
        ],
      });
    case 'listUserGroups':
      return Promise.resolve({
        status: 'success',
        data: [
          { id: 2, rowid: 2, title: 'idara', label: 'idara' },
        ],
      });
    case 'getTimeFlowProjects': {
      const clientId = Number(body?.client_id || 0);
      const dateFrom = body?.date_from || '';
      const dateTo = body?.date_to || '';
      const search = String(body?.search || '').trim().toLowerCase();
      const filtered = mockTimeFlowProjects.filter((project) => {
        if (clientId > 0 && Number(project.fk_soc) !== clientId) return false;
        const createdDate = String(project.date_creation || '').slice(0, 10);
        if (dateFrom && createdDate < dateFrom) return false;
        if (dateTo && createdDate > dateTo) return false;
        if (search && !project.title.toLowerCase().includes(search) && !String(project.ref || '').toLowerCase().includes(search)) return false;
        return true;
      });
      return Promise.resolve({ status: 'success', data: filtered });
    }
    case 'createTimeFlowProject': {
      const assignedUserIds = Array.isArray(body?.assigned_user_ids) ? body.assigned_user_ids.map(Number) : [];
      const project = {
        id: Date.now(),
        rowid: Date.now(),
        title: body?.title ?? '',
        ref: 'CPJ-MOCK'+Date.now(),
        description: body?.description ?? '',
        source: 'manual',
        fk_dolibarr_project: 0,
        fk_soc: Number(body?.fk_soc || 0),
        client: '',
        entry_count: 0,
        assigned_user_ids: assignedUserIds,
        assigned_count: assignedUserIds.length,
        date_creation: new Date().toISOString(),
      };
      mockTimeFlowProjects = [project, ...mockTimeFlowProjects];
      return Promise.resolve({ status: 'success', data: { id: project.id, title: project.title } });
    }
    case 'updateTimeFlowProject': {
      const id = Number(body?.id);
      const assignedUserIds = Array.isArray(body?.assigned_user_ids) ? body.assigned_user_ids.map(Number) : [];
      mockTimeFlowProjects = mockTimeFlowProjects.map((project) => project.id === id
        ? { ...project, title: body?.title ?? project.title, description: body?.description ?? project.description, fk_soc: Number(body?.fk_soc || 0), assigned_user_ids: assignedUserIds, assigned_count: assignedUserIds.length }
        : project);
      return Promise.resolve({ status: 'success', data: { id } });
    }
    case 'deleteTimeFlowProject': {
      const id = Number(body?.id);
      mockTimeFlowProjects = mockTimeFlowProjects.filter((project) => project.id !== id);
      return Promise.resolve({ status: 'success', data: { id } });
    }
    case 'deleteTimeFlowProjects': {
      const ids = Array.isArray(body?.ids) ? body.ids.map(Number) : [];
      mockTimeFlowProjects = mockTimeFlowProjects.filter((project) => !ids.includes(Number(project.id)));
      return Promise.resolve({ status: 'success', data: { deleted: ids, failed: [] } });
    }
    case 'listActiveThirdParties':
      return Promise.resolve({
        status: 'success',
        data: [{ id: 1, rowid: 1, title: 'Client Test', label: 'Client Test' }],
      });

    case 'resolveClockifyMapping': {
      const decisions = Array.isArray(body?.decisions) ? body.decisions : [];
      const updated = decisions.map((decision) => ({
        mapping_type: decision.mapping_type,
        source_system: 'clockify',
        source_value: decision.source_value,
        target_id: decision.resolution === 'matched' ? Number(decision.target_id) : null,
        target_action: decision.resolution === 'matched' ? 'matched' : 'create_confirmed',
        status: decision.resolution === 'matched' ? 'matched' : 'create_confirmed',
        new_label: decision.resolution === 'create_new' ? (decision.new_title || decision.source_value) : null,
      }));
      return Promise.resolve({ status: 'success', data: updated });
    }

    default:
      return Promise.resolve({ status: 'success', data: [] });
  }
}

export async function getActiveTimer() {
  const data = await moduleTimerRequest('getActiveTimer');
  return normalizeEntry(data?.data ?? null);
}

export async function startTimer(fkProject = 0, fkTask = 0, note = '') {
  const data = await moduleTimerRequest('startTimer', {
    fk_project: fkProject,
    fk_task: fkTask,
    note,
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
  const payload = data?.data ?? data;
  const entry = normalizeEntry(payload);
  // A timer left running past the max-duration cap is split at midnight into
  // extra entries server-side (see TimeEntry::stopTimer()); surface them so
  // the caller can add them to the list immediately instead of waiting for a
  // full reload to notice the extra rows.
  if (entry && Array.isArray(payload?.split_segments)) {
    entry.split_segments = payload.split_segments.map(normalizeEntry);
  }
  return entry;
}

export async function restartTimer(id) {
  const data = await moduleTimerRequest('restartTimer', { id });
  return normalizeEntry(data?.data ?? data);
}

export async function deleteTimeEntry(id) {
  const data = await moduleTimerRequest('deleteTimeEntry', { id });
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

export async function getTimeFlowProjects(filters = {}) {
  const data = await moduleTimerRequest('getTimeFlowProjects', {
    client_id: filters.clientId || 0,
    date_from: filters.dateFrom || '',
    date_to: filters.dateTo || '',
    search: filters.search || '',
  });
  return Array.isArray(data?.data) ? data.data : [];
}

export async function createTimeFlowProject(title, fkSoc = 0, description = '', assignedUserIds = []) {
  const data = await moduleTimerRequest('createTimeFlowProject', { title, fk_soc: fkSoc, description, assigned_user_ids: assignedUserIds });
  return data?.data ?? data;
}

export async function updateTimeFlowProject(id, title, fkSoc = 0, description = '', assignedUserIds = []) {
  const data = await moduleTimerRequest('updateTimeFlowProject', { id, title, fk_soc: fkSoc, description, assigned_user_ids: assignedUserIds });
  return data?.data ?? data;
}

export async function deleteTimeFlowProject(id) {
  const data = await moduleTimerRequest('deleteTimeFlowProject', { id });
  return data?.data ?? data;
}

export async function deleteTimeFlowProjects(ids = []) {
  const data = await moduleTimerRequest('deleteTimeFlowProjects', { ids: Array.from(ids) });
  return data?.data ?? data;
}

export async function listActiveThirdParties() {
  const data = await moduleTimerRequest('listActiveThirdParties');
  return Array.isArray(data?.data) ? data.data : [];
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

export async function saveDailyReport(dateReport, content, status = 1) {
  const data = await moduleTimerRequest('saveDailyReport', { date_report: dateReport, content, status });
  return data?.data ?? data;
}

export async function updateDailyReport(id, content, status = null) {
  const payload = { id, content };
  if (status !== null && status !== undefined) payload.status = status;
  const data = await moduleTimerRequest('updateDailyReport', payload);
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

export async function validateDailyReport(id) {
  return moduleTimerRequest('validateDailyReport', { id });
}

export async function rejectDailyReport(id) {
  return moduleTimerRequest('rejectDailyReport', { id });
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

export async function listActiveUsers() {
  const data = await moduleTimerRequest('listActiveUsers');
  return Array.isArray(data?.data) ? data.data : [];
}

export async function listUserGroups() {
  const data = await moduleTimerRequest('listUserGroups');
  return Array.isArray(data?.data) ? data.data : [];
}

/**
 * Persists a batch of mapping resolution decisions (user -> existing
 * Dolibarr user, project -> existing timeflow project or a confirmed new
 * project title). Writes only to llx_timeflow_import_mapping — never
 * creates a Dolibarr user account or a real llx_timeflow_project row.
 */
export async function resolveClockifyMapping(decisions = []) {
  const data = await moduleTimerRequest('resolveClockifyMapping', { decisions });
  return Array.isArray(data?.data) ? data.data : [];
}

/**
 * Uploads a Clockify CSV export for a dry-run preview (mapping resolution
 * only, no writes to llx_timeflow_timeentry). Unlike moduleTimerRequest,
 * the body is multipart/form-data, so no Content-Type header is set here —
 * the browser generates the boundary for FormData automatically.
 */
export async function previewClockifyImport(file) {
  if (API_MODE === 'mock') {
    return Promise.resolve({
      source: 'clockify',
      total_rows: 3,
      blocked_rows: 1,
      skipped_rows: 0,
      users: [
        { mapping_type: 'user', source_value: 'jane@example.com', target_action: 'matched' },
        { mapping_type: 'user', source_value: 'new.hire@example.com', target_action: 'create_pending' },
      ],
      projects: [
        { mapping_type: 'project', source_value: 'Projet Alpha', target_action: 'matched' },
        { mapping_type: 'project', source_value: '', target_action: 'ignored' },
      ],
      stats: { matched_users: 1, pending_users: 1, ignored_users: 0, matched_projects: 1, pending_projects: 0, ignored_projects: 1 },
    });
  }

  const formData = new FormData();
  formData.append('csv_file', file);

  const url = `${buildApiUrl('previewClockifyImport')}&token=${encodeURIComponent(TIMEFLOW_TOKEN)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    credentials: 'include',
    body: formData,
  });

  const responseText = await response.text();
  let data = null;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    throw new Error(responseText || 'Réponse invalide du serveur.');
  }

  if (!response.ok || data?.status === 'error') {
    throw new Error(data?.message || data?.error || `Erreur d’import (${response.status})`);
  }

  return data?.data ?? data;
}

/**
 * Re-submits the same CSV file (the browser keeps the File object in memory
 * as long as the preview modal stays open — see the backend design note on
 * TimeImportClockify::executeImportFromCsvPath()) once every mapping is
 * resolved, to actually create the confirmed projects/groups, link group
 * memberships, and import the eligible time entries.
 */
export async function executeClockifyImport(file) {
  if (API_MODE === 'mock') {
    return Promise.resolve({
      projects_created: [],
      groups_created: [{ source_value: 'HRM', id: 999, title: 'HRM' }],
      group_memberships_created: 3,
      group_memberships_skipped: 0,
      time_entries_created: 5,
      time_entries_skipped_empty: 0,
      time_entries_skipped_unresolved: 1,
      time_entries_skipped_already_imported: 0,
      time_entries_skipped_invalid: 0,
      unresolved_rows: [{ row: 4, reason: 'user_not_found', value: 'unknown@example.com' }],
      errors: [],
    });
  }

  const formData = new FormData();
  formData.append('csv_file', file);

  const url = `${buildApiUrl('executeClockifyImport')}&token=${encodeURIComponent(TIMEFLOW_TOKEN)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    credentials: 'include',
    body: formData,
  });

  const responseText = await response.text();
  let data = null;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    throw new Error(responseText || 'Réponse invalide du serveur.');
  }

  if (!response.ok || data?.status === 'error') {
    throw new Error(data?.message || data?.error || `Erreur d’exécution de l’import (${response.status})`);
  }

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
