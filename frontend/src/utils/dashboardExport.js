// Pure, DOM-free logic shared by the Dashboard's PDF and CSV export buttons
// (DashboardPage.jsx). Kept separate from the heavy jsPDF/html2canvas
// assembly (dashboardPdfExport.js, lazy-imported only on click) so this file
// stays cheap to import and easy to unit-test without a real canvas.

/**
 * Row data for the Dashboard's CSV export: a small "label, value" summary
 * block (period, total, billable) followed by a blank separator and the
 * data table for whichever chart is currently configured on screen.
 *
 * Without a crossing, that table is "category, duration" — chartData, from
 * buildSingleDimensionChartData(). With one active, a flat table can't
 * represent it (that's the bug this fixes): crossedData — the exact
 * {rows, segments} shape buildStackedChartData() also feeds the on-screen
 * stacked bar chart with — becomes a real pivot table instead, one column
 * per crossing category, one row per primary category, so the CSV always
 * matches what's visible, never a second, divergent computation.
 *
 * The table's own header row used to hardcode a generic "Category" label
 * for the first column regardless of what it actually held (employee,
 * project, client...) — opening the CSV on its own, without the chart in
 * view, gave no way to tell what that column, or a crossing's other
 * columns, actually represented. dimensionLabel/crossWithLabel (the same
 * translated dashboard.dimension.* labels the chart itself is captioned
 * with) fix that: the header names the real dimension, and an extra line
 * right before it spells out the crossing when one is active.
 */
export function buildDashboardCsvRows({ t, dateRange, totalSeconds, billableSeconds, formatDuration, chartData, crossedData, dimensionLabel, crossWithLabel }) {
  const rows = [
    [t('dashboard.export.csv_period_from'), dateRange.from],
    [t('dashboard.export.csv_period_to'), dateRange.to],
    [t('dashboard.total'), formatDuration(totalSeconds)],
    [t('dashboard.of_which_billable'), formatDuration(billableSeconds)],
    ['', ''],
  ];
  const categoryHeader = dimensionLabel || t('dashboard.export.csv_category');
  if (crossedData) {
    const { rows: dataRows, segments } = crossedData;
    rows.push([t('dashboard.export.csv_crossed_with_header', { dimension: crossWithLabel })]);
    rows.push([categoryHeader, ...segments.map((segment) => segment.label)]);
    dataRows.forEach((row) => {
      rows.push([row.label, ...segments.map((segment) => formatDuration(row[segment.dataKey] || 0))]);
    });
  } else {
    rows.push([categoryHeader, t('dashboard.export.csv_duration')]);
    chartData.forEach((row) => rows.push([row.label, formatDuration(row.value)]));
  }
  return rows;
}

/**
 * A short (2-3 sentence), purely factual analysis of the currently
 * configured chart, for the PDF export — built from the exact same
 * chartData/crossedData the chart itself renders from (buildSingleDimensionChartData
 * / buildStackedChartData), never a second, independent computation, so the
 * text can never disagree with the image above it.
 *
 * No adjectives, no "a lot"/"few" — just which category leads, its share
 * of the total and its duration, the runner-up if there is one, and (when
 * a crossing is active) which crossing category makes up most of the
 * leading row. Deliberately does NOT try to always produce exactly 2
 * sentences: a period with no data, or only one category, gets a shorter,
 * still-accurate sentence rather than a forced or nonsensical one.
 */
export function buildChartAnalysisText({ t, chartData, crossedData, totalSeconds, formatDuration, crossWithLabel }) {
  const total = Number(totalSeconds) || 0;
  if (total <= 0) {
    return t('dashboard.export.analysis_no_data');
  }

  if (crossedData) {
    const { rows, segments } = crossedData;
    const rowsWithTotal = (rows || [])
      .map((row) => ({
        row,
        total: segments.reduce((sum, segment) => sum + (Number(row[segment.dataKey]) || 0), 0),
      }))
      .filter((entry) => entry.total > 0)
      .sort((a, b) => b.total - a.total);

    if (rowsWithTotal.length === 0) {
      return t('dashboard.export.analysis_no_data');
    }

    const top = rowsWithTotal[0];
    const pct = Math.round((top.total / total) * 100);
    let text = t('dashboard.export.analysis_dominant', {
      label: top.row.label,
      pct,
      duration: formatDuration(top.total),
    });

    const topSegment = segments
      .map((segment) => ({ segment, value: Number(top.row[segment.dataKey]) || 0 }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value)[0];

    if (topSegment) {
      text += ' ' + t('dashboard.export.analysis_crossed_breakdown', {
        cross: crossWithLabel,
        label: topSegment.segment.label,
        duration: formatDuration(topSegment.value),
      });
    }

    return text;
  }

  const sorted = (chartData || [])
    .filter((row) => Number(row.value) > 0)
    .sort((a, b) => Number(b.value) - Number(a.value));

  if (sorted.length === 0) {
    return t('dashboard.export.analysis_no_data');
  }

  const top = sorted[0];
  const pct = Math.round((Number(top.value) / total) * 100);
  let text = t('dashboard.export.analysis_dominant', {
    label: top.label,
    pct,
    duration: formatDuration(Number(top.value)),
  });

  if (sorted.length > 1) {
    const second = sorted[1];
    text += ' ' + t('dashboard.export.analysis_runner_up', {
      label: second.label,
      duration: formatDuration(Number(second.value)),
    });
  }

  return text;
}
