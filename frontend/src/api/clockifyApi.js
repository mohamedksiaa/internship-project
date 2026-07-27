// frontend/src/api/clockifyApi.js

const DEFAULT_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || ((typeof window !== 'undefined' && window.DOL_URL_ROOT) ? `${window.DOL_URL_ROOT.replace(/\/$/, '')}/api/index.php` : '/api/index.php');
const MODULE_AJAX_URL = (typeof window !== 'undefined' && window.DOL_URL_ROOT)
  ? `${window.DOL_URL_ROOT.replace(/\/$/, '')}/custom/clockify/ajax/timeentry.php`
  : '/custom/clockify/ajax/timeentry.php';
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

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '');
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return entry;
  }

  return {
    ...entry,
    id: entry.id ?? entry.rowid ?? null,
    rowid: entry.rowid ?? entry.id ?? null,
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

export function buildApiUrl(endpoint, base = DEFAULT_BASE_URL) {
  const normalizedBase = normalizeBaseUrl(base);
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${normalizedBase}/clockify/timeentrys${normalizedEndpoint}`;
}

function getApiHeaders(body) {
  const headers = {
    Accept: 'application/json',
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

async function readApiError(response) {
  const text = await response.text();

  try {
    const parsed = JSON.parse(text);
    return parsed.message || parsed.error || text || 'Erreur API inconnue';
  } catch {
    return text || 'Erreur API inconnue';
  }
}

async function apiRequest(endpoint, method = 'GET', body = null) {
  if (API_MODE === 'mock') {
    return handleMockRequest(endpoint, method, body);
  }

  const url = buildApiUrl(endpoint);
  const options = {
    method,
    headers: getApiHeaders(body),
    credentials: 'include',
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Erreur API (${response.status}): ${await readApiError(response)}`);
  }

  const responseText = await response.text();
  if (!responseText) return null;
  try {
    return JSON.parse(responseText);
  } catch {
    return responseText;
  }
}

async function moduleTimerRequest(action, body = null) {
  const response = await fetch(`${MODULE_AJAX_URL}?action=${encodeURIComponent(action)}`, {
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

function buildDolibarrApiUrl(endpoint, base = DEFAULT_BASE_URL) {
  const normalizedBase = normalizeBaseUrl(base);
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${normalizedBase}${normalizedEndpoint}`;
}

async function dolibarrRequest(endpoint, method = 'GET', body = null) {
  if (API_MODE === 'mock') {
    return handleMockDolibarrRequest(endpoint, method, body);
  }

  const url = buildDolibarrApiUrl(endpoint);
  const options = {
    method,
    headers: getApiHeaders(body),
    credentials: 'include',
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Erreur API (${response.status}): ${await readApiError(response)}`);
  }

  const responseText = await response.text();
  if (!responseText) return null;
  try {
    return JSON.parse(responseText);
  } catch {
    return responseText;
  }
}

function handleMockDolibarrRequest(endpoint, method, body) {
  if (endpoint.startsWith('/projects')) {
    return Promise.resolve([
      { id: 1, title: 'Projet Alpha' },
      { id: 2, title: 'Projet Beta' },
    ]);
  }

  if (endpoint.startsWith('/tasks')) {
    return Promise.resolve([
      { id: 1, title: 'Tâche analyse' },
      { id: 2, title: 'Tâche corrective' },
    ]);
  }

  return Promise.resolve([]);
}

function handleMockRequest(endpoint, method, body) {
  if (endpoint.includes('/validate')) {
    const match = endpoint.match(/^\/([0-9]+)\/validate$/);
    if (match) {
      const entry = mockEntries.find((item) => item.id === Number(match[1]));
      if (!entry) {
        return Promise.reject(new Error('Entrée introuvable.'));
      }
      entry.status = 1;
      return Promise.resolve(entry);
    }
  }

  if (endpoint.includes('/reject')) {
    const match = endpoint.match(/^\/([0-9]+)\/reject$/);
    if (match) {
      const entry = mockEntries.find((item) => item.id === Number(match[1]));
      if (!entry) {
        return Promise.reject(new Error('Entrée introuvable.'));
      }
      entry.status = 9;
      return Promise.resolve(entry);
    }
  }

  switch (endpoint) {
    case '/active':
      return Promise.resolve(mockActiveTimer);
    case '/start': {
      const entry = {
        id: Date.now(),
        fk_project: body?.fk_project ?? 0,
        note: body?.note ?? '',
        duration: 0,
        status: 0,
        date_start: new Date().toISOString(),
      };
      mockActiveTimer = entry;
      mockEntries.unshift(entry);
      return Promise.resolve({ id: entry.id });
    }
    case '/stop': {
      if (!mockActiveTimer) {
        return Promise.reject(new Error('Aucun chrono actif à arrêter.'));
      }
      mockActiveTimer = null;
      return Promise.resolve({ success: true });
    }
    default:
      return Promise.resolve(mockEntries);
  }
}

export async function getActiveTimer() {
  const data = await apiRequest('/active', 'GET');
  return normalizeEntry(data);
}

export async function startTimer(fkProject, fkTask = 0, note = '') {
  const data = await moduleTimerRequest('startTimer', {
    fk_project: fkProject,
    fk_task: fkTask,
    note,
  });

  // Support both the current API response ({ id }) and older Dolibarr AJAX
  // responses ({ status, data }) while installations update their cache.
  const payload = data?.data ?? data;
  const numericId = typeof payload === 'number' || (typeof payload === 'string' && /^\d+$/.test(payload.trim()));
  const entry = normalizeEntry(numericId ? { id: Number(payload) } : payload);
  if (!entry?.id) {
    throw new Error('Le serveur n’a pas renvoyé l’identifiant du chrono créé.');
  }
  return entry;
}

export async function stopTimer(id) {
  const data = await moduleTimerRequest('stopTimer', { id });
  return normalizeEntry(data);
}

export async function getTimeEntries() {
  const data = await apiRequest('', 'GET');
  return normalizeEntries(data);
}

export async function approveTimeEntry(id) {
  const data = await apiRequest(`/${id}/validate`, 'POST');
  return normalizeEntry(data);
}

export async function rejectTimeEntry(id) {
  const data = await apiRequest(`/${id}/reject`, 'POST');
  return normalizeEntry(data);
}

export async function getProjects(limit = 0) {
  const data = await dolibarrRequest(`/projects?limit=${limit}`, 'GET');
  return normalizeProjects(data);
}

export async function getTasks(projectId = 0, limit = 100) {
  const projectFilter = Number(projectId) > 0
    ? `&sqlfilters=${encodeURIComponent(`(t.fk_projet:=:${Number(projectId)})`)}`
    : '';
  const data = await dolibarrRequest(`/tasks?limit=${limit}${projectFilter}`, 'GET');
  return normalizeTasks(data);
}

export function normalizeProjects(payload) {
  if (Array.isArray(payload)) {
    return payload.map((project) => ({
      id: project.id ?? project.rowid,
      title: project.title || project.name || project.label || 'Projet',
    }));
  }

  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  return rows.map((project) => ({
    id: project.id ?? project.rowid,
    title: project.title || project.name || project.label || 'Projet',
  }));
}

export function normalizeTasks(payload) {
  if (Array.isArray(payload)) {
    return payload.map((task) => ({
      id: task.id ?? task.rowid,
      title: task.title || task.label || task.name || 'Tâche',
    }));
  }

  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  return rows.map((task) => ({
    id: task.id ?? task.rowid,
    title: task.title || task.label || task.name || 'Tâche',
  }));
}
