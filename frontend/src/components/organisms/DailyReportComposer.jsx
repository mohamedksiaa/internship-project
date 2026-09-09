import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Card from '../atoms/Card';
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

// Delete is only ever offered for Brouillon (0, subject to the 24h
// isDraftExpired window above) and Soumis (1, no such window — expiry is a
// draft-only notion, a submitted report was already handed off). Validé/
// Refusé never show it here regardless of what the backend's delete_allowed
// computes: this page only ever lists the current employee's own reports,
// so there is no legitimate "delete my own already-decided report" action
// to expose from it — see class/timeentry.class.php's TimeEntry::delete()
// for the exact same hard/soft split this mirrors server-side.
function canDeleteReport(report) {
  if (!report || !report.delete_allowed) return false;
  const status = Number(report.status ?? 1);
  if (status === 0) return !isDraftExpired(report);
  return status === 1;
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
  const [reportToDelete, setReportToDelete] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});

  // Backend pagination (page/per_page=20, same contract as
  // timeflowGetProcessedHistory / "Rapports > Rapports des tâches") replaces
  // the old unbounded fetch-everything-then-filter-client-side approach. The
  // "hide validated reports older than 24h" / "hide soft-deleted" rules used
  // to be re-applied here in JS on top of an already-unbounded list; they are
  // now enforced once, server-side, in timeflowFetchDailyReports()'s WHERE
  // clause — duplicating them here would desync the displayed count from
  // pagination.total/pages, which is exactly what the backend total is
  // supposed to guarantee stays accurate.
  async function loadReports(targetPage) {
    setLoading(true);
    try {
      const data = await getMyDailyReports({ page: targetPage, per_page: 20 });
      const pages = data.pagination?.pages || 1;
      if (targetPage > pages && pages >= 1) {
        return loadReports(pages);
      }
      setReports(Array.isArray(data.reports) ? data.reports : []);
      setPagination(data.pagination || {});
      setPage(targetPage);
      setError('');
    } catch (err) {
      setError(err.message);
      setReports([]);
    } finally {
      setLoading(false);
    }
    return undefined;
  }

  useEffect(() => {
    loadReports(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        setContent('');
        setEditingId(null);
        onSaved(updated);
        // Refresh the current page from the backend instead of splicing
        // locally: with pagination, a local patch can no longer be trusted
        // to keep the displayed list consistent with pagination.total/pages.
        await loadReports(page);
      } else {
        const saved = await saveDailyReport(dateReport, trimmed, status);
        setContent('');
        onSaved(saved);
        // A brand new report sorts first (most recent date_report/tms) —
        // jump back to page 1 so the user actually sees what they just saved.
        await loadReports(1);
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
      if (Number(editingId) === Number(report.id)) {
        setEditingId(null);
        setDateReport(today());
        setContent('');
      }
      onSaved(updated);
      await loadReports(page);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleDelete(report) {
    if (!canDeleteReport(report)) return;
    setReportToDelete(report);
  }

  async function confirmDeleteReport() {
    if (!reportToDelete) return;
    const report = reportToDelete;
    setReportToDelete(null);
    try {
      setError('');
      await deleteDailyReport(report.id);
      if (Number(editingId) === Number(report.id)) {
        setEditingId(null);
        setDateReport(today());
        setContent('');
      }
      // loadReports() clamps to the last valid page itself if this was the
      // sole remaining report on the current (now out-of-range) page.
      await loadReports(page);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <Card size="section">
        <div className="tw-mb-5"><p className="tw-text-sm tw-font-semibold tw-uppercase tw-tracking-[.24em] tw-text-slate-500 dark:tw-text-slate-400">{t('daily_report.section_title')}</p><h2 className="tw-text-2xl tw-font-semibold tw-text-slate-900 dark:tw-text-slate-100">{t('daily_report.heading')}</h2></div>
        <form onSubmit={(event) => submit(event, 1)} className="tw-space-y-4">
          <label className="tw-flex tw-max-w-xs tw-flex-col tw-gap-1 tw-text-sm tw-font-medium tw-text-slate-700 dark:tw-text-slate-300">{t('daily_report.date_label')}
            <input aria-label={t('daily_report.date_aria')} type="date" value={dateReport} onChange={(event) => setDateReport(event.target.value)} className="tw-rounded-xl tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-px-3 tw-py-2 dark:tw-bg-slate-800 dark:tw-text-slate-100" />
          </label>
          <label className="tw-flex tw-flex-col tw-gap-1 tw-text-sm tw-font-medium tw-text-slate-700 dark:tw-text-slate-300">{t('daily_report.content_label')}
            <textarea aria-label={t('daily_report.content_aria')} value={content} onChange={(event) => setContent(event.target.value)} rows="7" placeholder={t('daily_report.placeholder')} className="tw-w-full tw-rounded-xl tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-px-3 tw-py-2 dark:tw-bg-slate-800 dark:tw-text-slate-100" />
          </label>
          {error && <p className="tw-text-sm tw-text-rose-600 dark:tw-text-rose-400">{error}</p>}
          <div className="tw-flex tw-flex-wrap tw-gap-3">
            <button type="button" onClick={(event) => submit(event, 0)} disabled={saving || content.trim() === ''} className="tw-rounded-xl tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-bg-white dark:tw-bg-slate-800 tw-px-5 tw-py-2.5 tw-text-sm tw-font-semibold tw-text-slate-700 dark:tw-text-slate-200 hover:tw-bg-slate-50 dark:hover:tw-bg-slate-700 disabled:tw-opacity-50">{saving ? t('daily_report.saving') : 'Enregistrer comme brouillon'}</button>
            <button type="submit" disabled={saving || content.trim() === ''} className="tw-rounded-xl tw-bg-[#5B8FA8] tw-px-5 tw-py-2.5 tw-text-sm tw-font-semibold tw-text-white hover:tw-bg-[#4A7690] dark:hover:tw-bg-[#6ea0ba] disabled:tw-opacity-50">{saving ? t('daily_report.saving') : t('daily_report.save')}</button>
          </div>
        </form>
        <div className="tw-mt-8 tw-border-t tw-border-slate-200 dark:tw-border-slate-700 tw-pt-5"><h3 className="tw-font-semibold tw-text-slate-900 dark:tw-text-slate-100">{t('daily_report.history_title')}</h3>{loading ? <p className="tw-mt-3 tw-text-sm tw-text-slate-500 dark:tw-text-slate-400">{t('daily_report.loading')}</p> : reports.length === 0 ? <p className="tw-mt-3 tw-text-sm tw-text-slate-500 dark:tw-text-slate-400">{t('daily_report.empty')}</p> : <div className="tw-mt-3 tw-space-y-3">{reports.map((report) => <article key={report.id} className="tw-rounded-2xl tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-p-4"><div className="tw-flex tw-items-center tw-justify-between tw-gap-3"><div className="tw-min-w-0"><strong className="tw-block tw-text-sm tw-font-semibold tw-text-slate-900 dark:tw-text-slate-100">{report.date_report}</strong><div className="tw-text-xs tw-text-slate-500 dark:tw-text-slate-400">{formatDateTime(report.date_creation || report.date_modification)}</div></div><div className="tw-flex tw-items-center tw-gap-2"><StatusBadge status={Number(report.status ?? 1)} />{isManuallyModifiedRecord(report.date_creation, report.date_last_content_edit) && <ModifiedManuallyBadge title="Temps corrigé et tracé" />}</div></div><div className="tw-mt-3 tw-flex tw-items-center tw-justify-between tw-gap-3"><div className="tw-flex-1" /> <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-end tw-gap-2"> <button type="button" onClick={() => setSelectedReport(report)} className="tw-rounded-lg tw-border tw-border-sky-200 dark:tw-border-sky-800 tw-bg-sky-50 dark:tw-bg-sky-900/30 tw-px-3 tw-py-1.5 tw-text-xs tw-font-medium tw-text-sky-700 dark:tw-text-sky-300 hover:tw-bg-sky-100 dark:hover:tw-bg-sky-900/50">{t('daily_report.read_report')}</button>{Number(report.status ?? 1) !== 2 && !isDraftExpired(report) && <button type="button" onClick={() => handleEdit(report)} className="tw-rounded-lg tw-border tw-border-slate-200 dark:tw-border-slate-600 tw-bg-slate-50 dark:tw-bg-slate-800 tw-px-3 tw-py-1.5 tw-text-xs tw-font-medium tw-text-slate-700 dark:tw-text-slate-200 hover:tw-bg-slate-100 dark:hover:tw-bg-slate-700">{t('daily_report.edit')}</button>}{Number(report.status ?? 1) === 0 && !isDraftExpired(report) && <button type="button" onClick={() => handleSend(report)} className="tw-rounded-lg tw-border tw-border-emerald-200 dark:tw-border-emerald-800 tw-bg-emerald-50 dark:tw-bg-emerald-900/30 tw-px-3 tw-py-1.5 tw-text-xs tw-font-medium tw-text-emerald-700 dark:tw-text-emerald-300 hover:tw-bg-emerald-100 dark:hover:tw-bg-emerald-900/50">{t('daily_report.send_report')}</button>}{canDeleteReport(report) && <button type="button" onClick={() => handleDelete(report)} className="tw-rounded-lg tw-border tw-border-rose-200 dark:tw-border-rose-800 tw-bg-rose-50 dark:tw-bg-rose-900/30 tw-px-3 tw-py-1.5 tw-text-xs tw-font-medium tw-text-rose-700 dark:tw-text-rose-300 hover:tw-bg-rose-100 dark:hover:tw-bg-rose-900/50">{t('daily_report.delete')}</button>}</div></div></article>)}</div>}
        {!loading && reports.length > 0 && (
          <div className="tw-mt-4 tw-flex tw-items-center tw-justify-center tw-gap-4">
            <button
              type="button"
              onClick={() => loadReports(Math.max(1, page - 1))}
              disabled={page <= 1}
              className={`tw-rounded tw-px-4 tw-py-2 ${page <= 1 ? 'tw-bg-slate-200 dark:tw-bg-slate-800 tw-text-slate-500 dark:tw-text-slate-500' : 'tw-bg-slate-100 dark:tw-bg-slate-700 tw-text-slate-700 dark:tw-text-slate-200 hover:tw-bg-slate-200 dark:hover:tw-bg-slate-600'}`}
            >
              {t('processed_history.pagination.previous')}
            </button>
            <div className="tw-text-sm tw-text-slate-700 dark:tw-text-slate-300">
              {t('processed_history.pagination.page', { current: pagination.page || page, total: pagination.pages || 1 })}
            </div>
            <button
              type="button"
              onClick={() => loadReports(Math.min(pagination.pages || page, page + 1))}
              disabled={page >= (pagination.pages || 1)}
              className={`tw-rounded tw-px-4 tw-py-2 ${page >= (pagination.pages || 1) ? 'tw-bg-slate-200 dark:tw-bg-slate-800 tw-text-slate-500 dark:tw-text-slate-500' : 'tw-bg-slate-100 dark:tw-bg-slate-700 tw-text-slate-700 dark:tw-text-slate-200 hover:tw-bg-slate-200 dark:hover:tw-bg-slate-600'}`}
            >
              {t('processed_history.pagination.next')}
            </button>
          </div>
        )}
        </div>
      </Card>
      {selectedReport && <ReadDailyReportModal report={selectedReport} onClose={() => setSelectedReport(null)} />}
      {reportToDelete && (
        <div className="tw-fixed tw-inset-0 tw-z-50 tw-flex tw-items-center tw-justify-center tw-bg-black/40 tw-p-4" role="dialog" aria-modal="true" aria-labelledby="delete-report-title">
          <div className="tw-w-full tw-max-w-md tw-space-y-4 tw-rounded-lg tw-bg-white dark:tw-bg-slate-900 dark:tw-border dark:tw-border-slate-700 tw-p-6 tw-shadow-xl">
            <div className="tw-flex tw-items-start tw-justify-between tw-gap-4">
              <div>
                <h2 id="delete-report-title" className="tw-text-lg tw-font-semibold tw-text-[#263746] dark:tw-text-slate-100">{t('daily_report.delete_title')}</h2>
                <p className="tw-mt-1 tw-text-sm tw-text-[#52656f] dark:tw-text-slate-400">{t('daily_report.delete_irreversible')}</p>
              </div>
              <button
                type="button"
                onClick={() => setReportToDelete(null)}
                aria-label={t('daily_report.close')}
                className="tw-text-lg tw-leading-none tw-text-[#78909c] dark:tw-text-slate-400 hover:tw-text-[#2c3e49] dark:hover:tw-text-slate-100"
              >
                ×
              </button>
            </div>

            <p className="tw-text-sm tw-text-[#52656f] dark:tw-text-slate-400">
              {reportToDelete.delete_requires_strong_confirmation
                ? t('daily_report.delete_requires_confirmation')
                : t('daily_report.delete_confirm')}
            </p>

            <div className="tw-flex tw-justify-end tw-gap-3">
              <button type="button" onClick={() => setReportToDelete(null)} className="tw-text-sm tw-text-[#52656f] dark:tw-text-slate-300">{t('daily_report.cancel')}</button>
              <button type="button" onClick={confirmDeleteReport} className="tw-rounded tw-bg-[#d64c4c] tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-white hover:tw-bg-[#b93d3d]">
                {t('daily_report.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
