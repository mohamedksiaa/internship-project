import { useEffect, useMemo, useState } from 'react';
import { getMyDailyReports, saveDailyReport } from '../../api/timeflowApi';

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function DailyReportComposer({ showHistory = false, onSaved = () => {} }) {
  const [dateReport, setDateReport] = useState(today);
  const [content, setContent] = useState('');
  const [reports, setReports] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getMyDailyReports()
      .then((items) => setReports(Array.isArray(items) ? items : []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (content.trim() === '') return;
    try {
      setSaving(true);
      setError('');
      if (editingId) {
        const updated = await updateDailyReport(editingId, content.trim());
        setReports((items) => items.map((r) => (r.id === updated.id ? updated : r)));
        setContent('');
        setEditingId(null);
        onSaved(updated);
      } else {
        const saved = await saveDailyReport(dateReport, content.trim());
        setReports((items) => [saved, ...items]);
        setContent('');
        onSaved(saved);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(report) {
    setEditingId(report.id);
    setDateReport(report.date_report);
    setContent(report.content || '');
  }

  async function handleDelete(id) {
    if (!window.confirm('Confirmer la suppression de ce rapport ?')) return;
    try {
      await deleteDailyReport(id);
      setReports((items) => items.filter((r) => r.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="mb-5"><p className="text-sm font-semibold uppercase tracking-[.24em] text-slate-500">Rapport journalier</p><h2 className="text-2xl font-semibold text-slate-900">Mon rapport</h2></div>
    <form onSubmit={submit} className="space-y-4">
      <label className="flex max-w-xs flex-col gap-1 text-sm font-medium text-slate-700">Date
        <input aria-label="Date du rapport" type="date" value={dateReport} onChange={(event) => setDateReport(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">Compte-rendu
        <textarea aria-label="Contenu du rapport" value={content} onChange={(event) => setContent(event.target.value)} rows="7" placeholder="Décrivez ce que vous avez fait aujourd’hui, les points bloquants ou vos remarques…" className="w-full rounded-xl border border-slate-300 px-3 py-2" />
      </label>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button type="submit" disabled={saving || content.trim() === ''} className="rounded-xl bg-[#03a9f4] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Enregistrement…' : 'Envoyer'}</button>
    </form>
    {showHistory && <div className="mt-8 border-t border-slate-200 pt-5"><h3 className="font-semibold text-slate-900">Mes rapports envoyés</h3>{loading ? <p className="mt-3 text-sm text-slate-500">Chargement…</p> : reports.length === 0 ? <p className="mt-3 text-sm text-slate-500">Aucun rapport envoyé.</p> : <div className="mt-3 space-y-3">{reports.map((report) => <article key={report.id} className="rounded-2xl border border-slate-200 p-4"><div className="mb-2 flex items-center justify-between gap-3"><div><strong>{report.date_report}</strong><div className="text-xs text-slate-500">{formatDateTime(report.date_creation || report.date_modification)}</div></div><div className="flex gap-2"><button onClick={() => handleEdit(report)} className="text-sm text-sky-600">Modifier</button><button onClick={() => handleDelete(report.id)} className="text-sm text-rose-600">Supprimer</button></div></div><div className="mb-2"><span className={report.is_read ? 'text-xs text-emerald-700' : 'text-xs text-amber-700'}>{report.is_read ? 'Lu' : 'Envoyé'}</span></div><p className="whitespace-pre-wrap text-sm text-slate-700">{report.content}</p></article>)}</div>}</div>}
  </section>;
}
