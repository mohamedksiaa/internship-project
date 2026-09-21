import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteExpectedAbsence, getUsersPresence, saveExpectedAbsence } from './timeflowApi';

// The three requests behind the Présence column, checked against the exact
// contract of the PHP actions (getUsersPresence / saveExpectedAbsence /
// deleteExpectedAbsence): action name, body field names, response mapping,
// and error surfacing.
function fakeResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, text: () => Promise.resolve(JSON.stringify(body)) };
}

describe('timeflowApi — presence & expected absences', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const sent = () => {
    const [url, init] = fetchMock.mock.calls[0];
    return { url, method: init.method, body: JSON.parse(init.body) };
  };

  describe('getUsersPresence', () => {
    it('posts action=getUsersPresence with date, page and per_page', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'success', data: { rows: [], pagination: {}, date: '2026-09-19', today: '2026-09-21', absences_available: true } }));
      await getUsersPresence('2026-09-19', 2, 20);
      const { url, method, body } = sent();
      expect(url).toContain('action=getUsersPresence');
      expect(method).toBe('POST');
      expect(body).toEqual({ date: '2026-09-19', page: 2, per_page: 20 });
    });

    it('leaves the date out when empty so the server uses its own "today"', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'success', data: { rows: [], pagination: {}, date: '2026-09-21' } }));
      await getUsersPresence('', 1, 20);
      expect(sent().body).toEqual({ page: 1, per_page: 20 });
    });

    it('maps the payload: rows with presence, pagination, the day computed, absences_available', async () => {
      const rows = [{ id: 1, label: 'Alice', presence: { status: 'present', reason_type: null, source: null } }];
      fetchMock.mockResolvedValue(fakeResponse({ status: 'success', data: { rows, pagination: { page: 1, pages: 3 }, date: '2026-09-19', today: '2026-09-21', absences_available: false } }));
      expect(await getUsersPresence('2026-09-19', 1, 20)).toEqual({
        rows,
        pagination: { page: 1, pages: 3 },
        date: '2026-09-19',
        today: '2026-09-21',
        absencesAvailable: false,
      });
    });

    it('treats a missing absences_available as available (only an explicit false turns it off)', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'success', data: { rows: [], pagination: {} } }));
      expect((await getUsersPresence('', 1, 20)).absencesAvailable).toBe(true);
    });

    it('is defensive about a malformed payload', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'success', data: { rows: 'nope' } }));
      const res = await getUsersPresence('2026-09-19', 1, 20);
      expect(res.rows).toEqual([]);
      expect(res.pagination).toEqual({});
      expect(res.date).toBe('2026-09-19');
    });

    it.each([
      [403, { status: 'error', message: 'Accès refusé' }, 'Accès refusé'],
      [400, { status: 'error', message: 'Date invalide (format attendu : AAAA-MM-JJ)' }, 'Date invalide (format attendu : AAAA-MM-JJ)'],
    ])('HTTP %i rejects with the server message', async (status, body, message) => {
      fetchMock.mockResolvedValue(fakeResponse(body, { ok: false, status }));
      await expect(getUsersPresence('2026-09-19', 1, 20)).rejects.toThrow(message);
    });
  });

  describe('saveExpectedAbsence', () => {
    it('posts user_id, date and reason_type (snake_case, as the PHP reads them)', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'success', data: { id: 7, created: true, user_id: 4, date: '2026-09-17', reason_type: 'rtt' } }));
      const result = await saveExpectedAbsence({ userId: 4, date: '2026-09-17', reasonType: 'rtt' });
      const { url, body } = sent();
      expect(url).toContain('action=saveExpectedAbsence');
      expect(body).toEqual({ user_id: 4, date: '2026-09-17', reason_type: 'rtt' });
      expect(result).toMatchObject({ id: 7, created: true });
    });

    it('surfaces the "table missing" 500 with its actionable message', async () => {
      fetchMock.mockResolvedValue(fakeResponse(
        { status: 'error', code: 'expected_absence_table_missing', message: 'La table des absences prévues est absente : désactivez puis réactivez le module TimeFlow.' },
        { ok: false, status: 500 },
      ));
      await expect(saveExpectedAbsence({ userId: 4, date: '2026-09-17', reasonType: 'rtt' })).rejects.toThrow('réactivez le module TimeFlow');
    });

    it('surfaces a validation refusal', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'error', message: 'Utilisateur désactivé' }, { ok: false, status: 400 }));
      await expect(saveExpectedAbsence({ userId: 4, date: '2026-09-17', reasonType: 'rtt' })).rejects.toThrow('Utilisateur désactivé');
    });
  });

  describe('deleteExpectedAbsence', () => {
    it('posts user_id and date', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'success', data: { deleted: 1, user_id: 4, date: '2026-09-17' } }));
      const result = await deleteExpectedAbsence({ userId: 4, date: '2026-09-17' });
      const { url, body } = sent();
      expect(url).toContain('action=deleteExpectedAbsence');
      expect(body).toEqual({ user_id: 4, date: '2026-09-17' });
      expect(result.deleted).toBe(1);
    });

    it('rejects with the server message on 403', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'error', message: 'Accès refusé' }, { ok: false, status: 403 }));
      await expect(deleteExpectedAbsence({ userId: 4, date: '2026-09-17' })).rejects.toThrow('Accès refusé');
    });
  });
});
