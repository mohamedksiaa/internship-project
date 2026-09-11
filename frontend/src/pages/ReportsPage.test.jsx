import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
  getTimeFlowUsers,
  listActiveThirdParties,
  listActiveUsers,
} = vi.hoisted(() => ({
  getProjects: vi.fn().mockResolvedValue([]),
  getProcessedHistory: vi.fn().mockResolvedValue({
    rows: [{ id: 1, note: 'Entrée validée', project_label: 'Projet test', user_label: 'Emma Lambert', date_start: '2026-08-12T08:00:00Z', date_end: '2026-08-12T09:00:00Z', status: 2, duration: 3600, processed_by_label: 'SuperAdmin', processed_at: '2026-08-12T10:00:00Z' }],
    pagination: { page: 1, pages: 1 },
    stats: { validated_count: 1, refused_count: 0, manual_count: 0 },
  }),
  getDailyReports: vi.fn().mockResolvedValue({ reports: [], employees: [] }),
  getMyDailyReports: vi.fn().mockResolvedValue({ reports: [], employees: [] }),
  exportProcessedHistory: vi.fn().mockResolvedValue([]),
  getTimeFlowProjects: vi.fn().mockResolvedValue({ rows: [], pagination: { page: 1, per_page: 20, total: 0, pages: 1 } }),
  getTimeFlowUsers: vi.fn().mockResolvedValue({ rows: [], pagination: { page: 1, per_page: 20, total: 0, pages: 1 } }),
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
  getTimeFlowUsers,
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
      rows: [{ id: 1, note: 'Entrée validée', project_label: 'Projet test', user_label: 'Emma Lambert', date_start: '2026-08-12T08:00:00Z', date_end: '2026-08-12T09:00:00Z', status: 2, duration: 3600, processed_by_label: 'SuperAdmin', processed_at: '2026-08-12T10:00:00Z' }],
      pagination: { page: 1, pages: 1 },
      stats: { validated_count: 1, refused_count: 0, manual_count: 0 },
    });
    getDailyReports.mockReset().mockResolvedValue({ reports: [], employees: [] });
    getMyDailyReports.mockReset().mockResolvedValue({ reports: [], employees: [] });
    exportProcessedHistory.mockReset().mockResolvedValue([]);
    getTimeFlowProjects.mockReset().mockResolvedValue({ rows: [], pagination: { page: 1, per_page: 20, total: 0, pages: 1 } });
    getTimeFlowUsers.mockReset().mockResolvedValue({ rows: [], pagination: { page: 1, per_page: 20, total: 0, pages: 1 } });
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

  it('shows a Facturable badge for billable rows and a dash otherwise, and pushes "billable only" to the backend filter', async () => {
    getProcessedHistory.mockReset().mockResolvedValue({
      rows: [
        { id: 1, note: 'Ligne facturable', project_label: 'Projet test', user_label: 'Emma Lambert', date_start: '2026-08-12T08:00:00Z', date_end: '2026-08-12T09:00:00Z', status: 2, duration: 3600, billable: 1, processed_by_label: 'SuperAdmin', processed_at: '2026-08-12T10:00:00Z' },
        { id: 2, note: 'Ligne non facturable', project_label: 'Projet test', user_label: 'Emma Lambert', date_start: '2026-08-12T08:00:00Z', date_end: '2026-08-12T09:00:00Z', status: 2, duration: 1800, billable: 0, processed_by_label: 'SuperAdmin', processed_at: '2026-08-12T10:00:00Z' },
      ],
      pagination: { page: 1, per_page: 20, total: 2, pages: 1 },
      stats: { validated_count: 2, refused_count: 0, manual_count: 0 },
    });
    const user = userEvent.setup();
    renderReportsPage();

    await screen.findByText('Ligne facturable');
    // The billable row carries the green badge; the non-billable row shows
    // a dash — same convention as the Modification column right next to it.
    const billableRow = screen.getByText('Ligne facturable').closest('tr');
    expect(within(billableRow).getByText(i18n.t('timeentry.billable_badge'))).toBeInTheDocument();
    const nonBillableRow = screen.getByText('Ligne non facturable').closest('tr');
    expect(within(nonBillableRow).queryByText(i18n.t('timeentry.billable_badge'))).not.toBeInTheDocument();
    expect(nonBillableRow).toHaveTextContent('—');

    await user.click(screen.getByRole('checkbox', { name: i18n.t('processed_history.filters.billable_only') }));

    await waitFor(() => expect(getProcessedHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({ billable_only: true, page: 1 }),
    ));
  });

  it('shows the three tabs and switches between them', async () => {
    renderReportsPage();
    expect(await screen.findByRole('button', { name: i18n.t('history.task_history') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('projects.title') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('history.report_history') })).toBeInTheDocument();
  });

  it('lists projects read-only in the projects tab, with no create/edit/delete affordance', async () => {
    getTimeFlowProjects.mockResolvedValue({
      rows: [
        { id: 5, ref: 'PJ-0005', title: 'Projet Alpha', client: 'Client A', assigned_user_ids: [], entry_count: 3 },
      ],
      pagination: { page: 1, per_page: 20, total: 1, pages: 1 },
    });
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

  it('paginates the projects tab through the backend, preserving the active filters on each page request', async () => {
    getTimeFlowProjects.mockResolvedValue({
      rows: [
        { id: 5, ref: 'PJ-0005', title: 'Projet Alpha', client: 'Client A', assigned_user_ids: [], entry_count: 3 },
      ],
      pagination: { page: 1, per_page: 20, total: 25, pages: 2 },
    });
    const user = userEvent.setup();
    renderReportsPage();

    await user.click(await screen.findByRole('button', { name: i18n.t('projects.title') }));
    await screen.findByText('Projet Alpha');

    // Filter first — page must stay/reset to 1 for the filtered request.
    await user.type(screen.getByLabelText(i18n.t('projects.filters.search_label')), 'Alpha');
    await waitFor(() => expect(getTimeFlowProjects).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'Alpha' }),
      1,
      20,
    ));

    getTimeFlowProjects.mockResolvedValueOnce({
      rows: [
        { id: 6, ref: 'PJ-0006', title: 'Projet Beta', client: 'Client B', assigned_user_ids: [], entry_count: 1 },
      ],
      pagination: { page: 2, per_page: 20, total: 25, pages: 2 },
    });
    await user.click(screen.getByRole('button', { name: i18n.t('processed_history.pagination.next') }));

    // The page-2 request must still carry the same search filter — a filter
    // narrowing the result set must never get silently dropped by paging.
    await waitFor(() => expect(getTimeFlowProjects).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'Alpha' }),
      2,
      20,
    ));
    expect(await screen.findByText('Projet Beta')).toBeInTheDocument();
  });

  it('paginates the users tab through the backend', async () => {
    window.TIMEFLOW_CAN_READALL = true;
    getTimeFlowUsers.mockResolvedValue({
      rows: [
        { id: 1, label: 'Alice Martin', email: 'alice@example.com', office_phone: '', user_mobile: '', groups: [] },
      ],
      pagination: { page: 1, per_page: 20, total: 25, pages: 2 },
    });
    const user = userEvent.setup();
    renderReportsPage();

    await user.click(await screen.findByRole('button', { name: i18n.t('users_report.title') }));
    await screen.findByText('Alice Martin');
    expect(getTimeFlowUsers).toHaveBeenLastCalledWith(1, 20);

    getTimeFlowUsers.mockResolvedValueOnce({
      rows: [
        { id: 2, label: 'Bob Durand', email: 'bob@example.com', office_phone: '', user_mobile: '', groups: [] },
      ],
      pagination: { page: 2, per_page: 20, total: 25, pages: 2 },
    });
    await user.click(screen.getByRole('button', { name: i18n.t('processed_history.pagination.next') }));

    await waitFor(() => expect(getTimeFlowUsers).toHaveBeenLastCalledWith(2, 20));
    expect(await screen.findByText('Bob Durand')).toBeInTheDocument();
  });

  it('hides the Utilisateurs tab entirely for a non-manager (window.TIMEFLOW_CAN_READALL=false)', async () => {
    window.TIMEFLOW_CAN_READALL = false;
    renderReportsPage();

    await screen.findByRole('button', { name: i18n.t('history.task_history') });
    expect(screen.queryByRole('button', { name: i18n.t('users_report.title') })).not.toBeInTheDocument();
  });

  it('never fetches getTimeFlowUsers for a non-manager, even with ?tab=users forced in the URL', async () => {
    window.TIMEFLOW_CAN_READALL = false;
    render(<ReportsPage />, { wrapper: ({ children }) => <MemoryRouter initialEntries={['/?tab=users']}>{children}</MemoryRouter> });

    // The "tasks" tab's own content loads instead — proof the forced
    // ?tab=users never mounts UsersReportTab (which would otherwise call
    // getTimeFlowUsers, refused by the backend anyway, but never attempted).
    await screen.findByRole('button', { name: i18n.t('history.task_history') });
    expect(screen.queryByRole('button', { name: i18n.t('users_report.title') })).not.toBeInTheDocument();
    expect(getTimeFlowUsers).not.toHaveBeenCalled();
  });

  // Excluding submitted (status=1) reports from this tab used to be a
  // client-side re-filter on top of an unbounded fetch; that responsibility
  // now lives exclusively in timeflowFetchDailyReports()'s SQL WHERE clause
  // (history:true → status IN (2,9)), already verified directly against
  // real data with real SQL. This only needs to prove the component itself
  // renders exactly the page it's given, with no filtering of its own on
  // top — so the mock is shaped like what a correctly-filtering backend
  // actually returns (no submitted row at all).
  it('renders the page-scoped, backend-filtered report history with no extra client-side filtering', async () => {
    window.TIMEFLOW_CAN_READALL = true;
    getDailyReports.mockResolvedValueOnce({
      reports: [
        { id: 22, user_label: 'Alice', date_report: '2026-08-11', content: 'Rapport validé', status: 2, date_creation: '2026-08-11 08:00:00', date_last_content_edit: '2026-08-11 08:00:00' },
        { id: 23, user_label: 'Bob', date_report: '2026-08-10', content: 'Rapport refusé', status: 9, date_creation: '2026-08-10 08:00:00', date_last_content_edit: '2026-08-10 08:00:00' },
        { id: 24, user_label: 'Chloé', date_report: '2026-08-09', content: 'Rapport supprimé', status: 9, date_creation: '2026-08-09 08:00:00', date_last_content_edit: '2026-08-09 08:00:00', is_deleted: true, deleted_at: '2026-08-10 09:00:00' },
      ],
      employees: [],
      pagination: { page: 1, per_page: 20, total: 3, pages: 1 },
      stats: { validated_count: 1, refused_count: 2, manual_count: 0 },
    });

    renderReportsPage();
    await userEvent.click(await screen.findByRole('button', { name: i18n.t('history.report_history') }));

    // The list shows user + day + status badge per report (content itself is
    // only revealed via "Lire le rapport"): both day groups must appear
    // (each rendered twice: once as the day-group heading, once as the
    // report's own date).
    await waitFor(() => expect(screen.getAllByText('2026-08-11').length).toBeGreaterThan(0));
    expect(screen.getAllByText('2026-08-10').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2026-08-09').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Alice')).toHaveLength(1);
    expect(screen.queryByText('Supprimé par l’utilisateur')).not.toBeInTheDocument();
    expect(getDailyReports).toHaveBeenLastCalledWith(expect.objectContaining({ history: true, include_deleted: true }));
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
