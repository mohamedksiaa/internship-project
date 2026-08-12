import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TimeEntryList from './TimeEntryList';

vi.mock('../../api/clockifyApi', () => ({
  approveTimeEntry: vi.fn(), correctTimeEntry: vi.fn(), rejectTimeEntry: vi.fn(), submitEntry: vi.fn(), getModificationHistory: vi.fn().mockResolvedValue([]),
}));

const entry = { id: 42, fk_user: 5, user_label: 'med ahemd', note: 'Correction', date_start: '2026-08-12T13:04:00Z', date_end: '2026-08-12T14:04:00Z', duration: 3600, status: 1, manual_editable: true, manual_modified: true, manual_reason: 'raison exacte' };

describe('TimeEntryList validation mode', () => {
  it('never exposes Modifier but shows the manual-change badge in its own column for another employee', () => {
    render(<TimeEntryList entries={[entry]} showWorker showValidationActions setEntries={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Modifier cette entrée' })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Modification' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifié manuellement' })).toBeInTheDocument();
  });
});
