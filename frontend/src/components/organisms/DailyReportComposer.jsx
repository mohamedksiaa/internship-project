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

function isDraftExpired(report) {
  return Number(report?.status ?? 1) === 0
    && Date.now() - new Date(report.date_creation).getTime() > 24 * 60 * 60 * 1000;
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
    if (!report || Number(report.status ?? 1) === 2 || isDraftExpired(report)) return;
    setEditingId(report.id);
    setDateReport(report.date_report);
    setContent(report.content || '');
  }

  async function handleSend(report) {
    if (!report || Number(report.status ?? 1) !== 0 || isDraftExpired(report)) return;
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
    if (!report || Number(report.status ?? 1) !== 0 || isDraftExpired(report)) {
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
      <section className="tw-rounded-3xl tw-border tw-border-slate-200 tw-bg-white tw-p-6 tw-shadow-sm">
        <div className="tw-mb-5"><p className="tw-text-sm tw-font-semibold tw-uppercase tw-tracking-[.24em] tw-text-slate-500">{t('daily_report.section_title')}</p><h2 className="tw-text-2xl tw-font-semibold tw-text-slate-900">{t('daily_report.heading')}</h2></div>
        <form onSubmit={(event) => submit(event, 1)} className="tw-space-y-4">
          <label className="tw-flex tw-max-w-xs tw-flex-col tw-gap-1 tw-text-sm tw-font-medium tw-text-slate-700">{t('daily_report.date_label')}
            <input aria-label={t('daily_report.date_aria')} type="date" value={dateReport} onChange={(event) => setDateReport(event.target.value)} className="tw-rounded-xl tw-border tw-border-slate-300 tw-px-3 tw-py-2" />
          </label>
          <label className="tw-flex tw-flex-col tw-gap-1 tw-text-sm tw-font-medium tw-text-slate-700">{t('daily_report.content_label')}
            <textarea aria-label={t('daily_report.content_aria')} value={content} onChange={(event) => setContent(event.target.value)} rows="7" placeholder={t('daily_report.placeholder')} className="tw-w-full tw-rounded-xl tw-border tw-border-slate-300 tw-px-3 tw-py-2" />
          </label>
          {error && <p className="tw-text-sm tw-text-rose-600">{error}</p>}
          <div className="tw-flex tw-flex-wrap tw-gap-3">
            <button type="button" onClick={(event) => submit(event, 0)} disabled={saving || content.trim() === ''} className="tw-rounded-xl tw-border tw-border-slate-300 tw-bg-white tw-px-5 tw-py-2.5 tw-text-sm tw-font-semibold tw-text-slate-700 tw-disabled:opacity-50">{saving ? t('daily_report.saving') : 'Enregistrer comme brouillon'}</button>
            <button type="submit" disabled={saving || content.trim() === ''} className="tw-rounded-xl tw-bg-[#5B8FA8] tw-px-5 tw-py-2.5 tw-text-sm tw-font-semibold tw-text-white tw-disabled:opacity-50">{saving ? t('daily_report.saving') : t('daily_report.save')}</button>
          </div>
        </form>
        <div className="tw-mt-8 tw-border-t tw-border-slate-200 tw-pt-5"><h3 className="tw-font-semibold tw-text-slate-900">{t('daily_report.history_title')}</h3>{loading ? <p className="tw-mt-3 tw-text-sm tw-text-slate-500">{t('daily_report.loading')}</p> : reports.length === 0 ? <p className="tw-mt-3 tw-text-sm tw-text-slate-500">{t('daily_report.empty')}</p> : <div className="tw-mt-3 tw-space-y-3">{reports.map((report) => <article key={report.id} className="tw-rounded-2xl tw-border tw-border-slate-200 tw-p-4"><div className="tw-flex tw-items-center tw-justify-between tw-gap-3"><div className="tw-min-w-0"><strong className="tw-block tw-text-sm tw-font-semibold tw-text-slate-900">{report.date_report}</strong><div className="tw-text-xs tw-text-slate-500">{formatDateTime(report.date_creation || report.date_modification)}</div></div><div className="tw-flex tw-items-center tw-gap-2"><StatusBadge status={Number(report.status ?? 1)} />{isManuallyModifiedRecord(report.date_creation, report.date_last_content_edit) && <ModifiedManuallyBadge title="Temps corrigé et tracé" />}</div></div><div className="tw-mt-3 tw-flex tw-items-center tw-justify-between tw-gap-3"><div className="tw-flex-1" /> <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-end tw-gap-2"> <button type="button" onClick={() => setSelectedReport(report)} className="tw-rounded-lg tw-border tw-border-sky-200 tw-bg-sky-50 tw-px-3 tw-py-1.5 tw-text-xs tw-font-medium tw-text-sky-700 tw-hover:bg-sky-100">{t('daily_report.read_report')}</button>{Number(report.status ?? 1) !== 2 && !isDraftExpired(report) && <button type="button" onClick={() => handleEdit(report)} className="tw-rounded-lg tw-border tw-border-slate-200 tw-bg-slate-50 tw-px-3 tw-py-1.5 tw-text-xs tw-font-medium tw-text-slate-700 tw-hover:bg-slate-100">{t('daily_report.edit')}</button>}{Number(report.status ?? 1) === 0 && !isDraftExpired(report) && <button type="button" onClick={() => handleSend(report)} className="tw-rounded-lg tw-border tw-border-emerald-200 tw-bg-emerald-50 tw-px-3 tw-py-1.5 tw-text-xs tw-font-medium tw-text-emerald-700 tw-hover:bg-emerald-100">{t('daily_report.send_report')}</button>}{Number(report.status ?? 1) === 0 && !isDraftExpired(report) && <button type="button" onClick={() => handleDelete(report)} className="tw-rounded-lg tw-border tw-border-rose-200 tw-bg-rose-50 tw-px-3 tw-py-1.5 tw-text-xs tw-font-medium tw-text-rose-700 tw-hover:bg-rose-100">{t('daily_report.delete')}</button>}</div></div></article>)}</div>}</div>
      </section>
      {selectedReport && <ReadDailyReportModal report={selectedReport} onClose={() => setSelectedReport(null)} />}
    </>
  );
}
