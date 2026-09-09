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

  it('renders the English week/day labels for the calendar view toggle', async () => {
    getWeeklyTimesheet.mockResolvedValue({
      weekStart: '2026-08-17',
      weekEnd: '2026-08-23',
      rows: [],
    });

    await i18n.changeLanguage('en');
    render(<HistoryPage />);

    expect(screen.getByRole('button', { name: 'Week' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Day' })).toBeInTheDocument();
  });

  // Fixture captured verbatim from timeflowFetchWeeklyTimesheet() against two
  // real rows created and cleaned up in the real database for this audit
  // (id 1081 billable=1, id 1082 billable=0, same week, same user) — this is
  // exactly the payload shape the real backend sends, not a hand-typed guess.
  it('marks only the billable event with the indicator dot, when a billable and a non-billable entry are both visible', async () => {
    getWeeklyTimesheet.mockResolvedValue({
      weekStart: '2026-09-07',
      weekEnd: '2026-09-14',
      rows: [
        {
          id: 1081, fk_user: 1, fk_project: 1, date_start: '2026-09-09T00:00:00Z', date_end: '2026-09-09T00:30:00Z',
          duration: 1800, note: 'Audit calendrier - facturable', billable: '1', status: 0,
          user_label: 'SuperAdmin', project_label: 'Projet Test', task_label: '',
        },
        {
          id: 1082, fk_user: 1, fk_project: 1, date_start: '2026-09-09T01:00:00Z', date_end: '2026-09-09T01:30:00Z',
          duration: 1800, note: 'Audit calendrier - non facturable', billable: '0', status: 0,
          user_label: 'SuperAdmin', project_label: 'Projet Test', task_label: '',
        },
      ],
    });

    await i18n.changeLanguage('fr');
    render(<HistoryPage />);

    await screen.findByText(/Audit calendrier - facturable/);
    await screen.findByText(/Audit calendrier - non facturable/);

    // Exactly one indicator dot exists, and it sits inside the billable
    // event's own title row, not the non-billable one.
    const indicators = screen.getAllByTitle('Entrée facturable');
    expect(indicators).toHaveLength(1);
    const billableTitle = screen.getByText(/Audit calendrier - facturable/);
    const nonBillableTitle = screen.getByText(/Audit calendrier - non facturable/);
    expect(indicators[0].parentElement).toContainElement(billableTitle);
    expect(nonBillableTitle.parentElement).not.toContainElement(indicators[0]);
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

  // Regression test for a real bug: scrollTime="07:00:00" was silently a
  // no-op because height="auto" makes FullCalendar's own Scroller render
  // with overflow-y: visible (see @fullcalendar/core's ScrollGrid) — there
  // is no scrollable region at all in that mode, so setting scrollTop (what
  // scrollTime does internally) has nothing to act on. A fixed pixel height
  // is what actually turns the time-grid body into a scrollable pane
  // (overflow-y: auto). This asserts the real rendered DOM, not the prop.
  it('gives the time-grid body a real scrollable pane, so scrollTime can actually take effect', async () => {
    getWeeklyTimesheet.mockResolvedValue({ weekStart: '2026-08-17', weekEnd: '2026-08-23', rows: [] });
    const { container } = render(<HistoryPage />);
    await screen.findByText('Calendrier');

    const scrollers = container.querySelectorAll('.fc-scroller');
    const scrollableBody = Array.from(scrollers).find((el) => el.querySelector('.fc-timegrid-slots'));
    expect(scrollableBody).toBeTruthy();
    expect(scrollableBody.style.overflowY).toBe('auto');
    expect(scrollableBody.style.overflowY).not.toBe('visible');
  });
});
