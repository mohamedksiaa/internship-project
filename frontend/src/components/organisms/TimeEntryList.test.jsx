import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TimeEntryList from './TimeEntryList';
import i18n from '../../i18n';
import { correctTimeEntry, deleteTimeEntry, submitEntry } from '../../api/timeflowApi';

vi.mock('../../api/timeflowApi', () => ({
  approveTimeEntry: vi.fn(), correctTimeEntry: vi.fn(), deleteTimeEntry: vi.fn(), rejectTimeEntry: vi.fn(), submitEntry: vi.fn(), getModificationHistory: vi.fn().mockResolvedValue([]),
}));

const entry = { id: 42, fk_user: 5, user_label: 'med ahemd', note: 'Correction', date_start: '2026-08-12T13:04:00Z', date_end: '2026-08-12T14:04:00Z', duration: 3600, status: 1, manual_editable: true, manual_modified: true, manual_reason: 'raison exacte' };

// Real payload captured from the real backend (timeflowFetchVisibleTimeEntries(),
// scope='validation', default current-month filters) for 3 real SUBMITTED
// rows in the dev DB (rowid 575/576/577 — the exact entries from the
// "Validation des tâches" bug report), not fabricated fixtures.
const realValidationEntries = [
  { id: 577, fk_user: 1, fk_project: 2, date_start: '2026-09-10T18:49:21Z', date_end: '2026-09-10T18:49:24Z', duration: 3, note: 'aaaaaaaaaaaaaaaaaaaaaaaaaaa', tags: '', billable: '0', status: 1, user_label: 'SuperAdmin', project_label: 'Projet Theta', manual_modified: false, manual_editable: false, delete_allowed: true, is_deleted: false },
  { id: 576, fk_user: 1, fk_project: 1, date_start: '2026-09-10T18:47:35Z', date_end: '2026-09-10T18:47:37Z', duration: 2, note: 'azerty', tags: '', billable: '0', status: 1, user_label: 'SuperAdmin', project_label: 'Projet Iota', manual_modified: false, manual_editable: false, delete_allowed: true, is_deleted: false },
  { id: 575, fk_user: 1, fk_project: 1, date_start: '2026-09-10T16:36:00Z', date_end: '2026-09-10T18:36:55Z', duration: 7255, note: 'azerty', tags: '', billable: '0', status: 1, user_label: 'SuperAdmin', project_label: 'Projet Iota', manual_modified: true, manual_reason: 'oublier', manual_editable: false, delete_allowed: true, is_deleted: false },
];

describe('TimeEntryList bulk-selection checkboxes vs Validation context (real data)', () => {
  it('renders zero bulk-selection checkboxes in the Validation context (showValidationActions), with the real 3-entry payload from the reported bug', () => {
    render(<TimeEntryList entries={realValidationEntries} showWorker showValidationActions setEntries={vi.fn()} />);

    // No checkbox anywhere: neither the per-row selection nor the
    // day-group "select all" checkbox, nor the bulk-delete button they'd
    // otherwise drive.
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Supprimer la sélection|selection/i })).not.toBeInTheDocument();

    // The Actions column (validate/reject) is still there, for all 3 real
    // submitted entries, with one fewer column competing for width now
    // that the checkbox column is gone.
    expect(screen.getAllByTitle(i18n.t('timeentry.title_validate'))).toHaveLength(3);
    expect(screen.getAllByTitle(i18n.t('timeentry.title_reject'))).toHaveLength(3);
    expect(screen.queryByRole('columnheader', { name: '' })).not.toBeInTheDocument();
  });

  it('still renders the bulk-selection checkboxes on "Suivi du temps" (no showValidationActions) with the same real entries', () => {
    render(<TimeEntryList entries={realValidationEntries} setEntries={vi.fn()} />);

    // One "select all" checkbox per day group, plus one per row: 3 entries
    // span 2 distinct dates (2026-09-10 twice via date grouping is the
    // same day for all three here) -> 1 group checkbox + 3 row checkboxes.
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThanOrEqual(3);
  });
});

