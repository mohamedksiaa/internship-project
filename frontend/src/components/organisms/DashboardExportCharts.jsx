import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, Tooltip, XAxis, YAxis } from 'recharts';
import { buildSingleDimensionChartData, formatHoursTick } from './CustomChartWidget.jsx';
import { formatDuration } from '../../utils/FormatDuration.js';
import useDarkMode from '../../hooks/useDarkMode';

const CHART_COLORS = ['#5B8FA8', '#4d5fca', '#35a66f', '#f59e0b', '#ef4444', '#9c27b0', '#8a9aa4', '#c084e0', '#6b7fe0', '#2a9d8f'];
// Exported so DashboardPage.jsx's off-screen "configured chart" clone (see
// its own handleExportPdf) uses the exact same pixel size as these 3 fixed
// views — one consistent image size across every chart in the PDF, instead
// of a second, divergent set of numbers.
export const EXPORT_CHART_WIDTH = 800;
export const EXPORT_CHART_HEIGHT = 360;
const EXPORT_CHART_PADDING = 16;
// <ResponsiveContainer> (used everywhere else in this app) only knows its
// size once a ResizeObserver fires — asynchronous by nature, since it can
// only measure after the DOM has actually been laid out. On the very first
// export of a session, that first callback can arrive late enough to lose
// the race against the fixed settle-delay in DashboardPage's
// handleExportPdf, and recharts warns "width(0) and height(0)" and renders
// nothing for that frame (confirmed via a real browser: the warning appears
// exactly at first-click time, only for these off-screen charts). These 3
// charts are never resized in response to anything — they're mounted once,
// off-screen, purely to be rasterized — so there is no reason to depend on
// ResponsiveContainer's async measurement at all: give the chart components
// their pixel size directly (a prop recharts supports natively), which is
// known synchronously from the very first render, no observer involved.
const EXPORT_CHART_INNER_WIDTH = EXPORT_CHART_WIDTH - EXPORT_CHART_PADDING * 2;
const EXPORT_CHART_INNER_HEIGHT = EXPORT_CHART_HEIGHT - EXPORT_CHART_PADDING * 2;

// Rendered off-screen (position: absolute; left: -9999px — still laid out
// normally, unlike display:none, which html2canvas cannot capture) purely so
// the PDF export flow (DashboardPage.jsx) has real chart DOM to rasterize
// for the 3 fixed views. Never shown to the user. All 3 views always mount
// here regardless of redundancy — the caller decides which captured image
// to actually use; skipping the render for the redundant one would save
// very little for meaningfully more branching.
export default function DashboardExportCharts({ summary, trendData, refs }) {
  const { t } = useTranslation();
  const isDark = useDarkMode();
  const axisColor = isDark ? '#334155' : '#dce5ea';
  const tickColor = isDark ? '#94a3b8' : '#334155';
  const gridColor = isDark ? '#232d42' : '#e7edf1';
  const bg = isDark ? '#0f172a' : '#ffffff';

  const projectData = buildSingleDimensionChartData({ summary, dimension: 'project', t });
  const billableData = buildSingleDimensionChartData({ summary, dimension: 'billable', t });

  const wrapperStyle = { width: EXPORT_CHART_WIDTH, height: EXPORT_CHART_HEIGHT, background: bg, padding: EXPORT_CHART_PADDING };

  return (
    <div style={{ position: 'absolute', left: '-9999px', top: 0, width: EXPORT_CHART_WIDTH }} aria-hidden="true">
      <div ref={refs.project} style={wrapperStyle}>
        <BarChart width={EXPORT_CHART_INNER_WIDTH} height={EXPORT_CHART_INNER_HEIGHT} data={projectData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: axisColor }} tick={{ fill: tickColor, fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
          <YAxis tickFormatter={formatHoursTick} tickLine={false} axisLine={{ stroke: axisColor }} tick={{ fill: tickColor }} />
          <Tooltip formatter={(value) => formatDuration(value)} />
          <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#4d5fca" isAnimationActive={false}>
            {projectData.map((entry, index) => <Cell key={entry.key} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
          </Bar>
        </BarChart>
      </div>
      <div ref={refs.billable} style={wrapperStyle}>
        <PieChart width={EXPORT_CHART_INNER_WIDTH} height={EXPORT_CHART_INNER_HEIGHT}>
          <Tooltip formatter={(value) => formatDuration(value)} />
          <Legend wrapperStyle={{ color: tickColor, fontSize: 12 }} />
          {/* endAngle stops just short of a full 360° sweep — see the same
              fix in CustomChartWidget.jsx for why an exact 100%/0% split
              (e.g. no billable time at all in the period) needs this.
              isAnimationActive=false: this chart is captured by
              html2canvas a fixed, short delay after mounting (see
              DashboardPage's handleExportPdf) — with the mount animation
              left on, a single-category pie's Sector path renders empty
              for its entire animation (confirmed via a real headless
              capture, not assumed), so the export would show a blank
              circle regardless of the settle delay's length. */}
          <Pie data={billableData} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={110} startAngle={0} endAngle={359.999} label={(entry) => entry.label} isAnimationActive={false}>
            {billableData.map((entry, index) => <Cell key={entry.key} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
          </Pie>
        </PieChart>
      </div>
      <div ref={refs.trend} style={wrapperStyle}>
        <LineChart width={EXPORT_CHART_INNER_WIDTH} height={EXPORT_CHART_INNER_HEIGHT} data={trendData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: axisColor }} tick={{ fill: tickColor, fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
          <YAxis tickFormatter={formatHoursTick} tickLine={false} axisLine={{ stroke: axisColor }} tick={{ fill: tickColor }} />
          <Tooltip formatter={(value) => formatDuration(value)} />
          <Line type="monotone" dataKey="total" stroke="#5B8FA8" strokeWidth={3} dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </div>
    </div>
  );
}
