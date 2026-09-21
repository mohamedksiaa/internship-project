import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import CustomChartWidget from './CustomChartWidget';
import { effectiveCrossWith, effectiveDimension, selectableDimensionsFor } from '../../utils/crossDimensions.js';

// The primary "Dimension" selector follows the same rule as "Croiser avec": a
// user WITHOUT the readall right is not offered "Employé" or "Client" (they
// only ever receive their own entries, server-side), users with readall keep
// all four. Also covers how the two selectors, both kept in the URL, behave
// together — including the cases where they point at the same value.
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

function Loc() {
  return <div data-testid="loc">{useLocation().search}</div>;
}

function renderAt(initialPath, props = {}) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <CustomChartWidget summary={summary} {...props} />
      <Loc />
    </MemoryRouter>
  );
}

const dimensionSelect = () => screen.getByLabelText(/^Dimension$/);
const crossSelect = () => screen.getByLabelText(/Cross with|Croiser avec/);
const values = (select) => Array.from(select.options).map((option) => option.value);
const url = () => screen.getByTestId('loc').textContent;

describe('CustomChartWidget — primary "Dimension" depends on the readall right', () => {
  afterEach(() => {
    cleanup();
    delete window.TIMEFLOW_CAN_READALL;
  });

  it('without readall: only "Projet" and "Facturable"', () => {
    renderAt('/dashboard', { canReadAll: false });
    expect(values(dimensionSelect())).toEqual(['project', 'billable']);
  });

  it('with readall: all four choices', () => {
    renderAt('/dashboard', { canReadAll: true });
    expect(values(dimensionSelect())).toEqual(['project', 'employee', 'client', 'billable']);
  });

  it('reads window.TIMEFLOW_CAN_READALL when no prop is given, and fails closed without it', () => {
    renderAt('/dashboard');
    expect(values(dimensionSelect())).toEqual(['project', 'billable']);
    cleanup();
    window.TIMEFLOW_CAN_READALL = true;
    renderAt('/dashboard');
    expect(values(dimensionSelect())).toEqual(['project', 'employee', 'client', 'billable']);
  });

  it.each(['employee', 'client'])('self-heals a forged ?dimension=%s to "project" without readall, and cleans the URL', (forged) => {
    renderAt(`/dashboard?dimension=${forged}`, { canReadAll: false });
    expect(dimensionSelect().value).toBe('project');
    expect(url()).toBe('');
  });

  it('keeps ?dimension=employee with readall', () => {
    renderAt('/dashboard?dimension=employee', { canReadAll: true });
    expect(dimensionSelect().value).toBe('employee');
    expect(url()).toBe('?dimension=employee');
  });

  it('keeps an allowed ?dimension=billable without readall', () => {
    renderAt('/dashboard?dimension=billable', { canReadAll: false });
    expect(dimensionSelect().value).toBe('billable');
  });
});

describe('CustomChartWidget — the two URL-backed selectors together', () => {
  afterEach(() => cleanup());

  it('without readall, forging BOTH to Employé fixes both, in the widget and in the URL (no correction lost)', () => {
    renderAt('/dashboard?dimension=employee&crossWith=employee', { canReadAll: false });
    expect(dimensionSelect().value).toBe('project');
    expect(crossSelect().value).toBe('none');
    expect(url()).toBe('');
  });

  it('without readall, forging both to Client fixes both too', () => {
    renderAt('/dashboard?dimension=client&crossWith=client', { canReadAll: false });
    expect(dimensionSelect().value).toBe('project');
    expect(crossSelect().value).toBe('none');
    expect(url()).toBe('');
  });

  it('without readall, a forged dimension does not make an allowed crossing invalid by accident', () => {
    // dimension=employee -> "project"; crossWith=billable is still allowed.
    renderAt('/dashboard?dimension=employee&crossWith=billable', { canReadAll: false });
    expect(dimensionSelect().value).toBe('project');
    expect(crossSelect().value).toBe('billable');
    expect(url()).toBe('?crossWith=billable');
  });

  it('with readall, ?dimension=employee&crossWith=employee no longer shows "Aucun" over an empty crossed chart', () => {
    renderAt('/dashboard?dimension=employee&crossWith=employee', { canReadAll: true });
    expect(dimensionSelect().value).toBe('employee');
    expect(crossSelect().value).toBe('none');
    expect(url()).toBe('?dimension=employee');
    expect(screen.queryByText(/No data for this period|Aucune donnée/)).toBeNull();
  });

  it('picking a Dimension equal to the current "Croiser avec" keeps the dimension and clears the crossing (used to lose the dimension)', () => {
    renderAt('/dashboard?crossWith=client', { canReadAll: true });
    fireEvent.change(dimensionSelect(), { target: { value: 'client' } });
    expect(dimensionSelect().value).toBe('client');
    expect(crossSelect().value).toBe('none');
    expect(url()).toBe('?dimension=client');
  });

  it('picking a Dimension different from the crossing leaves the crossing alone', () => {
    renderAt('/dashboard?crossWith=client', { canReadAll: true });
    fireEvent.change(dimensionSelect(), { target: { value: 'employee' } });
    expect(dimensionSelect().value).toBe('employee');
    expect(crossSelect().value).toBe('client');
    expect(Object.fromEntries(new URLSearchParams(url()))).toEqual({ dimension: 'employee', crossWith: 'client' });
  });
});

describe('selectableDimensionsFor / effectiveDimension / effectiveCrossWith (3-arg form)', () => {
  it('lists the dimensions per right', () => {
    expect(selectableDimensionsFor(false)).toEqual(['project', 'billable']);
    expect(selectableDimensionsFor(true)).toEqual(['project', 'employee', 'client', 'billable']);
  });

  it('resolves a dimension the user is not offered, or an unknown one, to "project"', () => {
    expect(effectiveDimension('employee', false)).toBe('project');
    expect(effectiveDimension('client', false)).toBe('project');
    expect(effectiveDimension('billable', false)).toBe('billable');
    expect(effectiveDimension('employee', true)).toBe('employee');
    expect(effectiveDimension('group', true)).toBe('project');
    expect(effectiveDimension('nonsense', false)).toBe('project');
  });

  it('resolves a crossing equal to the primary dimension to "none", for everyone', () => {
    expect(effectiveCrossWith('employee', true, 'employee')).toBe('none');
    expect(effectiveCrossWith('billable', false, 'billable')).toBe('none');
    expect(effectiveCrossWith('client', true, 'employee')).toBe('client');
    expect(effectiveCrossWith('client', false, 'project')).toBe('none');
  });
});
