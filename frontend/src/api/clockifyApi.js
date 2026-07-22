// frontend/src/api/clockifyApi.js

// URL de base de l'API REST Dolibarr
const REST_URL = '/api/index.php/clockify/timeentrys';

/**
 * Fonction générique pour effectuer les appels REST à Dolibarr
 */
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop().split(';').shift();
  }
  return null;
}

async function apiRequest(endpoint, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  // Récupérer la clé DOLAPIKEY dans le localStorage ou cookie si présente
  const apiKey = localStorage.getItem('DOLAPIKEY') || getCookie('DOLAPIKEY');
  if (apiKey) {
    headers['DOLAPIKEY'] = apiKey;
  }

  const options = {
    method,
    headers,
    credentials: 'include'
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${REST_URL}${endpoint}`, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erreur API (${response.status}): ${errorText}`);
  }

  return response.json();
}

// === Méthodes API pour la gestion des temps ===

/**
 * Récupère le chrono actif s'il existe
 */
export async function getActiveTimer() {
  return apiRequest('/active', 'GET');
}

/**
 * Démarre un nouveau chrono
 */
export async function startTimer(fkProject, fkTask = 0, note = '') {
  return apiRequest('/start', 'POST', {
    fk_project: fkProject,
    fk_task: fkTask,
    note: note
  });
}

/**
 * Arrête un chrono actif par son ID
 */
export async function stopTimer(id) {
  return apiRequest('/stop', 'POST', { id });
}

/**
 * Récupère la liste de toutes les entrées de temps
 */
export async function getTimeEntries() {
  return apiRequest('', 'GET');
}