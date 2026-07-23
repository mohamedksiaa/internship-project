// frontend/src/api/clockifyApi.js

const DEFAULT_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '/api/index.php';
const API_MODE = import.meta.env.VITE_API_MODE || 'mock';
const API_KEY = import.meta.env.VITE_API_KEY || '';

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

export function buildApiUrl(endpoint, base = DEFAULT_BASE_URL) {
  const normalizedBase = normalizeBaseUrl(base);
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${normalizedBase}/clockify/timeentrys${normalizedEndpoint}`;
}

function getApiHeaders() {
  const headers = {
    Accept: 'application/json',
  };

  if (API_KEY) {
    headers.DOLAPIKEY = API_KEY;
  }

  if (API_MODE !== 'mock') {
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
    headers: getApiHeaders(),
    credentials: 'include',
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Erreur API (${response.status}): ${await readApiError(response)}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return null;
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
  return apiRequest('/active', 'GET');
}

export async function startTimer(fkProject, fkTask = 0, note = '') {
  return apiRequest('/start', 'POST', {
    fk_project: fkProject,
    fk_task: fkTask,
    note,
  });
}

export async function stopTimer(id) {
  return apiRequest('/stop', 'POST', { id });
}

export async function getTimeEntries() {
  return apiRequest('', 'GET');
}

export async function approveTimeEntry(id) {
  return apiRequest(`/${id}/validate`, 'POST');
}

export async function rejectTimeEntry(id) {
  return apiRequest(`/${id}/reject`, 'POST');
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