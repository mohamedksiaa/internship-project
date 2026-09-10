import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import ImportPreviewModal from './ImportPreviewModal';

const t = (key, params) => i18n.t(key, params);

vi.mock('../../api/timeflowApi', () => ({
  listActiveUsers: vi.fn().mockResolvedValue([]),
  getProjects: vi.fn().mockResolvedValue([]),
  listUserGroups: vi.fn().mockResolvedValue([]),
  listActiveThirdParties: vi.fn().mockResolvedValue([]),
  resolveClockifyMapping: vi.fn(),
  executeClockifyImport: vi.fn(),
}));

// Simulates the real reported case: many groups and clients detected, all
// already matched (no pending decisions needed) — just a long result to
// scroll through, same shape as a real getTimeFlowImportPreview response.
function longImportData() {
  const groups = Array.from({ length: 15 }, (_, i) => ({
    source_value: `Groupe ${i + 1}`,
    target_action: 'matched',
    target_id: i + 1,
  }));
  const clients = Array.from({ length: 15 }, (_, i) => ({
    source_value: `Client ${i + 1}`,
    target_action: 'matched',
    target_id: i + 1,
  }));
  return {
    total_rows: 500,
    blocked_rows: 0,
    skipped_rows: 0,
    users: [],
    projects: [],
    groups,
    clients,
  };
}

describe('ImportPreviewModal', () => {
  it('pressing Escape closes the modal', () => {
    const onClose = vi.fn();
    render(<ImportPreviewModal open loading={false} error="" data={longImportData()} file={new File(['x'], 'x.csv')} onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not react to other keys', () => {
    const onClose = vi.fn();
    render(<ImportPreviewModal open loading={false} error="" data={longImportData()} file={new File(['x'], 'x.csv')} onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Enter' });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('both close controls (× and "Fermer") stay outside the scrollable content area, even with a long result (many groups/clients) — the exact reported bug', async () => {
    const onClose = vi.fn();
    const { container } = render(
      <ImportPreviewModal open loading={false} error="" data={longImportData()} file={new File(['x'], 'x.csv')} onClose={onClose} />
    );

    // Sanity check the long content actually rendered — otherwise this test
    // would trivially pass without ever exercising the scroll scenario.
    expect(await screen.findByText('Groupe 15')).toBeInTheDocument();
    expect(screen.getByText('Client 15')).toBeInTheDocument();

    const scrollArea = container.querySelector('.tw-overflow-y-auto');
    expect(scrollArea).toBeTruthy();
    // The long lists are inside it (that's what needs to scroll)...
    expect(scrollArea.textContent).toContain('Groupe 15');
    expect(scrollArea.textContent).toContain('Client 15');

    // The actual fix: the panel itself is a height-capped flex column
    // (jsdom has no real layout engine, so this checks the classes that
    // produce that behavior are really on the rendered panel, not that a
    // browser would actually cap it at 90% of the viewport — only a real
    // browser check, which this test can't do, proves that part).
    const panel = scrollArea.closest('.tw-max-h-\\[90vh\\]');
    expect(panel).toBeTruthy();
    expect(panel.className).toContain('tw-flex-col');

    // ...but neither way to close the modal (the × icon in the header and
    // the "Fermer" button in the footer both share this accessible name)
    // is a descendant of it, so no amount of scrolling that area can ever
    // hide them.
    const closeButtons = screen.getAllByRole('button', { name: t('processed_history.import.close') });
    expect(closeButtons).toHaveLength(2);
    closeButtons.forEach((button) => expect(scrollArea.contains(button)).toBe(false));

    fireEvent.click(closeButtons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
