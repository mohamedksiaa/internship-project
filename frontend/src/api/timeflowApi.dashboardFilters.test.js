import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDashboardFilterOptions, getSummaryReports } from './timeflowApi';

// The two requests behind the Dashboard filters, checked against the PHP actions
// (getSummaryReports with project_ids / client_ids / user_ids, getDashboardFilterOptions).
function fakeResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, text: () => Promise.resolve(JSON.stringify(body)) };
}

describe('timeflowApi — Dashboard filters', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const sent = () => {
    const [url, init] = fetchMock.mock.calls[0];
    return { url, body: JSON.parse(init.body) };
  };

  describe('getSummaryReports', () => {
    it('without filters, the request is exactly what it was before', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'success', data: {} }));
      await getSummaryReports(1000, '2026-09-01', '2026-09-30', true);
      expect(sent().body).toEqual({ limit: 1000, date_from: '2026-09-01', date_to: '2026-09-30', only_validated: 1 });
      expect(sent().url).toContain('action=getSummaryReports');
    });

    it('sends the three id lists as arrays of numbers', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'success', data: {} }));
      await getSummaryReports(1000, '2026-09-01', '2026-09-30', true, { project_ids: [5, 6], client_ids: [2], user_ids: [3] });
      expect(sent().body).toMatchObject({ project_ids: [5, 6], client_ids: [2], user_ids: [3] });
    });

    it('leaves out empty or missing lists, and unknown keys', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'success', data: {} }));
      await getSummaryReports(1000, '', '', false, { project_ids: [], client_ids: undefined, user_ids: [4], other: [1] });
      const { body } = sent();
      expect(body.user_ids).toEqual([4]);
      expect('project_ids' in body).toBe(false);
      expect('client_ids' in body).toBe(false);
      expect('other' in body).toBe(false);
    });

    it('surfaces the server refusal (400 "Filtre invalide")', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'error', message: 'Filtre invalide' }, { ok: false, status: 400 }));
      await expect(getSummaryReports(1000, '', '', false, { project_ids: [1] })).rejects.toThrow('Filtre invalide');
    });
  });

  describe('getDashboardFilterOptions', () => {
    it('posts action=getDashboardFilterOptions and returns the three lists', async () => {
      const payload = {
        projects: [{ id: 5, label: 'A', closed: false, client_id: 2 }],
        clients: [{ id: 2, label: 'ACME' }],
        employees: [{ id: 3, label: 'Alice', inactive: false }],
      };
      fetchMock.mockResolvedValue(fakeResponse({ status: 'success', data: payload }));
      const options = await getDashboardFilterOptions();
      expect(sent().url).toContain('action=getDashboardFilterOptions');
      expect(options).toEqual(payload);
    });

    it('always returns three arrays, whatever the server sent', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'success', data: { projects: 'nope' } }));
      expect(await getDashboardFilterOptions()).toEqual({ projects: [], clients: [], employees: [] });
    });
  });
});
