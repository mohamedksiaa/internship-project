import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import EditHistoryModal from './EditHistoryModal';
import { getModificationHistory } from '../../api/timeflowApi';

const t = (key, params) => i18n.t(key, params);

const defaultRows = [
  { rowid: 7, fk_user: 5, user_label: 'Emma Lambert', field_name: 'date_start', old_value: '2026-08-12T08:33:00Z', new_value: '2026-08-12T07:33:00Z', reason: 'aaaaaaaa', date_creation: '2026-08-12 15:25:00' },
  { rowid: 8, fk_user: 5, user_label: 'Emma Lambert', field_name: 'date_end', old_value: '2026-08-12T08:33:00Z', new_value: '2026-08-12T08:33:00Z', reason: 'aaaaaaaa', date_creation: '2026-08-12 15:25:00' },
];

vi.mock('../../api/timeflowApi', () => ({
  getModificationHistory: vi.fn().mockResolvedValue([
    { rowid: 7, fk_user: 5, user_label: 'Emma Lambert', field_name: 'date_start', old_value: '2026-08-12T08:33:00Z', new_value: '2026-08-12T07:33:00Z', reason: 'aaaaaaaa', date_creation: '2026-08-12 15:25:00' },
    { rowid: 8, fk_user: 5, user_label: 'Emma Lambert', field_name: 'date_end', old_value: '2026-08-12T08:33:00Z', new_value: '2026-08-12T08:33:00Z', reason: 'aaaaaaaa', date_creation: '2026-08-12 15:25:00' },
  ]),
}));

describe('EditHistoryModal', () => {
  it('shows only the changed field without a timezone shift', async () => {
    getModificationHistory.mockResolvedValue(defaultRows);
    render(<EditHistoryModal entry={{ id: 42 }} onClose={vi.fn()} />);
    expect(await screen.findByText(t('history.start'))).toBeInTheDocument();
    expect(screen.queryByText(t('history.end'))).not.toBeInTheDocument();
    expect(screen.getByText(/09:33/)).toBeInTheDocument();
    expect(screen.getByText(/08:33/)).toBeInTheDocument();
    expect(screen.getByText(/aaaaaaaa/)).toBeInTheDocument();
    expect(screen.getByText('2026-08-12 15:25')).toBeInTheDocument();
  });
});

// A-08: submitEntry()/validateEntry() now write their own audit rows (field_name
// always 'status', values the raw TimeEntry::STATUS_* ints) via the same
// llx_timeflow_timeentry_modification table and getModificationHistory()
// endpoint every other correction already used — shaped exactly as the real
// ajax/timeentry.php handler returns them, not fabricated fields.
const submitRow = { rowid: 1, fk_timeentry: 42, fk_user: 5, action: 'submit', field_name: 'status', old_value: '0', new_value: '1', reason: 'submit', date_creation: '2026-10-13 10:00:00', user_label: 'Alice' };
const validateRow = { rowid: 2, fk_timeentry: 42, fk_user: 7, action: 'validate', field_name: 'status', old_value: '1', new_value: '2', reason: 'validate', date_creation: '2026-10-13 11:00:00', user_label: 'Bob (manager)' };
const rejectRow = { rowid: 3, fk_timeentry: 42, fk_user: 7, action: 'reject', field_name: 'status', old_value: '1', new_value: '9', reason: 'Projet annulé par le client', date_creation: '2026-10-13 12:00:00', user_label: 'Bob (manager)' };

describe('EditHistoryModal — A-08 submit/validate/reject rows', () => {
  it('shows the translated action label and status values for a submission, with no reason line (the stored reason is a technical sentinel, not user text)', async () => {
    getModificationHistory.mockResolvedValue([submitRow]);
    render(<EditHistoryModal entry={{ id: 42 }} onClose={vi.fn()} />);

    // Action label text matches the resulting status's own label by design
    // (e.g. "Submitted" names both) — selector: 'p' targets only the action
    // label line, not the identical-looking new_value span.
    expect(await screen.findByText(t('history.action_submit'), { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText(t('history.status_field'))).toBeInTheDocument();
    expect(screen.getByText(t('history.status_draft'))).toBeInTheDocument();
    expect(screen.queryByText(t('history.reason'))).not.toBeInTheDocument();
  });

  it('shows the translated action label and status values for a manager validation, with no reason line', async () => {
    getModificationHistory.mockResolvedValue([validateRow]);
    render(<EditHistoryModal entry={{ id: 42 }} onClose={vi.fn()} />);

    expect(await screen.findByText(t('history.action_validate'), { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText(t('history.status_submitted'))).toBeInTheDocument();
    expect(screen.queryByText(t('history.reason'))).not.toBeInTheDocument();
  });

  it('shows the translated action label, status values, and the manager-typed motif for a rejection', async () => {
    getModificationHistory.mockResolvedValue([rejectRow]);
    render(<EditHistoryModal entry={{ id: 42 }} onClose={vi.fn()} />);

    expect(await screen.findByText(t('history.action_reject'), { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText(t('history.status_submitted'))).toBeInTheDocument(); // old value
    expect(screen.getByText(t('history.reason'))).toBeInTheDocument();
    expect(screen.getByText('Projet annulé par le client')).toBeInTheDocument();
  });

  it('still falls back to the raw field name for an action this modal does not special-case (no regression)', async () => {
    getModificationHistory.mockResolvedValue([
      { rowid: 4, fk_timeentry: 42, fk_user: 5, action: 'manual_employee', field_name: 'note', old_value: 'avant', new_value: 'après', reason: 'Correction du texte', date_creation: '2026-10-13 09:00:00', user_label: 'Alice' },
    ]);
    render(<EditHistoryModal entry={{ id: 42 }} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('note')).toBeInTheDocument());
    expect(screen.getByText(t('history.reason'))).toBeInTheDocument();
    expect(screen.getByText('Correction du texte')).toBeInTheDocument();
  });
});
