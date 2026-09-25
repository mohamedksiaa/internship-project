import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import NotificationBell, { NOTIFICATION_POLL_MS } from './NotificationBell';

const { getMyNotifications, markNotificationsRead, getAlertPreferences, saveAlertPreferences } = vi.hoisted(() => ({
  getMyNotifications: vi.fn(),
  markNotificationsRead: vi.fn(),
  getAlertPreferences: vi.fn(),
  saveAlertPreferences: vi.fn(),
}));
vi.mock('../../api/timeflowApi', () => ({ getMyNotifications, markNotificationsRead, getAlertPreferences, saveAlertPreferences }));

const person = (id, label) => ({ id, label });
const row = (id, day, over = {}) => ({
  id, type: 'late_arrivals', date_ref: day, created_at: `${day} 09:11:00`, read: false,
  late: [person(4, 'Nicole Kardashian')], threshold: '09:00', cutoff: '09:10', email_status: 'sent', ...over,
});
const list = (rows, over = {}) => ({ available: true, unreadCount: rows.filter((r) => !r.read).length, rows, ...over });
// Emails are opt-in: a manager who never touched the box has it unchecked.
const prefs = (over = {}) => ({ emailEnabled: false, hasEmail: true, email: 'manager@example.com', alertsEnabled: true, mailEnabled: true, ...over });
const twoRows = () => [
  row(12, '2026-09-23', { late: [person(4, 'Nicole Kardashian')] }),
  row(11, '2026-09-22', { read: true, late: [person(4, 'Nicole Kardashian'), person(3, 'Alex Waternson')] }),
];

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname}{loc.search}</div>;
}
function renderBell() {
  return render(
    <MemoryRouter initialEntries={['/timer']}>
      <Routes>
        <Route path="*" element={<><NotificationBell /><Where /></>} />
      </Routes>
    </MemoryRouter>,
  );
}
const bell = () => screen.getByRole('button', { name: /^Notifications/ });
const where = () => screen.getByTestId('where').textContent;
const openPanel = async (user) => {
  await user.click(bell());
  return screen.findByRole('dialog', { name: 'Notifications' });
};

