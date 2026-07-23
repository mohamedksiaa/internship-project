const BASE_URL = import.meta.env.VITE_API_BASE_URL;
const API_KEY = import.meta.env.VITE_API_KEY;

// Fonction générique utilisée par toutes les autres, pour éviter de répéter le code
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
    // On lève une erreur explicite, que les composants pourront attraper avec try/catch
    const errorBody = await response.text();
    throw new Error(`Erreur API (${response.status}): ${errorBody}`);
  }

  return response.json();
}

export async function getActiveTimer() {
  return apiRequest('/clockify/timeentrys/active');
}

export async function startTimer(fkProject, fkTask, note) {
  return apiRequest('/clockify/timeentrys/start', {
    method: 'POST',
    body: JSON.stringify({ fk_project: fkProject, fk_task: fkTask, note }),
  });
}

export async function stopTimer(id) {
  return apiRequest('/clockify/timeentrys/stop', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}

export async function getTimeEntries(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return apiRequest(`/clockify/timeentrys?${params}`);
}