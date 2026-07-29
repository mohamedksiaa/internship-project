import { useEffect, useState } from 'react';
import { generateInvoiceLines, getSummaryReports } from '../api/clockifyApi';
import { formatDuration } from '../utils/FormatDuration.js';

export default function ReportsPage() {
  const [summary, setSummary] = useState(null);
  const [invoiceLines, setInvoiceLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadReports() {
      try {
        const [summaryData, invoiceData] = await Promise.all([getSummaryReports(), generateInvoiceLines()]);
        if (isMounted) {
          setSummary(summaryData);
          setInvoiceLines(Array.isArray(invoiceData) ? invoiceData : []);
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
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Rapports</p>
          <h2 className="text-2xl font-semibold text-slate-900">Rapports d&apos;activité</h2>
          <p className="mt-2 text-sm text-slate-600">Sommaire global, répartition billable et lignes exploitables pour la facturation.</p>
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
                {Object.entries(summary.by_project || {}).map(([projectId, total]) => <div key={projectId} className="flex items-center justify-between"><span>Projet #{projectId}</span><strong>{formatDuration(total)}</strong></div>)}
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
