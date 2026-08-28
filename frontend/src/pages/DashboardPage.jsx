import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../components/templates/DashboardLayout';
import { getDailyReports, getMyDailyReports, getSummaryReports, getTimeEntries, getWeeklyTimesheet } from '../api/timeflowApi';
import { formatDuration } from '../utils/FormatDuration.js';
import Card from '../components/atoms/Card';
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
const ALERT_DAYS_THRESHOLD = 3;

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

function previousMonthRange(referenceDate = new Date()) {
  const current = startOfMonth(referenceDate);
  const previous = new Date(current.getFullYear(), current.getMonth() - 1, 1);
  return {
    from: [previous.getFullYear(), String(previous.getMonth() + 1).padStart(2, '0'), '01'].join('-'),
    to: [previous.getFullYear(), String(previous.getMonth() + 1).padStart(2, '0'), String(endOfMonth(previous).getDate()).padStart(2, '0')].join('-'),
  };
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

function diffDays(dateA, dateB) {
  const ms = dateB.getTime() - dateA.getTime();
  return Math.floor(ms / 86400000);
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const canReadAll = typeof window !== 'undefined' && window.TIMEFLOW_CAN_READALL === true;
  const canValidate = typeof window !== 'undefined' && window.TIMEFLOW_CAN_VALIDATE === true;
  const [summary, setSummary] = useState(null);
  const [previousSummary, setPreviousSummary] = useState(null);
  const [week, setWeek] = useState({ weekStart: '', weekEnd: '', rows: [] });
  const [allEntries, setAllEntries] = useState([]);
  const [pendingReports, setPendingReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      try {
        if (!isMounted) return;
        setLoading(true);

        const currentMonth = currentMonthRange();
        const previousMonth = previousMonthRange();
        const reportRequest = canReadAll ? getDailyReports({ date_from: currentMonth.from, date_to: currentMonth.to }) : getMyDailyReports({ date_from: currentMonth.from, date_to: currentMonth.to });
        const [weekData, summaryData, previousSummaryData, timeEntriesData, pendingReportsData] = await Promise.all([
          getWeeklyTimesheet(),
          getSummaryReports(1000, currentMonth.from, currentMonth.to),
          getSummaryReports(1000, previousMonth.from, previousMonth.to),
          getTimeEntries(1000),
          reportRequest,
        ]);

        if (!isMounted) return;

        const entries = Array.isArray(timeEntriesData) ? timeEntriesData : [];
        const filteredReports = Array.isArray(pendingReportsData?.reports)
          ? pendingReportsData.reports.filter((report) => Number(report.status ?? 1) === 1)
          : [];

        setSummary(summaryData || null);
        setPreviousSummary(previousSummaryData || null);
        setWeek(weekData || { weekStart: '', weekEnd: '', rows: [] });
        setAllEntries(entries);
        setPendingReports(filteredReports);
      } catch (err) {
        if (!isMounted) return;
        setError(err.message);
        setSummary(null);
        setPreviousSummary(null);
        setWeek({ weekStart: '', weekEnd: '', rows: [] });
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
  }, []);

  const locale = i18n.language === 'ar' ? 'ar-EG' : i18n.language === 'de' ? 'de-DE' : 'fr-FR';
  const noProjectLabel = t('dashboard.no_project');
  const currentMonth = useMemo(() => currentMonthRange(), []);
  const previousMonth = useMemo(() => previousMonthRange(), []);

  const monthlyTotalSeconds = Number(summary?.total_seconds || 0);
  const previousMonthTotalSeconds = Number(previousSummary?.total_seconds || 0);
  const monthDelta = previousMonthTotalSeconds > 0 ? ((monthlyTotalSeconds - previousMonthTotalSeconds) / previousMonthTotalSeconds) * 100 : (monthlyTotalSeconds > 0 ? 100 : 0);

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
    const rangeStart = entryDate(currentMonth.from);
    const rangeEnd = entryDate(currentMonth.to);
    const monthEntries = Array.isArray(allEntries)
      ? allEntries.filter((entry) => {
          const start = entryDate(entry.date_start);
          return !Number.isNaN(start.getTime()) && start >= rangeStart && start <= rangeEnd;
        })
      : [];

    const weeklyMap = new Map();
    for (const entry of monthEntries) {
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
  }, [allEntries, currentMonth, locale]);

  const alerts = useMemo(() => {
    const now = new Date();
    const reportAlerts = Array.isArray(pendingReports)
      ? pendingReports
          .filter((report) => {
            const reportDate = entryDate(report.date_report || report.date_creation || report.date_modification);
            return !Number.isNaN(reportDate.getTime()) && diffDays(reportDate, now) >= ALERT_DAYS_THRESHOLD;
          })
          .map((report) => ({
            id: `report-${report.id}`,
            label: `${report.user_label || t('dashboard.user_fallback', { userId: report.fk_user || 0 })} · ${report.date_report}`,
            detail: t('dashboard.pending_report_alert', { days: ALERT_DAYS_THRESHOLD }),
            tone: 'warning',
          }))
      : [];

    const draftAlerts = Array.isArray(allEntries)
      ? allEntries
          .filter((entry) => Number(entry.status) === 0)
          .filter((entry) => {
            const start = entryDate(entry.date_start);
            return !Number.isNaN(start.getTime()) && diffDays(start, now) >= ALERT_DAYS_THRESHOLD;
          })
          .map((entry) => ({
            id: `draft-${entry.id}`,
            label: `${entry.project_label || t('dashboard.no_project')} · ${entry.note || t('timeentry.no_description')}`,
            detail: t('dashboard.draft_stale_alert', { days: ALERT_DAYS_THRESHOLD }),
            tone: 'neutral',
          }))
      : [];

    return [...reportAlerts, ...draftAlerts].slice(0, 4);
  }, [allEntries, pendingReports, t]);

  const summaryStats = useMemo(() => ({
    totalSeconds: Number(summary?.total_seconds || 0),
    billableSeconds: Number(summary?.billable_seconds || 0),
    submittedCount: Number(summary?.by_status?.[1] ?? summary?.by_status?.['1'] ?? 0),
    validatedCount: Number(summary?.by_status?.[2] ?? summary?.by_status?.['2'] ?? 0),
  }), [summary]);

  return (
    <DashboardLayout summary={summaryStats} canReadAll={canReadAll}>
      <div className="space-y-6">
        {loading && <p className="text-sm text-[#71838f]">{t('loading')}</p>}
        {error && <p className="text-sm text-[#d64c4c]">{error}</p>}
        {!loading && !error && (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card headerLabel={t('dashboard.current_month_total')}>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{formatDuration(monthlyTotalSeconds)}</p>
              </Card>
              <Card headerLabel={t('dashboard.variation_vs_previous')}>
                <div className={`mt-2 text-2xl font-semibold ${monthDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {monthDelta >= 0 ? '+' : ''}{monthDelta.toFixed(1)}%
                </div>
              </Card>
              <Card headerLabel={t('dashboard.pending_reports')}>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{pendingReports.length}</p>
              </Card>
              <Card headerLabel={t('dashboard.period')}>
                <div className="mt-2 text-xl font-semibold text-slate-900">{currentMonth.from} → {currentMonth.to}</div>
              </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{t('dashboard.top_projects')}</p>
                    <h3 className="text-lg font-semibold text-slate-900">{t('dashboard.top_projects_title')}</h3>
                  </div>
                </div>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topProjects} layout="vertical" margin={{ top: 10, right: 20, left: 12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e7edf1" />
                      <XAxis type="number" tickFormatter={(value) => `${Math.round(value / 3600)}h`} tickLine={false} axisLine={{ stroke: '#dce5ea' }} />
                      <YAxis type="category" dataKey="name" width={120} tickLine={false} axisLine={{ stroke: '#dce5ea' }} />
                      <Tooltip formatter={(value) => formatDuration(value)} />
                      <Bar dataKey="value" radius={[0, 8, 8, 0]} fill="#4d5fca">
                        {topProjects.map((entry, index) => <Cell key={entry.id || entry.name} fill={TEAM_CHART_COLORS[index % TEAM_CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{t('dashboard.trend')}</p>
                    <h3 className="text-lg font-semibold text-slate-900">{t('dashboard.weekly_trend')}</h3>
                  </div>
                </div>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weeklyTrendData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e7edf1" />
                      <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#dce5ea' }} />
                      <YAxis tickFormatter={(value) => `${Math.round(value / 3600)}h`} tickLine={false} axisLine={{ stroke: '#dce5ea' }} />
                      <Tooltip formatter={(value) => formatDuration(value)} />
                      <Line type="monotone" dataKey="total" stroke="#5B8FA8" strokeWidth={3} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>

            {canValidate && (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{t('dashboard.alerts')}</p>
                    <h3 className="text-lg font-semibold text-slate-900">{t('dashboard.alerts_title')}</h3>
                  </div>
                  <Link to="/reports" className="text-sm font-medium text-[#5B8FA8] hover:text-[#4A7690]">{t('dashboard.see_all_reports')}</Link>
                </div>
                {alerts.length === 0 ? (
                  <p className="text-sm text-slate-500">{t('dashboard.no_alerts')}</p>
                ) : (
                  <ul className="space-y-3">
                    {alerts.map((alert) => (
                      <li key={alert.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-slate-900">{alert.label}</p>
                            <p className="text-xs text-slate-500">{alert.detail}</p>
                          </div>
                          {alert.tone === 'warning' && (
                            <span className="rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-wide bg-amber-50 text-amber-700">
                              {t('dashboard.warning')}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
