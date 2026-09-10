// Real-data regression test for the CSV crossing export fix. Fixture is a
// genuine getSummaryReports-shaped payload pulled from the live database
// (period 2026-07-01..2026-09-30, manager scope, 583 real validated
// entries — the same batch validated earlier this session), not a synthetic
// mock, so this exercises the exact scenario reported: Dimension=Employé,
// Croiser avec=Projet showing only 2 flat columns in the CSV instead of the
// stacked-bar pivot the chart actually displays.
import { describe, expect, it } from 'vitest';
import { buildStackedChartData } from '../components/organisms/CustomChartWidget.jsx';
import { buildDashboardCsvRows } from './dashboardExport.js';
import { formatDuration } from './FormatDuration.js';
import i18n from '../i18n';
import realSummary from './dashboardExport.realdata.fixture.json';

const t = i18n.getFixedT('fr');

describe('Dashboard CSV export — crossing reflects the real chart (real backend data)', () => {
  it('buildStackedChartData produces the exact same pivot the chart renders, for Dimension=Employé + Croiser avec=Projet', () => {
    const { rows, segments } = buildStackedChartData({ summary: realSummary, dimension: 'employee', crossWith: 'project', t });

    // Real project labels from the fixture must appear as columns (top-5 +
    // "Autres" bucket, same MAX_STACK_SEGMENTS=5 policy the chart itself uses).
    const segmentLabels = segments.map((s) => s.label);
    expect(segmentLabels).toContain('TB-UNITED');
    expect(segmentLabels.length).toBeLessThanOrEqual(5);

    // Real employee labels must appear as rows.
    const rowLabels = rows.map((r) => r.label);
    expect(rowLabels).toEqual(expect.arrayContaining(['wissal', 'samir chouaieb', 'mohamed chouaieb', 'bacem']));

    // Spot-check one real cell: project 13 (TB-UNITED) x user 13 (wissal) =
    // 466118s in the raw by_project_employee composite (fixture data).
    const wissalRow = rows.find((r) => r.label === 'wissal');
    const tbUnitedSegment = segments.find((s) => s.label === 'TB-UNITED');
    expect(wissalRow[tbUnitedSegment.dataKey]).toBe(466118);
  });

  it('the CSV rows are a real pivot table (one column per project) matching the chart data 1:1, not a 2-column flat total, and names both dimensions', () => {
    const crossedData = buildStackedChartData({ summary: realSummary, dimension: 'employee', crossWith: 'project', t });
    const csvRows = buildDashboardCsvRows({
      t,
      dateRange: { from: '2026-07-01', to: '2026-09-30' },
      totalSeconds: 3733916,
      billableSeconds: 0,
      formatDuration,
      chartData: [],
      crossedData,
      dimensionLabel: t('dashboard.dimension.employee'),
      crossWithLabel: t('dashboard.dimension.project'),
    });

    // A line naming the crossing dimension comes right before the header —
    // the exact reported readability gap (opening the CSV alone gave no
    // way to tell the columns were projects).
    expect(csvRows[5]).toEqual([t('dashboard.export.csv_crossed_with_header', { dimension: t('dashboard.dimension.project') })]);

    const headerRow = csvRows[6];
    // The real dimension name ("Employé") + one column per project segment
    // — not the generic "Catégorie", and not "Catégorie, Durée".
    expect(headerRow[0]).toBe(t('dashboard.dimension.employee'));
    expect(headerRow[0]).not.toBe(t('dashboard.export.csv_category'));
    expect(headerRow.length).toBe(1 + crossedData.segments.length);
    expect(headerRow).toContain('TB-UNITED');
    expect(headerRow).not.toContain(t('dashboard.export.csv_duration'));

    const wissalCsvRow = csvRows.find((row) => row[0] === 'wissal');
    const tbUnitedColIndex = headerRow.indexOf('TB-UNITED');
    expect(wissalCsvRow[tbUnitedColIndex]).toBe(formatDuration(466118));
    // Every data row has exactly as many cells as the header.
    csvRows.slice(7).forEach((row) => expect(row.length).toBe(headerRow.length));
  });

  it('still produces the old flat 2-column CSV when crossWith is none (unchanged behavior)', () => {
    const csvRows = buildDashboardCsvRows({
      t,
      dateRange: { from: '2026-07-01', to: '2026-09-30' },
      totalSeconds: 3733916,
      billableSeconds: 0,
      formatDuration,
      chartData: [{ key: '13', label: 'TB-UNITED', value: 1000 }],
      crossedData: null,
    });
    expect(csvRows[5]).toEqual([t('dashboard.export.csv_category'), t('dashboard.export.csv_duration')]);
    expect(csvRows[6]).toEqual(['TB-UNITED', formatDuration(1000)]);
  });
});
