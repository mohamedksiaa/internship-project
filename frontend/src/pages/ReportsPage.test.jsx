import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import ReportsPage from './ReportsPage';

const {
  getProjects,
  getProcessedHistory,
  getDailyReports,
  getMyDailyReports,
  exportProcessedHistory,
  getTimeFlowProjects,
  listActiveThirdParties,
  listActiveUsers,
} = vi.hoisted(() => ({
  getProjects: vi.fn().mockResolvedValue([]),
  getProcessedHistory: vi.fn().mockResolvedValue({
    rows: [{ id: 1, note: 'Entrée validée', project_label: 'Projet test', user_label: 'Soumeya', date_start: '2026-08-12T08:00:00Z', date_end: '2026-08-12T09:00:00Z', status: 2, duration: 3600, processed_by_label: 'SuperAdmin', processed_at: '2026-08-12T10:00:00Z' }],
    pagination: { page: 1, pages: 1 },
    stats: { validated_count: 1, refused_count: 0, manual_count: 0 },
  }),
  getDailyReports: vi.fn().mockResolvedValue({ reports: [], employees: [] }),
  getMyDailyReports: vi.fn().mockResolvedValue({ reports: [], employees: [] }),
  exportProcessedHistory: vi.fn().mockResolvedValue([]),
  getTimeFlowProjects: vi.fn().mockResolvedValue([]),
  listActiveThirdParties: vi.fn().mockResolvedValue([]),
  listActiveUsers: vi.fn().mockResolvedValue([]),
}));

vi.mock('../api/timeflowApi', () => ({
  getProjects,
  getProcessedHistory,
  getDailyReports,
  getMyDailyReports,
  exportProcessedHistory,
  getTimeFlowProjects,
  listActiveThirdParties,
  listActiveUsers,
}));

// ReportsPage reads/writes its tab and filters via useSearchParams (see
// src/hooks/useUrlState.js), which requires a Router ancestor even in tests.
function renderReportsPage() {
  return render(<ReportsPage />, { wrapper: MemoryRouter });
}

describe('ReportsPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
    window.TIMEFLOW_CAN_READALL = false;
    getProjects.mockClear();
    getProcessedHistory.mockReset().mockResolvedValue({
      rows: [{ id: 1, note: 'Entrée validée', project_label: 'Projet test', user_label: 'Soumeya', date_start: '2026-08-12T08:00:00Z', date_end: '2026-08-12T09:00:00Z', status: 2, duration: 3600, processed_by_label: 'SuperAdmin', processed_at: '2026-08-12T10:00:00Z' }],
      pagination: { page: 1, pages: 1 },
      stats: { validated_count: 1, refused_count: 0, manual_count: 0 },
    });
    getDailyReports.mockReset().mockResolvedValue({ reports: [], employees: [] });
    getMyDailyReports.mockReset().mockResolvedValue({ reports: [], employees: [] });
    exportProcessedHistory.mockReset().mockResolvedValue([]);
    getTimeFlowProjects.mockReset().mockResolvedValue([]);
    listActiveThirdParties.mockReset().mockResolvedValue([]);
    listActiveUsers.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it('mounts the task-reports tab (default) without any validation action', async () => {
    render(<ReportsPage />, { wrapper: MemoryRouter });
    expect(await screen.findByText('Entrée validée')).toBeInTheDocument();
    expect(screen.getByText(/SuperAdmin/)).toBeInTheDocument();
    expect(screen.queryByTitle('Valider')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Refuser')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Supprimer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Employé/i })).not.toBeInTheDocument();
  });

  it('shows the three tabs and switches between them', async () => {
    renderReportsPage();
    expect(await screen.findByRole('button', { name: i18n.t('history.task_history') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('projects.title') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('history.report_history') })).toBeInTheDocument();
  });

  it('lists projects read-only in the projects tab, with no create/edit/delete affordance', async () => {
    getTimeFlowProjects.mockResolvedValue([
      { id: 5, ref: 'PJ-0005', title: 'Projet Alpha', client: 'Client A', assigned_user_ids: [], entry_count: 3 },
    ]);
    const user = userEvent.setup();
    renderReportsPage();

    await user.click(await screen.findByRole('button', { name: i18n.t('projects.title') }));

    expect(await screen.findByText('Projet Alpha')).toBeInTheDocument();
    expect(screen.getByText('PJ-0005')).toBeInTheDocument();
    // Project management now lives exclusively in Dolibarr's native Projects
    // module: no create/edit/delete affordance must exist here anymore.
    expect(screen.queryByRole('button', { name: /nouveau projet/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Modifier$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Supprimer$/)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('keeps submitted reports out of the report-history tab', async () => {
    window.TIMEFLOW_CAN_READALL = true;
    getDailyReports.mockResolvedValueOnce({
      reports: [
        { id: 21, user_label: 'Alice', date_report: '2026-08-12', content: 'Rapport soumis', status: 1, date_creation: '2026-08-12 08:00:00', date_last_content_edit: null },
        { id: 22, user_label: 'Alice', date_report: '2026-08-11', content: 'Rapport validé', status: 2, date_creation: '2026-08-11 08:00:00', date_last_content_edit: '2026-08-11 08:00:00' },
        { id: 23, user_label: 'Bob', date_report: '2026-08-10', content: 'Rapport refusé', status: 9, date_creation: '2026-08-10 08:00:00', date_last_content_edit: '2026-08-10 08:00:00' },
      ],
      employees: [],
    });

    renderReportsPage();
    await userEvent.click(await screen.findByRole('button', { name: i18n.t('history.report_history') }));

    // The list shows user + day + status badge per report (content itself is
    // only revealed via "Lire le rapport"): the validated (2026-08-11) and
    // rejected (2026-08-10) day groups must appear (each rendered twice: once
    // as the day-group heading, once as the report's own date), the submitted
    // (2026-08-12, status 1) one must not appear at all.
    await waitFor(() => expect(screen.getAllByText('2026-08-11').length).toBeGreaterThan(0));
    expect(screen.getAllByText('2026-08-10').length).toBeGreaterThan(0);
    expect(screen.queryByText('2026-08-12')).not.toBeInTheDocument();
    expect(screen.getAllByText('Alice')).toHaveLength(1);
    // Read-only historical view: no validate/reject action here (that lives
    // in Validations > "Validation des comptes-rendus des employés" now).
    expect(screen.queryByRole('button', { name: i18n.t('reports.validate') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: i18n.t('reports.reject') })).not.toBeInTheDocument();
  });

  it('shows the modified-manually badge on processed report entries edited after creation', async () => {
    window.TIMEFLOW_CAN_READALL = true;
    getDailyReports.mockResolvedValueOnce({
      reports: [
        { id: 11, user_label: 'Alice', date_report: '2026-08-12', content: 'Version originale', status: 2, date_creation: '2026-08-12 08:00:00', date_last_content_edit: '2026-08-12 09:00:00' },
        { id: 12, user_label: 'Bob', date_report: '2026-08-13', content: 'Non modifié', status: 9, date_creation: '2026-08-13 08:00:00', date_last_content_edit: '2026-08-13 08:00:00' },
      ],
      employees: [],
    });

    renderReportsPage();
    await userEvent.click(await screen.findByRole('button', { name: i18n.t('history.report_history') }));

    expect(await screen.findByTitle('Temps corrigé et tracé')).toBeInTheDocument();
  });
});
