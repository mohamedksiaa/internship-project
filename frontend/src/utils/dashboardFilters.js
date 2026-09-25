// Pure helpers for the Dashboard's Projet / Client / Employé filters.

/**
 * The ids stored in the URL ("3,7,12") as an array of digit strings. Anything that is not a positive integer
 * is dropped, so a hand-edited or stale URL can never send garbage to the server.
 */
export function parseIdList(raw) {
  if (typeof raw !== 'string' || raw === '') return [];
  const seen = new Set();
  raw.split(',').forEach((part) => {
    const value = part.trim();
    if (/^\d+$/.test(value) && Number(value) > 0) seen.add(String(Number(value)));
  });
  return [...seen];
}

/** The URL value for a selection: "3,7,12", or '' (which removes the param) for "all". */
export function serializeIdList(ids) {
  return Array.isArray(ids) ? ids.join(',') : '';
}

/**
 * The filters as the API takes them: numeric id arrays, only the non-empty ones. The employee filter only
 * exists for a user who may read every entry; the server ignores it for anyone else, and it is not even sent.
 */
export function buildApiFilters({ projectIds, clientIds, employeeIds, canReadAll }) {
  const toNumbers = (ids) => ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
  const filters = {};
  const projects = toNumbers(projectIds);
  const clients = toNumbers(clientIds);
  const users = canReadAll ? toNumbers(employeeIds) : [];
  if (projects.length > 0) filters.project_ids = projects;
  if (clients.length > 0) filters.client_ids = clients;
  if (users.length > 0) filters.user_ids = users;
  return filters;
}

/** A stable string for effect dependencies (arrays would be a new object on every render). */
export function filtersKey(filters) {
  return JSON.stringify([filters.project_ids || [], filters.client_ids || [], filters.user_ids || []]);
}

/**
 * "Projet : A, B ; Employé : C" for the exports, or '' when no filter is active. Names come from the option
 * lists; an id no longer in them (deleted project...) is shown as "#id" rather than silently dropped.
 */
export function buildFilterSummary({ t, projectIds, clientIds, employeeIds, options, canReadAll }) {
  const nameOf = (list, id) => (list || []).find((option) => String(option.id) === String(id))?.label ?? `#${id}`;
  const parts = [];
  if (projectIds.length > 0) {
    parts.push(`${t('dashboard.filters.project')} : ${projectIds.map((id) => nameOf(options.projects, id)).join(', ')}`);
  }
  if (clientIds.length > 0) {
    parts.push(`${t('dashboard.filters.client')} : ${clientIds.map((id) => nameOf(options.clients, id)).join(', ')}`);
  }
  if (canReadAll && employeeIds.length > 0) {
    parts.push(`${t('dashboard.filters.employee')} : ${employeeIds.map((id) => nameOf(options.employees, id)).join(', ')}`);
  }
  return parts.join(' ; ');
}
