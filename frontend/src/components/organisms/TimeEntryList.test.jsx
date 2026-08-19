import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TimeEntryList from './TimeEntryList';
import { correctTimeEntry, deleteTimeEntry } from '../../api/timeflowApi';

vi.mock('../../api/timeflowApi', () => ({
  approveTimeEntry: vi.fn(), correctTimeEntry: vi.fn(), deleteTimeEntry: vi.fn(), rejectTimeEntry: vi.fn(), submitEntry: vi.fn(), getModificationHistory: vi.fn().mockResolvedValue([]),
}));

const entry = { id: 42, fk_user: 5, user_label: 'med ahemd', note: 'Correction', date_start: '2026-08-12T13:04:00Z', date_end: '2026-08-12T14:04:00Z', duration: 3600, status: 1, manual_editable: true, manual_modified: true, manual_reason: 'raison exacte' };

describe('TimeEntryList validation mode', () => {
  it('never exposes Modifier but shows the manual-change badge in its own column for another employee', () => {
    render(<TimeEntryList entries={[entry]} showWorker showValidationActions setEntries={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Modifier cette entrée' })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Modification' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifié manuellement' })).toBeInTheDocument();
  });

  it('does not expose deletion for a submitted entry without server permission', () => {
    render(<TimeEntryList entries={[{ ...entry, delete_allowed: false }]} setEntries={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Supprimer cette entrée' })).not.toBeInTheDocument();
  });

  it('shows a custom confirmation modal for draft entries and deletes only after explicit confirmation', async () => {
    deleteTimeEntry.mockResolvedValue({ id: 42 });
    const setEntries = vi.fn();
    const user = userEvent.setup();
    render(<TimeEntryList entries={[{ ...entry, delete_allowed: true, delete_requires_strong_confirmation: false }]} setEntries={setEntries} />);

    await user.click(screen.getByRole('button', { name: 'Supprimer cette entrée' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Supprimer définitivement cette entrée de temps ? Cette action est irréversible.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(deleteTimeEntry).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Supprimer cette entrée' }));
    await user.click(screen.getByRole('button', { name: 'Confirmer' }));

    expect(deleteTimeEntry).toHaveBeenCalledWith(42);
    expect(setEntries).toHaveBeenCalled();
  });

  it('shows the strong warning for validated entries before deletion is confirmed', async () => {
    deleteTimeEntry.mockResolvedValue({ id: 42 });
    const user = userEvent.setup();
    render(<TimeEntryList entries={[{ ...entry, status: 2, delete_allowed: true, delete_requires_strong_confirmation: true }]} setEntries={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Supprimer cette entrée' }));

    expect(screen.getByText('Cette entrée a été soumise, validée ou refusée. Confirmer sa suppression définitive ?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(deleteTimeEntry).toHaveBeenCalledWith(42);
  });

  it('keeps the validated entry displayed and shows the server rejection when deletion is refused', async () => {
    deleteTimeEntry.mockRejectedValue(new Error('Suppression refusée : une entrée soumise, validée ou refusée est immuable pour un utilisateur normal'));
    const setEntries = vi.fn();
    const user = userEvent.setup();
    render(<TimeEntryList entries={[{ ...entry, status: 2, delete_allowed: true, delete_requires_strong_confirmation: true }]} setEntries={setEntries} />);

    await user.click(screen.getByRole('button', { name: 'Supprimer cette entrée' }));
    await user.click(screen.getByRole('button', { name: 'Confirmer' }));

    expect(await screen.findByText(/Suppression refusée.*immuable/)).toBeInTheDocument();
    expect(setEntries).not.toHaveBeenCalled();
  });

  it('sends only the changed start as an ISO instant', async () => {
    correctTimeEntry.mockResolvedValue({ ...entry, date_start: '2026-08-12T08:33:00Z' });
    const user = userEvent.setup();
    render(<TimeEntryList entries={[{ ...entry, date_start: '2026-08-12T09:33:00Z', date_end: '2026-08-12T09:33:36Z' }]} setEntries={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Modifier cette entrée' }));
    await user.clear(screen.getByLabelText('Début'));
    await user.type(screen.getByLabelText('Début'), '2026-08-12T08:33');
    await user.type(screen.getByLabelText(/Raison/), 'correction début');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(correctTimeEntry).toHaveBeenCalledWith(42, {
      date_start: '2026-08-12T07:33:00.000Z',
      reason: 'correction début',
    });
  });
});
