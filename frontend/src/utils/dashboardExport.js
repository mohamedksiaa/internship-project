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
 * A purely factual overview of the currently configured chart, for the PDF
 * export — built from the exact same chartData/crossedData the chart itself
 * renders from (buildSingleDimensionChartData / buildStackedChartData),
 * never a second, independent computation, so the text can never disagree
 * with the image above it.
 *
 * No adjectives, no "a lot"/"few" — only shares, durations and counts.
 * Covers, in order: the leading category (share + duration) with its own
 * full crossing breakdown when a crossing is active, then every other named
 * category — each with its own share/duration AND its own full crossing
 * breakdown too, not just the leader (a '▸' marker separates each category
 * block from the '•' employee-level lines nested under it) — then a closing
 * block of standalone facts (billable share, distinct category count, and
 * the "Autres" bucket if present). Still returns a single short sentence
 * for a period with no data.
 *
 * Only the crossed case lists every category (a crossing breakdown per
 * category is the whole point here, and the PDF renderer now paginates this
 * section — see ANALYSIS_LINE_HEIGHT_MM/ensureSpace in dashboardPdfExport.js
 * — so length is no longer a reason to cut it short). The non-crossed case
 * keeps its original top-3 cap: with no per-category breakdown to justify a
 * full listing, a long flat list of every category adds bulk without much
 * of it being anything a reader would want to scan.
 *
 * "Autres" (the top-K-plus-bucket both chart builders produce, see
 * CustomChartWidget's MAX_SLICES/MAX_STACK_SEGMENTS) is never presented as
 * if it were one real, named category — it's identified structurally (its
 * row/segment key: 'other' for the single-dimension bucket,
 * '__other_primary__'/'__other_secondary__' for the crossed one, not by
 * comparing translated labels) and excluded from the ranking entirely; if
 * it has any duration, it gets its own "remainder" sentence instead of ever
 * competing to be "the leading category" or "the majority".
 *
 * @param {object} params
 * @param {number} [params.billableSeconds] Omit to skip the billable-share sentence.
 * @param {number} [params.categoryCount] Total distinct non-zero categories
 *   for the primary dimension *before* top-K bucketing (the caller's to
 *   compute, since chartData/crossedData here are already bucketed and can't
 *   recover it). Omit (or 0) to skip the category-count sentence.
 */