describe('NotificationBell', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
    getMyNotifications.mockReset().mockResolvedValue(list(twoRows()));
    markNotificationsRead.mockReset().mockResolvedValue({ updated: 1 });
    getAlertPreferences.mockReset().mockResolvedValue(prefs());
    saveAlertPreferences.mockReset().mockImplementation(async ({ emailEnabled }) => prefs({ emailEnabled }));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  describe('the bell button', () => {
    it('asks for the notifications on mount, and shows how many are unread — in the label too, not only visually', async () => {
      renderBell();
      await waitFor(() => expect(getMyNotifications).toHaveBeenCalledTimes(1));
      expect(await screen.findByTestId('notification-badge')).toHaveTextContent('1');
      expect(screen.getByRole('button', { name: 'Notifications, 1 non lue(s)' })).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(getAlertPreferences).not.toHaveBeenCalled();
    });

    it('nothing unread: no badge, plain label', async () => {
      getMyNotifications.mockResolvedValue(list([row(11, '2026-09-22', { read: true })]));
      renderBell();
      await waitFor(() => expect(getMyNotifications).toHaveBeenCalled());
      expect(screen.queryByTestId('notification-badge')).toBeNull();
      expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    });

    it('caps the visible counter at 99+, the label keeps the real number', async () => {
      getMyNotifications.mockResolvedValue(list(twoRows(), { unreadCount: 250 }));
      renderBell();
      expect(await screen.findByTestId('notification-badge')).toHaveTextContent('99+');
      expect(screen.getByRole('button', { name: 'Notifications, 250 non lue(s)' })).toBeInTheDocument();
    });

    it('a server that fails does not break the page: the bell is still there, without a badge', async () => {
      getMyNotifications.mockRejectedValue(new Error('boom'));
      renderBell();
      await waitFor(() => expect(getMyNotifications).toHaveBeenCalled());
      expect(bell()).toBeInTheDocument();
      expect(screen.queryByTestId('notification-badge')).toBeNull();
    });
  });

  describe('the panel', () => {
    it('opens on click, refreshes, and loads the preference once', async () => {
      const user = userEvent.setup();
      renderBell();
      await waitFor(() => expect(getMyNotifications).toHaveBeenCalledTimes(1));
      await openPanel(user);
      await waitFor(() => expect(getMyNotifications).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(getAlertPreferences).toHaveBeenCalledTimes(1));
      expect(bell()).toHaveAttribute('aria-expanded', 'true');
      await user.click(bell()); // close
      await user.click(bell()); // open again
      await waitFor(() => expect(getMyNotifications).toHaveBeenCalledTimes(3));
      expect(getAlertPreferences).toHaveBeenCalledTimes(1);
    });

    it('lists the digests as the server gave them (newest first), each with its title, the names and the cut-off', async () => {
      const user = userEvent.setup();
      renderBell();
      const panel = await openPanel(user);
      const items = await within(panel).findAllByRole('listitem');
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent('1 employé(s) en retard le 23 septembre 2026');
      expect(items[0]).toHaveTextContent('Nicole Kardashian');
      expect(items[0]).toHaveTextContent('Heure limite : 09:10');
      expect(items[1]).toHaveTextContent('2 employé(s) en retard le 22 septembre 2026');
      expect(items[1]).toHaveTextContent('Nicole Kardashian, Alex Waternson');
    });

    it('marks unread ones visibly and for screen readers', async () => {
      const user = userEvent.setup();
      renderBell();
      const panel = await openPanel(user);
      const [unreadRow, readRow] = await within(panel).findAllByRole('button', { name: /employé/ });
      expect(unreadRow).toHaveAttribute('data-read', 'false');
      expect(unreadRow).toHaveTextContent('Non lue');
      expect(readRow).toHaveAttribute('data-read', 'true');
      expect(readRow).not.toHaveTextContent('Non lue');
    });

    it('shows at most 3 names then "+N autre(s)"', async () => {
      getMyNotifications.mockResolvedValue(list([row(1, '2026-09-23', { late: ['A', 'B', 'C', 'D', 'E'].map((n, i) => person(i + 1, n)) })]));
      const user = userEvent.setup();
      renderBell();
      const panel = await openPanel(user);
      const item = (await within(panel).findAllByRole('listitem'))[0];
      expect(item).toHaveTextContent('5 employé(s) en retard');
      expect(item).toHaveTextContent('A, B, C +2 autre(s)');
      expect(item).not.toHaveTextContent('D');
    });

    it('renders names as plain text, never as HTML', async () => {
      getMyNotifications.mockResolvedValue(list([row(1, '2026-09-23', { late: [person(1, '<i>Amir</i><img src=x onerror=alert(1)>')] })]));
      const user = userEvent.setup();
      renderBell();
      const panel = await openPanel(user);
      const item = (await within(panel).findAllByRole('listitem'))[0];
      expect(item.querySelector('i')).toBeNull();
      expect(item.querySelector('img')).toBeNull();
      expect(item).toHaveTextContent('<i>Amir</i><img src=x onerror=alert(1)>');
    });

    it('an unknown notification type still shows something sensible', async () => {
      getMyNotifications.mockResolvedValue(list([row(1, '2026-09-23', { type: 'something_new', late: [] })]));
      const user = userEvent.setup();
      renderBell();
      const panel = await openPanel(user);
      expect(await within(panel).findByText('Notification du 23 septembre 2026')).toBeInTheDocument();
    });

    it('closes with Escape and with a click outside, but not with a click inside', async () => {
      const user = userEvent.setup();
      renderBell();
      const panel = await openPanel(user);
      await user.click(within(panel).getByRole('heading', { name: 'Notifications' }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).toBeNull();
      await openPanel(user);
      await user.click(screen.getByTestId('where'));
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  describe('reading', () => {
    it('clicking an UNREAD digest marks it read, opens the Users report on that day, and closes the panel', async () => {
      const user = userEvent.setup();
      renderBell();
      const panel = await openPanel(user);
      await user.click((await within(panel).findAllByRole('button', { name: /employé/ }))[0]);
      expect(markNotificationsRead).toHaveBeenCalledWith({ ids: [12] });
      expect(where()).toBe('/reports?tab=users&presenceDate=2026-09-23');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByTestId('notification-badge')).toBeNull();
      expect(bell()).toHaveAccessibleName('Notifications');
    });

    it('clicking a digest that is already read only navigates', async () => {
      const user = userEvent.setup();
      renderBell();
      const panel = await openPanel(user);
      await user.click((await within(panel).findAllByRole('button', { name: /employé/ }))[1]);
      expect(markNotificationsRead).not.toHaveBeenCalled();
      expect(where()).toBe('/reports?tab=users&presenceDate=2026-09-22');
    });

    it('a day that is not a plain date is never put in the URL (still marked read, no navigation)', async () => {
      getMyNotifications.mockResolvedValue(list([row(5, '2026-09-23&admin=1')]));
      const user = userEvent.setup();
      renderBell();
      const panel = await openPanel(user);
      await user.click((await within(panel).findAllByRole('button', { name: /employé/ }))[0]);
      expect(markNotificationsRead).toHaveBeenCalledWith({ ids: [5] });
      expect(where()).toBe('/timer');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('if marking fails it still navigates, and the unread state comes back from the server', async () => {
      markNotificationsRead.mockRejectedValue(new Error('refused'));
      const user = userEvent.setup();
      renderBell();
      const panel = await openPanel(user);
      const callsBefore = getMyNotifications.mock.calls.length;
      await user.click((await within(panel).findAllByRole('button', { name: /employé/ }))[0]);
      expect(where()).toBe('/reports?tab=users&presenceDate=2026-09-23');
      await waitFor(() => expect(getMyNotifications.mock.calls.length).toBeGreaterThan(callsBefore));
      expect(await screen.findByTestId('notification-badge')).toHaveTextContent('1');
    });

    it('"Tout marquer comme lu" marks everything and clears the badge', async () => {
      const user = userEvent.setup();
      renderBell();
      const panel = await openPanel(user);
      await user.click(within(panel).getByRole('button', { name: 'Tout marquer comme lu' }));
      expect(markNotificationsRead).toHaveBeenCalledWith({ all: true });
      expect(screen.queryByTestId('notification-badge')).toBeNull();
      expect(within(panel).getByRole('button', { name: 'Tout marquer comme lu' })).toBeDisabled();
      for (const item of within(panel).getAllByRole('button', { name: /employé/ })) {
        expect(item).toHaveAttribute('data-read', 'true');
      }
    });

    it('"Tout marquer comme lu" is disabled when nothing is unread', async () => {
      getMyNotifications.mockResolvedValue(list([row(11, '2026-09-22', { read: true })]));
      const user = userEvent.setup();
      renderBell();
      const panel = await openPanel(user);
      expect(within(panel).getByRole('button', { name: 'Tout marquer comme lu' })).toBeDisabled();
    });
  });

  describe('states', () => {
    it('shows "loading" until the first answer', async () => {
      let resolve;
      getMyNotifications.mockImplementation(() => new Promise((r) => { resolve = r; }));
      const user = userEvent.setup();
      renderBell();
      await openPanel(user);
      expect(screen.getByText('Chargement…')).toBeInTheDocument();
      await act(async () => resolve(list(twoRows())));
      expect(await screen.findAllByRole('listitem')).toHaveLength(2);
    });

    it('empty list -> "Aucune notification."', async () => {
      getMyNotifications.mockResolvedValue(list([]));
      const user = userEvent.setup();
      renderBell();
      const panel = await openPanel(user);
      expect(await within(panel).findByText('Aucune notification.')).toBeInTheDocument();
      expect(within(panel).queryByRole('list')).toBeNull();
    });

    it('a failing server -> an alert with a retry that works', async () => {
      getMyNotifications.mockRejectedValue(new Error('boom'));
      const user = userEvent.setup();
      renderBell();
      const panel = await openPanel(user);
      expect(await within(panel).findByRole('alert')).toHaveTextContent('Impossible de charger les notifications.');
      getMyNotifications.mockResolvedValue(list(twoRows()));
      await user.click(within(panel).getByRole('button', { name: 'Réessayer' }));
      expect(await within(panel).findAllByRole('listitem')).toHaveLength(2);
      expect(within(panel).queryByRole('alert')).toBeNull();
    });

    it('a refresh that fails after a success keeps the list and says so', async () => {
      const user = userEvent.setup();
      renderBell();
      const panel = await openPanel(user);
      await within(panel).findAllByRole('listitem');
      getMyNotifications.mockRejectedValue(new Error('boom'));
      await user.click(bell());
      await user.click(bell());
      await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Impossible de charger'));
      expect(within(screen.getByRole('dialog')).getAllByRole('listitem')).toHaveLength(2);
    });

    it('a table that does not exist on the server -> an explicit message, no list', async () => {
      getMyNotifications.mockResolvedValue({ available: false, unreadCount: 0, rows: [] });
      const user = userEvent.setup();
      renderBell();
      const panel = await openPanel(user);
      expect(await within(panel).findByText(/la table est absente/)).toBeInTheDocument();
      expect(within(panel).queryByRole('list')).toBeNull();
    });

    it('an older answer never overwrites a newer one', async () => {
      const pending = [];
      getMyNotifications.mockImplementation(() => new Promise((resolve) => { pending.push(resolve); }));
      const user = userEvent.setup();
      renderBell();                       // request #1 (mount)
      await openPanel(user);              // request #2 (opening)
      await waitFor(() => expect(pending.length).toBe(2));
      await act(async () => pending[1](list([row(20, '2026-09-24', { late: [person(9, 'Fresh')] })])));
      expect(await screen.findByText('Fresh')).toBeInTheDocument();
      await act(async () => pending[0](list([row(1, '2026-09-01', { late: [person(8, 'Stale')] })])));
      expect(screen.getByText('Fresh')).toBeInTheDocument();
      expect(screen.queryByText('Stale')).toBeNull();
    });
  });

  describe('keeping fresh', () => {
    it('asks again every minute, and stops for good once unmounted', async () => {
      vi.useFakeTimers();
      const view = renderBell();
      await act(async () => {});
      expect(getMyNotifications).toHaveBeenCalledTimes(1);
      await act(async () => { await vi.advanceTimersByTimeAsync(NOTIFICATION_POLL_MS); });
      expect(getMyNotifications).toHaveBeenCalledTimes(2);
      await act(async () => { await vi.advanceTimersByTimeAsync(NOTIFICATION_POLL_MS * 2); });
      expect(getMyNotifications).toHaveBeenCalledTimes(4);
      view.unmount();
      await act(async () => { await vi.advanceTimersByTimeAsync(NOTIFICATION_POLL_MS * 5); });
      expect(getMyNotifications).toHaveBeenCalledTimes(4);
    });

    it('the poll period is one minute', () => {
      expect(NOTIFICATION_POLL_MS).toBe(60000);
    });

    it('refreshes when the window regains focus, and when the tab becomes visible — not when it is hidden', async () => {
      renderBell();
      await waitFor(() => expect(getMyNotifications).toHaveBeenCalledTimes(1));
      fireEvent.focus(window);
      await waitFor(() => expect(getMyNotifications).toHaveBeenCalledTimes(2));
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      fireEvent(document, new Event('visibilitychange'));
      expect(getMyNotifications).toHaveBeenCalledTimes(2);
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      fireEvent(document, new Event('visibilitychange'));
      await waitFor(() => expect(getMyNotifications).toHaveBeenCalledTimes(3));
    });

    it('listeners are removed on unmount (a focus afterwards asks nothing)', async () => {
      const view = renderBell();
      await waitFor(() => expect(getMyNotifications).toHaveBeenCalledTimes(1));
      view.unmount();
      fireEvent.focus(window);
      expect(getMyNotifications).toHaveBeenCalledTimes(1);
    });
  });

  describe('the email preference (footer)', () => {
    it('is loaded when the panel opens, shows the state and the address', async () => {
      const user = userEvent.setup();
      renderBell();
      const panel = await openPanel(user);
      const checkbox = await within(panel).findByRole('checkbox', { name: 'Recevoir aussi les alertes par email' });
      expect(checkbox).not.toBeChecked();
      expect(checkbox).toBeEnabled();
      expect(within(panel).getByText('Adresse : manager@example.com')).toBeInTheDocument();
    });

    it('reflects "on" when the manager opted in', async () => {
      getAlertPreferences.mockResolvedValue(prefs({ emailEnabled: true }));
      const user = userEvent.setup();
      renderBell();
      const panel = await openPanel(user);
      expect(await within(panel).findByRole('checkbox', { name: /Recevoir aussi/ })).toBeChecked();
    });

    it('checking saves "on" and shows what the server answered; unchecking saves "off"', async () => {
      const user = userEvent.setup();
      renderBell();
      const panel = await openPanel(user);
      const checkbox = await within(panel).findByRole('checkbox', { name: /Recevoir aussi/ });
      await user.click(checkbox);
      expect(saveAlertPreferences).toHaveBeenCalledWith({ emailEnabled: true });
      await waitFor(() => expect(checkbox).toBeChecked());
      await user.click(checkbox);
      expect(saveAlertPreferences).toHaveBeenLastCalledWith({ emailEnabled: false });
      await waitFor(() => expect(checkbox).not.toBeChecked());
    });

    it('a checked box stays checked after the panel is closed and after the whole bell is reloaded (state lives on the server)', async () => {
      let serverEnabled = false;
      getAlertPreferences.mockImplementation(async () => prefs({ emailEnabled: serverEnabled }));
      saveAlertPreferences.mockImplementation(async ({ emailEnabled }) => {
        serverEnabled = emailEnabled;
        return prefs({ emailEnabled });
      });
      const user = userEvent.setup();
      const first = renderBell();
      let panel = await openPanel(user);
      await user.click(await within(panel).findByRole('checkbox', { name: /Recevoir aussi/ }));
      await waitFor(() => expect(serverEnabled).toBe(true));
      first.unmount(); // a page reload: every bit of React state is gone
      renderBell();
      panel = await openPanel(user);
      expect(await within(panel).findByRole('checkbox', { name: /Recevoir aussi/ })).toBeChecked();
    });

    it('is locked while saving, so a double click sends one request', async () => {
      let release;
      saveAlertPreferences.mockImplementation(() => new Promise((resolve) => { release = () => resolve(prefs({ emailEnabled: true })); }));
      const user = userEvent.setup();
      renderBell();
      const panel = await openPanel(user);
      const checkbox = await within(panel).findByRole('checkbox', { name: /Recevoir aussi/ });
      await user.click(checkbox);
      await waitFor(() => expect(checkbox).toBeDisabled());
      fireEvent.click(checkbox);
      expect(saveAlertPreferences).toHaveBeenCalledTimes(1);
      await act(async () => release());
      await waitFor(() => expect(checkbox).toBeEnabled());
    });

    it('a refused save puts the checkbox back and says why', async () => {
      saveAlertPreferences.mockRejectedValue(new Error('Accès refusé'));
      const user = userEvent.setup();
      renderBell();
      const panel = await openPanel(user);
      const checkbox = await within(panel).findByRole('checkbox', { name: /Recevoir aussi/ });
      await user.click(checkbox);
      expect(await within(panel).findByRole('alert')).toHaveTextContent('Accès refusé');
      expect(checkbox).not.toBeChecked();
      expect(checkbox).toBeEnabled();
    });

    it('a manager with NO email address: the box is locked and the text says they only get the bell', async () => {
      getAlertPreferences.mockResolvedValue(prefs({ hasEmail: false, email: null }));
      const user = userEvent.setup();
      renderBell();
      const panel = await openPanel(user);
      const checkbox = await within(panel).findByRole('checkbox', { name: /Recevoir aussi/ });
      expect(checkbox).toBeDisabled();
      expect(within(panel).getByText(/Aucune adresse email sur votre fiche utilisateur/)).toBeInTheDocument();
      expect(within(panel).queryByText(/Adresse :/)).toBeNull();
      await user.click(checkbox);
      expect(saveAlertPreferences).not.toHaveBeenCalled();
    });

    it('tells the manager when the administrator has not switched the alerts on', async () => {
      getAlertPreferences.mockResolvedValue(prefs({ alertsEnabled: false }));
      const user = userEvent.setup();
      renderBell();
      const panel = await openPanel(user);
      expect(await within(panel).findByText(/ne sont pas activées par l’administrateur/)).toBeInTheDocument();
    });

    it('tells the manager when mail sending is off on the instance', async () => {
      getAlertPreferences.mockResolvedValue(prefs({ mailEnabled: false }));
      const user = userEvent.setup();
      renderBell();
      const panel = await openPanel(user);
      expect(await within(panel).findByText(/L’envoi d’emails est désactivé/)).toBeInTheDocument();
    });

    it('says nothing extra in the normal case', async () => {
      const user = userEvent.setup();
      renderBell();
      const panel = await openPanel(user);
      await within(panel).findByRole('checkbox');
      expect(within(panel).queryByText(/administrateur/)).toBeNull();
      expect(within(panel).queryByText(/désactivé/)).toBeNull();
      expect(within(panel).queryByText(/Aucune adresse/)).toBeNull();
    });

    it('a preference that cannot be loaded shows an error instead of a broken box', async () => {
      getAlertPreferences.mockRejectedValue(new Error('nope'));
      const user = userEvent.setup();
      renderBell();
      const panel = await openPanel(user);
      expect(await within(panel).findByRole('alert')).toHaveTextContent('nope');
      expect(within(panel).queryByRole('checkbox')).toBeNull();
    });
  });

  describe('languages', () => {
    it.each([
      ['en', 'Notifications, 1 unread', '1 employee(s) late on September 23, 2026', 'Also receive the alerts by email', 'Mark all as read'],
      ['de', 'Benachrichtigungen, 1 ungelesen', '1 Mitarbeiter am 23. September 2026 verspätet', 'Alarme zusätzlich per E-Mail erhalten', 'Alle als gelesen markieren'],
      ['ar', 'الإشعارات، 1 غير مقروء', 'موظف(ين) متأخر(ون) بتاريخ', 'تلقّي التنبيهات أيضًا عبر البريد الإلكتروني', 'تعليم الكل كمقروء'],
    ])('%s: bell label, digest title, preference and "mark all" are translated', async (lang, label, title, pref, markAll) => {
      await i18n.changeLanguage(lang);
      const user = userEvent.setup();
      renderBell();
      await user.click(await screen.findByRole('button', { name: label }));
      const panel = await screen.findByRole('dialog');
      expect((await within(panel).findAllByRole('listitem'))[0]).toHaveTextContent(title);
      expect(await within(panel).findByRole('checkbox', { name: pref })).toBeInTheDocument();
      expect(within(panel).getByRole('button', { name: markAll })).toBeInTheDocument();
    });
  });
});
