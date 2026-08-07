import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApiUrl, getTimeEntryUpdates, normalizeProjects, normalizeTasks } from './clockifyApi';

afterEach(() => {
  vi.unstubAllGlobals();
});

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

    expect(normalizeProjects(payload)).toEqual([{ id: 7, title: 'Projet Alpha', ref: '', client: '' }]);
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

describe('getTimeEntryUpdates', () => {
  it('returns changed existing entries with their new duration, end time and status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({
        status: 'success',
        data: {
          marker: 'after-stop',
          changed: true,
          entries: [{ id: 42, duration: 3672, date_end: '2026-08-07T14:00:00Z', status: 1 }],
        },
      })),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(getTimeEntryUpdates('entries', 'before-stop')).resolves.toEqual({
      marker: 'after-stop',
      changed: true,
      entries: [{ id: 42, rowid: 42, tags: '', project_label: '', duration: 3672, date_end: '2026-08-07T14:00:00Z', status: 1 }],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ scope: 'entries', marker: 'before-stop' }));
  });
});
