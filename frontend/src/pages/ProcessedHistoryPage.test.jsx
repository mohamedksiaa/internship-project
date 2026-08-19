import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ProcessedHistoryPage from './ProcessedHistoryPage';

const getProjects = vi.fn().mockResolvedValue([]);
const getProcessedHistory = vi.fn().mockResolvedValue({
  rows: [{ id: 1, note: 'Entrée validée', project_label: 'Projet test', user_label: 'Soumeya', date_start: '2026-08-12T08:00:00Z', date_end: '2026-08-12T09:00:00Z', status: 2, duration: 3600, processed_by_label: 'SuperAdmin', processed_at: '2026-08-12T10:00:00Z' }],
  pagination: { page: 1, pages: 1 }, stats: { validated_seconds: 3600, refused_count: 0, manual_count: 0 },
});

vi.mock('../api/timeflowApi', () => ({
  getProjects,
  getProcessedHistory,
  exportProcessedHistory: vi.fn().mockResolvedValue([]),
  hardDeleteTimeEntry: vi.fn().mockResolvedValue({ id: 1 }),
  hardDeleteTimeEntries: vi.fn().mockResolvedValue({ deleted: 1 }),
}));

describe('ProcessedHistoryPage', () => {
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
});