export function buildChartAnalysisText({
  t,
  chartData,
  crossedData,
  totalSeconds,
  formatDuration,
  crossWithLabel,
  billableSeconds,
  categoryCount,
}) {
  const total = Number(totalSeconds) || 0;
  if (total <= 0) {
    return t('dashboard.export.analysis_no_data');
  }

  const pctOf = (value, base) => Math.round((value / base) * 100);
  const listItem = (label, pct, duration) => '• ' + t('dashboard.export.analysis_list_item', { label, pct, duration });

  const closingSentences = [];
  if (billableSeconds != null) {
    closingSentences.push(t('dashboard.export.analysis_billable_share', { pct: pctOf(Number(billableSeconds), total) }));
  }
  if (categoryCount) {
    closingSentences.push(t('dashboard.export.analysis_category_count', { count: categoryCount }));
  }

  let text;

  if (crossedData) {
    const { rows, segments } = crossedData;
    const isOtherRow = (row) => row.key === '__other_primary__';

    const rowsWithTotal = (rows || [])
      .map((row) => ({ row, total: segments.reduce((sum, segment) => sum + (Number(row[segment.dataKey]) || 0), 0) }))
      .filter((entry) => entry.total > 0);
    const namedRows = rowsWithTotal.filter((entry) => !isOtherRow(entry.row)).sort((a, b) => b.total - a.total);
    const otherRow = rowsWithTotal.find((entry) => isOtherRow(entry.row));

    // Every named row's own crossing breakdown, e.g. "Répartition de Projet X
    // par Employé :" followed by one '• label : pct% (duration)' line per
    // sub-category of THAT row (percentages relative to the row's own
    // total, not the grand total) — '' when the row has no positive segment.
    const breakdownFor = (entry) => {
      const rowBreakdown = segments
        .map((segment) => ({ segment, value: Number(entry.row[segment.dataKey]) || 0 }))
        .filter((s) => s.value > 0)
        .sort((a, b) => b.value - a.value);
      if (rowBreakdown.length === 0) return '';
      const items = rowBreakdown.map((s) => {
        const label = s.segment.dataKey === 'seg___other_secondary__' ? t('dashboard.other_bucket') : s.segment.label;
        return listItem(label, pctOf(s.value, entry.total), formatDuration(s.value));
      });
      return t('dashboard.export.analysis_crossed_breakdown_intro', { label: entry.row.label, cross: crossWithLabel }) + '\n' + items.join('\n');
    };

    if (namedRows.length === 0) {
      if (!otherRow) {
        return t('dashboard.export.analysis_no_data');
      }
      text = t('dashboard.export.analysis_other_bucket', { pct: pctOf(otherRow.total, total), duration: formatDuration(otherRow.total) });
    } else {
      const top = namedRows[0];
      text = t('dashboard.export.analysis_dominant', { label: top.row.label, pct: pctOf(top.total, total), duration: formatDuration(top.total) });

      const topBreakdown = breakdownFor(top);
      if (topBreakdown) {
        text += '\n\n' + topBreakdown;
      }

      // Every other named category, not just the first two: each gets its
      // own '▸' line (share + duration) and, nested under it, its own full
      // crossing breakdown — the exact thing point-by-point requested for
      // "all categories, not just the dominant one".
      const rest = namedRows.slice(1);
      if (rest.length > 0) {
        const blocks = rest.map((entry) => {
          const header = '▸ ' + t('dashboard.export.analysis_list_item', { label: entry.row.label, pct: pctOf(entry.total, total), duration: formatDuration(entry.total) });
          const sub = breakdownFor(entry);
          if (!sub) return header;
          const indentedSub = sub.split('\n').map((line) => '  ' + line).join('\n');
          return header + '\n' + indentedSub;
        });
        text += '\n\n' + t('dashboard.export.analysis_top_list_intro') + '\n\n' + blocks.join('\n\n');
      }

      if (otherRow) {
        closingSentences.push(t('dashboard.export.analysis_other_bucket', { pct: pctOf(otherRow.total, total), duration: formatDuration(otherRow.total) }));
      }
    }
  } else {
    const isOtherEntry = (row) => row.key === 'other';
    const withData = (chartData || []).filter((row) => Number(row.value) > 0);
    const named = withData.filter((row) => !isOtherEntry(row)).sort((a, b) => Number(b.value) - Number(a.value));
    const otherEntry = withData.find(isOtherEntry);

    if (named.length === 0) {
      if (!otherEntry) {
        return t('dashboard.export.analysis_no_data');
      }
      text = t('dashboard.export.analysis_other_bucket', { pct: pctOf(Number(otherEntry.value), total), duration: formatDuration(Number(otherEntry.value)) });
    } else {
      const top = named[0];
      text = t('dashboard.export.analysis_dominant', { label: top.label, pct: pctOf(Number(top.value), total), duration: formatDuration(Number(top.value)) });

      const runnersUp = named.slice(1, 3);
      if (runnersUp.length > 0) {
        const items = runnersUp.map((row) => listItem(row.label, pctOf(Number(row.value), total), formatDuration(Number(row.value))));
        text += '\n\n' + t('dashboard.export.analysis_top_list_intro') + '\n' + items.join('\n');
      }

      if (otherEntry) {
        closingSentences.push(t('dashboard.export.analysis_other_bucket', { pct: pctOf(Number(otherEntry.value), total), duration: formatDuration(Number(otherEntry.value)) }));
      }
    }
  }

  if (closingSentences.length > 0) {
    text += '\n\n' + closingSentences.join(' ');
  }

  return text;
}
