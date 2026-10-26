import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import RejectReasonText from './RejectReasonText';

describe('RejectReasonText', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });
  afterEach(() => cleanup());

  it('renders nothing when there is no reason', () => {
    const { container } = render(<RejectReasonText reason={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('prefixes the reason with the translated "Motif : " label, so it reads as context rather than an error', () => {
    render(<RejectReasonText reason="Projet annulé par le client" />);
    expect(screen.getByText('Motif : Projet annulé par le client')).toBeInTheDocument();
  });

  it('carries the raw reason (no label) in the hover tooltip', () => {
    render(<RejectReasonText reason="Projet annulé par le client" />);
    expect(screen.getByTitle('Projet annulé par le client')).toBeInTheDocument();
  });

  it('starts truncated, and a click/tap reveals the full text (hover does not exist on touch)', async () => {
    const user = userEvent.setup();
    const long = 'Motif très long qui dépasse largement la largeur disponible dans la cellule du tableau et doit donc être tronqué par défaut';
    render(<RejectReasonText reason={long} />);

    const button = screen.getByRole('button', { name: 'Afficher le motif complet' });
    expect(button.className).toContain('tw-truncate');
    expect(button.className).not.toContain('tw-whitespace-normal');

    await user.click(button);
    const expandedButton = screen.getByRole('button', { name: 'Réduire le motif' });
    expect(expandedButton.className).toContain('tw-whitespace-normal');
    expect(expandedButton.className).toContain('tw-break-words');
    expect(expandedButton.className).not.toContain('tw-truncate');

    // Clicking again collapses it back.
    await user.click(expandedButton);
    expect(screen.getByRole('button', { name: 'Afficher le motif complet' }).className).toContain('tw-truncate');
  });

  it('follows the active language for the label and the expand/collapse aria-labels', async () => {
    await i18n.changeLanguage('en');
    const { unmount } = render(<RejectReasonText reason="Client cancelled the project" />);
    expect(screen.getByText('Reason: Client cancelled the project')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show the full reason' })).toBeInTheDocument();
    unmount();

    await i18n.changeLanguage('de');
    const second = render(<RejectReasonText reason="Kunde hat das Projekt abgesagt" />);
    expect(screen.getByText('Grund: Kunde hat das Projekt abgesagt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vollständigen Grund anzeigen' })).toBeInTheDocument();
    second.unmount();

    await i18n.changeLanguage('ar');
    render(<RejectReasonText reason="ألغى العميل المشروع" />);
    expect(screen.getByText('السبب: ألغى العميل المشروع')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إظهار السبب كاملاً' })).toBeInTheDocument();
  });
});
