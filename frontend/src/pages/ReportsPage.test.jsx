import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import ReportsPage from './ReportsPage';
import {
  generateInvoiceLines,
  getDailyReports,
  getMyDailyReports,
  getSummaryReports,
  rejectDailyReport,
  saveDailyReport,
  validateDailyReport,
} from '../api/timeflowApi';

const t = (key, params) => i18n.t(key, params);

// ReportsPage reads/writes its tab and filters via useSearchParams (see
// src/hooks/useUrlState.js), which requires a Router ancestor even in tests.
function renderReportsPage() {
  return render(<ReportsPage />, { wrapper: MemoryRouter });
}

vi.mock('../api/timeflowApi', () => ({
  generateInvoiceLines: vi.fn(),
  getDailyReports: vi.fn(),
  getMyDailyReports: vi.fn(),
  getSummaryReports: vi.fn(),
  validateDailyReport: vi.fn(),
  rejectDailyReport: vi.fn(),
  saveDailyReport: vi.fn(),
}));

describe('ReportsPage', () => {
  beforeEach(() => {
    getSummaryReports.mockReset();
    generateInvoiceLines.mockReset();
    getDailyReports.mockReset();
    getMyDailyReports.mockReset();
    validateDailyReport.mockReset();
    rejectDailyReport.mockReset();
    saveDailyReport.mockReset();
    generateInvoiceLines.mockResolvedValue([]);
    getDailyReports.mockResolvedValue({ reports: [], employees: [] });
    getMyDailyReports.mockResolvedValue([]);
  });

  it('refetches the summary and updates the breakdown when the date range changes', async () => {
    getSummaryReports
      .mockResolvedValueOnce({ total_seconds: 3600, by_project: { 1: 3600 } })
      .mockResolvedValueOnce({ total_seconds: 7200, by_project: { 2: 7200 } });

    renderReportsPage();

    expect(await screen.findByText(t('dashboard.project_fallback', { projectId: 1 }))).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(t('reports.from')), { target: { value: '2026-06-01' } });

    await waitFor(() => expect(getSummaryReports).toHaveBeenLastCalledWith(1000, '2026-06-01', expect.any(String)));
    expect(await screen.findByText(t('dashboard.project_fallback', { projectId: 2 }))).toBeInTheDocument();
    expect(screen.getAllByText('02:00:00')).not.toHaveLength(0);
  });

  it('renders the activity and employee report tabs and switches between them', async () => {
    getSummaryReports.mockResolvedValue({ total_seconds: 3600, by_project: { 1: 3600 }, project_labels: { 1: 'Project One' } });
    getDailyReports.mockResolvedValue({ reports: [{ id: 42, user_label: 'Alice', date_report: '2026-08-20', content: 'Rapport à valider', status: 1, is_read: false, read_at: null }], employees: [{ id: 1, label: 'Alice' }] });

    renderReportsPage();

    expect(await screen.findByRole('button', { name: t('reports.activity_title') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('reports.daily_reports_title') })).toBeInTheDocument();
    expect(screen.getByText(t('reports.by_project'))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: t('reports.daily_reports_title') }));

    await waitFor(() => expect(screen.getByText(t('reports.daily_reports_description'))).toBeInTheDocument());
    expect(screen.getByRole('combobox', { name: t('reports.filter_employee') })).toBeInTheDocument();
  });

  it('removes a report from the queue immediately after validation', async () => {
    const report = {
      id: 42,
      user_label: 'Alice',
      date_report: '2026-08-20',
      content: 'Rapport à valider',
      status: 1,
      is_read: false,
      read_at: null,
    };

    getDailyReports.mockResolvedValue({ reports: [report], employees: [{ id: 1, label: 'Alice' }] });
    validateDailyReport.mockResolvedValue({});

    renderReportsPage();

    fireEvent.click(screen.getByRole('button', { name: t('reports.daily_reports_title') }));

    const actionButton = await screen.findByRole('button', { name: t('reports.validate') });
    expect(actionButton).toBeInTheDocument();

    fireEvent.click(actionButton);

    await waitFor(() => expect(validateDailyReport).toHaveBeenCalledWith(42));
    await waitFor(() => expect(screen.queryByRole('button', { name: t('reports.validate') })).not.toBeInTheDocument());
  });

  it('removes a report from the queue immediately after rejection', async () => {
    const report = {
      id: 42,
      user_label: 'Alice',
      date_report: '2026-08-20',
      content: 'Rapport à rejeter',
      status: 1,
      is_read: false,
      read_at: null,
    };

    getDailyReports.mockResolvedValue({ reports: [report], employees: [{ id: 1, label: 'Alice' }] });
    rejectDailyReport.mockResolvedValue({});

    renderReportsPage();

    fireEvent.click(screen.getByRole('button', { name: t('reports.daily_reports_title') }));

    const actionButton = await screen.findByRole('button', { name: t('reports.reject') });
    expect(actionButton).toBeInTheDocument();

    fireEvent.click(actionButton);

    await waitFor(() => expect(rejectDailyReport).toHaveBeenCalledWith(42));
    await waitFor(() => expect(screen.queryByRole('button', { name: t('reports.reject') })).not.toBeInTheDocument());
  });
});
