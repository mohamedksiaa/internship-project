import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import CustomChartWidget from './CustomChartWidget';

// "Groupe" was removed from the Dashboard's "Dimension" picker (a duration
// can land in more than one group at once, so it never belonged in this
// single-series chart to begin with — see the stacking exclusion note in the
// file). These tests guard the two ways removing an <option> from the list
// can silently misbehave: the option must actually be gone, and a stale
// ?dimension=group left over from a bookmarked/shared URL must self-heal
// instead of leaving the <select> pointing at a value with no matching
// <option>.
const summary = {
  total_seconds: 3600,
  billable_seconds: 3600,
  non_billable_seconds: 0,
  by_project: { 1: 3600 },
  project_labels: { 1: 'Alpha' },
  by_client: {},
  client_labels: {},
  by_user: {},
  user_labels: {},
  by_group: { 5: 3600 },
  group_labels: { 5: 'HRM' },
};

function renderAt(initialPath) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <CustomChartWidget summary={summary} />
    </MemoryRouter>
  );
}

describe('CustomChartWidget — Dimension picker after removing "Groupe"', () => {
  afterEach(() => cleanup());

  it('no longer offers "Groupe" as a dimension option', () => {
    renderAt('/dashboard');
    const select = screen.getByLabelText('Dimension');
    const optionValues = Array.from(select.options).map((option) => option.value);
    expect(optionValues).not.toContain('group');
    expect(optionValues).toEqual(['project', 'employee', 'client', 'billable']);
  });

  it('self-heals a stale ?dimension=group URL back to "project" instead of leaving the select pointing at a removed option', () => {
    renderAt('/dashboard?dimension=group');
    const select = screen.getByLabelText('Dimension');
    expect(select.value).toBe('project');
  });
});
