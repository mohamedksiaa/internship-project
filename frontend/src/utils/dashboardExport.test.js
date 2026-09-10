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
      case 'dashboard.export.analysis_list_item':
        return `${vars.label} : ${vars.pct}% (${vars.duration})`;
      case 'dashboard.export.analysis_top_list_intro':
        return 'Autres catégories principales :';
      case 'dashboard.export.analysis_crossed_breakdown_intro':
        return `Répartition de ${vars.label} par ${vars.cross} :`;
      case 'dashboard.export.analysis_billable_share':
        return `${vars.pct}% du temps total est facturable.`;
      case 'dashboard.export.analysis_category_count':
        return `Répartition sur ${vars.count} catégories.`;
      case 'dashboard.export.analysis_other_bucket':
        return `Le reste, réparti sur plusieurs petites catégories, représente ${vars.pct}% du temps total sur cette période, avec ${vars.duration}.`;
      case 'dashboard.other_bucket':
        return 'Autres';
      default:
        return key;
    }
  };
  // "8h18"-style formatting, same shape as the app's real formatDuration.
  const formatDuration = (seconds) => `${Math.floor(seconds / 3600)}h${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}`;

  it('reports the dominant category with its exact share and duration, then up to two runners-up as a bulleted list', () => {
    // TB-UNITED dominant at 8h18, project-example 2nd, project-c 3rd, total 9h11.
    const text = buildChartAnalysisText({
      t,
      chartData: [
        { key: '1', label: 'TB-UNITED', value: 29880 }, // 8h18, 90%
        { key: '2', label: 'project-example', value: 2400 }, // 0h40, 7%
        { key: '3', label: 'project-c', value: 780 }, // 0h13, 2%
      ],
      crossedData: null,
      totalSeconds: 33060, // 9h11
      formatDuration,
    });

    expect(text).toBe(
      'TB-UNITED représente 90% du temps total sur cette période, avec 8h18.\n\n' +
      'Autres catégories principales :\n' +
      '• project-example : 7% (0h40)\n' +
      '• project-c : 2% (0h13)'
    );
  });

  it('lists at most 2 runners-up even when more categories have data (top 3 total)', () => {
    const text = buildChartAnalysisText({
      t,
      chartData: [
        { key: '1', label: 'A', value: 4000 },
        { key: '2', label: 'B', value: 3000 },
        { key: '3', label: 'C', value: 2000 },
        { key: '4', label: 'D', value: 1000 },
      ],
      crossedData: null,
      totalSeconds: 10000,
      formatDuration,
    });

    expect(text).not.toContain('D :');
    expect(text).toContain('B : 30% (0h50)');
    expect(text).toContain('C : 20% (0h33)');
  });

  it('omits the runners-up list when only one category has data', () => {
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

  it('adds the billable-share sentence when billableSeconds is provided', () => {
    const text = buildChartAnalysisText({
      t,
      chartData: [{ key: '1', label: 'TB-UNITED', value: 29880 }],
      crossedData: null,
      totalSeconds: 29880,
      formatDuration,
      billableSeconds: 17330, // 58%
    });

    expect(text).toBe(
      'TB-UNITED représente 100% du temps total sur cette période, avec 8h18.\n\n58% du temps total est facturable.'
    );
  });

  it('adds the category-count sentence when categoryCount is provided, and omits it when 0/absent', () => {
    const withCount = buildChartAnalysisText({
      t,
      chartData: [{ key: '1', label: 'TB-UNITED', value: 29880 }],
      crossedData: null,
      totalSeconds: 29880,
      formatDuration,
      categoryCount: 9,
    });
    expect(withCount).toContain('Répartition sur 9 catégories.');

    const withoutCount = buildChartAnalysisText({
      t,
      chartData: [{ key: '1', label: 'TB-UNITED', value: 29880 }],
      crossedData: null,
      totalSeconds: 29880,
      formatDuration,
      categoryCount: 0,
    });
    expect(withoutCount).not.toContain('catégories.');
  });

  it('never headlines the "Autres" bucket as the dominant category, and reports it as a separate remainder sentence instead — the exact reported nonsense case', () => {
    const text = buildChartAnalysisText({
      t,
      chartData: [
        { key: '1', label: 'TB-UNITED', value: 6000 },
        { key: 'other', label: 'Autres', value: 4000 }, // would outrank a smaller real 2nd place, must never headline
      ],
      crossedData: null,
      totalSeconds: 10000,
      formatDuration,
    });

    expect(text).not.toContain('Autres représente');
    expect(text).not.toContain('La majorité provient de Autres');
    expect(text).toBe(
      'TB-UNITED représente 60% du temps total sur cette période, avec 1h40.\n\n' +
      'Le reste, réparti sur plusieurs petites catégories, représente 40% du temps total sur cette période, avec 1h06.'
    );
  });

  it('falls back to the remainder sentence alone when only the "Autres" bucket has data', () => {
    const text = buildChartAnalysisText({
      t,
      chartData: [{ key: 'other', label: 'Autres', value: 5000 }],
      crossedData: null,
      totalSeconds: 5000,
      formatDuration,
    });

    expect(text).toBe('Le reste, réparti sur plusieurs petites catégories, représente 100% du temps total sur cette période, avec 1h23.');
  });

  it('when a crossing is active, lists the FULL breakdown of the dominant row AND of every other named category — not just the dominant one', () => {
    const text = buildChartAnalysisText({
      t,
      chartData: [],
      crossedData: {
        segments: [
          { dataKey: 'p5', label: 'Mohamed' },
          { dataKey: 'p6', label: 'Soumeya' },
        ],
        rows: [
          { key: '1', label: 'TB-UNITED', p5: 25200, p6: 3600 }, // 7h + 1h = 8h total
          { key: '2', label: 'project-example', p5: 3600, p6: 0 }, // 1h total
        ],
      },
      totalSeconds: 32400, // 9h
      formatDuration,
      crossWithLabel: 'Employé',
    });

    expect(text).toBe(
      'TB-UNITED représente 89% du temps total sur cette période, avec 8h00.\n\n' +
      'Répartition de TB-UNITED par Employé :\n' +
      '• Mohamed : 88% (7h00)\n' +
      '• Soumeya : 13% (1h00)\n\n' +
      'Autres catégories principales :\n\n' +
      '▸ project-example : 11% (1h00)\n' +
      '  Répartition de project-example par Employé :\n' +
      '  • Mohamed : 100% (1h00)'
    );
  });

  it('never headlines the "Autres" primary row in a crossing either, and reports it as a remainder sentence', () => {
    const text = buildChartAnalysisText({
      t,
      chartData: [],
      crossedData: {
        segments: [{ dataKey: 'p5', label: 'Alice' }],
        rows: [
          { key: '__other_primary__', label: 'Autres', p5: 9000 },
          { key: '1', label: 'TB-UNITED', p5: 1000 },
        ],
      },
      totalSeconds: 10000,
      formatDuration,
      crossWithLabel: 'Employé',
    });

    expect(text).not.toContain('Autres représente');
    expect(text.startsWith('TB-UNITED')).toBe(true);
    expect(text).toContain('Le reste, réparti sur plusieurs petites catégories, représente 90%');
  });

  it('demo — same scenario, now with all 8 categories (Dimension=Projet crossed with Employé): every category gets its own crossing breakdown, not just TB-UNITED', () => {
    // Realistic round numbers, 100h period, 8 real projects summing exactly
    // to the total (no primary "Autres" bucket needed here — the primary
    // "Autres" case is already covered by the dedicated test above).
    // TB-UNITED's own breakdown still includes a secondary "Autres" bucket,
    // to also exercise that alongside the multi-category listing.
    const totalSeconds = 360000; // 100h
    const realT = (key, vars) => {
      const dict = {
        'dashboard.export.analysis_no_data': 'Aucune activité enregistrée sur cette période.',
        'dashboard.export.analysis_dominant': `${vars?.label} représente ${vars?.pct}% du temps total sur cette période, avec ${vars?.duration}.`,
        'dashboard.export.analysis_list_item': `${vars?.label} : ${vars?.pct}% (${vars?.duration})`,
        'dashboard.export.analysis_top_list_intro': 'Autres catégories principales :',
        'dashboard.export.analysis_crossed_breakdown_intro': `Répartition de ${vars?.label} par ${vars?.cross} :`,
        'dashboard.export.analysis_billable_share': `${vars?.pct}% du temps total est facturable.`,
        'dashboard.export.analysis_category_count': `Répartition sur ${vars?.count} catégories.`,
        'dashboard.export.analysis_other_bucket': `Le reste, réparti sur plusieurs petites catégories, représente ${vars?.pct}% du temps total sur cette période, avec ${vars?.duration}.`,
        'dashboard.other_bucket': 'Autres',
      };
      return dict[key] ?? key;
    };

    const text = buildChartAnalysisText({
      t: realT,
      chartData: [],
      crossedData: {
        segments: [
          { dataKey: 'seg_mohamed', label: 'Mohamed' },
          { dataKey: 'seg_soumeya', label: 'Soumeya' },
          { dataKey: 'seg___other_secondary__', label: 'Autres' },
        ],
        rows: [
          { key: '1', label: 'TB-UNITED', seg_mohamed: 108000, seg_soumeya: 45000, seg___other_secondary__: 27000 }, // 180000 = 50h, 50%
          { key: '2', label: 'IDARA', seg_mohamed: 54000, seg_soumeya: 0, seg___other_secondary__: 0 }, // 15h, 15%
          { key: '3', label: 'LEARN', seg_mohamed: 0, seg_soumeya: 36000, seg___other_secondary__: 0 }, // 10h, 10%
          { key: '4', label: 'INFRA', seg_mohamed: 20160, seg_soumeya: 8640, seg___other_secondary__: 0 }, // 8h, 8%
          { key: '5', label: 'TRAINING', seg_mohamed: 25200, seg_soumeya: 0, seg___other_secondary__: 0 }, // 7h, 7%
          { key: '6', label: 'project-example', seg_mohamed: 0, seg_soumeya: 18000, seg___other_secondary__: 0 }, // 5h, 5%
          { key: '7', label: "falous' app", seg_mohamed: 10800, seg_soumeya: 0, seg___other_secondary__: 0 }, // 3h, 3%
          { key: '8', label: 'dev mtaa app', seg_mohamed: 7200, seg_soumeya: 0, seg___other_secondary__: 0 }, // 2h, 2%
        ],
      },
      totalSeconds,
      formatDuration,
      crossWithLabel: 'Employé',
      billableSeconds: 216000, // 60%
      categoryCount: 8,
    });

    // eslint-disable-next-line no-console
    console.log('\n----- buildChartAnalysisText demo output (8 categories) -----\n' + text + '\n----- end -----\n');

    // Headline + its own full breakdown, unchanged from before.
    expect(text).toContain('TB-UNITED représente 50% du temps total sur cette période, avec 50h00.');
    expect(text).toContain('Répartition de TB-UNITED par Employé :\n• Mohamed : 60% (30h00)\n• Soumeya : 25% (12h30)\n• Autres : 15% (7h30)');

    // Every other named category gets its own '▸' line...
    expect(text).toContain('▸ IDARA : 15% (15h00)');
    expect(text).toContain('▸ LEARN : 10% (10h00)');
    expect(text).toContain('▸ INFRA : 8% (8h00)');
    expect(text).toContain('▸ TRAINING : 7% (7h00)');
    expect(text).toContain('▸ project-example : 5% (5h00)');
    expect(text).toContain("▸ falous' app : 3% (3h00)");
    expect(text).toContain('▸ dev mtaa app : 2% (2h00)');

    // ...AND its own nested, indented "Répartition de X par Employé" —
    // the actual point of this change: not just the dominant category.
    expect(text).toContain('  Répartition de IDARA par Employé :\n  • Mohamed : 100% (15h00)');
    expect(text).toContain('  Répartition de LEARN par Employé :\n  • Soumeya : 100% (10h00)');
    expect(text).toContain('  Répartition de INFRA par Employé :\n  • Mohamed : 70% (5h36)\n  • Soumeya : 30% (2h24)');
    expect(text).toContain('  Répartition de TRAINING par Employé :\n  • Mohamed : 100% (7h00)');
    expect(text).toContain('  Répartition de project-example par Employé :\n  • Soumeya : 100% (5h00)');
    expect(text).toContain("  Répartition de falous' app par Employé :\n  • Mohamed : 100% (3h00)");
    expect(text).toContain('  Répartition de dev mtaa app par Employé :\n  • Mohamed : 100% (2h00)');

    // Closing facts.
    expect(text).toContain('60% du temps total est facturable.');
    expect(text).toContain('Répartition sur 8 catégories.');

    // No primary "Autres" bucket in this scenario (8 named categories sum
    // to exactly 100%) -> no remainder sentence, and never a nonsense
    // "Autres représente..." headline anywhere.
    expect(text).not.toContain('Le reste, réparti');
    expect(text).not.toContain('Autres représente');
    expect(text).not.toContain('▸ Autres');
  });
});
