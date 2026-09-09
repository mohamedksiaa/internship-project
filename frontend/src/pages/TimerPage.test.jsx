import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import TimerPage from './TimerPage';

const {
  getActiveTimer,
  startTimer,
  stopTimer,
  restartTimer,
  getProjects,
  getTasks,
  getTimeEntries,
  getTimeEntryUpdates,
} = vi.hoisted(() => ({
  getActiveTimer: vi.fn().mockResolvedValue(null),
  startTimer: vi.fn(),
  stopTimer: vi.fn(),
  restartTimer: vi.fn(),
  getProjects: vi.fn().mockResolvedValue([]),
  getTasks: vi.fn().mockResolvedValue([]),
  getTimeEntries: vi.fn().mockResolvedValue({ entries: [], pagination: { page: 1, per_page: 20, total: 0, pages: 1 } }),
  getTimeEntryUpdates: vi.fn().mockResolvedValue({ marker: '', changed: false, entries: [] }),
}));

vi.mock('../api/timeflowApi', () => ({
  getActiveTimer,
  startTimer,
  stopTimer,
  restartTimer,
  getProjects,
  getTasks,
  getTimeEntries,
  getTimeEntryUpdates,
}));

describe('TimerPage — "Facturable uniquement" filter', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
    getActiveTimer.mockReset().mockResolvedValue(null);
    getProjects.mockReset().mockResolvedValue([]);
    getTasks.mockReset().mockResolvedValue([]);
    getTimeEntries.mockReset().mockResolvedValue({ entries: [], pagination: { page: 1, per_page: 20, total: 0, pages: 1 } });
    getTimeEntryUpdates.mockReset().mockResolvedValue({ marker: '', changed: false, entries: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it('sends billable_only=false by default, then true after checking the filter, resetting to page 1', async () => {
    const user = userEvent.setup();
    render(<TimerPage />);

    await waitFor(() => expect(getTimeEntries).toHaveBeenCalledWith(1, 20, false));

    getTimeEntries.mockResolvedValueOnce({
      entries: [{ id: 5, note: 'Tâche facturable', duration: 3600, status: 2, billable: 1, date_start: '2026-09-01T08:00:00Z', date_end: '2026-09-01T09:00:00Z' }],
      pagination: { page: 1, per_page: 20, total: 1, pages: 1 },
    });

    await user.click(screen.getByRole('checkbox', { name: i18n.t('processed_history.filters.billable_only') }));

    await waitFor(() => expect(getTimeEntries).toHaveBeenLastCalledWith(1, 20, true));
    expect(await screen.findByText('Tâche facturable')).toBeInTheDocument();
  });

  it('keeps the active filter when paging, and when the background poll refetches', async () => {
    getTimeEntries.mockResolvedValue({
      entries: [{ id: 1, note: 'Entrée', duration: 60, status: 2, date_start: '2026-09-01T08:00:00Z', date_end: '2026-09-01T08:01:00Z' }],
      pagination: { page: 1, per_page: 20, total: 25, pages: 2 },
    });
    const user = userEvent.setup();
    render(<TimerPage />);

    await screen.findByText('Entrée');
    await user.click(screen.getByRole('checkbox', { name: i18n.t('processed_history.filters.billable_only') }));
    await waitFor(() => expect(getTimeEntries).toHaveBeenLastCalledWith(1, 20, true));

    await user.click(screen.getByRole('button', { name: i18n.t('processed_history.pagination.next') }));
    await waitFor(() => expect(getTimeEntries).toHaveBeenLastCalledWith(2, 20, true));
  });
});
