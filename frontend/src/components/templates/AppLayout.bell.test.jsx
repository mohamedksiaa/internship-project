import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import AppLayout from './AppLayout';

const { getMyNotifications, markNotificationsRead, getAlertPreferences, saveAlertPreferences } = vi.hoisted(() => ({
  getMyNotifications: vi.fn(),
  markNotificationsRead: vi.fn(),
  getAlertPreferences: vi.fn(),
  saveAlertPreferences: vi.fn(),
}));
vi.mock('../../api/timeflowApi', () => ({ getMyNotifications, markNotificationsRead, getAlertPreferences, saveAlertPreferences }));

// The bell holds the managers' late-arrival alerts, so only a user with the
// team-wide read right (readall) gets one — and, for everybody else, not even
// the request is made (the server would answer 403 anyway).
function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/timer']}>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route path="timer" element={<div>Timer page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}
const setFlags = ({ readall, validate }) => {
  window.TIMEFLOW_CAN_READALL = readall;
  window.TIMEFLOW_CAN_VALIDATE = validate;
};

describe('AppLayout — the notification bell', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
    getMyNotifications.mockReset().mockResolvedValue({ available: true, unreadCount: 3, rows: [] });
    markNotificationsRead.mockReset().mockResolvedValue({ updated: 0 });
    getAlertPreferences.mockReset().mockResolvedValue({ emailEnabled: true, hasEmail: true, email: 'a@b.c', alertsEnabled: true, mailEnabled: true });
    saveAlertPreferences.mockReset();
  });
  afterEach(() => {
    cleanup();
    delete window.TIMEFLOW_CAN_READALL;
    delete window.TIMEFLOW_CAN_VALIDATE;
  });

  it('a manager (readall) has the bell in the header, and it loads their notifications', async () => {
    setFlags({ readall: true, validate: false });
    renderLayout();
    expect(await screen.findByRole('button', { name: 'Notifications, 3 non lue(s)' })).toBeInTheDocument();
    expect(getMyNotifications).toHaveBeenCalledTimes(1);
  });

  it('the bell sits in the header, next to the language selector', async () => {
    setFlags({ readall: true, validate: true });
    renderLayout();
    const button = await screen.findByRole('button', { name: /^Notifications/ });
    const header = screen.getByRole('banner');
    expect(header).toContainElement(button);
    expect(header).toContainElement(screen.getByLabelText('Sélecteur de langue'));
  });

  it('an employee (no readall) has no bell and nothing is requested', async () => {
    setFlags({ readall: false, validate: false });
    renderLayout();
    expect(await screen.findByText('Timer page')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Notifications/ })).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(getMyNotifications).not.toHaveBeenCalled();
    expect(getAlertPreferences).not.toHaveBeenCalled();
  });

  it('validate WITHOUT readall is not enough: no bell', async () => {
    setFlags({ readall: false, validate: true });
    renderLayout();
    expect(await screen.findByText('Timer page')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Notifications/ })).toBeNull();
    expect(getMyNotifications).not.toHaveBeenCalled();
  });

  it('a missing flag fails closed (no bell)', async () => {
    delete window.TIMEFLOW_CAN_READALL;
    renderLayout();
    expect(await screen.findByText('Timer page')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Notifications/ })).toBeNull();
  });

  it('the rest of the layout is unchanged: navigation and page are still there', async () => {
    setFlags({ readall: true, validate: true });
    renderLayout();
    expect(await screen.findByText('Timer page')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Validations/i })).toBeInTheDocument();
    await waitFor(() => expect(getMyNotifications).toHaveBeenCalled());
  });
});
