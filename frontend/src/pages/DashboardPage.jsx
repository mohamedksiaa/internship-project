import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../components/templates/DashboardLayout';
import CustomChartWidget from '../components/organisms/CustomChartWidget';
import { getDailyReports, getMyDailyReports, getSummaryReports, getTimeEntries } from '../api/timeflowApi';
import { formatDuration } from '../utils/FormatDuration.js';
import Card from '../components/atoms/Card';
import useDarkMode from '../hooks/useDarkMode';
import { useUrlDateRange } from '../hooks/useUrlState.js';
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

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

// Fixed window for the "pending reports" alert count: intentionally NOT tied
// to the user-editable date range below — it's a "right now" alert (reports
// awaiting validation for too long), not a historical figure to browse.
const PENDING_REPORTS_WINDOW = currentMonthRange();

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const isDark = useDarkMode();
  const canReadAll = typeof window !== 'undefined' && window.TIMEFLOW_CAN_READALL === true;
  // Same dateFrom/dateTo URL params as ReportsPage — kept in the URL so the
  // period survives a refresh (see src/hooks/useUrlState.js).
  const [dateRange, setDateFrom, setDateTo] = useUrlDateRange(currentMonthRange());
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
        const [timeEntriesData, pendingReportsData] = await Promise.all([
          getTimeEntries(1000),
          reportRequest,
        ]);

        if (!isMounted) return;

        const entries = Array.isArray(timeEntriesData) ? timeEntriesData : [];
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

  const weeklyTrendData = useMemo(() => {
    const rangeStart = entryDate(dateRange.from);
    const rangeEnd = entryDate(dateRange.to);
    const periodEntries = Array.isArray(allEntries)
      ? allEntries.filter((entry) => {
          const start = entryDate(entry.date_start);
          return !Number.isNaN(start.getTime()) && start >= rangeStart && start <= rangeEnd;
        })
      : [];

    const weeklyMap = new Map();
    for (const entry of periodEntries) {
      const start = entryDate(entry.date_start);
      if (Number.isNaN(start.getTime())) continue;
      const day = start.getDay();
      const diff = (day + 6) % 7;
      const startOfWeek = new Date(start);
      startOfWeek.setHours(0, 0, 0, 0);
      startOfWeek.setDate(start.getDate() - diff);
      const key = toIsoDate(startOfWeek);
      if (!weeklyMap.has(key)) {
        weeklyMap.set(key, { weekStart: key, label: `${startOfWeek.toLocaleDateString(locale, { month: 'short', day: 'numeric' })}`, total: 0 });
      }
      weeklyMap.get(key).total += Number(entry.duration || 0);
    }

    return Array.from(weeklyMap.values()).sort((left, right) => left.weekStart.localeCompare(right.weekStart));
  }, [allEntries, dateRange, locale]);

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
      </div>
      {summaryError && <p className="tw-mt-2 tw-text-sm tw-text-rose-600 dark:tw-text-rose-400">{summaryError}</p>}
      {isSummaryTruncated && (
        <p className="tw-mt-2 tw-rounded-lg tw-bg-amber-50 dark:tw-bg-amber-900/30 tw-px-3 tw-py-2 tw-text-sm tw-text-amber-700 dark:tw-text-amber-300">
          ⚠ {t('dashboard.entries_truncated_warning', { limit: summary.entries_returned })}
        </p>
      )}
    </div>
  );

  return (
    <DashboardLayout summary={summaryStats} canReadAll={canReadAll} totalLabel={t('dashboard.total')} periodPicker={periodPicker}>
      <div className="tw-space-y-6">
        {loading && <p className="tw-text-sm tw-text-[#71838f] dark:tw-text-slate-400">{t('loading')}</p>}
        {error && <p className="tw-text-sm tw-text-[#d64c4c] dark:tw-text-[#f0908f]">{error}</p>}
        {!loading && !error && (
          <>

            <CustomChartWidget summary={summary} />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
