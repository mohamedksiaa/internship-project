import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useUrlState } from '../../hooks/useUrlState.js';
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
// A stacked bar needs each segment's color to stay distinguishable within a
// single bar, on top of the up-to-9 bars already on the X axis — much
// tighter than the single-dimension MAX_SLICES, or the chart turns into
// unreadable confetti. 5 named segments + one "Autre" bucket stays legible.
const MAX_STACK_SEGMENTS = 5;
const DIMENSIONS = ['project', 'employee', 'client', 'group', 'billable'];
const CHART_TYPES = ['bar', 'pie', 'line'];

// "group" is deliberately never part of this list: an employee can belong to
// several groups at once, so a duration can land in more than one group
// bucket — stacking it (as either axis) would make a bar's segments sum to
// more than its real total. It stays available only as a single dimension.
const CROSSABLE_DIMENSIONS = ['project', 'employee', 'client', 'billable'];

// Fixed priority order matching the composite dictionary keys the backend
// builds in timeflowBuildSummary() (by_project_employee, by_project_client,
// by_project_billable, by_employee_client, by_employee_billable,
// by_client_billable) — each pair is computed once server-side in this exact
// order, so the pivot below must parse "a|b" keys using the same order.
const DIMENSION_PRIORITY = ['project', 'employee', 'client', 'billable'];

export function pairFieldFor(dimA, dimB) {
  const [first, second] = DIMENSION_PRIORITY.indexOf(dimA) < DIMENSION_PRIORITY.indexOf(dimB) ? [dimA, dimB] : [dimB, dimA];
  return { field: `by_${first}_${second}`, order: [first, second] };
}

const LABEL_MAP_KEY_BY_DIMENSION = { client: 'client_labels', employee: 'user_labels', project: 'project_labels', group: 'group_labels' };

export function labelForDimValue(dim, rawKey, summary, t) {
  if (dim === 'billable') {
    return rawKey === '1' ? t('dashboard.billable_label') : t('dashboard.non_billable_label');
  }
  const fallbackLabelByDimension = {
    client: t('dashboard.no_client'),
    employee: t('dashboard.user_fallback', { userId: 0 }),
    project: t('dashboard.no_project'),
    group: t('dashboard.no_group'),
  };
  const labels = summary[LABEL_MAP_KEY_BY_DIMENSION[dim]] || {};
  return rawKey === '0' ? fallbackLabelByDimension[dim] : (labels[rawKey] || `#${rawKey}`);
}

/**
 * Pivots a composite "by_A_B" dictionary (flat "<a>|<b>" -> seconds map) into
 * the row-per-primary-category shape recharts' stacked <Bar> needs, applying
 * the same top-K + "Autre" bucketing on BOTH axes independently — the
 * secondary/stack top-K is computed once over the WHOLE dataset (not per
 * bar), so a given category always lands in the same segment position/color
 * across every bar, never per-bar-relative ranking.
 */
export function buildStackedChartData({ summary, dimension, crossWith, t }) {
  const { field, order } = pairFieldFor(dimension, crossWith);
  const composite = summary[field] || {};
  const primaryIsFirstInPair = order[0] === dimension;

  const primaryTotals = new Map();
  const secondaryTotals = new Map();
  const grid = new Map(); // primaryKey -> Map(secondaryKey -> seconds)

  Object.entries(composite).forEach(([pairKey, seconds]) => {
    const value = Number(seconds || 0);
    if (value <= 0) return;
    const [a, b] = pairKey.split('|');
    const primaryKey = primaryIsFirstInPair ? a : b;
    const secondaryKey = primaryIsFirstInPair ? b : a;

    primaryTotals.set(primaryKey, (primaryTotals.get(primaryKey) || 0) + value);
    secondaryTotals.set(secondaryKey, (secondaryTotals.get(secondaryKey) || 0) + value);
    if (!grid.has(primaryKey)) grid.set(primaryKey, new Map());
    const row = grid.get(primaryKey);
    row.set(secondaryKey, (row.get(secondaryKey) || 0) + value);
  });

  // Secondary (stack) top-K — skipped for "billable": fixed at 2 categories,
  // never worth bucketing into "Autre".
  let secondaryOrdered = [...secondaryTotals.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key);
  let secondaryOther = [];
  if (crossWith !== 'billable' && secondaryOrdered.length > MAX_STACK_SEGMENTS) {
    secondaryOther = secondaryOrdered.slice(MAX_STACK_SEGMENTS - 1);
    secondaryOrdered = secondaryOrdered.slice(0, MAX_STACK_SEGMENTS - 1);
  }
  const secondaryOtherSet = new Set(secondaryOther);

  // Primary (X axis) top-K — same MAX_SLICES policy as the single-dimension chart.
  let primaryOrdered = [...primaryTotals.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key);
  let primaryOther = [];
  if (primaryOrdered.length > MAX_SLICES) {
    primaryOther = primaryOrdered.slice(MAX_SLICES - 1);
    primaryOrdered = primaryOrdered.slice(0, MAX_SLICES - 1);
  }
  const primaryOtherSet = new Set(primaryOther);

  const rowAccumulators = new Map();
  grid.forEach((secMap, primaryKey) => {
    const rowKey = primaryOtherSet.has(primaryKey) ? '__other_primary__' : primaryKey;
    if (!rowAccumulators.has(rowKey)) rowAccumulators.set(rowKey, new Map());
    const rowAcc = rowAccumulators.get(rowKey);
    secMap.forEach((value, secondaryKey) => {
      const segKey = secondaryOtherSet.has(secondaryKey) ? '__other_secondary__' : secondaryKey;
      rowAcc.set(segKey, (rowAcc.get(segKey) || 0) + value);
    });
  });

  const orderedPrimaryKeys = primaryOther.length > 0 ? [...primaryOrdered, '__other_primary__'] : primaryOrdered;
  const segmentOrder = secondaryOther.length > 0 ? [...secondaryOrdered, '__other_secondary__'] : secondaryOrdered;

  const rows = orderedPrimaryKeys.map((primaryKey) => {
    const rowAcc = rowAccumulators.get(primaryKey) || new Map();
    const row = {
      key: primaryKey,
      label: primaryKey === '__other_primary__' ? t('dashboard.other_bucket') : labelForDimValue(dimension, primaryKey, summary, t),
    };
    segmentOrder.forEach((segKey) => {
      row[`seg_${segKey}`] = rowAcc.get(segKey) || 0;
    });
    return row;
  });

  const segments = segmentOrder.map((segKey) => ({
    dataKey: `seg_${segKey}`,
    label: segKey === '__other_secondary__' ? t('dashboard.other_bucket') : labelForDimValue(crossWith, segKey, summary, t),
  }));

  return { rows, segments };
}

