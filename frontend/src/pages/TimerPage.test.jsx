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

describe('TimerPage — "Facturable uniquement" filter removed', () => {
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

  it('no longer renders the "Facturable uniquement" checkbox', async () => {
    render(<TimerPage />);

    await waitFor(() => expect(getTimeEntries).toHaveBeenCalledWith(1, 20, false));
    expect(screen.queryByRole('checkbox', { name: i18n.t('processed_history.filters.billable_only') })).not.toBeInTheDocument();
    expect(screen.queryByText(i18n.t('processed_history.filters.billable_only'))).not.toBeInTheDocument();
  });

  it('still fetches with billable_only permanently false — removing the UI did not break the list or its pagination', async () => {
    getTimeEntries.mockResolvedValue({
      entries: [{ id: 1, note: 'Entrée', duration: 60, status: 2, date_start: '2026-09-01T08:00:00Z', date_end: '2026-09-01T08:01:00Z' }],
      pagination: { page: 1, per_page: 20, total: 25, pages: 2 },
    });
    const user = userEvent.setup();
    render(<TimerPage />);

    await screen.findByText('Entrée');
    expect(getTimeEntries).toHaveBeenCalledWith(1, 20, false);

    await user.click(screen.getByRole('button', { name: i18n.t('processed_history.pagination.next') }));
    await waitFor(() => expect(getTimeEntries).toHaveBeenLastCalledWith(2, 20, false));
  });
});

describe('TimerPage — write-right gating (security report A-13, decision D2)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
    getActiveTimer.mockReset().mockResolvedValue(null);
    getProjects.mockReset().mockResolvedValue([{ id: 1, title: 'Projet Alpha' }]);
    getTasks.mockReset().mockResolvedValue([]);
    getTimeEntries.mockReset().mockResolvedValue({ entries: [], pagination: { page: 1, per_page: 20, total: 0, pages: 1 } });
    getTimeEntryUpdates.mockReset().mockResolvedValue({ marker: '', changed: false, entries: [] });
  });

  afterEach(() => {
    cleanup();
    delete window.TIMEFLOW_CAN_WRITE;
  });

  it('disables START and shows the read-only notice without window.TIMEFLOW_CAN_WRITE', async () => {
    window.TIMEFLOW_CAN_WRITE = false;
    render(<TimerPage />);
    await screen.findByRole('option', { name: 'Projet Alpha' });
    expect(screen.getByRole('button', { name: i18n.t('timer_widget.start') })).toBeDisabled();
    expect(screen.getByText(i18n.t('timer_widget.read_only_notice'))).toBeInTheDocument();
  });

  it('enables START once a project and description are filled with window.TIMEFLOW_CAN_WRITE=true', async () => {
    window.TIMEFLOW_CAN_WRITE = true;
    const user = userEvent.setup();
    render(<TimerPage />);
    await user.selectOptions(await screen.findByLabelText(i18n.t('timer_widget.project_label')), '1');
    await user.type(screen.getByLabelText(i18n.t('timer_widget.description_label')), 'abc');
    expect(screen.getByRole('button', { name: i18n.t('timer_widget.start') })).toBeEnabled();
  });
});
