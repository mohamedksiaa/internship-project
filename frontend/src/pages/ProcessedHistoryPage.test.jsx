import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import ProcessedHistoryPage from './ProcessedHistoryPage';

const { getProjects, getProcessedHistory, getDailyReports, getMyDailyReports, exportProcessedHistory, hardDeleteTimeEntry, hardDeleteTimeEntries } = vi.hoisted(() => ({
  getProjects: vi.fn().mockResolvedValue([]),
  getProcessedHistory: vi.fn().mockResolvedValue({
    rows: [{ id: 1, note: 'Entrée validée', project_label: 'Projet test', user_label: 'Soumeya', date_start: '2026-08-12T08:00:00Z', date_end: '2026-08-12T09:00:00Z', status: 2, duration: 3600, processed_by_label: 'SuperAdmin', processed_at: '2026-08-12T10:00:00Z' }],
    pagination: { page: 1, pages: 1 },
    stats: { validated_count: 1, refused_count: 0, manual_count: 0 },
  }),
  getDailyReports: vi.fn().mockResolvedValue({ reports: [], employees: [] }),
  getMyDailyReports: vi.fn().mockResolvedValue({ reports: [], employees: [] }),
  exportProcessedHistory: vi.fn().mockResolvedValue([]),
  hardDeleteTimeEntry: vi.fn().mockResolvedValue({ id: 1 }),
  hardDeleteTimeEntries: vi.fn().mockResolvedValue({ deleted: 1 }),
}));

vi.mock('../api/timeflowApi', () => ({
  getProjects,
  getProcessedHistory,
  getDailyReports,
  getMyDailyReports,
  exportProcessedHistory,
  hardDeleteTimeEntry,
  hardDeleteTimeEntries,
}));

