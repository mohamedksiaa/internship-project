import { describe, expect, it } from 'vitest';
import { buildStackedChartData, pairFieldFor } from './CustomChartWidget.jsx';

// Real getSummaryReports payload captured from the live dev instance (10
// projects, 8 employees, 3 clients — enough to exercise both the primary
// MAX_SLICES=9 threshold and the secondary MAX_STACK_SEGMENTS=5 threshold).
const summary = {
  total_seconds: 3733882,
  billable_seconds: 3090583,
  non_billable_seconds: 643299,
  by_project: { 6: 78, 5: 91, 8: 0, 11: 7290, 12: 4, 13: 3083195, 14: 625324, 15: 13676, 16: 2040, 17: 2184 },
  project_labels: { 6: 'NOUVEAU PROJET', 5: 'AAAAA', 8: 'test - 02', 11: 'backend', 12: 'hahahahha', 13: 'TB-UNITED', 14: 'IDARA', 15: 'LEARN', 16: 'TRAINING', 17: 'INFRA' },
  by_client: { 1: 7463, 2: 3083195, 3: 643224 },
  client_labels: { 1: 'Client Test', 2: 'imbus AG', 3: 'imbus TN' },
  by_user: { 1: 7463, 9: 567547, 8: 533675, 11: 629890, 13: 468198, 14: 434172, 10: 625324, 15: 467613 },
  user_labels: { 1: 'SuperAdmin', 9: 'samir chouaieb', 8: 'mohamed chouaieb', 11: 'bacem', 13: 'wissal', 14: 'wafa', 10: 'soyah', 15: 'imen' },
  by_project_employee: {
    '6|1': 78, '5|1': 91, '8|1': 0, '11|1': 7290, '12|1': 4,
    '13|9': 561299, '13|8': 531491, '13|11': 622502, '13|13': 466118, '13|14': 434172,
    '14|10': 625324, '13|15': 467613, '15|11': 5348, '15|9': 6248, '16|11': 2040, '15|13': 2080, '17|8': 2184,
  },
  by_project_client: {
    '6|1': 78, '5|1': 91, '8|1': 0, '11|1': 7290, '12|1': 4,
    '13|2': 3083195, '14|3': 625324, '15|3': 13676, '16|3': 2040, '17|3': 2184,
  },
  by_project_billable: {
    '6|0': 78, '5|0': 91, '8|0': 0, '11|0': 7290, '12|0': 4,
    '13|1': 3083195, '14|0': 625324, '15|1': 5348, '15|0': 8328, '16|1': 2040, '17|0': 2184,
  },
  by_employee_client: {
    '1|1': 7463, '9|2': 561299, '8|2': 531491, '11|2': 622502, '13|2': 466118, '14|2': 434172,
    '10|3': 625324, '15|2': 467613, '11|3': 7388, '9|3': 6248, '13|3': 2080, '8|3': 2184,
  },
  by_employee_billable: {
    '1|0': 7463, '9|1': 561299, '8|1': 531491, '11|1': 629890, '13|1': 466118, '14|1': 434172,
    '10|0': 625324, '15|1': 467613, '9|0': 6248, '13|0': 2080, '8|0': 2184,
  },
  by_client_billable: { '1|0': 7463, '2|1': 3083195, '3|0': 635836, '3|1': 7388 },
};

// Minimal i18n stub: returns a readable marker instead of a real translation,
// good enough to assert routing/shape without depending on locale files.
const t = (key) => `[${key}]`;

function sumAllSegments(rows) {
  return rows.reduce((total, row) => {
    const rowTotal = Object.entries(row).filter(([k]) => k.startsWith('seg_')).reduce((s, [, v]) => s + v, 0);
    return total + rowTotal;
  }, 0);
}

describe('pairFieldFor', () => {
  it('resolves the composite field using the fixed backend priority order, regardless of argument order', () => {
    expect(pairFieldFor('project', 'employee')).toEqual({ field: 'by_project_employee', order: ['project', 'employee'] });
    expect(pairFieldFor('employee', 'project')).toEqual({ field: 'by_project_employee', order: ['project', 'employee'] });
    expect(pairFieldFor('billable', 'client')).toEqual({ field: 'by_client_billable', order: ['client', 'billable'] });
  });
});

