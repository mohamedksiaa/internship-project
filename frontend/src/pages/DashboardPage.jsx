import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../components/templates/DashboardLayout';
import { getSummaryReports, getWeeklyTimesheet } from '../api/timeflowApi';
import { formatDuration } from '../utils/FormatDuration.js';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const TEAM_CHART_COLORS = ['#03a9f4', '#4d5fca', '#35a66f', '#f59e0b', '#d66', '#8a9aa4'];

function entryDate(value) {
  if (!value) return new Date(0);
  const raw = String(value);
  return /^[0-9]+$/.test(raw) ? new Date(Number(raw) * (raw.length === 10 ? 1000 : 1)) : new Date(value);
}

function dayLabel(value, locale = 'fr-FR') {
  const date = entryDate(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' });
}

function projectLabel(projectId, projectLabels = {}, fallbackLabel = 'dashboard.no_project') {
  if (!projectId || Number(projectId) <= 0) {
    return fallbackLabel;
  }
  return projectLabels[projectId] || projectLabels[String(projectId)] || `dashboard.project_fallback`;
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const [summary, setSummary] = useState(null);
  const [week, setWeek] = useState({ weekStart: '', weekEnd: '', rows: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      try {
        if (isMounted) {
          setLoading(true);
        }
        // Load weekly timesheet first to get the week range, then request
        // summary reports restricted to the same date range so the "Total
        // semaine" matches the breakdown shown in the chart.
        const weekData = await getWeeklyTimesheet();
        const summaryData = await getSummaryReports(1000, weekData?.weekStart ?? '', weekData?.weekEnd ?? '');
        if (isMounted) {
          setSummary(summaryData || null);
          setWeek(weekData || { weekStart: '', weekEnd: '', rows: [] });
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message);
          setSummary(null);
          setWeek({ weekStart: '', weekEnd: '', rows: [] });
        }
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

  const canReadAll = typeof window !== 'undefined' && window.TIMEFLOW_CAN_READALL === true;
  const locale = i18n.language === 'ar' ? 'ar-EG' : i18n.language === 'de' ? 'de-DE' : 'fr-FR';
  const noProjectLabel = t('dashboard.no_project');

  const weeklyChartData = useMemo(() => {
    const rows = Array.isArray(week.rows) ? week.rows : [];
    const weeklyMap = new Map();
    for (const entry of rows) {
      const dayKey = entry.day || (entry.date_start ? String(entry.date_start).slice(0, 10) : '');
      if (!dayKey) continue;
      if (!weeklyMap.has(dayKey)) {
        weeklyMap.set(dayKey, { day: dayKey, label: dayLabel(dayKey, locale), billable: 0, nonBillable: 0, total: 0 });
      }
      const bucket = weeklyMap.get(dayKey);
      const duration = Number(entry.duration || 0);
      bucket.total += duration;
      if (Number(entry.billable) === 1) {
        bucket.billable += duration;
      } else {
        bucket.nonBillable += duration;
      }
    }
    return Array.from(weeklyMap.values()).sort((left, right) => left.day.localeCompare(right.day));
  }, [week.rows]);

  const projectChartData = useMemo(() => {
    const byProject = summary?.by_project || {};
    const projectLabels = summary?.project_labels || {};
    return Object.entries(byProject)
      .map(([projectId, duration]) => ({
        id: projectId,
        name: projectLabel(projectId, projectLabels, noProjectLabel),
        value: Number(duration || 0),
      }))
      .sort((left, right) => right.value - left.value);
  }, [summary, noProjectLabel]);

  const teamRows = useMemo(() => {
    // Do not compute team aggregation when the current user cannot read all
    // entries — avoids unnecessary work and guarantees no accidental
    // exposure in the UI.
    if (!canReadAll) return [];
    const rows = Array.isArray(week.rows) ? week.rows : [];
    const map = new Map();
    for (const entry of rows) {
      const userId = Number(entry.fk_user) || 0;
      const key = userId > 0 ? String(userId) : '0';
      if (!map.has(key)) {
        map.set(key, {
          key,
          user: entry.user_label || entry.user_name || entry.user_login || (userId > 0 ? t('dashboard.user_fallback', { userId }) : '—'),
          total: 0,
          billable: 0,
          submitted: 0,
          validated: 0,
          entries: 0,
        });
      }
      const row = map.get(key);
      const duration = Number(entry.duration || 0);
      row.total += duration;
      row.entries += 1;
      if (Number(entry.billable) === 1) {
        row.billable += duration;
      }
      if (Number(entry.status) === 1) {
        row.submitted += 1;
      }
      if (Number(entry.status) === 2) {
        row.validated += 1;
      }
    }
    return Array.from(map.values()).sort((left, right) => right.total - left.total);
  }, [week.rows, canReadAll]);

  const summaryStats = useMemo(() => ({
    totalSeconds: Number(summary?.total_seconds || 0),
    billableSeconds: Number(summary?.billable_seconds || 0),
    submittedCount: Number(summary?.by_status?.[1] ?? summary?.by_status?.['1'] ?? 0),
    validatedCount: Number(summary?.by_status?.[2] ?? summary?.by_status?.['2'] ?? 0),
  }), [summary]);

  const dashboardContent = (
    <div className="space-y-6">
      {loading && <p className="text-sm text-[#71838f]">{t('loading')}</p>}
      {error && <p className="text-sm text-[#d64c4c]">{error}</p>}
      {!loading && !error && (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-lg bg-white p-6 shadow-sm border border-gray-200">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8a9aa4]">{t('dashboard.week')}</p>
                  <h3 className="text-lg font-semibold text-[#263746]">{t('dashboard.daily_breakdown')}</h3>
                </div>
                <span className="text-sm text-[#71838f]">{t('dashboard.days', { count: weeklyChartData.length })}</span>
              </div>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7edf1" />
                    <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#dce5ea' }} />
                    <YAxis tickFormatter={(value) => `${Math.round(value / 3600)}h`} tickLine={false} axisLine={{ stroke: '#dce5ea' }} />
                    <Tooltip formatter={(value) => formatDuration(value)} />
                    <Bar dataKey="total" fill="#03a9f4" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="rounded-lg bg-white p-6 shadow-sm border border-gray-200">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8a9aa4]">{t('dashboard.projects')}</p>
                  <h3 className="text-lg font-semibold text-[#263746]">{t('dashboard.project_breakdown')}</h3>
                </div>
                <span className="text-sm text-[#71838f]">{t('dashboard.projects_count', { count: projectChartData.length })}</span>
              </div>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={projectChartData} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7edf1" />
                    <XAxis type="number" tickFormatter={(value) => `${Math.round(value / 3600)}h`} tickLine={false} axisLine={{ stroke: '#dce5ea' }} />
                    <YAxis type="category" dataKey="name" width={120} tickLine={false} axisLine={{ stroke: '#dce5ea' }} />
                    <Tooltip formatter={(value) => formatDuration(value)} />
                    <Bar dataKey="value" fill="#4d5fca" radius={[0, 8, 8, 0]}>
                      {projectChartData.map((entry, index) => <Cell key={entry.id} fill={TEAM_CHART_COLORS[index % TEAM_CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          {canReadAll && (
            <section className="rounded-lg bg-white p-6 shadow-sm border border-gray-200">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8a9aa4]">{t('dashboard.team')}</p>
                  <h3 className="text-lg font-semibold text-[#263746]">{t('dashboard.team_activity')}</h3>
                </div>
                <span className="text-sm text-[#71838f]">{t('dashboard.members', { count: teamRows.length })}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      <th className="border-b border-[#dce5ea] px-4 py-3 text-left font-medium text-[#52656f]">{t('dashboard.collaborator')}</th>
                      <th className="border-b border-[#dce5ea] px-4 py-3 text-left font-medium text-[#52656f]">{t('dashboard.entries')}</th>
                      <th className="border-b border-[#dce5ea] px-4 py-3 text-left font-medium text-[#52656f]">{t('dashboard.total_time')}</th>
                      <th className="border-b border-[#dce5ea] px-4 py-3 text-left font-medium text-[#52656f]">{t('dashboard.billable')}</th>
                      <th className="border-b border-[#dce5ea] px-4 py-3 text-left font-medium text-[#52656f]">{t('dashboard.submitted')}</th>
                      <th className="border-b border-[#dce5ea] px-4 py-3 text-left font-medium text-[#52656f]">{t('dashboard.validated')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamRows.map((row) => (
                      <tr key={row.key}>
                        <td className="border-b border-[#f0f3f5] px-4 py-3 font-medium text-[#263746]">{row.user}</td>
                        <td className="border-b border-[#f0f3f5] px-4 py-3 text-[#52656f]">{row.entries}</td>
                        <td className="border-b border-[#f0f3f5] px-4 py-3 text-[#52656f]">{formatDuration(row.total)}</td>
                        <td className="border-b border-[#f0f3f5] px-4 py-3 text-[#52656f]">{formatDuration(row.billable)}</td>
                        <td className="border-b border-[#f0f3f5] px-4 py-3 text-[#52656f]">{row.submitted}</td>
                        <td className="border-b border-[#f0f3f5] px-4 py-3 text-[#52656f]">{row.validated}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );

  return (
    <DashboardLayout summary={summaryStats} canReadAll={canReadAll}>
      {dashboardContent}
    </DashboardLayout>
  );
}