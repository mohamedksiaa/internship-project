import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../components/templates/DashboardLayout';
import CustomChartWidget, { buildSingleDimensionChartData, buildStackedChartData } from '../components/organisms/CustomChartWidget';
import DashboardExportCharts, { EXPORT_CHART_WIDTH } from '../components/organisms/DashboardExportCharts';
import { getDailyReports, getMyDailyReports, getSummaryReports, getTimeEntries } from '../api/timeflowApi';
import { formatDuration } from '../utils/FormatDuration.js';
import { downloadCsv } from '../utils/csvExport.js';
import { buildDashboardCsvRows, buildTrendData, chooseTrendGranularity, detectRedundantFixedViews } from '../utils/dashboardExport.js';
import Card from '../components/atoms/Card';
import useDarkMode from '../hooks/useDarkMode';
import { useUrlDateRange, useUrlState } from '../hooks/useUrlState.js';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const TEAM_CHART_COLORS = ['#5B8FA8', '#4d5fca', '#35a66f', '#f59e0b', '#d66', '#8a9aa4'];

function entryDate(value) {
  if (!value) return new Date(0);
  const raw = String(value);
  return /^[0-9]+$/.test(raw) ? new Date(Number(raw) * (raw.length === 10 ? 1000 : 1)) : new Date(value);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function currentMonthRange(referenceDate = new Date()) {
  const current = startOfMonth(referenceDate);
  return {
    from: [current.getFullYear(), String(current.getMonth() + 1).padStart(2, '0'), '01'].join('-'),
    to: [current.getFullYear(), String(current.getMonth() + 1).padStart(2, '0'), String(endOfMonth(current).getDate()).padStart(2, '0')].join('-'),
  };
}

function dayLabel(value, locale = 'fr-FR') {
  const date = entryDate(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' });
}

function projectLabel(projectId, projectLabels = {}, fallbackLabel = 'dashboard.no_project') {
  if (!projectId || Number(projectId) <= 0) {
    return fallbackLabel;
  }
  return projectLabels[projectId] || projectLabels[String(projectId)] || 'dashboard.project_fallback';
}

// Fixed window for the "pending reports" alert count: intentionally NOT tied
// to the user-editable date range below — it's a "right now" alert (reports
// awaiting validation for too long), not a historical figure to browse.
const PENDING_REPORTS_WINDOW = currentMonthRange();

// Same persistence contract as the language selector (see i18n.js /
// LanguageSelector.jsx: a plain, try/catch-guarded localStorage read/write,
// no extra abstraction): the last range the user explicitly picked here
// takes priority over the computed "current month" default and stays in
// effect until they change it again. This is deliberately separate from
// useUrlDateRange's own ?dateFrom/?dateTo — those already survive a
// same-tab refresh, but not a fresh app entry with no query string at all,
// which is the actual bug: the URL is not durable storage across sessions.
const DASHBOARD_DATE_RANGE_STORAGE_KEY = 'timeflow_dashboard_date_range';

function readStoredDashboardDateRange() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DASHBOARD_DATE_RANGE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.from === 'string' && typeof parsed.to === 'string') {
      return parsed;
    }
  } catch (e) {
    // Malformed or inaccessible storage (private mode, quota...) — fall
    // back to the computed "current month" default below.
  }
  return null;
}

function writeStoredDashboardDateRange(range) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DASHBOARD_DATE_RANGE_STORAGE_KEY, JSON.stringify(range));
  } catch (e) {
    // ignore localStorage errors
  }
}

