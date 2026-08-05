// frontend/src/api/clockifyApi.js

const MODULE_AJAX_URL = (typeof window !== 'undefined' && (window.CLOCKIFY_AJAX_URL || window.DOL_URL_ROOT))
  ? (window.CLOCKIFY_AJAX_URL || `${window.DOL_URL_ROOT.replace(/\/$/, '')}/custom/clockify/ajax/timeentry.php`)
  : '/custom/clockify/ajax/timeentry.php';
const CLOCKIFY_TOKEN = (typeof window !== 'undefined' && window.CLOCKIFY_TOKEN) || '';
const API_MODE = import.meta.env.VITE_API_MODE || 'real';

let mockActiveTimer = null;
const mockEntries = [
  {
    id: 101,
    fk_project: 1,
    note: 'Analyse du module Clockify',
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

  const url = `${buildApiUrl(action)}&token=${encodeURIComponent(CLOCKIFY_TOKEN)}`;
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
    case 'getWeeklyTimesheet':
      return Promise.resolve({ status: 'success', data: { weekStart: '2026-07-28', weekEnd: '2026-08-04', rows: mockEntries.map(normalizeEntry) } });
    case 'getSummaryReports':
      return Promise.resolve({ status: 'success', data: { total_seconds: mockEntries.reduce((sum, entry) => sum + Number(entry.duration || 0), 0), billable_seconds: 0, non_billable_seconds: 0, by_project: {}, by_tag: {}, by_status: {} } });
    case 'generateInvoiceLines':
      return Promise.resolve({ status: 'success', data: [] });

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

export async function startTimer(projectLabel = '', fkTask = 0, note = '', tags = '', billable = 0) {
  const data = await moduleTimerRequest('startTimer', {
    fk_project: 0,
    fk_task: fkTask,
    note,
    project_label: projectLabel,
    tags,
    billable,
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

export async function getTimeEntries(limit = 100) {
  const data = await moduleTimerRequest('getTimeEntries', { limit });
  return normalizeEntries(data?.data ?? data);
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


export async function updateEntry(id, updates) {
  const data = await moduleTimerRequest('updateEntry', { id, ...updates });
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