// Recharts auto-picks evenly spaced Y-axis ticks (e.g. 0/1800/3600/5400/7200s
// for a ~2h range) that don't always land on whole hours. Rounding straight
// to the nearest hour collapsed distinct ticks onto the same label (1800s and
// 3600s both became "1h"), so this keeps the minutes whenever they're non-zero.
function formatHoursTick(seconds) {
  const totalMinutes = Math.round(Number(seconds) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h${String(minutes).padStart(2, '0')}`;
}

/**
 * Renders one of summary's "by_X" breakdowns as a bar/pie/line chart, picked
 * by the user. Reuses the same getSummaryReports payload that feeds the
 * period cards above — no extra network call for this widget.
 */
export default function CustomChartWidget({ summary }) {
  const { t } = useTranslation();
  const isDark = useDarkMode();
  // Kept in the URL (?dimension=&chartType=) rather than local state — this
  // widget lives on the dashboard, itself a descendant of the app's
  // HashRouter, so useUrlState works here with no prop drilling needed.
  const [dimension, setDimension] = useUrlState('dimension', 'project');
  const [chartType, setChartType] = useUrlState('chartType', 'bar');
  const [crossWith, setCrossWith] = useUrlState('crossWith', 'none');

  // "Croiser avec" only makes sense for a stacked BAR chart, and never for
  // "group" (see CROSSABLE_DIMENSIONS) or crossed with itself — reset it the
  // moment the primary selection makes it invalid, instead of silently
  // ignoring a selector value the user can still see selected.
  const handleDimensionChange = (nextDimension) => {
    setDimension(nextDimension);
    if (nextDimension === 'group' || crossWith === nextDimension) {
      setCrossWith('none');
    }
  };
  const canCrossDimension = dimension !== 'group';
  const isCrossing = canCrossDimension && chartType === 'bar' && crossWith !== 'none';

  const stackedChartData = useMemo(() => {
    if (!summary || !isCrossing) return null;
    return buildStackedChartData({ summary, dimension, crossWith, t });
  }, [summary, dimension, crossWith, isCrossing, t]);

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
            onChange={(event) => handleDimensionChange(event.target.value)}
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
        {canCrossDimension && chartType === 'bar' && (
          <label className="tw-flex tw-flex-col tw-gap-1 tw-text-sm tw-font-medium tw-text-slate-700 dark:tw-text-slate-300">
            {t('dashboard.cross_with_label')}
            <select
              value={crossWith}
              onChange={(event) => setCrossWith(event.target.value)}
              className="tw-rounded-xl tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-px-3 tw-py-2 dark:tw-bg-slate-800 dark:tw-text-slate-100"
            >
              <option value="none">{t('dashboard.cross_with_none')}</option>
              {CROSSABLE_DIMENSIONS.filter((dim) => dim !== dimension).map((dim) => (
                <option key={dim} value={dim}>{t(`dashboard.dimension.${dim}`)}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {isCrossing ? (
        stackedChartData === null || stackedChartData.rows.length === 0 ? (
          <p className="tw-text-sm tw-text-slate-500 dark:tw-text-slate-400">{t('dashboard.custom_chart_empty')}</p>
        ) : (
          <div className="tw-h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stackedChartData.rows} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: axisColor }} tick={{ fill: tickColor, fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tickFormatter={formatHoursTick} tickLine={false} axisLine={{ stroke: axisColor }} tick={{ fill: tickColor }} />
                <Tooltip formatter={(value) => formatDuration(value)} contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ color: tickColor, fontSize: 12 }} />
                {stackedChartData.segments.map((segment, index) => (
                  <Bar key={segment.dataKey} dataKey={segment.dataKey} name={segment.label} stackId="cross" fill={CHART_COLORS[index % CHART_COLORS.length]} radius={index === stackedChartData.segments.length - 1 ? [8, 8, 0, 0] : undefined} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      ) : chartData.length === 0 ? (
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
                <YAxis tickFormatter={formatHoursTick} tickLine={false} axisLine={{ stroke: axisColor }} tick={{ fill: tickColor }} />
                <Tooltip formatter={(value) => formatDuration(value)} contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="value" stroke="#5B8FA8" strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            ) : (
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: axisColor }} tick={{ fill: tickColor, fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tickFormatter={formatHoursTick} tickLine={false} axisLine={{ stroke: axisColor }} tick={{ fill: tickColor }} />
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
