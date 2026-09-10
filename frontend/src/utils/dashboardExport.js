// Pure, DOM-free logic shared by the Dashboard's PDF and CSV export buttons
// (DashboardPage.jsx). Kept separate from the heavy jsPDF/html2canvas
// assembly (dashboardPdfExport.js, lazy-imported only on click) so this file
// stays cheap to import and easy to unit-test without a real canvas.

export function entryDate(value) {
  if (!value) return new Date(Number.NaN);
  const raw = String(value);
  return /^[0-9]+$/.test(raw) ? new Date(Number(raw) * (raw.length === 10 ? 1000 : 1)) : new Date(value);
}

// NOT date.toISOString().slice(0, 10): that reads the UTC calendar date,
// while startOfDay()/startOfWeek() below build their result using *local*
// setHours()/setDate(). In any positive UTC-offset timezone, local midnight
// is still the previous day in UTC (e.g. UTC+1: 2026-09-01T00:00 local ==
// 2026-08-31T23:00 UTC), so toISOString() would silently mislabel every
// bucket one day early. Reading the local date components directly keeps
// both functions in the same (local) time frame.
function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfDay(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function startOfWeek(date) {
  const day = date.getDay();
  const diff = (day + 6) % 7; // Monday-based week, same convention as the rest of the app (FullCalendar's firstDay={1})
  const start = startOfDay(date);
  start.setDate(start.getDate() - diff);
  return start;
}

/**
 * Period length in whole days (inclusive of both bounds), used to pick the
 * trend chart's aggregation: short period -> one bar per day, long period ->
 * one bar per week (otherwise a multi-month range would render an unreadable
 * wall of daily bars).
 */
export function periodLengthInDays(dateRange) {
  const start = entryDate(dateRange?.from);
  const end = entryDate(dateRange?.to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86400000) + 1;
}

const TREND_GRANULARITY_THRESHOLD_DAYS = 31;

export function chooseTrendGranularity(dateRange) {
  return periodLengthInDays(dateRange) <= TREND_GRANULARITY_THRESHOLD_DAYS ? 'day' : 'week';
}

/**
 * Aggregates entries (already loaded for the dashboard's trend data, not a
 * separate fetch) into one total-duration bucket per day or per week,
 * restricted to dateRange, sorted chronologically.
 */
export function buildTrendData(entries, dateRange, locale, granularity) {
  const rangeStart = entryDate(dateRange?.from);
  const rangeEnd = entryDate(dateRange?.to);
  const periodEntries = Array.isArray(entries)
    ? entries.filter((entry) => {
        const start = entryDate(entry.date_start);
        return !Number.isNaN(start.getTime()) && start >= rangeStart && start <= rangeEnd;
      })
    : [];

  const map = new Map();
  for (const entry of periodEntries) {
    const start = entryDate(entry.date_start);
    if (Number.isNaN(start.getTime())) continue;
    const bucketStart = granularity === 'week' ? startOfWeek(start) : startOfDay(start);
    const key = toIsoDate(bucketStart);
    if (!map.has(key)) {
      const label = bucketStart.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
      map.set(key, { bucketStart: key, label, total: 0 });
    }
    map.get(key).total += Number(entry.duration || 0);
  }

  return Array.from(map.values()).sort((left, right) => left.bucketStart.localeCompare(right.bucketStart));
}

/**
 * Which of the 3 fixed export views duplicate what the user already
 * configured in "Graphique personnalisé" — the trend (by day/week) view has
 * no equivalent there (no time dimension exists in CustomChartWidget), so
 * it is never redundant.
 */
export function detectRedundantFixedViews({ dimension, crossWith }) {
  const noCross = !crossWith || crossWith === 'none';
  return {
    project: dimension === 'project' && noCross,
    billable: dimension === 'billable' && noCross,
    trend: false,
  };
}

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
 */
export function buildDashboardCsvRows({ t, dateRange, totalSeconds, billableSeconds, formatDuration, chartData, crossedData }) {
  const rows = [
    [t('dashboard.export.csv_period_from'), dateRange.from],
    [t('dashboard.export.csv_period_to'), dateRange.to],
    [t('dashboard.total'), formatDuration(totalSeconds)],
    [t('dashboard.of_which_billable'), formatDuration(billableSeconds)],
    ['', ''],
  ];
  if (crossedData) {
    const { rows: dataRows, segments } = crossedData;
    rows.push([t('dashboard.export.csv_category'), ...segments.map((segment) => segment.label)]);
    dataRows.forEach((row) => {
      rows.push([row.label, ...segments.map((segment) => formatDuration(row[segment.dataKey] || 0))]);
    });
  } else {
    rows.push([t('dashboard.export.csv_category'), t('dashboard.export.csv_duration')]);
    chartData.forEach((row) => rows.push([row.label, formatDuration(row.value)]));
  }
  return rows;
}
