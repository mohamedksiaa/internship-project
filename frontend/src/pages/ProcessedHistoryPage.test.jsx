import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import ProcessedHistoryPage from './ProcessedHistoryPage';

const { getProjects, getProcessedHistory, getDailyReports, getMyDailyReports, exportProcessedHistory } = vi.hoisted(() => ({
  getProjects: vi.fn().mockResolvedValue([]),
  getProcessedHistory: vi.fn().mockResolvedValue({
    rows: [{ id: 1, note: 'Entrée validée', project_label: 'Projet test', user_label: 'Soumeya', date_start: '2026-08-12T08:00:00Z', date_end: '2026-08-12T09:00:00Z', status: 2, duration: 3600, processed_by_label: 'SuperAdmin', processed_at: '2026-08-12T10:00:00Z' }],
    pagination: { page: 1, pages: 1 },
    stats: { validated_count: 1, refused_count: 0, manual_count: 0 },
  }),
  getDailyReports: vi.fn().mockResolvedValue({ reports: [], employees: [] }),
  getMyDailyReports: vi.fn().mockResolvedValue({ reports: [], employees: [] }),
  exportProcessedHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock('../api/timeflowApi', () => ({
  getProjects,
  getProcessedHistory,
  getDailyReports,
  getMyDailyReports,
  exportProcessedHistory,
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

  // The "Suppression définitive" mechanism (hardDeleteTimeEntry(ies) /
  // hardDeleteDailyReport(s)) has been fully removed from the UI: the soft
  // delete via the 🗑 in Suivi du temps/Validations is now the only visible
  // deletion mechanism in the module. This guards against it reappearing,
  // even for a manager (canReadAll) who used to see selection checkboxes
  // and bulk/unit "Suppression définitive" buttons here.
  it('never shows a delete/selection control here, even for a manager', async () => {
    window.TIMEFLOW_CAN_READALL = true;
    render(<ProcessedHistoryPage />);

    expect(await screen.findByText('Entrée validée')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Supprimer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Sélectionner/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Tout sélectionner/i })).not.toBeInTheDocument();
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
});
