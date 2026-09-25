import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAlertPreferences, getMyNotifications, markNotificationsRead, saveAlertPreferences } from './timeflowApi';

// The four requests behind the bell, checked against the PHP actions
// (getMyNotifications / markNotificationsRead / getAlertPreferences /
// saveAlertPreferences): action name, body fields, mapping, error surfacing.
function fakeResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, text: () => Promise.resolve(JSON.stringify(body)) };
}

describe('timeflowApi — notifications and alert preferences', () => {
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

  describe('getMyNotifications', () => {
    it('posts action=getMyNotifications with the limit', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'success', data: { available: true, unread_count: 0, rows: [] } }));
      await getMyNotifications(30);
      const { url, method, body } = sent();
      expect(url).toContain('action=getMyNotifications');
      expect(method).toBe('POST');
      expect(body).toEqual({ limit: 30 });
    });

    it('defaults the limit to 30', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'success', data: { rows: [] } }));
      await getMyNotifications();
      expect(sent().body).toEqual({ limit: 30 });
    });

    it('maps the payload: rows as they are, the unread count, availability', async () => {
      const rows = [{ id: 1, date_ref: '2026-09-23', read: false, late: [{ id: 4, label: 'N' }] }];
      fetchMock.mockResolvedValue(fakeResponse({ status: 'success', data: { available: true, unread_count: 5, rows } }));
      expect(await getMyNotifications(30)).toEqual({ available: true, unreadCount: 5, rows });
    });

    it('a table that is missing on the server is reported as unavailable', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'success', data: { available: false, unread_count: 0, rows: [] } }));
      expect((await getMyNotifications(30)).available).toBe(false);
    });

    it('is defensive about a malformed payload', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'success', data: { rows: 'nope', unread_count: 'x' } }));
      expect(await getMyNotifications(30)).toEqual({ available: true, unreadCount: 0, rows: [] });
    });

    it('a 403 rejects with the server message', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'error', message: 'Accès refusé' }, { ok: false, status: 403 }));
      await expect(getMyNotifications(30)).rejects.toThrow('Accès refusé');
    });
  });

  describe('markNotificationsRead', () => {
    it('sends the ids', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'success', data: { updated: 2 } }));
      const result = await markNotificationsRead({ ids: [4, 7] });
      const { url, body } = sent();
      expect(url).toContain('action=markNotificationsRead');
      expect(body).toEqual({ ids: [4, 7] });
      expect(result).toEqual({ updated: 2 });
    });

    it('sends all=true, and only that, for "mark everything"', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'success', data: { updated: 9 } }));
      await markNotificationsRead({ all: true, ids: [1, 2] });
      expect(sent().body).toEqual({ all: true });
    });

    it('without ids it sends an empty list (the server refuses it) rather than "all"', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'error', message: 'Indiquez entre 1 et 200 notifications, ou toutes.' }, { ok: false, status: 400 }));
      await expect(markNotificationsRead()).rejects.toThrow('Indiquez');
      expect(sent().body).toEqual({ ids: [] });
    });
  });

  describe('alert preferences', () => {
    const serverPrefs = { email_enabled: false, has_email: true, email: 'm@example.com', alerts_enabled: true, mail_enabled: true };

    it('getAlertPreferences maps the fields to camelCase', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'success', data: serverPrefs }));
      const prefs = await getAlertPreferences();
      expect(sent().url).toContain('action=getAlertPreferences');
      expect(prefs).toEqual({ emailEnabled: false, hasEmail: true, email: 'm@example.com', alertsEnabled: true, mailEnabled: true });
    });

    it('emails are OFF (opt-in) unless the server says exactly true; the other flags are strict as well', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'success', data: {} }));
      expect(await getAlertPreferences()).toEqual({ emailEnabled: false, hasEmail: false, email: null, alertsEnabled: false, mailEnabled: true });
      fetchMock.mockResolvedValue(fakeResponse({ status: 'success', data: { email_enabled: true } }));
      expect((await getAlertPreferences()).emailEnabled).toBe(true);
      for (const notTrue of ['true', 1, '1', null]) {
        fetchMock.mockResolvedValue(fakeResponse({ status: 'success', data: { email_enabled: notTrue } }));
        expect((await getAlertPreferences()).emailEnabled).toBe(false);
      }
    });

    it('a blank address is null', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'success', data: { ...serverPrefs, email: '' } }));
      expect((await getAlertPreferences()).email).toBeNull();
    });

    it.each([[true], [false]])('saveAlertPreferences sends email_enabled=%s as a real boolean and returns the saved state', async (value) => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'success', data: { ...serverPrefs, email_enabled: value } }));
      const saved = await saveAlertPreferences({ emailEnabled: value });
      const { url, body } = sent();
      expect(url).toContain('action=saveAlertPreferences');
      expect(body).toEqual({ email_enabled: value });
      expect(saved.emailEnabled).toBe(value);
    });

    it('anything but a real true is sent as false (never a truthy string)', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'success', data: serverPrefs }));
      await saveAlertPreferences({ emailEnabled: 'yes' });
      expect(sent().body).toEqual({ email_enabled: false });
    });

    it('a refusal surfaces the server message', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 'error', message: 'Valeur invalide pour email_enabled (true ou false attendu)' }, { ok: false, status: 400 }));
      await expect(saveAlertPreferences({ emailEnabled: true })).rejects.toThrow('Valeur invalide');
    });
  });
});