describe('ProcessedHistoryPage', () => {
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
    hardDeleteTimeEntry.mockReset().mockResolvedValue({ id: 1 });
    hardDeleteTimeEntries.mockReset().mockResolvedValue({ deleted: 1 });
  });

  afterEach(() => {
    cleanup();
  });

  it('mounts the processed-entry history without validation actions', async () => {
    window.TIMEFLOW_CAN_READALL = false;
    render(<ProcessedHistoryPage />);
    expect(await screen.findByText('Entrée validée')).toBeInTheDocument();
    expect(screen.getByText(/SuperAdmin/)).toBeInTheDocument();
    expect(screen.queryByTitle('Valider')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Refuser')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Supprimer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Employé/i })).not.toBeInTheDocument();
  });

  it('shows manager-only hard-delete controls and bulk deletion', async () => {
    window.TIMEFLOW_CAN_READALL = true;
    const user = userEvent.setup();
    render(<ProcessedHistoryPage />);

    expect(await screen.findByText('Entrée validée')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Sélectionner cette entrée/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Supprimer cette entrée/i })).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Sélectionner cette entrée/i }));
    expect(screen.getByRole('button', { name: /Supprimer la sélection \(1\)/i })).toBeInTheDocument();
  });

  it('keeps submitted reports out of the final history list', async () => {
    window.TIMEFLOW_CAN_READALL = true;
    getDailyReports.mockResolvedValueOnce({
      reports: [
        { id: 21, user_label: 'Alice', date_report: '2026-08-12', content: 'Rapport soumis', status: 1, date_creation: '2026-08-12 08:00:00', date_last_content_edit: null },
        { id: 22, user_label: 'Alice', date_report: '2026-08-11', content: 'Rapport validé', status: 2, date_creation: '2026-08-11 08:00:00', date_last_content_edit: '2026-08-11 08:00:00' },
        { id: 23, user_label: 'Bob', date_report: '2026-08-10', content: 'Rapport refusé', status: 9, date_creation: '2026-08-10 08:00:00', date_last_content_edit: '2026-08-10 08:00:00' },
      ],
      employees: [],
    });

    render(<ProcessedHistoryPage />);
    await userEvent.click(screen.getByRole('button', { name: /Historique des rapports/i }));

    expect(await screen.findByText('Rapport validé')).toBeInTheDocument();
    expect(screen.getByText('Rapport refusé')).toBeInTheDocument();
    expect(screen.queryByText('Rapport soumis')).not.toBeInTheDocument();
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

    render(<ProcessedHistoryPage />);
    await userEvent.click(screen.getByRole('button', { name: /Historique des rapports/i }));

    expect(await screen.findByTitle('Temps corrigé et tracé')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    const modifiedLabels = screen.getAllByText('Modifiées');
    expect(modifiedLabels[modifiedLabels.length - 1].closest('div')).toHaveTextContent('1');
  });

  it('renders the orange modified badge in the report-history row for a modified-only report', async () => {
    window.TIMEFLOW_CAN_READALL = true;
    getDailyReports.mockResolvedValueOnce({
      reports: [
        {
          id: 77,
          user_label: 'SuperAdmin',
          date_report: '2026-08-17',
          content: 'Rapport modifié en validation',
          status: 2,
          date_creation: '2026-08-17 08:00:00',
          date_last_content_edit: '2026-08-17 09:45:00',
        },
      ],
      employees: [],
    });

    render(<ProcessedHistoryPage />);
    await userEvent.click(screen.getByRole('button', { name: /Historique des rapports/i }));

    expect(await screen.findByText('SuperAdmin')).toBeInTheDocument();
    const badge = await screen.findByRole('button', { name: /Modifié manuellement/i });
    expect(badge).toBeVisible();
    expect(badge).toHaveTextContent('Modifié manuellement');
    expect(badge).toHaveAttribute('title', 'Temps corrigé et tracé');
  });

  it('global checkbox selects all visible rows and shows correct count', async () => {
    window.TIMEFLOW_CAN_READALL = true;
    const user = userEvent.setup();
    getProcessedHistory.mockResolvedValueOnce({
      rows: [
        { id: 1, note: 'Entry 1', project_label: 'P', user_label: 'U', date_start: '2026-08-12T08:00:00Z', date_end: '2026-08-12T09:00:00Z', status: 2, duration: 3600, processed_by_label: 'A', processed_at: '2026-08-12T10:00:00Z' },
        { id: 2, note: 'Entry 2', project_label: 'P', user_label: 'U', date_start: '2026-08-12T08:00:00Z', date_end: '2026-08-12T09:00:00Z', status: 2, duration: 3600, processed_by_label: 'A', processed_at: '2026-08-12T10:00:00Z' },
      ],
      pagination: { page: 1, pages: 1 },
        stats: { validated_count: 2, refused_count: 0, manual_count: 0 },
    });

    render(<ProcessedHistoryPage />);

    expect(await screen.findByText('Entry 1')).toBeInTheDocument();
    const global = screen.getByRole('checkbox', { name: /Tout sélectionner sur la page/i });
    await user.click(global);

    const rowCheckboxes = screen.getAllByRole('checkbox', { name: /Sélectionner cette entrée/i });
    expect(rowCheckboxes).toHaveLength(2);
    rowCheckboxes.forEach((cb) => expect(cb).toBeChecked());
    expect(screen.getByRole('button', { name: /Supprimer la sélection \(2\)/i })).toBeInTheDocument();
  });

  it('unchecking one row sets group checkbox to indeterminate', async () => {
    window.TIMEFLOW_CAN_READALL = true;
    const user = userEvent.setup();
    getProcessedHistory.mockResolvedValueOnce({
      rows: [
        { id: 3, note: 'Entry A', project_label: 'P', user_label: 'U', date_start: '2026-08-12T08:00:00Z', date_end: '2026-08-12T09:00:00Z', status: 2, duration: 3600, processed_by_label: 'A', processed_at: '2026-08-12T10:00:00Z' },
        { id: 4, note: 'Entry B', project_label: 'P', user_label: 'U', date_start: '2026-08-12T08:00:00Z', date_end: '2026-08-12T09:00:00Z', status: 2, duration: 3600, processed_by_label: 'A', processed_at: '2026-08-12T10:00:00Z' },
      ],
      pagination: { page: 1, pages: 1 },
      stats: { validated_count: 2, refused_count: 0, manual_count: 0 },
    });

    render(<ProcessedHistoryPage />);
    expect(await screen.findByText('Entry A')).toBeInTheDocument();

    const global = screen.getByRole('checkbox', { name: /Tout sélectionner sur la page/i });
    await user.click(global);

    const rowCheckboxes = screen.getAllByRole('checkbox', { name: /Sélectionner cette entrée/i });
    // Uncheck the first row
    await user.click(rowCheckboxes[0]);

    // group checkbox uses date key 2026-08-12
    const group = screen.getByRole('checkbox', { name: /Sélectionner le groupe 2026-08-12/i });
    expect(group.indeterminate).toBe(true);
  });

  it('selection resets when results change (filter/page change)', async () => {
    window.TIMEFLOW_CAN_READALL = true;
    const user = userEvent.setup();
    // First response: two rows
    getProcessedHistory.mockResolvedValueOnce({
      rows: [
        { id: 5, note: 'E1', project_label: 'P', user_label: 'U', date_start: '2026-08-12T08:00:00Z', date_end: '2026-08-12T09:00:00Z', status: 2, duration: 3600, processed_by_label: 'A', processed_at: '2026-08-12T10:00:00Z' },
        { id: 6, note: 'E2', project_label: 'P', user_label: 'U', date_start: '2026-08-12T08:00:00Z', date_end: '2026-08-12T09:00:00Z', status: 2, duration: 3600, processed_by_label: 'A', processed_at: '2026-08-12T10:00:00Z' },
      ],
      pagination: { page: 1, pages: 1 },
      stats: { validated_count: 2, refused_count: 0, manual_count: 0 },
    });

    // Second response: empty results after filter change
    getProcessedHistory.mockResolvedValueOnce({ rows: [], pagination: { page: 1, pages: 1 }, stats: {} });

    render(<ProcessedHistoryPage />);
    expect(await screen.findByText('E1')).toBeInTheDocument();

    const global = screen.getByRole('checkbox', { name: /Tout sélectionner sur la page/i });
    await user.click(global);
    expect(screen.getByRole('button', { name: /Supprimer la sélection \(2\)/i })).toBeInTheDocument();

    // Change filter: select status -> validated
    await user.selectOptions(screen.getByLabelText('Statut'), 'validated');

    // After refresh, delete button should not be present
    expect(await screen.findByText('Aucune entrée traitée.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Supprimer la sélection/i })).not.toBeInTheDocument();
  });

  it('clicking delete triggers hardDeleteTimeEntries with selected ids', async () => {
    window.TIMEFLOW_CAN_READALL = true;
    const user = userEvent.setup();
    getProcessedHistory.mockResolvedValueOnce({
      rows: [
        { id: 7, note: 'X1', project_label: 'P', user_label: 'U', date_start: '2026-08-12T08:00:00Z', date_end: '2026-08-12T09:00:00Z', status: 2, duration: 3600, processed_by_label: 'A', processed_at: '2026-08-12T10:00:00Z' },
        { id: 8, note: 'X2', project_label: 'P', user_label: 'U', date_start: '2026-08-12T08:00:00Z', date_end: '2026-08-12T09:00:00Z', status: 2, duration: 3600, processed_by_label: 'A', processed_at: '2026-08-12T10:00:00Z' },
      ],
      pagination: { page: 1, pages: 1 },
      stats: { validated_count: 2, refused_count: 0, manual_count: 0 },
    });

    render(<ProcessedHistoryPage />);
    expect(await screen.findByText('X1')).toBeInTheDocument();

    const global = screen.getByRole('checkbox', { name: /Tout sélectionner sur la page/i });
    await user.click(global);

    const deleteBtn = screen.getByRole('button', { name: /Supprimer la sélection \(2\)/i });
    await user.click(deleteBtn);

    // Modal appears, click Confirmer
    const confirm = screen.getByRole('button', { name: /Confirmer/i });
    await user.click(confirm);

    // Expect bulk API called with [7,8]
    expect(hardDeleteTimeEntries).toHaveBeenCalledWith([7, 8]);
  });
});
