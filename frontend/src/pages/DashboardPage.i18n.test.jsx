import React, { act } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as timeflowApi from '../api/timeflowApi';
import i18n from '../i18n';
import DashboardPage from './DashboardPage';

vi.mock('../api/timeflowApi', () => ({
  getSummaryReports: vi.fn().mockResolvedValue({
    total_seconds: 7200,
    billable_seconds: 3600,
    by_project: { 1: 3600 },
    project_labels: { 1: 'Alpha' },
    by_status: { 1: 2, 2: 1 },
  }),
  getWeeklyTimesheet: vi.fn().mockResolvedValue({
    weekStart: '2026-08-18',
    weekEnd: '2026-08-24',
    rows: [
      { day: '2026-08-18', duration: 3600, billable: 1, fk_user: 1, user_label: 'Alice', status: 2 },
      { day: '2026-08-19', duration: 1800, billable: 0, fk_user: 2, user_label: 'Bob', status: 1 },
    ],
  }),
  getTimeEntries: vi.fn().mockResolvedValue([
    { id: 10, duration: 3600, status: 0, date_start: '2026-08-18T09:00:00Z', project_label: 'Alpha', note: 'Draft task' },
  ]),
  getDailyReports: vi.fn().mockResolvedValue({ reports: [{ id: 11, status: 1, date_report: '2026-08-18', user_label: 'Alice' }], employees: [] }),
  getMyDailyReports: vi.fn().mockResolvedValue([{ id: 11, status: 1, date_report: '2026-08-18', user_label: 'Alice' }]),
}));

describe('DashboardPage i18n integration', () => {
  afterEach(async () => {
    cleanup();
    document.documentElement.dir = 'ltr';
    await i18n.changeLanguage('fr');
  });

  it.each([
    ['fr', 'Total semaine', 'ltr'],
    ['de', 'Gesamt Woche', 'ltr'],
    ['ar', 'إجمالي الأسبوع', 'rtl'],
  ])('renders dashboard summary in %s with the correct direction', async (language, summaryLabel, expectedDir) => {
    await act(async () => {
      await i18n.changeLanguage(language);
      document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(summaryLabel)).toBeInTheDocument();
    expect(document.documentElement.dir).toBe(expectedDir);
  });

  it('uses the employee-scoped dashboard data when the current user is not a manager', async () => {
    window.TIMEFLOW_CAN_READALL = false;

    await act(async () => {
      await i18n.changeLanguage('fr');
      document.documentElement.dir = 'ltr';
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Total semaine')).toBeInTheDocument();
    expect(timeflowApi.getMyDailyReports).toHaveBeenCalled();
    expect(timeflowApi.getDailyReports).not.toHaveBeenCalled();
  });
});
