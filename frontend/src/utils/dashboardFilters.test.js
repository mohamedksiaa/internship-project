import { describe, expect, it } from 'vitest';
import { buildApiFilters, buildFilterSummary, filtersKey, parseIdList, serializeIdList } from './dashboardFilters';

describe('parseIdList / serializeIdList', () => {
  it('reads "3,7,12" as digit strings, in order', () => {
    expect(parseIdList('3,7,12')).toEqual(['3', '7', '12']);
  });
  it.each([[''], [undefined], [null], [42], [{}]])('is empty for %j', (raw) => {
    expect(parseIdList(raw)).toEqual([]);
  });
  it('drops anything that is not a positive integer (a hand-edited URL never reaches the server)', () => {
    expect(parseIdList('3,abc,-1,0,4.5,1) OR 1=1,,  7 ')).toEqual(['3', '7']);
  });
  it('removes duplicates and leading zeros', () => {
    expect(parseIdList('3,03,3,7')).toEqual(['3', '7']);
  });
  it('serialises to a comma list, and to "" (param removed) for "all"', () => {
    expect(serializeIdList(['3', '7'])).toBe('3,7');
    expect(serializeIdList([])).toBe('');
    expect(serializeIdList(undefined)).toBe('');
  });
});

describe('buildApiFilters', () => {
  const base = { projectIds: ['5'], clientIds: ['2', '9'], employeeIds: ['3'], canReadAll: true };
  it('sends numeric id arrays, only the non-empty ones', () => {
    expect(buildApiFilters(base)).toEqual({ project_ids: [5], client_ids: [2, 9], user_ids: [3] });
    expect(buildApiFilters({ ...base, projectIds: [], clientIds: [] })).toEqual({ user_ids: [3] });
    expect(buildApiFilters({ projectIds: [], clientIds: [], employeeIds: [], canReadAll: true })).toEqual({});
  });
  it('never sends the employee filter for a user who cannot read everything', () => {
    expect(buildApiFilters({ ...base, canReadAll: false })).toEqual({ project_ids: [5], client_ids: [2, 9] });
  });
});

describe('filtersKey', () => {
  it('is equal for equal selections and different otherwise (effect dependency)', () => {
    expect(filtersKey({ project_ids: [1, 2] })).toBe(filtersKey({ project_ids: [1, 2] }));
    expect(filtersKey({ project_ids: [1, 2] })).not.toBe(filtersKey({ project_ids: [1] }));
    expect(filtersKey({ user_ids: [1] })).not.toBe(filtersKey({ client_ids: [1] }));
    expect(filtersKey({})).toBe(filtersKey({ project_ids: [], client_ids: [], user_ids: [] }));
  });
});

describe('buildFilterSummary', () => {
  const t = (key) => ({ 'dashboard.filters.project': 'Projet', 'dashboard.filters.client': 'Client', 'dashboard.filters.employee': 'Employé' })[key];
  const options = {
    projects: [{ id: 5, label: 'Alpha' }, { id: 6, label: 'Beta' }],
    clients: [{ id: 2, label: 'ACME' }],
    employees: [{ id: 3, label: 'Alice' }],
  };
  it('is empty without a filter', () => {
    expect(buildFilterSummary({ t, projectIds: [], clientIds: [], employeeIds: [], options, canReadAll: true })).toBe('');
  });
  it('lists every active filter with the names', () => {
    expect(buildFilterSummary({ t, projectIds: ['5', '6'], clientIds: ['2'], employeeIds: ['3'], options, canReadAll: true })).toBe('Projet : Alpha, Beta ; Client : ACME ; Employé : Alice');
  });
  it('shows an id that is no longer in the lists as #id instead of dropping it', () => {
    expect(buildFilterSummary({ t, projectIds: ['99'], clientIds: [], employeeIds: [], options, canReadAll: true })).toBe('Projet : #99');
  });
  it('leaves the employee filter out for a user who cannot use it', () => {
    expect(buildFilterSummary({ t, projectIds: [], clientIds: [], employeeIds: ['3'], options, canReadAll: false })).toBe('');
  });
});
