import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProcessedHistoryPage from './ProcessedHistoryPage';

vi.mock('../api/clockifyApi', () => ({
  getProjects: vi.fn().mockResolvedValue([]),
  getProcessedHistory: vi.fn().mockResolvedValue({
    rows: [{ id: 1, note: 'Entrée validée', project_label: 'Projet test', user_label: 'Soumeya', date_start: '2026-08-12T08:00:00Z', date_end: '2026-08-12T09:00:00Z', status: 2, duration: 3600, processed_by_label: 'SuperAdmin', processed_at: '2026-08-12T10:00:00Z' }],
    pagination: { page: 1, pages: 1 }, stats: { validated_seconds: 3600, refused_count: 0, manual_count: 0 },
  }),
}));

describe('ProcessedHistoryPage', () => {
  it('mounts the processed-entry history without validation actions', async () => {
    render(<ProcessedHistoryPage />);
    expect(await screen.findByText('Entrée validée')).toBeInTheDocument();
    expect(screen.getByText(/SuperAdmin/)).toBeInTheDocument();
    expect(screen.queryByTitle('Valider')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Refuser')).not.toBeInTheDocument();
  });
});
