import React, { act } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  getTimeEntries: vi.fn().mockResolvedValue({
    entries: [
      { id: 10, duration: 3600, status: 0, date_start: '2026-08-18T09:00:00Z', project_label: 'Alpha', note: 'Draft task' },
    ],
    pagination: { page: 1, per_page: 100, total: 1, pages: 1 },
  }),
}));

describe('DashboardPage i18n integration', () => {
  afterEach(async () => {
    cleanup();
    document.documentElement.dir = 'ltr';
    await i18n.changeLanguage('fr');
  });

  it.each([
    ['fr', 'Total', 'ltr'],
    ['de', 'Gesamt', 'ltr'],
    ['ar', 'الإجمالي', 'rtl'],
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

  it('shows the Total KPI card, but not a separate "Dont facturable" card (billable time is only in the PDF/CSV exports, not a Dashboard card)', async () => {
    await act(async () => {
      await i18n.changeLanguage('fr');
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    // total_seconds: 7200 -> "02:00:00" (getSummaryReports mock above).
    expect(await screen.findByText('Total')).toBeInTheDocument();
    expect(screen.getByText('02:00:00')).toBeInTheDocument();
    expect(screen.queryByText('Dont facturable')).not.toBeInTheDocument();
  });
});
