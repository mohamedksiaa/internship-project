import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EditHistoryModal from './EditHistoryModal';

vi.mock('../../api/clockifyApi', () => ({
  getModificationHistory: vi.fn().mockResolvedValue([
    { rowid: 7, fk_user: 5, user_label: 'soumeya chouaieb', field_name: 'date_end', old_value: '2026-08-12 14:24:00', new_value: '2026-08-12 15:03:00', reason: 'aaaaaaaa', date_creation: '2026-08-12 15:25:00' },
  ]),
}));

describe('EditHistoryModal', () => {
  it('keeps the exact local wall-clock values stored in the correction log', async () => {
    render(<EditHistoryModal entry={{ id: 42 }} onClose={vi.fn()} />);
    expect(await screen.findByText('Fin')).toBeInTheDocument();
    expect(screen.getByText(/14:24/)).toBeInTheDocument();
    expect(screen.getByText(/15:03/)).toBeInTheDocument();
    expect(screen.getByText(/aaaaaaaa/)).toBeInTheDocument();
    expect(screen.getByText('2026-08-12 15:25')).toBeInTheDocument();
  });
});
