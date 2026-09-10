import { describe, expect, it } from 'vitest';
import { buildChartAnalysisText, buildDashboardCsvRows } from './dashboardExport.js';

describe('buildDashboardCsvRows', () => {
  const t = (key, vars) => {
    const dict = {
      'dashboard.export.csv_period_from': 'Période du',
      'dashboard.export.csv_period_to': 'Période au',
      'dashboard.total': 'Total',
      'dashboard.of_which_billable': 'Dont facturable',
      'dashboard.export.csv_category': 'Catégorie',
      'dashboard.export.csv_duration': 'Durée',
      'dashboard.export.csv_crossed_with_header': `Ventilation par ${vars?.dimension}`,
    };
    return dict[key] ?? key;
  };
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

  it('uses the real dimension name as the first column header instead of the generic "Category" fallback', () => {
    const rows = buildDashboardCsvRows({
      t,
      dateRange: { from: '2026-09-01', to: '2026-09-30' },
      totalSeconds: 36000,
      billableSeconds: 18000,
      formatDuration,
      chartData: [{ key: '1', label: 'Alice', value: 10800 }],
      dimensionLabel: 'Employé',
    });
    expect(rows[5]).toEqual(['Employé', 'Durée']);
  });

  it('falls back to the generic "Category" label when no dimensionLabel is given (back-compat)', () => {
    const rows = buildDashboardCsvRows({
      t,
      dateRange: { from: '2026-09-01', to: '2026-09-30' },
      totalSeconds: 0,
      billableSeconds: 0,
      formatDuration,
      chartData: [],
    });
    expect(rows[5][0]).toBe('Catégorie');
  });

  it('when a crossing is active, names both the row dimension (header) and the column dimension (a line above it) — the exact reported readability issue', () => {
    const rows = buildDashboardCsvRows({
      t,
      dateRange: { from: '2026-09-01', to: '2026-09-30' },
      totalSeconds: 36000,
      billableSeconds: 18000,
      formatDuration,
      chartData: [],
      dimensionLabel: 'Employé',
      crossWithLabel: 'Projet',
      crossedData: {
        segments: [
          { dataKey: 'p5', label: 'TB-UNITED' },
          { dataKey: 'p6', label: 'project-example' },
        ],
        rows: [
          { label: 'Alice', p5: 7200, p6: 3600 },
        ],
      },
    });

    // Blank separator (index 4) is followed by the crossing-dimension line,
    // *then* the header row naming the primary dimension — in that order,
    // so opening the CSV alone still reads top to bottom without the chart.
    expect(rows[5]).toEqual(['Ventilation par Projet']);
    expect(rows[6]).toEqual(['Employé', 'TB-UNITED', 'project-example']);
    expect(rows[7]).toEqual(['Alice', '2h', '1h']);
  });
});

describe('buildChartAnalysisText', () => {
  const t = (key, vars) => {
    switch (key) {
      case 'dashboard.export.analysis_no_data':
        return 'Aucune activité enregistrée sur cette période.';
      case 'dashboard.export.analysis_dominant':
        return `${vars.label} représente ${vars.pct}% du temps total sur cette période, avec ${vars.duration}.`;
      case 'dashboard.export.analysis_runner_up':
        return `Suivi de ${vars.label} avec ${vars.duration}.`;
      case 'dashboard.export.analysis_crossed_breakdown':
        return `La majorité provient de ${vars.label} (${vars.cross}), avec ${vars.duration}.`;
      default:
        return key;
    }
  };
  // "8h18"-style formatting, same shape as the app's real formatDuration.
  const formatDuration = (seconds) => `${Math.floor(seconds / 3600)}h${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}`;

  it('reports the dominant category with its exact share and duration, then the runner-up — the exact reported scenario (Dimension=Projet, no crossing)', () => {
    // TB-UNITED dominant at 8h18, project-example runner-up, total 9h11.
    const text = buildChartAnalysisText({
      t,
      chartData: [
        { key: '1', label: 'TB-UNITED', value: 29880 }, // 8h18
        { key: '2', label: 'project-example', value: 3180 }, // 0h53
      ],
      crossedData: null,
      totalSeconds: 33060, // 9h11
      formatDuration,
    });

    expect(text).toBe(
      'TB-UNITED représente 90% du temps total sur cette période, avec 8h18. Suivi de project-example avec 0h53.'
    );
  });

  it('omits the runner-up sentence when only one category has data', () => {
    const text = buildChartAnalysisText({
      t,
      chartData: [{ key: '1', label: 'TB-UNITED', value: 29880 }],
      crossedData: null,
      totalSeconds: 29880,
      formatDuration,
    });

    expect(text).toBe('TB-UNITED représente 100% du temps total sur cette période, avec 8h18.');
  });

  it('reports "no activity" instead of an absurd percentage when the total is 0', () => {
    expect(buildChartAnalysisText({
      t,
      chartData: [],
      crossedData: null,
      totalSeconds: 0,
      formatDuration,
    })).toBe('Aucune activité enregistrée sur cette période.');
  });

  it('when a crossing is active, names the dominant row AND its main crossing breakdown, not just a duplicate of the CSV header', () => {
    const text = buildChartAnalysisText({
      t,
      chartData: [],
      crossedData: {
        segments: [
          { dataKey: 'p5', label: 'TB-UNITED' },
          { dataKey: 'p6', label: 'project-example' },
        ],
        rows: [
          { label: 'Alice', p5: 25200, p6: 3600 }, // 7h + 1h = 8h total
          { label: 'Bob', p5: 3600, p6: 0 }, // 1h total
        ],
      },
      totalSeconds: 32400, // 9h
      formatDuration,
      crossWithLabel: 'Projet',
    });

    expect(text).toBe(
      'Alice représente 89% du temps total sur cette période, avec 8h00. La majorité provient de TB-UNITED (Projet), avec 7h00.'
    );
  });
});
