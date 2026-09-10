import { describe, expect, it } from 'vitest';
import {
  buildDashboardCsvRows,
  buildTrendData,
  chooseTrendGranularity,
  detectRedundantFixedViews,
  periodLengthInDays,
} from './dashboardExport.js';

describe('periodLengthInDays', () => {
  it('counts both bounds inclusively', () => {
    expect(periodLengthInDays({ from: '2026-09-01', to: '2026-09-01' })).toBe(1);
    expect(periodLengthInDays({ from: '2026-09-01', to: '2026-09-30' })).toBe(30);
  });
});

describe('chooseTrendGranularity', () => {
  it('picks daily aggregation for a period of 31 days or less', () => {
    expect(chooseTrendGranularity({ from: '2026-09-01', to: '2026-09-30' })).toBe('day'); // 30 days
    expect(chooseTrendGranularity({ from: '2026-09-01', to: '2026-10-01' })).toBe('day'); // exactly 31 days
  });

  it('picks weekly aggregation once the period exceeds 31 days', () => {
    expect(chooseTrendGranularity({ from: '2026-09-01', to: '2026-10-02' })).toBe('week'); // 32 days
    expect(chooseTrendGranularity({ from: '2026-01-01', to: '2026-12-31' })).toBe('week');
  });
});

describe('buildTrendData', () => {
  const entries = [
    { date_start: '2026-09-01T09:00:00Z', duration: 3600 },
    { date_start: '2026-09-01T14:00:00Z', duration: 1800 },
    { date_start: '2026-09-08T09:00:00Z', duration: 7200 },
    // Outside the requested range — must be excluded from every bucket.
    { date_start: '2026-10-15T09:00:00Z', duration: 9999 },
  ];
  const dateRange = { from: '2026-09-01', to: '2026-09-14' };

  it('aggregates by calendar day, one bucket per distinct day, summing durations', () => {
    const result = buildTrendData(entries, dateRange, 'fr-FR', 'day');
    expect(result).toHaveLength(2);
    expect(result[0].bucketStart).toBe('2026-09-01');
    expect(result[0].total).toBe(3600 + 1800);
    expect(result[1].bucketStart).toBe('2026-09-08');
    expect(result[1].total).toBe(7200);
  });

  it('aggregates by ISO (Monday-start) week when granularity is "week"', () => {
    const result = buildTrendData(entries, dateRange, 'fr-FR', 'week');
    // 2026-09-01 is a Tuesday -> week starts Monday 2026-08-31.
    // 2026-09-08 is also a Tuesday -> week starts Monday 2026-09-07.
    expect(result).toHaveLength(2);
    expect(result[0].bucketStart).toBe('2026-08-31');
    expect(result[0].total).toBe(3600 + 1800);
    expect(result[1].bucketStart).toBe('2026-09-07');
    expect(result[1].total).toBe(7200);
  });

  it('returns an empty array when nothing falls in range', () => {
    expect(buildTrendData(entries, { from: '2027-01-01', to: '2027-01-31' }, 'fr-FR', 'day')).toEqual([]);
  });
});

describe('detectRedundantFixedViews', () => {
  it('flags the project fixed view as redundant only for a plain, uncrossed project dimension', () => {
    expect(detectRedundantFixedViews({ dimension: 'project', crossWith: 'none' })).toEqual({ project: true, billable: false, trend: false });
    expect(detectRedundantFixedViews({ dimension: 'project', crossWith: 'billable' })).toEqual({ project: false, billable: false, trend: false });
  });

  it('flags the billable fixed view as redundant only for a plain, uncrossed billable dimension', () => {
    expect(detectRedundantFixedViews({ dimension: 'billable', crossWith: 'none' })).toEqual({ project: false, billable: true, trend: false });
  });

  it('never flags the trend view as redundant — no time dimension exists in the custom chart', () => {
    expect(detectRedundantFixedViews({ dimension: 'project', crossWith: 'none' }).trend).toBe(false);
    expect(detectRedundantFixedViews({ dimension: 'employee', crossWith: 'client' }).trend).toBe(false);
  });

  it('treats an empty/undefined crossWith the same as "none"', () => {
    expect(detectRedundantFixedViews({ dimension: 'project', crossWith: undefined }).project).toBe(true);
    expect(detectRedundantFixedViews({ dimension: 'project', crossWith: '' }).project).toBe(true);
  });
});

describe('buildDashboardCsvRows', () => {
  const t = (key) => ({
    'dashboard.export.csv_period_from': 'Période du',
    'dashboard.export.csv_period_to': 'Période au',
    'dashboard.total': 'Total',
    'dashboard.of_which_billable': 'Dont facturable',
    'dashboard.export.csv_category': 'Catégorie',
    'dashboard.export.csv_duration': 'Durée',
  })[key] ?? key;
  const formatDuration = (seconds) => `${Math.floor(seconds / 3600)}h`;

  it('puts the summary block first, then a blank separator, then the data table', () => {
    const rows = buildDashboardCsvRows({
      t,
      dateRange: { from: '2026-09-01', to: '2026-09-30' },
      totalSeconds: 36000,
      billableSeconds: 18000,
      formatDuration,
      chartData: [
        { key: '1', label: 'Projet Alpha', value: 10800 },
        { key: '2', label: 'Projet Beta', value: 7200 },
      ],
    });

    expect(rows).toEqual([
      ['Période du', '2026-09-01'],
      ['Période au', '2026-09-30'],
      ['Total', '10h'],
      ['Dont facturable', '5h'],
      ['', ''],
      ['Catégorie', 'Durée'],
      ['Projet Alpha', '3h'],
      ['Projet Beta', '2h'],
    ]);
  });

  it('still produces the summary block and header when there is no chart data', () => {
    const rows = buildDashboardCsvRows({
      t,
      dateRange: { from: '2026-09-01', to: '2026-09-30' },
      totalSeconds: 0,
      billableSeconds: 0,
      formatDuration,
      chartData: [],
    });
    expect(rows).toHaveLength(6);
    expect(rows[5]).toEqual(['Catégorie', 'Durée']);
  });
});
