import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import HistoryPage from './HistoryPage';
import { getWeeklyTimesheet } from '../api/timeflowApi';

vi.mock('../api/timeflowApi', () => ({
  getWeeklyTimesheet: vi.fn(),
}));

describe('HistoryPage i18n', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('timeflow_lang', 'de');
  });

  it('uses the active language for the week/day toggle and the date range label', async () => {
    getWeeklyTimesheet.mockResolvedValue({
      weekStart: '2026-08-17',
      weekEnd: '2026-08-23',
      rows: [
        {
          id: 1,
          date_start: '2026-08-17T09:00:00',
          date_end: '2026-08-17T11:00:00',
          duration: 7200,
          project_label: 'Project A',
          task_label: 'Implementation',
          fk_project: 1,
          billable: 1,
          status: 1,
        },
      ],
    });

    await i18n.changeLanguage('de');
    render(<HistoryPage />);

    expect(await screen.findByRole('button', { name: 'Woche' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tag' })).toBeInTheDocument();
    expect(await screen.findByText('17. Aug. - 23. Aug.')).toBeInTheDocument();
  });

  it('renders the calendar-only page without the task/report tab split', async () => {
    getWeeklyTimesheet.mockResolvedValue({
      weekStart: '2026-08-17',
      weekEnd: '2026-08-23',
      rows: [],
    });

    await i18n.changeLanguage('fr');
    render(<HistoryPage />);

    expect(screen.getByText('Calendrier')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Semaine' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jour' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Historique des tâches' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Historique des rapports' })).not.toBeInTheDocument();
  });
});
