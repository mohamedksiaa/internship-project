import { describe, expect, it } from 'vitest';
import { buildApiUrl, normalizeProjects, normalizeTasks } from './clockifyApi';

describe('buildApiUrl', () => {
  it('joins the API base URL and endpoint without duplicate separators', () => {
    expect(buildApiUrl('/active', 'http://localhost/htdocs/api/index.php')).toBe(
      'http://localhost/htdocs/api/index.php/clockify/timeentrys/active'
    );
  });
});

describe('normalizeProjects', () => {
  it('maps Dolibarr project payloads to the frontend shape', () => {
    const payload = {
      rows: [{ rowid: 7, title: 'Projet Alpha' }],
    };

    expect(normalizeProjects(payload)).toEqual([{ id: 7, title: 'Projet Alpha' }]);
  });
});

describe('normalizeTasks', () => {
  it('maps Dolibarr task payloads to the frontend shape', () => {
    const payload = {
      rows: [{ rowid: 12, label: 'Analyse' }],
    };

    expect(normalizeTasks(payload)).toEqual([{ id: 12, title: 'Analyse' }]);
  });
});
