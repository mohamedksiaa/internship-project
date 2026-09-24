import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import ConfirmRemoveAbsenceDialog from './ConfirmRemoveAbsenceDialog';

const absence = { name: 'Chloé Petit', date: '2026-09-19', reasonType: 'rtt' };

function renderDialog(props = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const utils = render(<ConfirmRemoveAbsenceDialog absence={absence} onConfirm={onConfirm} onCancel={onCancel} {...props} />);
  return { onConfirm, onCancel, ...utils };
}

describe('ConfirmRemoveAbsenceDialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });
  afterEach(() => cleanup());

  it('renders nothing when there is no absence to remove', () => {
    renderDialog({ absence: null });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('is a modal alert dialog with a title and a message naming who, which day and why', () => {
    renderDialog();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Retirer l’absence prévue ?');
    expect(dialog).toHaveAccessibleDescription('L’absence prévue de Chloé Petit le 2026-09-19 (RTT) sera supprimée.');
  });

  it('puts the focus on Cancel (the safe choice), and confirming is a distinct red button', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Retirer' }).className).toContain('tw-bg-[#d64c4c]');
  });

  it('Retirer confirms, Annuler / × / Escape cancel — each exactly once, and never the other', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Retirer' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(3);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('while busy: everything is disabled, the label says so, and Escape does nothing', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog({ busy: true });
    expect(screen.getByRole('button', { name: 'Suppression…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows a server error as an alert and stays open', () => {
    const { onCancel } = renderDialog({ error: 'Accès refusé' });
    expect(screen.getByRole('alert')).toHaveTextContent('Accès refusé');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('shows no alert without an error', () => {
    renderDialog();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('an unknown reason falls back to "Autre" instead of printing a raw code or nothing', () => {
    renderDialog({ absence: { ...absence, reasonType: 'made-up' } });
    expect(screen.getByRole('alertdialog')).toHaveTextContent('(Autre)');
  });

  it.each([
    ['en', 'Remove the expected absence?', 'The expected absence of Chloé Petit on 2026-09-19 (RTT) will be deleted.', 'Remove'],
    ['de', 'Geplante Abwesenheit entfernen?', 'Die geplante Abwesenheit von Chloé Petit am 2026-09-19 (RTT) wird gelöscht.', 'Entfernen'],
    ['ar', 'إزالة الغياب المخطط له؟', 'سيتم حذف الغياب المخطط له لـ Chloé Petit بتاريخ 2026-09-19 (RTT).', 'إزالة'],
  ])('is translated (%s)', async (lang, title, message, confirmLabel) => {
    await i18n.changeLanguage(lang);
    renderDialog();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAccessibleName(title);
    expect(dialog).toHaveAccessibleDescription(message);
    expect(screen.getByRole('button', { name: confirmLabel })).toBeInTheDocument();
  });
});