describe('TimeEntryList validation mode', () => {
  beforeAll(async () => {
    try {
      // Ensure tests run with French translations to match expectations
      await i18n.changeLanguage('fr');
      window.localStorage.removeItem('timeflow_lang');
    } catch (e) {
      // ignore
    }
  });
  it('never exposes Modifier but shows the manual-change badge in its own column for another employee', () => {
    render(<TimeEntryList entries={[entry]} showWorker showValidationActions setEntries={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Modifier cette entrée' })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Modification' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifié manuellement' })).toBeInTheDocument();
  });

  it('renders only one who column when a worker is displayed', () => {
    render(<TimeEntryList entries={[entry]} showWorker setEntries={vi.fn()} />);
    expect(screen.getAllByRole('columnheader', { name: 'Qui' })).toHaveLength(1);
    expect(screen.getByText('med ahemd')).toBeInTheDocument();
  });

  it('does not expose deletion for a submitted entry without server permission', () => {
    render(<TimeEntryList entries={[{ ...entry, delete_allowed: false }]} setEntries={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Supprimer l’entrée' })).not.toBeInTheDocument();
  });

  it('hides the submit button for a draft whose timer is still running', () => {
    render(<TimeEntryList entries={[{ ...entry, status: 0, date_end: null }]} setEntries={vi.fn()} />);
    expect(screen.queryByTitle('Soumettre')).not.toBeInTheDocument();
  });

  it('shows the submit button for a draft whose timer has been stopped', () => {
    render(<TimeEntryList entries={[{ ...entry, status: 0, date_end: '2026-08-12T14:04:00Z' }]} setEntries={vi.fn()} />);
    expect(screen.getByTitle('Soumettre')).toBeInTheDocument();
  });

  it('requires confirmation before submitting a draft: clicking ⇪ opens a modal, "Annuler" leaves it a draft, "Soumettre" actually submits', async () => {
    submitEntry.mockReset().mockResolvedValue({ id: 42, status: 1 });
    const setEntries = vi.fn();
    const user = userEvent.setup();
    const draft = { ...entry, status: 0, date_end: '2026-08-12T14:04:00Z' };
    render(<TimeEntryList entries={[draft]} setEntries={setEntries} />);

    // The click on the row's ⇪ button must only open the confirmation modal —
    // never call submitEntry directly.
    await user.click(screen.getByTitle('Soumettre'));
    expect(submitEntry).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Soumettre cette entrée ?')).toBeInTheDocument();
    expect(screen.getByText('1 entrée sera soumise.')).toBeInTheDocument();
    expect(screen.getByText('Une fois soumise, cette entrée ne pourra plus être modifiée librement : seul un manager pourra la corriger.')).toBeInTheDocument();

    // "Annuler" closes the modal without ever calling submitEntry.
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(submitEntry).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Re-open and confirm this time — only now must submitEntry actually fire.
    await user.click(screen.getByTitle('Soumettre'));
    await user.click(screen.getByRole('button', { name: 'Soumettre' }));
    expect(submitEntry).toHaveBeenCalledWith(42);
    expect(setEntries).toHaveBeenCalled();
  });

  it('marks a midnight-split pair with the continuation link, distinct from the resume/segments badge', () => {
    const dayOne = { id: 100, fk_user: 5, note: 'Oubli chrono', date_start: '2026-08-11T20:00:00Z', date_end: '2026-08-12T00:00:00Z', duration: 4 * 3600, status: 0 };
    const dayTwo = { id: 101, fk_user: 5, note: 'Oubli chrono', date_start: '2026-08-12T00:00:00Z', date_end: '2026-08-12T05:00:00Z', duration: 5 * 3600, status: 0, fk_split_previous: 100 };
    render(<TimeEntryList entries={[dayOne, dayTwo]} setEntries={vi.fn()} />);

    expect(screen.getByTitle('Suite demain : chrono resté actif après minuit, scindé automatiquement')).toBeInTheDocument();
    expect(screen.getByTitle('Suite d’hier : chrono resté actif après minuit, scindé automatiquement')).toBeInTheDocument();
    // Never rendered as a "×N segments" resume badge: that one shows a
    // "×count · duration" label, which must not appear here.
    expect(screen.queryByTitle('Nombre de segments et durée totale pour cette tâche')).not.toBeInTheDocument();
    expect(screen.queryByText(/×2/)).not.toBeInTheDocument();
  });

  it('shows a custom confirmation modal for draft entries and deletes only after explicit confirmation', async () => {
    deleteTimeEntry.mockResolvedValue({ id: 42 });
    const setEntries = vi.fn();
    const user = userEvent.setup();
    render(<TimeEntryList entries={[{ ...entry, delete_allowed: true, delete_requires_strong_confirmation: false }]} setEntries={setEntries} />);

    await user.click(screen.getByRole('button', { name: 'Supprimer l’entrée' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Supprimer définitivement cette entrée de temps ? Cette action est irréversible.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(deleteTimeEntry).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Supprimer l’entrée' }));
    await user.click(screen.getByRole('button', { name: 'Confirmer' }));

    expect(deleteTimeEntry).toHaveBeenCalledWith(42);
    expect(setEntries).toHaveBeenCalled();
  });

  it('shows the strong warning for validated entries before deletion is confirmed', async () => {
    deleteTimeEntry.mockResolvedValue({ id: 42 });
    const user = userEvent.setup();
    render(<TimeEntryList entries={[{ ...entry, status: 2, delete_allowed: true, delete_requires_strong_confirmation: true }]} setEntries={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Supprimer l’entrée' }));

    expect(screen.getByText('Cette entrée a été soumise, validée ou refusée. Confirmer sa suppression définitive ?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(deleteTimeEntry).toHaveBeenCalledWith(42);
  });

  it('keeps the validated entry displayed and shows the server rejection when deletion is refused', async () => {
    deleteTimeEntry.mockRejectedValue(new Error('Suppression refusée : une entrée soumise, validée ou refusée est immuable pour un utilisateur normal'));
    const setEntries = vi.fn();
    const user = userEvent.setup();
    render(<TimeEntryList entries={[{ ...entry, status: 2, delete_allowed: true, delete_requires_strong_confirmation: true }]} setEntries={setEntries} />);

    await user.click(screen.getByRole('button', { name: 'Supprimer l’entrée' }));
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

  it('toggles billable on a single click, reusing correctTimeEntry with a fixed audit reason', async () => {
    correctTimeEntry.mockResolvedValue({ ...entry, billable: 1 });
    const setEntries = vi.fn();
    const user = userEvent.setup();
    render(<TimeEntryList entries={[{ ...entry, billable: 0 }]} setEntries={setEntries} />);

    // Not billable yet: shown as a dash, but still the clickable toggle
    // (manual_editable is true and this is not the validation view).
    const toggle = screen.getByTitle(i18n.t('timeentry.title_toggle_billable'));
    expect(toggle).toHaveTextContent('—');

    await user.click(toggle);

    expect(correctTimeEntry).toHaveBeenCalledWith(42, {
      billable: 1,
      reason: 'Statut facturable corrigé',
    });
    expect(setEntries).toHaveBeenCalled();
  });

  it('toggles billable back off from the badge', async () => {
    correctTimeEntry.mockResolvedValue({ ...entry, billable: 0 });
    const user = userEvent.setup();
    render(<TimeEntryList entries={[{ ...entry, billable: 1 }]} setEntries={vi.fn()} />);

    await user.click(screen.getByTitle(i18n.t('timeentry.title_toggle_billable')));

    expect(correctTimeEntry).toHaveBeenCalledWith(42, {
      billable: 0,
      reason: 'Statut facturable corrigé',
    });
  });

  it('shows the billable badge/dash as read-only (no toggle) in the validation view', () => {
    render(<TimeEntryList entries={[{ ...entry, billable: 1 }]} showWorker showValidationActions setEntries={vi.fn()} />);
    expect(screen.queryByTitle(i18n.t('timeentry.title_toggle_billable'))).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifié manuellement' }).closest('tr')).toHaveTextContent(i18n.t('timeentry.billable_badge'));
  });

  it('shows the billable badge/dash as read-only once an entry is no longer manually editable', () => {
    render(<TimeEntryList entries={[{ ...entry, billable: 0, manual_editable: false }]} setEntries={vi.fn()} />);
    expect(screen.queryByTitle(i18n.t('timeentry.title_toggle_billable'))).not.toBeInTheDocument();
  });
});
