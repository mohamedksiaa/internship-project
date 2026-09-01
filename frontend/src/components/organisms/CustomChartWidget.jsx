import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Card from '../atoms/Card';
import useDarkMode from '../../hooks/useDarkMode';
import { formatDuration } from '../../utils/FormatDuration.js';

const CHART_COLORS = ['#5B8FA8', '#4d5fca', '#35a66f', '#f59e0b', '#ef4444', '#9c27b0', '#8a9aa4', '#c084e0', '#6b7fe0', '#2a9d8f'];
const MAX_SLICES = 9;
const DIMENSIONS = ['project', 'employee', 'client', 'group', 'billable'];
const CHART_TYPES = ['bar', 'pie', 'line'];

/**
 * Renders one of summary's "by_X" breakdowns as a bar/pie/line chart, picked
 * by the user. Reuses the same getSummaryReports payload that feeds the
 * period cards above — no extra network call for this widget.
 */
export default function CustomChartWidget({ summary }) {
  const { t } = useTranslation();
  const isDark = useDarkMode();
  const [dimension, setDimension] = useState('project');
  const [chartType, setChartType] = useState('bar');

  const chartData = useMemo(() => {
    if (!summary) return [];

    if (dimension === 'billable') {
      return [
        { key: 'billable', label: t('dashboard.billable_label'), value: Number(summary.billable_seconds || 0) },
        { key: 'non_billable', label: t('dashboard.non_billable_label'), value: Number(summary.non_billable_seconds || 0) },
      ].filter((row) => row.value > 0);
    }

    const mapKeyByDimension = { client: 'by_client', employee: 'by_user', project: 'by_project', group: 'by_group' };
    const labelMapKeyByDimension = { client: 'client_labels', employee: 'user_labels', project: 'project_labels', group: 'group_labels' };
    const fallbackLabelByDimension = {
      client: t('dashboard.no_client'),
      employee: t('dashboard.user_fallback', { userId: 0 }),
      project: t('dashboard.no_project'),
      group: t('dashboard.no_group'),
    };

    const byX = summary[mapKeyByDimension[dimension]] || {};
    const labels = summary[labelMapKeyByDimension[dimension]] || {};

    const rows = Object.entries(byX)
      .map(([key, seconds]) => ({
        key,
        label: key === '0' ? fallbackLabelByDimension[dimension] : (labels[key] || `#${key}`),
        value: Number(seconds || 0),
      }))
      .filter((row) => row.value > 0)
      .sort((left, right) => right.value - left.value);

    if (rows.length <= MAX_SLICES) return rows;
    const top = rows.slice(0, MAX_SLICES - 1);
    const otherTotal = rows.slice(MAX_SLICES - 1).reduce((sum, row) => sum + row.value, 0);
    return [...top, { key: 'other', label: t('dashboard.other_bucket'), value: otherTotal }];
  }, [summary, dimension, t]);

  const axisColor = isDark ? '#334155' : '#dce5ea';
  const tickColor = isDark ? '#94a3b8' : '#334155';
  const gridColor = isDark ? '#232d42' : '#e7edf1';
  const tooltipStyle = isDark ? { background: '#141b2d', border: '1px solid #334155', color: '#e2e8f0' } : undefined;

  return (
    <Card size="section" headerLabel={t('dashboard.custom_chart_section')} title={t('dashboard.custom_chart_title')}>
      <div className="tw-mb-4 tw-flex tw-flex-wrap tw-gap-4">
        <label className="tw-flex tw-flex-col tw-gap-1 tw-text-sm tw-font-medium tw-text-slate-700 dark:tw-text-slate-300">
          {t('dashboard.dimension_label')}
          <select
            value={dimension}
            onChange={(event) => setDimension(event.target.value)}
            className="tw-rounded-xl tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-px-3 tw-py-2 dark:tw-bg-slate-800 dark:tw-text-slate-100"
          >
            {DIMENSIONS.map((dim) => <option key={dim} value={dim}>{t(`dashboard.dimension.${dim}`)}</option>)}
          </select>
        </label>
        <label className="tw-flex tw-flex-col tw-gap-1 tw-text-sm tw-font-medium tw-text-slate-700 dark:tw-text-slate-300">
          {t('dashboard.chart_type_label')}
          <select
            value={chartType}
            onChange={(event) => setChartType(event.target.value)}
            className="tw-rounded-xl tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-px-3 tw-py-2 dark:tw-bg-slate-800 dark:tw-text-slate-100"
          >
            {CHART_TYPES.map((type) => <option key={type} value={type}>{t(`dashboard.chart_type.${type}`)}</option>)}
          </select>
        </label>
      </div>

      {chartData.length === 0 ? (
        <p className="tw-text-sm tw-text-slate-500 dark:tw-text-slate-400">{t('dashboard.custom_chart_empty')}</p>
      ) : (
        <div className="tw-h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'pie' ? (
              <PieChart>
                <Tooltip formatter={(value) => formatDuration(value)} contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ color: tickColor, fontSize: 12 }} />
                <Pie data={chartData} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={110} label={(entry) => entry.label}>
                  {chartData.map((entry, index) => <Cell key={entry.key} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                </Pie>
              </PieChart>
            ) : chartType === 'line' ? (
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: axisColor }} tick={{ fill: tickColor, fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tickFormatter={(value) => `${Math.round(value / 3600)}h`} tickLine={false} axisLine={{ stroke: axisColor }} tick={{ fill: tickColor }} />
                <Tooltip formatter={(value) => formatDuration(value)} contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="value" stroke="#5B8FA8" strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            ) : (
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: axisColor }} tick={{ fill: tickColor, fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tickFormatter={(value) => `${Math.round(value / 3600)}h`} tickLine={false} axisLine={{ stroke: axisColor }} tick={{ fill: tickColor }} />
                <Tooltip formatter={(value) => formatDuration(value)} contentStyle={tooltipStyle} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#4d5fca">
                  {chartData.map((entry, index) => <Cell key={entry.key} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
