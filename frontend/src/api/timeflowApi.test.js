import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { buildApiUrl, deleteTimeEntry, getActiveTimer, getTimeEntryUpdates, normalizeProjects, normalizeTasks } from './timeflowApi';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('moduleTimerRequest failure modes', () => {
  it('reports a translated network-error message when fetch() itself rejects (offline, DNS, CORS)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(getActiveTimer()).rejects.toThrow(i18n.t('app.network_error'));
  });

  it('reports a translated service-unavailable message for a non-JSON response (core fatal-error page, HTTP 202)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 202,
      text: () => Promise.resolve('This website or feature is currently temporarly not available...'),
    }));

    await expect(getActiveTimer()).rejects.toThrow(i18n.t('app.service_unavailable'));
  });

  it('reports a translated session-expired message when the login page HTML comes back instead of JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('<form><input type="hidden" name="actionlogin" value="login"></form>'),
    }));

    await expect(getActiveTimer()).rejects.toThrow(i18n.t('app.session_expired'));
  });

  it('translates a generic "sql_error" JSON response (e.g. a lost connection inside stopTimer/startTimer), ignoring the server\'s French message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve(JSON.stringify({
        status: 'error',
        code: 'sql_error',
        message: 'Erreur de base de données (TimeEntry::stopTimer:fetch). Contactez un administrateur.',
      })),
    }));

    await expect(getActiveTimer()).rejects.toThrow(i18n.t('app.service_unavailable'));
  });
});

describe('buildApiUrl', () => {
  it('builds the module AJAX URL for an action', () => {
    expect(buildApiUrl('getActiveTimer', '/custom/timeflow/ajax/timeentry.php')).toBe('/custom/timeflow/ajax/timeentry.php?action=getActiveTimer');
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
      entries: [{ id: 42, rowid: 42, tags: '', project_label: '', delete_allowed: false, delete_requires_strong_confirmation: false, duration: 3672, date_end: '2026-08-07T14:00:00Z', status: 1 }],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ scope: 'entries', marker: 'before-stop', page: 1, per_page: 20, billable_only: 0 }));
  });
});

describe('deleteTimeEntry', () => {
  it('posts the entry id to the deletion endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ status: 'success', data: { id: 42 } })),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteTimeEntry(42)).resolves.toEqual({ id: 42 });
    expect(fetchMock.mock.calls[0][0]).toContain('action=deleteTimeEntry');
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ id: 42 }));
  });
});
