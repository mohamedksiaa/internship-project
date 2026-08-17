import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReportsPage from './ReportsPage';
import { generateInvoiceLines, getDailyReports, getMyDailyReports, getSummaryReports, markDailyReportRead, saveDailyReport } from '../api/timeflowApi';

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
      .mockResolvedValueOnce({ total_seconds: 3600, billable_seconds: 3600, non_billable_seconds: 0, by_project: { 1: 3600 }, by_tag: {} })
      .mockResolvedValueOnce({ total_seconds: 7200, billable_seconds: 0, non_billable_seconds: 7200, by_project: { 2: 7200 }, by_tag: { Support: 7200 } });

    render(<ReportsPage />);

    expect(await screen.findByText('Projet #1')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-06-01' } });

    await waitFor(() => expect(getSummaryReports).toHaveBeenLastCalledWith(1000, '2026-06-01', expect.any(String)));
    expect(await screen.findByText('Projet #2')).toBeInTheDocument();
    expect(screen.getAllByText('02:00:00')).not.toHaveLength(0);
    expect(screen.getByText('Support')).toBeInTheDocument();
  });
});
