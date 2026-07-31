import { useEffect, useState } from 'react';
import { generateInvoiceLines, getSummaryReports } from '../api/clockifyApi';
import { formatDuration } from '../utils/FormatDuration.js';

function currentMonthRange() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const formatDate = (date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

  return {
    from: formatDate(new Date(year, month, 1)),
    to: formatDate(new Date(year, month + 1, 0)),
  };
}

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState(currentMonthRange);
  const [summary, setSummary] = useState(null);
  const [invoiceLines, setInvoiceLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadReports() {
      try {
        setLoading(true);
        setError('');
        const summaryData = await getSummaryReports(1000, dateRange.from, dateRange.to);
        if (isMounted) {
          setSummary(summaryData);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadReports();
    return () => {
      isMounted = false;
    };
  }, [dateRange]);

  useEffect(() => {
    let isMounted = true;

    generateInvoiceLines()
      .then((invoiceData) => {
        if (isMounted) {
          setInvoiceLines(Array.isArray(invoiceData) ? invoiceData : []);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Rapports</p>
          <h2 className="text-2xl font-semibold text-slate-900">Rapports d&apos;activité</h2>
          <p className="mt-2 text-sm text-slate-600">Sommaire global, répartition billable et lignes exploitables pour la facturation.</p>
        </div>
        <div className="mb-6 flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700" htmlFor="reports-date-from">
            From
            <input
              id="reports-date-from"
              type="date"
              value={dateRange.from}
              onChange={(event) => setDateRange((range) => ({ ...range, from: event.target.value }))}
              className="rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700" htmlFor="reports-date-to">
            To
            <input
              id="reports-date-to"
              type="date"
              value={dateRange.to}
              onChange={(event) => setDateRange((range) => ({ ...range, to: event.target.value }))}
              className="rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
            />
          </label>
        </div>
        {loading && <p className="text-sm text-slate-600">Chargement…</p>}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {!loading && !error && summary && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5"><p className="text-sm font-semibold text-slate-500">Total</p><p className="mt-2 text-2xl font-semibold text-slate-900">{formatDuration(summary.total_seconds)}</p></div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5"><p className="text-sm font-semibold text-slate-500">Billable</p><p className="mt-2 text-2xl font-semibold text-slate-900">{formatDuration(summary.billable_seconds)}</p></div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5"><p className="text-sm font-semibold text-slate-500">Non billable</p><p className="mt-2 text-2xl font-semibold text-slate-900">{formatDuration(summary.non_billable_seconds)}</p></div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5"><p className="text-sm font-semibold text-slate-500">Lignes facture</p><p className="mt-2 text-2xl font-semibold text-slate-900">{invoiceLines.length}</p></div>
          </div>
        )}
        {!loading && !error && summary && (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 p-5">
              <p className="text-sm font-semibold text-slate-500">Par projet</p>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                {Object.entries(summary.by_project || {}).map(([projectId, total]) => <div key={projectId} className="flex items-center justify-between"><span>{summary.project_labels?.[projectId] || `Projet #${projectId}`}</span><strong>{formatDuration(total)}</strong></div>)}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 p-5">
              <p className="text-sm font-semibold text-slate-500">Par tag</p>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                {Object.entries(summary.by_tag || {}).map(([tag, total]) => <div key={tag} className="flex items-center justify-between"><span>{tag}</span><strong>{formatDuration(total)}</strong></div>)}
              </div>
            </div>
          </div>
        )}
        {!loading && !error && invoiceLines.length > 0 && (
          <div className="mt-6">
            <p className="text-sm font-semibold text-slate-500">Préparation de facture</p>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              {invoiceLines.map((line, index) => <div key={`${line.description}-${index}`} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3"><span>{line.description}</span><strong>{line.qty_hours} h</strong></div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
