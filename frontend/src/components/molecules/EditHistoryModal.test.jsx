import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EditHistoryModal from './EditHistoryModal';

vi.mock('../../api/clockifyApi', () => ({
  getModificationHistory: vi.fn().mockResolvedValue([
    { rowid: 7, fk_user: 5, user_label: 'soumeya chouaieb', field_name: 'date_start', old_value: '2026-08-12T08:33:00Z', new_value: '2026-08-12T07:33:00Z', reason: 'aaaaaaaa', date_creation: '2026-08-12 15:25:00' },
    { rowid: 8, fk_user: 5, user_label: 'soumeya chouaieb', field_name: 'date_end', old_value: '2026-08-12T08:33:00Z', new_value: '2026-08-12T08:33:00Z', reason: 'aaaaaaaa', date_creation: '2026-08-12 15:25:00' },
  ]),
}));

describe('EditHistoryModal', () => {
  it('shows only the changed field without a timezone shift', async () => {
    render(<EditHistoryModal entry={{ id: 42 }} onClose={vi.fn()} />);
    expect(await screen.findByText('Début')).toBeInTheDocument();
    expect(screen.queryByText('Fin')).not.toBeInTheDocument();
    expect(screen.getByText(/09:33/)).toBeInTheDocument();
    expect(screen.getByText(/08:33/)).toBeInTheDocument();
    expect(screen.getByText(/aaaaaaaa/)).toBeInTheDocument();
    expect(screen.getByText('2026-08-12 15:25')).toBeInTheDocument();
  });
});
