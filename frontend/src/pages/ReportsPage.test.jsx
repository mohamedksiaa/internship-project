import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import ReportsPage from './ReportsPage';
import { generateInvoiceLines, getDailyReports, getMyDailyReports, getSummaryReports, markDailyReportRead, saveDailyReport } from '../api/timeflowApi';

const t = (key, params) => i18n.t(key, params);

vi.mock('../api/timeflowApi', () => ({
  generateInvoiceLines: vi.fn(),
  getDailyReports: vi.fn(),
  getMyDailyReports: vi.fn(),
  getSummaryReports: vi.fn(),
  markDailyReportRead: vi.fn(),
  saveDailyReport: vi.fn(),
}));

describe('ReportsPage', () => {
  beforeEach(() => {
    getSummaryReports.mockReset();
    generateInvoiceLines.mockReset();
    getDailyReports.mockReset();
    getMyDailyReports.mockReset();
    markDailyReportRead.mockReset();
    saveDailyReport.mockReset();
    generateInvoiceLines.mockResolvedValue([]);
    getDailyReports.mockResolvedValue({ reports: [], employees: [] });
    getMyDailyReports.mockResolvedValue([]);
  });

  it('refetches the summary and updates the breakdown when the date range changes', async () => {
    getSummaryReports
      .mockResolvedValueOnce({ total_seconds: 3600, by_project: { 1: 3600 } })
      .mockResolvedValueOnce({ total_seconds: 7200, by_project: { 2: 7200 } });

    render(<ReportsPage />);

    expect(await screen.findByText(t('dashboard.project_fallback', { projectId: 1 }))).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(t('reports.from')), { target: { value: '2026-06-01' } });

    await waitFor(() => expect(getSummaryReports).toHaveBeenLastCalledWith(1000, '2026-06-01', expect.any(String)));
    expect(await screen.findByText(t('dashboard.project_fallback', { projectId: 2 }))).toBeInTheDocument();
    expect(screen.getAllByText('02:00:00')).not.toHaveLength(0);
  });

  it('removes a report immediately from the manager queue after marking it read', async () => {
    const report = {
      id: 42,
      user_label: 'Alice',
      date_report: '2026-08-20',
      content: 'Rapport non lu',
      is_read: false,
      read_at: null,
    };

    getDailyReports.mockResolvedValue({ reports: [report], employees: [{ id: 1, label: 'Alice' }] });
    markDailyReportRead.mockResolvedValue({});

    render(<ReportsPage />);

    const actionButton = await screen.findByRole('button', { name: t('reports.new_mark_read') });
    expect(actionButton).toBeInTheDocument();

    fireEvent.click(actionButton);

    await waitFor(() => expect(markDailyReportRead).toHaveBeenCalledWith(42));
    await waitFor(() => expect(screen.queryByRole('button', { name: t('reports.new_mark_read') })).not.toBeInTheDocument());
  });

  it('opens the read-report modal without crashing when the user clicks the read button', async () => {
    const report = {
      id: 42,
      user_label: 'Alice',
      date_report: '2026-08-20',
      content: 'Contenu du rapport détaillé',
      is_read: false,
      read_at: null,
    };

    getDailyReports.mockResolvedValue({ reports: [report], employees: [{ id: 1, label: 'Alice' }] });
    render(<ReportsPage />);

    fireEvent.click(await screen.findByRole('button', { name: t('reports.read') }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Contenu du rapport détaillé')).toBeInTheDocument();
  });
});
