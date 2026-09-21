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
    ['rtt', 'RTT'],
    ['sick', 'Maladie'],
    ['other', 'Autre'],
    ['something-unknown', 'Autre'],
  ])('reason "%s" -> "%s"', (reason, label) => {
    render(<PresenceBadge status="expected_absence" reasonType={reason} />);
    expect(screen.getByText(`Absence prévue · ${label}`)).toBeInTheDocument();
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
