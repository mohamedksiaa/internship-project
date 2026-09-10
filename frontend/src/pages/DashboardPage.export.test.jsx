import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import DashboardPage from './DashboardPage';
import { downloadCsv } from '../utils/csvExport.js';

vi.mock('../api/timeflowApi', () => ({
  getSummaryReports: vi.fn().mockResolvedValue({
    total_seconds: 36000,
    billable_seconds: 18000,
    non_billable_seconds: 18000,
    by_project: { 5: 21600, 6: 14400 },
    project_labels: { 5: 'Projet Alpha', 6: 'Projet Beta' },
    by_user: { 1: 10800 },
    user_labels: { 1: 'Alice' },
    by_project_employee: { '5|1': 7200, '6|1': 3600 },
    by_status: {},
  }),
  getTimeEntries: vi.fn().mockResolvedValue({ entries: [], pagination: { page: 1, per_page: 100, total: 0, pages: 1 } }),
  getDailyReports: vi.fn().mockResolvedValue({ reports: [], employees: [] }),
  getMyDailyReports: vi.fn().mockResolvedValue([]),
}));

vi.mock('../utils/csvExport.js', () => ({ downloadCsv: vi.fn() }));

const generateDashboardPdf = vi.fn().mockResolvedValue(undefined);
vi.mock('../utils/dashboardPdfExport.js', () => ({
  generateDashboardPdf: (...args) => generateDashboardPdf(...args),
}));

function renderDashboard(initialEntries = ['/']) {
  return render(<DashboardPage />, { wrapper: ({ children }) => <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter> });
}

describe('DashboardPage — export buttons', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
    downloadCsv.mockClear();
    generateDashboardPdf.mockClear().mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it('CSV export downloads a file with the summary block plus the current dimension breakdown', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText(i18n.t('dashboard.total'));

    await user.click(screen.getByRole('button', { name: i18n.t('dashboard.export.csv_button') }));

    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const [slug, , rows] = downloadCsv.mock.calls[0];
    expect(slug).toBe('tableau_de_bord');
    expect(rows[0][0]).toBe(i18n.t('dashboard.export.csv_period_from'));
    expect(rows[2]).toEqual([i18n.t('dashboard.total'), '10:00:00']);
    expect(rows[3]).toEqual([i18n.t('dashboard.of_which_billable'), '05:00:00']);
    // Default dimension is "project" — its breakdown must be in the data table.
    expect(rows.some((row) => row[0] === 'Projet Alpha')).toBe(true);
  });

  it('CSV export builds a real pivot table (one column per crossing category) when Dimension=Employé + Croiser avec=Projet is active — the exact reported scenario', async () => {
    const user = userEvent.setup();
    renderDashboard(['/?dimension=employee&chartType=bar&crossWith=project']);
    await screen.findByText(i18n.t('dashboard.total'));

    await user.click(screen.getByRole('button', { name: i18n.t('dashboard.export.csv_button') }));

    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const [, , rows] = downloadCsv.mock.calls[0];
    const headerRow = rows[5];
    // Must NOT be the old flat "Catégorie, Durée" — one column per project.
    expect(headerRow).not.toEqual([i18n.t('dashboard.export.csv_category'), i18n.t('dashboard.export.csv_duration')]);
    expect(headerRow[0]).toBe(i18n.t('dashboard.export.csv_category'));
    expect(headerRow).toContain('Projet Alpha');
    expect(headerRow).toContain('Projet Beta');

    const aliceRow = rows.find((row) => row[0] === 'Alice');
    expect(aliceRow).toBeTruthy();
    expect(aliceRow.length).toBe(headerRow.length);
    const alphaCol = headerRow.indexOf('Projet Alpha');
    expect(aliceRow[alphaCol]).toBe('02:00:00'); // 7200s, from by_project_employee "5|1"
  });

  it('PDF export calls generateDashboardPdf once, with the configured chart and every non-redundant fixed view', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText(i18n.t('dashboard.total'));

    await user.click(screen.getByRole('button', { name: i18n.t('dashboard.export.pdf_button') }));

    await waitFor(() => expect(generateDashboardPdf).toHaveBeenCalledTimes(1));
    const call = generateDashboardPdf.mock.calls[0][0];
    expect(call.configuredChart.el).toBeTruthy();
    // Default URL state is dimension=project, crossWith=none -> the "project"
    // fixed view is redundant with the configured chart and must be skipped.
    const captions = call.fixedViews.map((view) => view.caption);
    expect(captions).not.toContain(i18n.t('dashboard.export.project_caption'));
    expect(captions).toContain(i18n.t('dashboard.export.billable_caption'));
    expect(captions.some((c) => c === i18n.t('dashboard.export.trend_caption_day') || c === i18n.t('dashboard.export.trend_caption_week'))).toBe(true);
  });

  it('includes the project fixed view when the configured chart is NOT plain-project (e.g. crossed)', async () => {
    const user = userEvent.setup();
    renderDashboard(['/?dimension=project&crossWith=billable']);
    await screen.findByText(i18n.t('dashboard.total'));

    await user.click(screen.getByRole('button', { name: i18n.t('dashboard.export.pdf_button') }));

    await waitFor(() => expect(generateDashboardPdf).toHaveBeenCalledTimes(1));
    const captions = generateDashboardPdf.mock.calls[0][0].fixedViews.map((view) => view.caption);
    expect(captions).toContain(i18n.t('dashboard.export.project_caption'));
  });

  it('skips the billable fixed view when the user already configured a plain billable chart', async () => {
    const user = userEvent.setup();
    renderDashboard(['/?dimension=billable&crossWith=none']);
    await screen.findByText(i18n.t('dashboard.total'));

    await user.click(screen.getByRole('button', { name: i18n.t('dashboard.export.pdf_button') }));

    await waitFor(() => expect(generateDashboardPdf).toHaveBeenCalledTimes(1));
    const captions = generateDashboardPdf.mock.calls[0][0].fixedViews.map((view) => view.caption);
    expect(captions).not.toContain(i18n.t('dashboard.export.billable_caption'));
    expect(captions).toContain(i18n.t('dashboard.export.project_caption'));
  });

  it('shows an error message if PDF generation throws, without crashing', async () => {
    generateDashboardPdf.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText(i18n.t('dashboard.total'));

    await user.click(screen.getByRole('button', { name: i18n.t('dashboard.export.pdf_button') }));

    expect(await screen.findByText('boom')).toBeInTheDocument();
  });
});
