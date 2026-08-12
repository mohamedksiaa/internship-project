import { useEffect, useMemo, useState } from 'react';
import { getMyDailyReports, saveDailyReport } from '../../api/clockifyApi';

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function DailyReportComposer({ showHistory = false, onSaved = () => {} }) {
  const [dateReport, setDateReport] = useState(today);
  const [content, setContent] = useState('');
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selectedReport = useMemo(() => reports.find((report) => report.date_report === dateReport), [reports, dateReport]);
  const locked = Boolean(selectedReport?.is_read);

  useEffect(() => {
    getMyDailyReports()
      .then((items) => setReports(Array.isArray(items) ? items : []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setContent(selectedReport?.content || '');
  }, [selectedReport]);

  async function submit(event) {
    event.preventDefault();
    if (locked || content.trim() === '') return;
    try {
      setSaving(true);
      setError('');
      const saved = await saveDailyReport(dateReport, content.trim());
      setReports((items) => [saved, ...items.filter((item) => item.id !== saved.id && item.date_report !== saved.date_report)]);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="mb-5"><p className="text-sm font-semibold uppercase tracking-[.24em] text-slate-500">Rapport journalier</p><h2 className="text-2xl font-semibold text-slate-900">Mon rapport</h2></div>
    <form onSubmit={submit} className="space-y-4">
      <label className="flex max-w-xs flex-col gap-1 text-sm font-medium text-slate-700">Date
        <input aria-label="Date du rapport" type="date" value={dateReport} onChange={(event) => setDateReport(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">Compte-rendu
        <textarea aria-label="Contenu du rapport" value={content} disabled={locked} onChange={(event) => setContent(event.target.value)} rows="7" placeholder="Décrivez ce que vous avez fait aujourd’hui, les points bloquants ou vos remarques…" className="w-full rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100" />
      </label>
      {locked && <p className="text-sm text-amber-700">Ce rapport a déjà été lu par le manager et ne peut plus être modifié.</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button type="submit" disabled={saving || locked || content.trim() === ''} className="rounded-xl bg-[#03a9f4] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Enregistrement…' : selectedReport ? 'Mettre à jour' : 'Envoyer au manager'}</button>
    </form>
    {showHistory && <div className="mt-8 border-t border-slate-200 pt-5"><h3 className="font-semibold text-slate-900">Mes rapports envoyés</h3>{loading ? <p className="mt-3 text-sm text-slate-500">Chargement…</p> : reports.length === 0 ? <p className="mt-3 text-sm text-slate-500">Aucun rapport envoyé.</p> : <div className="mt-3 space-y-3">{reports.map((report) => <article key={report.id} className="rounded-2xl border border-slate-200 p-4"><div className="mb-2 flex items-center justify-between gap-3"><strong>{report.date_report}</strong><span className={report.is_read ? 'text-xs text-emerald-700' : 'text-xs text-amber-700'}>{report.is_read ? 'Lu' : 'Envoyé'}</span></div><p className="whitespace-pre-wrap text-sm text-slate-700">{report.content}</p></article>)}</div>}</div>}
  </section>;
}
