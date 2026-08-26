import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deleteDailyReport, getMyDailyReports, saveDailyReport, updateDailyReport } from '../../api/timeflowApi';
import StatusBadge from '../atoms/StatusBadge';
import ReadDailyReportModal from '../molecules/ReadDailyReportModal';
import { isManuallyModifiedRecord, ModifiedManuallyBadge } from './TimeEntryList';

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

export default function DailyReportComposer({ onSaved = () => {} }) {
  const { t } = useTranslation();
  const [dateReport, setDateReport] = useState(today);
  const [content, setContent] = useState('');
  const [reports, setReports] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getMyDailyReports()
      .then((items) => {
        const activeItems = Array.isArray(items)
          ? items.filter((report) => {
              if (report.is_deleted) return false;
              const status = Number(report.status ?? 1);
              if (status === 2) {
                const processedAt = report.date_validated_at || report.read_at || report.date_modification || report.date_creation;
                if (!processedAt) return true;
                const processedTs = new Date(processedAt).getTime();
                if (!Number.isNaN(processedTs) && Date.now() - processedTs > 24 * 60 * 60 * 1000) {
                  return false;
                }
              }
              return true;
            })
          : [];
        setReports(activeItems);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function submit(event, status = 1) {
    event.preventDefault();
    const trimmed = content.trim();
    if (trimmed === '') return;
    try {
      setSaving(true);
      setError('');
      if (editingId) {
        const updated = await updateDailyReport(editingId, trimmed, status);
        setReports((items) => items.map((r) => (Number(r.id) === Number(updated.id) ? { ...r, ...updated, status: updated.status ?? r.status } : r)));
        setContent('');
        setEditingId(null);
        onSaved(updated);
      } else {
        const saved = await saveDailyReport(dateReport, trimmed, status);
        setReports((items) => [{ ...saved, status: saved.status ?? status }, ...items]);
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
    if (!report || Number(report.status ?? 1) === 2) return;
    setEditingId(report.id);
    setDateReport(report.date_report);
    setContent(report.content || '');
  }

  async function handleSend(report) {
    if (!report || Number(report.status ?? 1) !== 0) return;
    try {
      setError('');
      const updated = await updateDailyReport(report.id, (report.content || '').trim(), 1);
      setReports((items) => items.map((item) => (Number(item.id) === Number(updated.id || report.id)
        ? { ...item, ...updated, status: updated.status ?? 1 }
        : item)));
      if (Number(editingId) === Number(report.id)) {
        setEditingId(null);
        setDateReport(today());
        setContent('');
      }
      onSaved(updated);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(report) {
    if (!report || Number(report.status ?? 1) !== 0) {
      return;
    }
    const confirmed = window.confirm(t('daily_report.delete_confirm'));
    if (!confirmed) {
      return;
    }
    try {
      setError('');
      await deleteDailyReport(report.id);
      setReports((items) => items.filter((item) => Number(item.id) !== Number(report.id)));
      if (Number(editingId) === Number(report.id)) {
        setEditingId(null);
        setDateReport(today());
        setContent('');
      }
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5"><p className="text-sm font-semibold uppercase tracking-[.24em] text-slate-500">{t('daily_report.section_title')}</p><h2 className="text-2xl font-semibold text-slate-900">{t('daily_report.heading')}</h2></div>
        <form onSubmit={(event) => submit(event, 1)} className="space-y-4">
          <label className="flex max-w-xs flex-col gap-1 text-sm font-medium text-slate-700">{t('daily_report.date_label')}
            <input aria-label={t('daily_report.date_aria')} type="date" value={dateReport} onChange={(event) => setDateReport(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">{t('daily_report.content_label')}
            <textarea aria-label={t('daily_report.content_aria')} value={content} onChange={(event) => setContent(event.target.value)} rows="7" placeholder={t('daily_report.placeholder')} className="w-full rounded-xl border border-slate-300 px-3 py-2" />
          </label>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={(event) => submit(event, 0)} disabled={saving || content.trim() === ''} className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">{saving ? t('daily_report.saving') : 'Enregistrer comme brouillon'}</button>
            <button type="submit" disabled={saving || content.trim() === ''} className="rounded-xl bg-[#03a9f4] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? t('daily_report.saving') : t('daily_report.save')}</button>
          </div>
        </form>
        <div className="mt-8 border-t border-slate-200 pt-5"><h3 className="font-semibold text-slate-900">{t('daily_report.history_title')}</h3>{loading ? <p className="mt-3 text-sm text-slate-500">{t('daily_report.loading')}</p> : reports.length === 0 ? <p className="mt-3 text-sm text-slate-500">{t('daily_report.empty')}</p> : <div className="mt-3 space-y-3">{reports.map((report) => <article key={report.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><strong className="block text-sm font-semibold text-slate-900">{report.date_report}</strong><div className="text-xs text-slate-500">{formatDateTime(report.date_creation || report.date_modification)}</div></div><div className="flex items-center gap-2"><StatusBadge status={Number(report.status ?? 1)} />{isManuallyModifiedRecord(report.date_creation, report.date_last_content_edit) && <ModifiedManuallyBadge title="Temps corrigé et tracé" />}</div></div><div className="mt-3 flex items-center justify-between gap-3"><div className="flex-1" /> <div className="flex flex-wrap items-center justify-end gap-2"> <button type="button" onClick={() => setSelectedReport(report)} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100">{t('daily_report.read_report')}</button>{Number(report.status ?? 1) !== 2 && <button type="button" onClick={() => handleEdit(report)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100">{t('daily_report.edit')}</button>}{Number(report.status ?? 1) === 0 && <button type="button" onClick={() => handleSend(report)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100">{t('daily_report.send_report')}</button>}{Number(report.status ?? 1) === 0 && <button type="button" onClick={() => handleDelete(report)} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100">{t('daily_report.delete')}</button>}</div></div></article>)}</div>}</div>
      </section>
      {selectedReport && <ReadDailyReportModal report={selectedReport} onClose={() => setSelectedReport(null)} />}
    </>
  );
}
