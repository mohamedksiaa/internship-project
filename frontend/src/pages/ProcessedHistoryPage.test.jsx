import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import ProcessedHistoryPage from './ProcessedHistoryPage';

const { getProjects, getProcessedHistory, exportProcessedHistory, hardDeleteTimeEntry, hardDeleteTimeEntries } = vi.hoisted(() => ({
  getProjects: vi.fn().mockResolvedValue([]),
  getProcessedHistory: vi.fn().mockResolvedValue({
    rows: [{ id: 1, note: 'Entrée validée', project_label: 'Projet test', user_label: 'Soumeya', date_start: '2026-08-12T08:00:00Z', date_end: '2026-08-12T09:00:00Z', status: 2, duration: 3600, processed_by_label: 'SuperAdmin', processed_at: '2026-08-12T10:00:00Z' }],
    pagination: { page: 1, pages: 1 },
    stats: { validated_seconds: 3600, refused_count: 0, manual_count: 0 },
  }),
  exportProcessedHistory: vi.fn().mockResolvedValue([]),
  hardDeleteTimeEntry: vi.fn().mockResolvedValue({ id: 1 }),
  hardDeleteTimeEntries: vi.fn().mockResolvedValue({ deleted: 1 }),
}));

vi.mock('../api/timeflowApi', () => ({
  getProjects,
  getProcessedHistory,
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
      stats: { validated_seconds: 3600, refused_count: 0, manual_count: 0 },
    });
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

  it('global checkbox selects all visible rows and shows correct count', async () => {
    window.TIMEFLOW_CAN_READALL = true;
    const user = userEvent.setup();
    getProcessedHistory.mockResolvedValueOnce({
      rows: [
        { id: 1, note: 'Entry 1', project_label: 'P', user_label: 'U', date_start: '2026-08-12T08:00:00Z', date_end: '2026-08-12T09:00:00Z', status: 2, duration: 3600, processed_by_label: 'A', processed_at: '2026-08-12T10:00:00Z' },
        { id: 2, note: 'Entry 2', project_label: 'P', user_label: 'U', date_start: '2026-08-12T08:00:00Z', date_end: '2026-08-12T09:00:00Z', status: 2, duration: 3600, processed_by_label: 'A', processed_at: '2026-08-12T10:00:00Z' },
      ],
      pagination: { page: 1, pages: 1 },
      stats: { validated_seconds: 7200, refused_count: 0, manual_count: 0 },
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
      stats: { validated_seconds: 7200, refused_count: 0, manual_count: 0 },
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
      stats: { validated_seconds: 7200, refused_count: 0, manual_count: 0 },
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
      stats: { validated_seconds: 7200, refused_count: 0, manual_count: 0 },
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
