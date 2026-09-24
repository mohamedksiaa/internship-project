import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import ExpectedAbsenceDialog from './ExpectedAbsenceDialog';

const employee = { id: 4, label: 'Nicole Kardashian' };

function renderDialog(props = {}) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <ExpectedAbsenceDialog user={employee} initialDate="2026-09-19" onSave={onSave} onClose={onClose} {...props} />,
  );
  return { onSave, onClose, ...utils };
}

describe('ExpectedAbsenceDialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });
  afterEach(() => cleanup());

  it('renders nothing without a user', () => {
    renderDialog({ user: null });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a modal dialog labelled by its title, showing the employee, the date and the reason picker — nothing more', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: 'Absence prévue' })).toBeInTheDocument();
    expect(dialog).toHaveAccessibleName('Absence prévue');
    expect(screen.getByText('Nicole Kardashian')).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toHaveValue('2026-09-19');
    expect(screen.getByLabelText('Motif')).toBeInTheDocument();
    // date + reason only: no free text
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('offers exactly Congé / RTT / Maladie / Autre, "Congé" preselected for a new absence', () => {
    renderDialog();
    const select = screen.getByLabelText('Motif');
    expect(Array.from(select.options).map((o) => [o.value, o.textContent])).toEqual([
      ['leave', 'Congé'],
      ['rtt', 'RTT'],
      ['sick', 'Maladie'],
      ['other', 'Autre'],
    ]);
    expect(select).toHaveValue('leave');
  });

  it('preselects the recorded reason when editing, and falls back to Congé for an unknown one', () => {
    const { unmount } = renderDialog({ initialReason: 'sick' });
    expect(screen.getByLabelText('Motif')).toHaveValue('sick');
    unmount();
    renderDialog({ initialReason: 'made-up' });
    expect(screen.getByLabelText('Motif')).toHaveValue('leave');
  });

  it('saves with the chosen date and reason', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();
    await user.selectOptions(screen.getByLabelText('Motif'), 'rtt');
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-25' } });
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ date: '2026-09-25', reasonType: 'rtt' });
  });

  it('cannot be saved without a date', () => {
    const { onSave } = renderDialog();
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('dialog'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('cancel, the × button and Escape all close it', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('while saving: buttons disabled, label says so, and it cannot be closed or double-submitted', async () => {
    const user = userEvent.setup();
    const { onSave, onClose } = renderDialog({ saving: true });
    expect(screen.getByRole('button', { name: 'Enregistrement…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
    await user.keyboard('{Escape}');
    fireEvent.submit(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows a server error as an alert and stays open', () => {
    const { onClose } = renderDialog({ error: 'Utilisateur désactivé' });
    expect(screen.getByRole('alert')).toHaveTextContent('Utilisateur désactivé');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('no alert when there is no error', () => {
    renderDialog();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('is translated: English and German', async () => {
    await i18n.changeLanguage('en');
    const { unmount } = renderDialog();
    expect(screen.getByRole('heading', { name: 'Expected absence' })).toBeInTheDocument();
    expect(screen.getByLabelText('Reason')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    unmount();
    await i18n.changeLanguage('de');
    renderDialog();
    expect(screen.getByRole('heading', { name: 'Geplante Abwesenheit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeInTheDocument();
  });
});
