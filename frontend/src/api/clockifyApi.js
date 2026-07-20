// frontend/src/api/clockifyApi.js

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/custom/clockify/ajax';
const API_KEY = import.meta.env.VITE_API_KEY;

// Fonction générique
async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'DOLAPIKEY': API_KEY,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Erreur API (${response.status}): ${errorBody}`);
  }

  return response.json();
}

// Fonctions principales
export async function getActiveTimer() {
  return apiRequest('/timeentry.php?action=getActiveTimer');
}

export async function startTimer(fkProject, fkTask, note) {
  return apiRequest('/timeentry.php?action=startTimer', {
    method: 'POST',
    body: JSON.stringify({ 
      fk_project: fkProject, 
      fk_task: fkTask, 
      note 
    }),
  });
}

export async function stopTimer(id) {
  return apiRequest('/timeentry.php?action=stopTimer', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}

export async function getTimeEntries(filters = {}) {
  const params = new URLSearchParams({ 
    action: 'getTimeEntries', 
    ...filters 
  }).toString();
  return apiRequest(`/timeentry.php?${params}`);
}