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

// The submit event must be dispatched on the <form> itself: on the surrounding
// role="dialog" <div> it never reaches the form's onSubmit and a test of "it
// does not submit" would pass whatever the code does.
const submitForm = () => fireEvent.submit(screen.getByRole('dialog').querySelector('form'));

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
    // date + reason only: no free text until "Autre" is chosen
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('offers exactly Congé / Maladie / Autre (no RTT any more), "Congé" preselected for a new absence', () => {
    renderDialog();
    const select = screen.getByLabelText('Motif');
    expect(Array.from(select.options).map((o) => [o.value, o.textContent])).toEqual([
      ['leave', 'Congé'],
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
    await user.selectOptions(screen.getByLabelText('Motif'), 'sick');
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-25' } });
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ date: '2026-09-25', reasonType: 'sick', reasonNote: '' });
  });

  it('cannot be saved without a date', () => {
    const { onSave } = renderDialog();
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    submitForm();
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
    submitForm();
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

  describe('"Autre" asks for a mandatory free-text reason', () => {
    const noteField = () => screen.getByLabelText('Précisez la raison');
    const saveButton = () => screen.getByRole('button', { name: 'Enregistrer' });

    it('the text field only exists while "Autre" is selected', async () => {
      const user = userEvent.setup();
      renderDialog();
      expect(screen.queryByLabelText('Précisez la raison')).toBeNull();
      await user.selectOptions(screen.getByLabelText('Motif'), 'other');
      expect(noteField()).toBeInTheDocument();
      await user.selectOptions(screen.getByLabelText('Motif'), 'sick');
      expect(screen.queryByLabelText('Précisez la raison')).toBeNull();
      await user.selectOptions(screen.getByLabelText('Motif'), 'leave');
      expect(screen.queryByLabelText('Précisez la raison')).toBeNull();
    });

    it('it is a required single-line field limited to 255 characters', async () => {
      const user = userEvent.setup();
      renderDialog();
      await user.selectOptions(screen.getByLabelText('Motif'), 'other');
      expect(noteField()).toBeRequired();
      expect(noteField()).toHaveAttribute('maxlength', '255');
      expect(noteField().tagName).toBe('INPUT');
    });

    it('Save is disabled while it is empty, and a hint says why', async () => {
      const user = userEvent.setup();
      const { onSave } = renderDialog();
      await user.selectOptions(screen.getByLabelText('Motif'), 'other');
      expect(saveButton()).toBeDisabled();
      expect(screen.getByText(/obligatoire pour le motif/)).toBeInTheDocument();
      expect(noteField()).toHaveAccessibleDescription(/obligatoire pour le motif/);
      submitForm();
      expect(onSave).not.toHaveBeenCalled();
    });

    it('spaces only do not count as a reason', async () => {
      const user = userEvent.setup();
      const { onSave } = renderDialog();
      await user.selectOptions(screen.getByLabelText('Motif'), 'other');
      await user.type(noteField(), '     ');
      expect(saveButton()).toBeDisabled();
      submitForm();
      expect(onSave).not.toHaveBeenCalled();
    });

    it('typing a reason enables Save and sends it trimmed with reasonType "other"', async () => {
      const user = userEvent.setup();
      const { onSave } = renderDialog();
      await user.selectOptions(screen.getByLabelText('Motif'), 'other');
      await user.type(noteField(), '  rachat pool client  ');
      expect(saveButton()).toBeEnabled();
      expect(screen.queryByText(/obligatoire pour le motif/)).toBeNull();
      await user.click(saveButton());
      expect(onSave).toHaveBeenCalledWith({ date: '2026-09-19', reasonType: 'other', reasonNote: 'rachat pool client' });
    });

    it('clearing the text again disables Save again', async () => {
      const user = userEvent.setup();
      renderDialog();
      await user.selectOptions(screen.getByLabelText('Motif'), 'other');
      await user.type(noteField(), 'x');
      expect(saveButton()).toBeEnabled();
      await user.clear(noteField());
      expect(saveButton()).toBeDisabled();
    });

    it('a text typed then abandoned by switching to another reason is NOT sent', async () => {
      const user = userEvent.setup();
      const { onSave } = renderDialog();
      await user.selectOptions(screen.getByLabelText('Motif'), 'other');
      await user.type(noteField(), 'à ne pas envoyer');
      await user.selectOptions(screen.getByLabelText('Motif'), 'sick');
      expect(saveButton()).toBeEnabled();
      await user.click(saveButton());
      expect(onSave).toHaveBeenCalledWith({ date: '2026-09-19', reasonType: 'sick', reasonNote: '' });
    });

    it('for "leave" and "sick" no text is needed', async () => {
      const user = userEvent.setup();
      renderDialog();
      for (const reason of ['leave', 'sick']) {
        await user.selectOptions(screen.getByLabelText('Motif'), reason);
        expect(saveButton()).toBeEnabled();
      }
    });

    it('editing an existing "Autre" absence opens with its text already filled in', () => {
      renderDialog({ initialReason: 'other', initialNote: 'rachat pool client' });
      expect(screen.getByLabelText('Motif')).toHaveValue('other');
      expect(noteField()).toHaveValue('rachat pool client');
      expect(saveButton()).toBeEnabled();
    });

    it('an old "Autre" absence with no text opens with Save disabled until the reason is given', () => {
      renderDialog({ initialReason: 'other', initialNote: null });
      expect(noteField()).toHaveValue('');
      expect(saveButton()).toBeDisabled();
    });

    it('a retired reason ("rtt") is not offered: the picker falls back to Congé', () => {
      renderDialog({ initialReason: 'rtt' });
      expect(screen.getByLabelText('Motif')).toHaveValue('leave');
      expect(screen.queryByLabelText('Précisez la raison')).toBeNull();
    });

    it('the label, hint and field are translated', async () => {
      await i18n.changeLanguage('en');
      const user = userEvent.setup();
      renderDialog();
      await user.selectOptions(screen.getByLabelText('Reason'), 'other');
      expect(screen.getByLabelText('Specify the reason')).toBeRequired();
      expect(screen.getByText(/required for the/)).toBeInTheDocument();
    });
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