describe('buildStackedChartData — dimension x billable (simplest combo, fixed cardinality)', () => {
  it('never buckets billable into "Autre" (only 2 possible values)', () => {
    const { segments } = buildStackedChartData({ summary, dimension: 'project', crossWith: 'billable', t });
    expect(segments.map((s) => s.dataKey).sort()).toEqual(['seg_0', 'seg_1']);
    expect(segments.some((s) => s.label === '[dashboard.other_bucket]')).toBe(false);
  });

  it('drops a project with zero duration on this pairing instead of showing an empty bar', () => {
    const { rows } = buildStackedChartData({ summary, dimension: 'project', crossWith: 'billable', t });
    // Project 8 ("test - 02") only ever appears as "8|0": 0 in the fixture —
    // zero contribution on every pairing, so it must not produce a bar at
    // all (same behavior as the existing single-dimension chart, which
    // already filters out row.value === 0 entries).
    expect(rows.some((r) => r.label === 'test - 02')).toBe(false);
    // 9 of the fixture's 10 projects have a nonzero total here, at exactly
    // MAX_SLICES=9 — under the ">" threshold, so no "Autre" bucket forms.
    expect(rows).toHaveLength(9);
    expect(rows.some((r) => r.label === '[dashboard.other_bucket]')).toBe(false);
  });

  it('every stacked bar sums back to the exact by_project total for that project (no double counting, no data loss)', () => {
    const { rows } = buildStackedChartData({ summary, dimension: 'project', crossWith: 'billable', t });
    const biggest = rows.find((r) => r.label === 'TB-UNITED');
    expect(biggest.seg_1 + biggest.seg_0).toBe(summary.by_project['13']);
  });

  it('flips correctly when billable is the PRIMARY axis and project is the stack (symmetric direction)', () => {
    const { rows, segments } = buildStackedChartData({ summary, dimension: 'billable', crossWith: 'project', t });
    // primary = billable => exactly 2 bars (no "Autre" bucket possible/needed here)
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.key).sort()).toEqual(['0', '1']);
    // secondary = project, 10 distinct values > MAX_STACK_SEGMENTS(5) => top 4 + "Autre" = 5 segments
    expect(segments).toHaveLength(5);
    expect(segments[segments.length - 1].label).toBe('[dashboard.other_bucket]');
  });

  it('conserves the grand total across every row and segment either direction', () => {
    const a = buildStackedChartData({ summary, dimension: 'project', crossWith: 'billable', t });
    const b = buildStackedChartData({ summary, dimension: 'billable', crossWith: 'project', t });
    expect(sumAllSegments(a.rows)).toBe(summary.billable_seconds + summary.non_billable_seconds);
    expect(sumAllSegments(b.rows)).toBe(summary.billable_seconds + summary.non_billable_seconds);
  });
});

describe('buildStackedChartData — project x employee (both thresholds active at once)', () => {
  it('thresholds both axes independently: 9 primary bars (8 top + Autre), 5 stack segments (4 top + Autre)', () => {
    const { rows, segments } = buildStackedChartData({ summary, dimension: 'project', crossWith: 'employee', t });
    expect(rows).toHaveLength(9);
    expect(segments).toHaveLength(5);
    expect(segments[segments.length - 1].label).toBe('[dashboard.other_bucket]');
  });

  it('a same employee keeps the same segment slot across every bar (global, not per-bar, top-K)', () => {
    const { rows, segments } = buildStackedChartData({ summary, dimension: 'project', crossWith: 'employee', t });
    // "bacem" (employee 11) is the single biggest contributor overall
    // (629890s across 3 projects: TB-UNITED, LEARN, TRAINING), so he's
    // guaranteed a spot in the global top-4 segments — every bar he
    // contributes to must expose the exact same seg_<key>, so a single
    // shared color/legend entry maps to him everywhere instead of one
    // "Autre" bucket per bar.
    const bacemSegment = segments.find((s) => s.label === 'bacem');
    expect(bacemSegment).toBeTruthy();
    const tbUnited = rows.find((r) => r.label === 'TB-UNITED');
    const learn = rows.find((r) => r.label === 'LEARN');
    const training = rows.find((r) => r.label === 'TRAINING');
    expect(tbUnited[bacemSegment.dataKey]).toBe(622502);
    expect(learn[bacemSegment.dataKey]).toBe(5348);
    expect(training[bacemSegment.dataKey]).toBe(2040);
  });

  it('conserves the grand total', () => {
    const { rows } = buildStackedChartData({ summary, dimension: 'project', crossWith: 'employee', t });
    expect(sumAllSegments(rows)).toBe(summary.total_seconds);
  });
});

describe('buildStackedChartData — client x employee (neither axis is a numeric id shortcut)', () => {
  it('conserves the grand total and produces no segment named after "group"', () => {
    const { rows, segments } = buildStackedChartData({ summary, dimension: 'client', crossWith: 'employee', t });
    expect(sumAllSegments(rows)).toBe(summary.total_seconds);
    expect(segments.every((s) => !s.label.toLowerCase().includes('group'))).toBe(true);
  });
});
