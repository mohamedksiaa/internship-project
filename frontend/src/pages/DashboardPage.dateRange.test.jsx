import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import DashboardPage from './DashboardPage';

vi.mock('../api/timeflowApi', () => ({
  getSummaryReports: vi.fn().mockResolvedValue({ total_seconds: 0, billable_seconds: 0, by_project: {}, project_labels: {}, by_status: {} }),
  getWeeklyTimesheet: vi.fn().mockResolvedValue({ weekStart: '2026-09-01', weekEnd: '2026-09-07', rows: [] }),
  getTimeEntries: vi.fn().mockResolvedValue({ entries: [], pagination: { page: 1, per_page: 100, total: 0, pages: 1 } }),
  getDailyReports: vi.fn().mockResolvedValue({ reports: [], employees: [] }),
  getMyDailyReports: vi.fn().mockResolvedValue([]),
}));

const STORAGE_KEY = 'timeflow_dashboard_date_range';

function renderDashboard() {
  return render(<DashboardPage />, { wrapper: MemoryRouter });
}

describe('DashboardPage — date range persistence', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
    window.localStorage.removeItem(STORAGE_KEY);
    // Pin "today" so the computed default ("current month") is deterministic.
    // Only fake Date — leaving setTimeout/setInterval real so RTL's own
    // async findBy*/waitFor polling (which relies on real timers) still works.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-15T10:00:00Z'));
  });

  afterEach(() => {
    cleanup();
    window.localStorage.removeItem(STORAGE_KEY);
    vi.useRealTimers();
  });

  it('defaults to the 1st of the current month through its last day when nothing is stored', async () => {
    renderDashboard();
    const from = await screen.findByLabelText(i18n.t('dashboard.date_from'));
    const to = await screen.findByLabelText(i18n.t('dashboard.date_to'));
    expect(from).toHaveValue('2026-09-01');
    expect(to).toHaveValue('2026-09-30');
  });

  it('remembers a manually chosen date across a fresh app entry (no URL state carried over), until changed again', async () => {
    const { unmount } = renderDashboard();

    // fireEvent.change (not userEvent.type) — a native date input is filled
    // atomically by the browser's own picker, not typed character by
    // character, and typing into it via userEvent is flaky/jsdom-specific.
    const from = await screen.findByLabelText(i18n.t('dashboard.date_from'));
    fireEvent.change(from, { target: { value: '2026-07-15' } });

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify({ from: '2026-07-15', to: '2026-09-30' }));

    // Simulate closing and reopening the app: unmount, then mount a brand
    // new instance with a brand new MemoryRouter (no ?dateFrom in the URL —
    // exactly what happens on a real fresh navigation, as opposed to a
    // same-tab refresh which keeps the URL). Only localStorage bridges them.
    unmount();
    renderDashboard();

    const fromAfterReopen = await screen.findByLabelText(i18n.t('dashboard.date_from'));
    const toAfterReopen = await screen.findByLabelText(i18n.t('dashboard.date_to'));
    expect(fromAfterReopen).toHaveValue('2026-07-15');
    expect(toAfterReopen).toHaveValue('2026-09-30');
  });

  it('falls back to the current-month default again once storage is cleared', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ from: '2026-01-05', to: '2026-01-20' }));
    const { unmount } = renderDashboard();
    expect(await screen.findByLabelText(i18n.t('dashboard.date_from'))).toHaveValue('2026-01-05');
    unmount();

    window.localStorage.removeItem(STORAGE_KEY);
    renderDashboard();

    const from = await screen.findByLabelText(i18n.t('dashboard.date_from'));
    const to = await screen.findByLabelText(i18n.t('dashboard.date_to'));
    expect(from).toHaveValue('2026-09-01');
    expect(to).toHaveValue('2026-09-30');
  });
});