// getTimeEntries() is now backend-paginated (see ajax/timeentry.php's
// timeflowFetchVisibleTimeEntries), capped at 100 rows/page — this used to
// be a single getTimeEntries(1000) call relying on an uncapped $limit. Walk
// pages at the backend's own max page size until exhausted or the same
// 1000-row ceiling the old call had, to feed the trend chart an equivalent
// volume without going back to an unbounded query.
async function fetchAllTimeEntriesUpTo(maxEntries) {
  const perPage = 100;
  let page = 1;
  let all = [];
  for (;;) {
    const data = await getTimeEntries(page, perPage);
    const rows = Array.isArray(data?.entries) ? data.entries : [];
    all = all.concat(rows);
    const pages = data?.pagination?.pages || 1;
    if (rows.length === 0 || page >= pages || all.length >= maxEntries) break;
    page += 1;
  }
  return all.slice(0, maxEntries);
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const isDark = useDarkMode();
  const canReadAll = typeof window !== 'undefined' && window.TIMEFLOW_CAN_READALL === true;
  // Same dateFrom/dateTo URL params as ReportsPage — kept in the URL so the
  // period survives a refresh (see src/hooks/useUrlState.js). The DEFAULT fed
  // into it, though, prefers a previously-saved choice (localStorage) over
  // the computed "current month" — see readStoredDashboardDateRange() above.
  // Resolved once at mount (useMemo, not on every render): reading it fresh
  // each render would be harmless but pointless, and computing the fallback
  // via currentMonthRange() must not silently re-run on every re-render either.
  const initialDateRange = useMemo(() => readStoredDashboardDateRange() || currentMonthRange(), []);
  const [dateRange, setUrlDateFrom, setUrlDateTo] = useUrlDateRange(initialDateRange);
  // Wrap the setters so any explicit user change is also saved — this is the
  // part that actually fixes the bug: without it, only the URL remembers the
  // choice, and the URL does not survive a fresh app entry (no query string),
  // only a same-tab refresh.
  const setDateFrom = (value) => {
    setUrlDateFrom(value);
    writeStoredDashboardDateRange({ from: value, to: dateRange.to });
  };
  const setDateTo = (value) => {
    setUrlDateTo(value);
    writeStoredDashboardDateRange({ from: dateRange.from, to: value });
  };
  const [summary, setSummary] = useState(null);
  const [allEntries, setAllEntries] = useState([]);
  const [pendingReports, setPendingReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState('');

  // Mount-once data: weekly timesheet (feeds nothing here directly but kept
  // for parity with prior behavior), all entries (for the trend chart), and
  // pending reports (fixed window, see PENDING_REPORTS_WINDOW above).
  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      try {
        if (!isMounted) return;
        setLoading(true);

        const reportRequest = canReadAll
          ? getDailyReports({ date_from: PENDING_REPORTS_WINDOW.from, date_to: PENDING_REPORTS_WINDOW.to })
          : getMyDailyReports({ date_from: PENDING_REPORTS_WINDOW.from, date_to: PENDING_REPORTS_WINDOW.to });
        const [entries, pendingReportsData] = await Promise.all([
          fetchAllTimeEntriesUpTo(1000),
          reportRequest,
        ]);

        if (!isMounted) return;

        const filteredReports = Array.isArray(pendingReportsData?.reports)
          ? pendingReportsData.reports.filter((report) => Number(report.status ?? 1) === 1)
          : [];

        setAllEntries(entries);
        setPendingReports(filteredReports);
      } catch (err) {
        if (!isMounted) return;
        setError(err.message);
        setAllEntries([]);
        setPendingReports([]);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [canReadAll]);

  // Period-scoped summary: refetched whenever the user changes the date
  // range. Feeds the Total/Submitted/Validated tiles (via DashboardLayout),
  // the "Top projects" chart, and the custom chart widget below.
  useEffect(() => {
    let isMounted = true;

    async function loadSummary() {
      setSummaryLoading(true);
      setSummaryError('');
      try {
        // Dashboard-only: a draft can still change or be deleted, and a
        // refused entry means a manager explicitly did not recognize that
        // time — neither is reliable enough to show as a confirmed stat.
        // "Suivi du temps" (TimerPage) deliberately keeps showing drafts, so
        // this flag stays scoped to this one call, not a global default.
        const summaryData = await getSummaryReports(1000, dateRange.from, dateRange.to, true);
        if (isMounted) {
          setSummary(summaryData || null);
        }
      } catch (err) {
        if (isMounted) {
          setSummaryError(err.message);
          setSummary(null);
        }
      } finally {
        if (isMounted) {
          setSummaryLoading(false);
        }
      }
    }

    loadSummary();

    return () => {
      isMounted = false;
    };
  }, [dateRange.from, dateRange.to]);

  const locale = i18n.language === 'ar' ? 'ar-EG' : i18n.language === 'de' ? 'de-DE' : 'fr-FR';
  const noProjectLabel = t('dashboard.no_project');

  const topProjects = useMemo(() => {
    const byProject = summary?.by_project || {};
    const projectLabels = summary?.project_labels || {};
    return Object.entries(byProject)
      .map(([projectId, duration]) => ({
        id: projectId,
        name: projectLabel(projectId, projectLabels, noProjectLabel),
        value: Number(duration || 0),
      }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 5);
  }, [summary, noProjectLabel]);

  // "Total d'heures par jour/semaine" — used by the PDF export's fixed trend
  // view. Was a Dashboard-only, week-only computation (weeklyTrendData) never
  // actually rendered on screen; generalized into utils/dashboardExport.js
  // so the export can pick day-vs-week aggregation by period length (see
  // chooseTrendGranularity — <=31 days -> daily bars, otherwise weekly).
  const trendGranularity = useMemo(() => chooseTrendGranularity(dateRange), [dateRange]);
  const trendData = useMemo(
    () => buildTrendData(allEntries, dateRange, locale, trendGranularity),
    [allEntries, dateRange, locale, trendGranularity]
  );

  // getSummaryReports caps its fetch at `limit` rows (see ajax/timeentry.php)
  // for performance — entries_total_in_period is the real, unlimited count
  // for the same filter, so a mismatch means every card/chart fed by
  // `summary` below is silently built from a partial sample of the period.
  const isSummaryTruncated = Boolean(
    summary && Number(summary.entries_total_in_period) > Number(summary.entries_returned)
  );

  const summaryStats = useMemo(() => ({
    totalSeconds: Number(summary?.total_seconds || 0),
    billableSeconds: Number(summary?.billable_seconds || 0),
    submittedCount: Number(summary?.by_status?.[1] ?? summary?.by_status?.['1'] ?? 0),
    validatedCount: Number(summary?.by_status?.[2] ?? summary?.by_status?.['2'] ?? 0),
  }), [summary]);

  // Same URL keys CustomChartWidget itself reads (?dimension/?chartType/
  // ?crossWith) — read independently here rather than lifting state or
  // adding a callback prop, since useUrlState's contract IS the URL, shared
  // by any component that asks for the same key.
  const [dimension] = useUrlState('dimension', 'project');
  const [chartType] = useUrlState('chartType', 'bar');
  const [crossWith] = useUrlState('crossWith', 'none');
  const redundantFixedViews = useMemo(
    () => detectRedundantFixedViews({ dimension, crossWith }),
    [dimension, crossWith]
  );

  // Capture targets for the PDF export. All 4 sections (the configured
  // chart + the 3 fixed views) are captured from dedicated off-screen clones
  // that only exist in the DOM while exporting is true — see
  // <DashboardExportCharts> and the off-screen <CustomChartWidget> below.
  //
  // Earlier version captured the configured chart straight from the
  // already-visible, on-screen <CustomChartWidget> instead, toggling its
  // ResponsiveContainer between "100%" and a forced pixel size around the
  // capture. That toggle was itself the bug: a real authenticated-session
  // test showed recharts' "width(0) and height(0)" warning firing TWICE per
  // export (once on the forced-size transition in, once again clearing it
  // back out) — and at both moments document.querySelectorAll('svg.recharts-
  // surface') found ZERO elements, meaning ResponsiveContainer was rendering
  // nothing at all during the prop transition, not just measuring late.
  // Perturbing the live, already-stable widget for every export was the
  // actual defect. A dedicated off-screen clone (identical to how the 3
  // fixed views already work) never has that problem: it mounts once with
  // its final pixel size already set, no transition to warn about, and
  // never touches the on-screen widget at all.
  const exportConfiguredChartRef = useRef(null);
  const exportProjectRef = useRef(null);
  const exportBillableRef = useRef(null);
  const exportTrendRef = useRef(null);
  const [isPreparingExport, setIsPreparingExport] = useState(false);
  const [exportError, setExportError] = useState('');

  function nextPaint() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  const trendCaption = trendGranularity === 'day'
    ? t('dashboard.export.trend_caption_day')
    : t('dashboard.export.trend_caption_week');

  const configuredChartCaption = useMemo(() => {
    const dimLabel = t(`dashboard.dimension.${dimension}`);
    const typeLabel = t(`dashboard.chart_type.${chartType}`);
    const base = t('dashboard.export.configured_chart_caption', { dimension: dimLabel, type: typeLabel });
    if (crossWith && crossWith !== 'none') {
      return `${base} ${t('dashboard.export.configured_chart_crossed_with', { cross: t(`dashboard.dimension.${crossWith}`) })}`;
    }
    return base;
  }, [dimension, chartType, crossWith, t]);

  const handleExportPdf = async () => {
    setExportError('');
    setIsPreparingExport(true);
    try {
      // Kick off the lazy import() immediately, in parallel with the chart
      // settle wait below, instead of after it. On a first-ever export in
      // the session this chunk (jsPDF + html2canvas, ~330 KB) hasn't been
      // fetched yet, and fetch+parse can itself take longer than the settle
      // wait — sequencing them one after another was adding that whole
      // fetch time on top of the wait, on exactly the first click.
      const pdfModulePromise = import('../utils/dashboardPdfExport.js');

      // Mount the off-screen configured-chart clone and the 3 fixed-view
      // charts and let them actually paint before capturing — each has a
      // fixed pixel size from the moment it mounts (see CustomChartWidget's
      // forcedSize and DashboardExportCharts), so there's no ResizeObserver
      // to wait on, but a real paint still needs to happen, hence the
      // settle wait rather than capturing on the same tick as the state update.
      await nextPaint();
      await new Promise((resolve) => setTimeout(resolve, 150));

      console.log('[timeflow-pdf-diag] awaiting pdfModulePromise...');
      const pdfModule = await pdfModulePromise;
      console.log('[timeflow-pdf-diag] pdfModule resolved:', pdfModule, typeof pdfModule?.generateDashboardPdf);
      const { generateDashboardPdf } = pdfModule;

      const fixedViews = [];
      if (!redundantFixedViews.project) {
        fixedViews.push({ el: exportProjectRef.current, caption: t('dashboard.export.project_caption') });
      }
      if (!redundantFixedViews.billable) {
        fixedViews.push({ el: exportBillableRef.current, caption: t('dashboard.export.billable_caption') });
      }
      fixedViews.push({ el: exportTrendRef.current, caption: trendCaption });

      const now = new Date();
      console.log('[timeflow-pdf-diag] calling generateDashboardPdf, refs:', {
        configured: exportConfiguredChartRef.current,
        project: exportProjectRef.current,
        billable: exportBillableRef.current,
        trend: exportTrendRef.current,
      });
      await generateDashboardPdf({
        fileName: `timeflow_tableau_de_bord_${now.toISOString().slice(0, 10)}.pdf`,
        title: t('dashboard.export.pdf_title'),
        generatedAtLabel: t('dashboard.export.generated_at', { date: now.toLocaleString(locale) }),
        summaryLines: [
          t('dashboard.export.summary_period', { from: dateRange.from, to: dateRange.to }),
          t('dashboard.export.summary_total', { value: formatDuration(summaryStats.totalSeconds) }),
          t('dashboard.export.summary_billable', { value: formatDuration(summaryStats.billableSeconds) }),
        ],
        configuredChart: { el: exportConfiguredChartRef.current, caption: configuredChartCaption },
        fixedViews,
        emptyChartMessage: t('dashboard.custom_chart_empty'),
      });
      console.log('[timeflow-pdf-diag] generateDashboardPdf resolved OK');
    } catch (err) {
      // TEMPORARY diagnostic instrumentation — removed once the root cause
      // behind the "first click reloads the page" report is confirmed.
      console.error('[timeflow-pdf-diag] handleExportPdf caught:', err, err?.stack);
      setExportError(err?.message || t('dashboard.export.pdf_error'));
    } finally {
      setIsPreparingExport(false);
    }
  };

  // Same crossing condition as CustomChartWidget's own isCrossing — the CSV's
  // data table must match exactly what's currently on screen: a flat
  // "category, duration" table with no crossing, or a real pivot table (one
  // column per crossing category) when one is active, built from the same
  // buildStackedChartData() the chart itself renders from.
  const isCrossingCsv = chartType === 'bar' && crossWith !== 'none';
  const handleExportCsv = () => {
    const csvChartData = isCrossingCsv ? [] : buildSingleDimensionChartData({ summary, dimension, t });
    const crossedData = isCrossingCsv ? buildStackedChartData({ summary, dimension, crossWith, t }) : null;
    const rows = buildDashboardCsvRows({
      t,
      dateRange,
      totalSeconds: summaryStats.totalSeconds,
      billableSeconds: summaryStats.billableSeconds,
      formatDuration,
      chartData: csvChartData,
      crossedData,
    });
    downloadCsv('tableau_de_bord', [t('dashboard.export.pdf_title'), ''], rows);
  };

  const periodPicker = (
    <div className="tw-rounded-xl tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-bg-slate-50 dark:tw-bg-slate-800/60 tw-p-4">
      <div className="tw-flex tw-flex-wrap tw-items-end tw-gap-4">
        <label className="tw-flex tw-flex-col tw-gap-1 tw-text-sm tw-font-medium tw-text-slate-700 dark:tw-text-slate-300" htmlFor="dashboard-date-from">
          {t('dashboard.date_from')}
          <input
            id="dashboard-date-from"
            type="date"
            value={dateRange.from}
            onChange={(event) => setDateFrom(event.target.value)}
            className="tw-rounded-xl tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-px-3 tw-py-2 tw-text-slate-900 dark:tw-bg-slate-800 dark:tw-text-slate-100"
          />
        </label>
        <label className="tw-flex tw-flex-col tw-gap-1 tw-text-sm tw-font-medium tw-text-slate-700 dark:tw-text-slate-300" htmlFor="dashboard-date-to">
          {t('dashboard.date_to')}
          <input
            id="dashboard-date-to"
            type="date"
            value={dateRange.to}
            onChange={(event) => setDateTo(event.target.value)}
            className="tw-rounded-xl tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-px-3 tw-py-2 tw-text-slate-900 dark:tw-bg-slate-800 dark:tw-text-slate-100"
          />
        </label>
        {summaryLoading && <span className="tw-text-sm tw-text-slate-500 dark:tw-text-slate-400">{t('loading')}</span>}
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={!summary}
          className="tw-rounded-xl tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-bg-white dark:tw-bg-slate-800 tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-slate-700 dark:tw-text-slate-200 hover:tw-bg-slate-50 dark:hover:tw-bg-slate-700 disabled:tw-cursor-not-allowed disabled:tw-opacity-50"
        >
          {t('dashboard.export.csv_button')}
        </button>
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={!summary || isPreparingExport}
          className="tw-rounded-xl tw-bg-[#5B8FA8] tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-white hover:tw-bg-[#4A7690] disabled:tw-cursor-not-allowed disabled:tw-opacity-50"
        >
          {isPreparingExport ? t('dashboard.export.pdf_generating') : t('dashboard.export.pdf_button')}
        </button>
      </div>
      {summaryError && <p className="tw-mt-2 tw-text-sm tw-text-rose-600 dark:tw-text-rose-400">{summaryError}</p>}
      {exportError && <p className="tw-mt-2 tw-text-sm tw-text-rose-600 dark:tw-text-rose-400">{exportError}</p>}
      {isSummaryTruncated && (
        <p className="tw-mt-2 tw-rounded-lg tw-bg-amber-50 dark:tw-bg-amber-900/30 tw-px-3 tw-py-2 tw-text-sm tw-text-amber-700 dark:tw-text-amber-300">
          ⚠ {t('dashboard.entries_truncated_warning', { limit: summary.entries_returned })}
        </p>
      )}
    </div>
  );

  return (
    <DashboardLayout summary={summaryStats} canReadAll={canReadAll} totalLabel={t('dashboard.total')} periodPicker={periodPicker} showBillableCard={false}>
      <div className="tw-space-y-6">
        {loading && <p className="tw-text-sm tw-text-[#71838f] dark:tw-text-slate-400">{t('loading')}</p>}
        {error && <p className="tw-text-sm tw-text-[#d64c4c] dark:tw-text-[#f0908f]">{error}</p>}
        {!loading && !error && (
          <>

            <CustomChartWidget summary={summary} />
          </>
        )}
        {isPreparingExport && (
          <>
            {/* Dedicated off-screen clone of the configured chart, captured
                instead of the live on-screen widget above — see the long
                comment on exportConfiguredChartRef for why touching the
                live widget's ResponsiveContainer around every export was
                itself the bug. Reads dimension/chartType/crossWith from the
                same URL the on-screen widget does (useUrlState), so it
                always renders the identical chart, just off-screen and at a
                fixed pixel size. */}
            <div style={{ position: 'absolute', left: '-9999px', top: 0 }} aria-hidden="true">
              {/* height stays 320 to match the wrapping div's own tw-h-[320px]
                  (same as the on-screen widget, never actually the uncertain
                  dimension) — only width was ever driven by an async "100%"
                  measurement, so only it needs a forced number here. */}
              <CustomChartWidget
                summary={summary}
                chartRef={exportConfiguredChartRef}
                forcedSize={{ width: EXPORT_CHART_WIDTH, height: 320 }}
              />
            </div>
            <DashboardExportCharts
              summary={summary}
              trendData={trendData}
              refs={{ project: exportProjectRef, billable: exportBillableRef, trend: exportTrendRef }}
            />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
