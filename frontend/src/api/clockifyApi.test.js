import { describe, expect, it } from 'vitest';
import { buildApiUrl, normalizeProjects, normalizeTasks } from './clockifyApi';

describe('buildApiUrl', () => {
  it('builds the module AJAX URL for an action', () => {
    expect(buildApiUrl('getActiveTimer', '/custom/clockify/ajax/timeentry.php')).toBe('/custom/clockify/ajax/timeentry.php?action=getActiveTimer');
  });
});

describe('normalizeProjects', () => {
  it('maps Dolibarr project payloads to the frontend shape', () => {
    const payload = {
      data: [{ rowid: 7, title: 'Projet Alpha' }],
    };

    expect(normalizeProjects(payload)).toEqual([{
      id: 7,
      title: 'Projet Alpha',
      ref: '',
      client: '',
    }]);
  });
});

describe('normalizeTasks', () => {
  it('maps Dolibarr task payloads to the frontend shape', () => {
    const payload = {
      data: [{ rowid: 12, label: 'Analyse' }],
    };

    expect(normalizeTasks(payload)).toEqual([{ id: 12, title: 'Analyse' }]);
  });
});
