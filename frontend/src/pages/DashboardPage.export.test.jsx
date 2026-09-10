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
    // A line naming the crossing dimension (Projet) comes right before the
    // header, so the table reads on its own without the chart in view —
    // the exact reported readability gap.
    expect(rows[5]).toEqual([i18n.t('dashboard.export.csv_crossed_with_header', { dimension: i18n.t('dashboard.dimension.project') })]);
    const headerRow = rows[6];
    // Must NOT be the old generic "Catégorie" — the real dimension (Employé).
    expect(headerRow[0]).toBe(i18n.t('dashboard.dimension.employee'));
    expect(headerRow[0]).not.toBe(i18n.t('dashboard.export.csv_category'));
    expect(headerRow).toContain('Projet Alpha');
    expect(headerRow).toContain('Projet Beta');

    const aliceRow = rows.find((row) => row[0] === 'Alice');
    expect(aliceRow).toBeTruthy();
    expect(aliceRow.length).toBe(headerRow.length);
    const alphaCol = headerRow.indexOf('Projet Alpha');
    expect(aliceRow[alphaCol]).toBe('02:00:00'); // 7200s, from by_project_employee "5|1"
  });

  it('PDF export calls generateDashboardPdf once, with the configured chart captured and captioned', async () => {
    // The PDF used to also carry 3 fixed off-screen views (project split,
    // billable/non-billable, trend). That multi-element capture sequence
    // broke repeatedly in real sessions across 4 different architectural
    // fixes — always the same failure, capture #2 onward finding its
    // target already gone. The configured chart alone never failed in any
    // real test, so the PDF now contains only it; see dashboardPdfExport.js
    // and the DashboardPage.jsx comment above exportConfiguredChartRef.
    //
    // configuredChart.el is a getter backed by a ref (see DashboardPage.jsx's
    // handleExportPdf) so it always resolves the *current* DOM node instead
    // of a snapshot taken before the capture runs. That means it must be
    // read synchronously inside the call, same as the real capture code
    // does; reading it later (once export has finished and the off-screen
    // block has unmounted) would correctly see null, not prove anything wrong.
    let capturedEl;
    generateDashboardPdf.mockImplementationOnce(async (params) => {
      capturedEl = params.configuredChart.el;
    });

    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText(i18n.t('dashboard.total'));

    await user.click(screen.getByRole('button', { name: i18n.t('dashboard.export.pdf_button') }));

    await waitFor(() => expect(generateDashboardPdf).toHaveBeenCalledTimes(1));
    expect(capturedEl).toBeTruthy();
    const call = generateDashboardPdf.mock.calls[0][0];
    expect(call.configuredChart.caption).toContain(i18n.t('dashboard.dimension.project'));
    expect(call.fixedViews).toBeUndefined();
  });

  it('shows a clear, translated error message if PDF generation throws, without crashing', async () => {
    // The shown message must always be the translated, user-facing one —
    // never the raw thrown error (a library-internal string like
    // html2canvas' "Unable to find element in cloned iframe" is not
    // something an end user should see as-is).
    generateDashboardPdf.mockRejectedValueOnce(new Error('Unable to find element in cloned iframe'));
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText(i18n.t('dashboard.total'));

    await user.click(screen.getByRole('button', { name: i18n.t('dashboard.export.pdf_button') }));

    expect(await screen.findByText(i18n.t('dashboard.export.pdf_error'))).toBeInTheDocument();
    expect(screen.queryByText('Unable to find element in cloned iframe')).not.toBeInTheDocument();
  });
});
