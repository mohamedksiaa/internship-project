import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import CustomChartWidget from './CustomChartWidget';
import { crossableDimensionsFor, effectiveCrossWith } from '../../utils/crossDimensions.js';

// "Croiser avec" for a user WITHOUT the readall right: they only ever receive
// their own entries (getSummaryReports is scoped to them server-side), so
// crossing by "Employé" or "Client" is dropped from the selector. Users with
// readall keep every option. Pure UI adaptation — the data restriction itself
// is enforced by the backend.
const summary = {
  total_seconds: 3600,
  billable_seconds: 3600,
  non_billable_seconds: 0,
  by_project: { 1: 3600 },
  project_labels: { 1: 'Alpha' },
  by_client: { 7: 3600 },
  client_labels: { 7: 'Acme' },
  by_user: { 4: 3600 },
  user_labels: { 4: 'knicole' },
  by_group: {},
  group_labels: {},
};

function renderAt(initialPath, props = {}) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <CustomChartWidget summary={summary} {...props} />
    </MemoryRouter>
  );
}

// The test env may run in English or French: match either label.
const CROSS_LABEL = /Cross with|Croiser avec/;
const crossValues = () => Array.from(screen.getByLabelText(CROSS_LABEL).options).map((option) => option.value);

describe('CustomChartWidget — "Croiser avec" depends on the readall right', () => {
  afterEach(() => {
    cleanup();
    delete window.TIMEFLOW_CAN_READALL;
  });

  it('without readall: only "Aucun" and "Facturable" (dimension = project)', () => {
    renderAt('/dashboard', { canReadAll: false });
    expect(crossValues()).toEqual(['none', 'billable']);
  });

  it('without readall and a different primary dimension: "Projet" and "Facturable" remain, never Employé/Client', () => {
    renderAt('/dashboard?dimension=employee', { canReadAll: false });
    expect(crossValues()).toEqual(['none', 'project', 'billable']);
  });

  it('with readall: all four choices are still available', () => {
    renderAt('/dashboard', { canReadAll: true });
    expect(crossValues()).toEqual(['none', 'employee', 'client', 'billable']);
  });

  it('reads the same window.TIMEFLOW_CAN_READALL flag as the other pages when no prop is given', () => {
    window.TIMEFLOW_CAN_READALL = true;
    renderAt('/dashboard');
    expect(crossValues()).toEqual(['none', 'employee', 'client', 'billable']);
    cleanup();
    window.TIMEFLOW_CAN_READALL = false;
    renderAt('/dashboard');
    expect(crossValues()).toEqual(['none', 'billable']);
  });

  it('defaults to the restricted list when the flag is absent (fails closed)', () => {
    renderAt('/dashboard');
    expect(crossValues()).toEqual(['none', 'billable']);
  });

  it('self-heals a forged ?crossWith=employee for a user without readall instead of leaving a crossed chart behind', () => {
    renderAt('/dashboard?crossWith=employee', { canReadAll: false });
    expect(screen.getByLabelText(CROSS_LABEL).value).toBe('none');
  });

  it('keeps ?crossWith=employee for a user with readall', () => {
    renderAt('/dashboard?crossWith=employee', { canReadAll: true });
    expect(screen.getByLabelText(CROSS_LABEL).value).toBe('employee');
  });

  it('keeps an allowed crossing (?crossWith=billable) for a user without readall', () => {
    renderAt('/dashboard?crossWith=billable', { canReadAll: false });
    expect(screen.getByLabelText(CROSS_LABEL).value).toBe('billable');
  });
});

describe('crossableDimensionsFor / effectiveCrossWith', () => {
  it('drops employee and client without readall, keeps everything with it', () => {
    expect(crossableDimensionsFor(false)).toEqual(['project', 'billable']);
    expect(crossableDimensionsFor(true)).toEqual(['project', 'employee', 'client', 'billable']);
  });

  it('resolves a crossing the user is not offered to "none"', () => {
    expect(effectiveCrossWith('employee', false)).toBe('none');
    expect(effectiveCrossWith('client', false)).toBe('none');
    expect(effectiveCrossWith('billable', false)).toBe('billable');
    expect(effectiveCrossWith('project', false)).toBe('project');
    expect(effectiveCrossWith('employee', true)).toBe('employee');
    expect(effectiveCrossWith('none', false)).toBe('none');
    expect(effectiveCrossWith('group', true)).toBe('none');
    expect(effectiveCrossWith('nonsense', true)).toBe('none');
  });
});
