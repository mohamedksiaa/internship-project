import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import PresenceBadge from './PresenceBadge';

const badge = (container) => container.querySelector('[data-presence-status]');

describe('PresenceBadge', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });
  afterEach(() => cleanup());

  it.each([
    ['present', 'Présent', 'tw-bg-emerald-50'],
    ['absent', 'Absent', 'tw-bg-rose-50'],
    ['expected_absence', 'Absence prévue', 'tw-bg-sky-50'],
  ])('%s -> text "%s" with its colour (green / red / blue)', (status, text, colour) => {
    const { container } = render(<PresenceBadge status={status} />);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(badge(container)).toHaveAttribute('data-presence-status', status);
    expect(badge(container).className).toContain(colour);
  });

  it('the meaning is in the text, not only in the colour (dark-mode variants exist too)', () => {
    const { container } = render(<PresenceBadge status="absent" />);
    expect(badge(container).textContent).toBe('Absent');
    expect(badge(container).className).toContain('dark:tw-bg-rose-900/40');
  });

  it('an expected absence shows its reason', () => {
    render(<PresenceBadge status="expected_absence" reasonType="sick" />);
    expect(screen.getByText('Absence prévue · Maladie')).toBeInTheDocument();
  });

  it.each([
    ['leave', 'Congé'],
    ['sick', 'Maladie'],
    ['other', 'Autre'],
    // "rtt" was retired: an old row that still carries it, or any unknown code, is shown generically
    ['rtt', 'Autre'],
    ['something-unknown', 'Autre'],
  ])('reason "%s" -> "%s"', (reason, label) => {
    render(<PresenceBadge status="expected_absence" reasonType={reason} />);
    expect(screen.getByText(`Absence prévue · ${label}`)).toBeInTheDocument();
  });

  describe('the free-text precision of "Autre"', () => {
    it('is shown in the badge: "Absence prévue · Autre : <texte>"', () => {
      render(<PresenceBadge status="expected_absence" reasonType="other" reasonNote="rachat pool client" />);
      expect(screen.getByText('Absence prévue · Autre : rachat pool client')).toBeInTheDocument();
    });

    it('is trimmed, and a blank one is the same as none', () => {
      const { unmount } = render(<PresenceBadge status="expected_absence" reasonType="other" reasonNote="   rachat pool   " />);
      expect(screen.getByText('Absence prévue · Autre : rachat pool')).toBeInTheDocument();
      unmount();
      render(<PresenceBadge status="expected_absence" reasonType="other" reasonNote="    " />);
      expect(screen.getByText('Absence prévue · Autre')).toBeInTheDocument();
    });

    it.each(['leave', 'sick'])('is ignored for "%s"', (reason) => {
      const { container } = render(<PresenceBadge status="expected_absence" reasonType={reason} reasonNote="ne doit pas apparaître" />);
      expect(container).not.toHaveTextContent('ne doit pas apparaître');
    });

    it('is only used for an expected absence (never leaks into another status)', () => {
      const { container } = render(<PresenceBadge status="absent" reasonType="other" reasonNote="secret" />);
      expect(container).toHaveTextContent('Absent');
      expect(container).not.toHaveTextContent('secret');
    });

    it('is rendered as plain text, never as HTML', () => {
      const { container } = render(<PresenceBadge status="expected_absence" reasonType="other" reasonNote={'<b>gras</b> <img src=x onerror=alert(1)>'} />);
      expect(container.querySelector('b')).toBeNull();
      expect(container.querySelector('img')).toBeNull();
      expect(container).toHaveTextContent('Autre : <b>gras</b> <img src=x onerror=alert(1)>');
    });

    it('a long text wraps inside the badge instead of stretching the table, and the full text is in the tooltip', () => {
      const long = 'x'.repeat(255);
      const { container } = render(<PresenceBadge status="expected_absence" reasonType="other" reasonNote={long} />);
      const el = container.querySelector('[data-presence-status]');
      expect(el.className).toContain('tw-break-words');
      expect(el.className).toContain('tw-max-w-');
      expect(el.className).not.toContain('tw-whitespace-nowrap');
      expect(el).toHaveAttribute('title', `Absence prévue · Autre : ${long}`);
    });

    it('follows the language', async () => {
      await i18n.changeLanguage('en');
      const { unmount } = render(<PresenceBadge status="expected_absence" reasonType="other" reasonNote="client buy-back" />);
      expect(screen.getByText('Expected absence · Other: client buy-back')).toBeInTheDocument();
      unmount();
      await i18n.changeLanguage('de');
      const second = render(<PresenceBadge status="expected_absence" reasonType="other" reasonNote="Kundenrückkauf" />);
      expect(second.container).toHaveTextContent('Geplante Abwesenheit · Sonstiges: Kundenrückkauf');
      second.unmount();
      await i18n.changeLanguage('ar');
      const third = render(<PresenceBadge status="expected_absence" reasonType="other" reasonNote="سبب" />);
      expect(third.container).toHaveTextContent('غياب مخطط له · أخرى: سبب');
    });
  });

  it('"none" (future day / disabled account) is a neutral dash that still carries its label for screen readers', () => {
    const { container } = render(<PresenceBadge status="none" />);
    expect(badge(container).textContent).toBe('—');
    expect(badge(container)).toHaveAttribute('aria-label', 'Non applicable');
    expect(badge(container)).toHaveAttribute('title', 'Non applicable');
    expect(badge(container).className).toContain('tw-bg-gray-100');
  });

  it.each([undefined, null, '', 'garbage', 'PRESENT'])('an unknown or missing status (%s) is shown as "not applicable", never as present/absent', (status) => {
    const { container } = render(<PresenceBadge status={status} />);
    expect(badge(container)).toHaveAttribute('data-presence-status', 'none');
    expect(screen.queryByText('Présent')).toBeNull();
    expect(screen.queryByText('Absent')).toBeNull();
  });

  it('follows the active language', async () => {
    await i18n.changeLanguage('en');
    const { unmount } = render(<PresenceBadge status="expected_absence" reasonType="leave" />);
    expect(screen.getByText('Expected absence · Leave')).toBeInTheDocument();
    unmount();
    await i18n.changeLanguage('de');
    render(<PresenceBadge status="present" />);
    expect(screen.getByText('Anwesend')).toBeInTheDocument();
  });
});
