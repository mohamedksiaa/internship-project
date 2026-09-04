import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Card from '../components/atoms/Card';
import TimeEntryList from '../components/organisms/TimeEntryList';
import { getDailyReports, getTimeEntryUpdates, getValidationEntries, rejectDailyReport, validateDailyReport } from '../api/timeflowApi';
import ReadDailyReportModal from '../components/molecules/ReadDailyReportModal.jsx';
import { ModifiedManuallyBadge, isManuallyModifiedRecord } from '../components/organisms/TimeEntryList.jsx';
import { useUrlDateRange, useUrlState } from '../hooks/useUrlState.js';

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

function TaskValidationTab() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;
    let marker = null;
    let polling = false;

    async function loadEntries() {
      try {
        const data = await getValidationEntries();
        if (isMounted) {
          setEntries(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message);
          setEntries([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    async function checkForUpdates() {
      if (polling || document.visibilityState !== 'visible') return;
      polling = true;
      try {
        const update = await getTimeEntryUpdates('validation', marker || '');
        if (!isMounted) return;
        if (marker === null) {
          marker = update.marker;
        } else if (update.changed) {
          marker = update.marker;
          setEntries(update.entries);
        }
      } catch {
        // A failed background check must not replace the currently displayed list.
      } finally {
        polling = false;
      }
    }

    async function initialize() {
      // Capture a marker on both sides of the first list request. Without
      // this, an entry created between loadEntries() and the first marker
      // check can become the baseline and remain invisible until another
      // change happens or the user navigates away and back.
      let markerBefore = null;
      try {
        markerBefore = (await getTimeEntryUpdates('validation')).marker;
      } catch {
        // The list remains usable even if the lightweight marker is temporary unavailable.
      }
      await loadEntries();
      try {
        const update = await getTimeEntryUpdates('validation', markerBefore || '');
        marker = update.marker;
        if (markerBefore !== null && update.changed) {
          setEntries(update.entries);
        }
      } catch {
        // The next interval will establish the marker and retry normally.
      }
    }

    initialize();
    const intervalId = window.setInterval(checkForUpdates, 15000);
    window.addEventListener('focus', checkForUpdates);
    document.addEventListener('visibilitychange', checkForUpdates);
    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', checkForUpdates);
      document.removeEventListener('visibilitychange', checkForUpdates);
    };
  }, []);

  return (
    <Card size="section" titleSize="xl" headerLabel={t('validation.section')} title={t('validation.heading')} headerRight={<span className="tw-inline-flex tw-rounded-full tw-bg-slate-100 tw-px-3 tw-py-1 tw-text-sm tw-text-slate-700">{t('entries', { count: entries.length })}</span>}>
      {loading && <p className="tw-text-sm tw-text-slate-600">{t('loading')}</p>}
      {error && <p className="tw-text-sm tw-text-rose-600">{error}</p>}
      {!loading && !error && <TimeEntryList entries={entries} setEntries={setEntries} showWorker showValidationActions />}
    </Card>
  );
}

function ReportValidationTab() {
  const { t } = useTranslation();
  // Own URL-persisted filters (?dateFrom=&dateTo=&employee=), independent from
  // the task-validation tab and from ReportsPage — this tab used to live at
  // /reports (ReportsPage's "employees" tab) and is moved here as-is.
  const [dateRange, setDateFrom, setDateTo] = useUrlDateRange(currentMonthRange());
  const [dailyReports, setDailyReports] = useState([]);
  const [dailyEmployees, setDailyEmployees] = useState([]);
  const [dailyEmployeeId, setDailyEmployeeId] = useUrlState('employee', '');
  const [dailyError, setDailyError] = useState('');
  const [selectedReport, setSelectedReport] = useState(null);

  useEffect(() => {
    let isMounted = true;
    getDailyReports({ date_from: dateRange.from, date_to: dateRange.to, employee_id: dailyEmployeeId })
      .then((data) => {
        if (!isMounted) return;
        const nextReports = Array.isArray(data?.reports)
          ? data.reports.filter((report) => Number(report.status ?? 1) === 1 && !report.is_deleted)
          : [];
        setDailyReports(nextReports);
        setDailyEmployees(Array.isArray(data?.employees) ? data.employees : []);
        setDailyError('');
      })
      .catch((err) => isMounted && setDailyError(err.message));
    return () => { isMounted = false; };
  }, [dateRange, dailyEmployeeId]);

  async function handleDailyReportDecision(id, action) {
    try {
      if (action === 'validate') {
        await validateDailyReport(id);
      } else {
        await rejectDailyReport(id);
      }
      setDailyReports((items) => items.filter((report) => Number(report.id) !== Number(id)));
      if (selectedReport && Number(selectedReport.id) === Number(id)) {
        setSelectedReport(null);
      }
      setDailyError('');
    } catch (err) {
      setDailyError(err.message);
    }
  }

  return (
    <section className="tw-rounded-3xl tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-bg-white dark:tw-bg-slate-900 tw-p-6 tw-shadow-sm dark:tw-shadow-none tw-overflow-hidden">
      <div className="tw-mb-6"><p className="tw-text-sm tw-font-semibold tw-uppercase tw-tracking-[.24em] tw-text-slate-500 dark:tw-text-slate-400">{t('reports.daily_reports')}</p><h2 className="tw-text-2xl tw-font-semibold tw-text-slate-900 dark:tw-text-slate-100">{t('reports.daily_reports_title')}</h2><p className="tw-mt-2 tw-text-sm tw-text-slate-600 dark:tw-text-slate-400">{t('reports.daily_reports_description')}</p></div>
      <div>
        <div className="tw-mb-4 tw-flex tw-flex-wrap tw-items-end tw-gap-4">
          <label className="tw-flex tw-flex-col tw-gap-1 tw-text-sm tw-font-medium tw-text-slate-700 dark:tw-text-slate-300">
            {t('reports.from')}
            <input type="date" value={dateRange.from} onChange={(event) => setDateFrom(event.target.value)} className="tw-rounded-xl tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-px-3 tw-py-2 dark:tw-bg-slate-800 dark:tw-text-slate-100" />
          </label>
          <label className="tw-flex tw-flex-col tw-gap-1 tw-text-sm tw-font-medium tw-text-slate-700 dark:tw-text-slate-300">
            {t('reports.to')}
            <input type="date" value={dateRange.to} onChange={(event) => setDateTo(event.target.value)} className="tw-rounded-xl tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-px-3 tw-py-2 dark:tw-bg-slate-800 dark:tw-text-slate-100" />
          </label>
          <label className="tw-flex tw-flex-col tw-gap-1 tw-text-sm tw-font-medium tw-text-slate-700 dark:tw-text-slate-300">
            {t('reports.employee')}
            <select aria-label={t('reports.filter_employee')} value={dailyEmployeeId} onChange={(event) => setDailyEmployeeId(event.target.value)} className="tw-rounded-xl tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-px-3 tw-py-2 dark:tw-bg-slate-800 dark:tw-text-slate-100">
              <option value="">{t('reports.all_employees')}</option>
              {dailyEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.label}</option>)}
            </select>
          </label>
        </div>
        {dailyError && <p className="tw-mb-3 tw-text-sm tw-text-rose-600 dark:tw-text-rose-400">{dailyError}</p>}
        {dailyReports.length === 0 ? (
          <p className="tw-text-sm tw-text-slate-500 dark:tw-text-slate-400">{t('reports.no_reports_for_period')}</p>
        ) : (
          <div className="tw-space-y-3">
            {dailyReports.map((report) => (
              <article key={report.id} className="tw-rounded-2xl tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-p-4">
                <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3 tw-min-w-0">
                  <div className="tw-min-w-0 tw-flex tw-items-center tw-gap-2">
                    <strong className="tw-text-slate-900 dark:tw-text-slate-100">{report.user_label}</strong>
                    <span className="tw-text-sm tw-text-slate-500 dark:tw-text-slate-400">{report.date_report}</span>
                    {isManuallyModifiedRecord(report.date_creation, report.date_last_content_edit) && (
                      <ModifiedManuallyBadge title={t('timeentry.corrected_traced')} />
                    )}
                  </div>
                  <div className="tw-flex tw-items-center tw-gap-3">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDailyReportDecision(report.id, 'validate'); }}
                      className="tw-rounded-full tw-bg-emerald-100 dark:tw-bg-emerald-900/40 tw-px-2 tw-py-1 tw-text-xs tw-font-medium tw-text-emerald-800 dark:tw-text-emerald-300"
                    >
                      {t('reports.validate')}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDailyReportDecision(report.id, 'reject'); }}
                      className="tw-rounded-full tw-bg-rose-100 dark:tw-bg-rose-900/40 tw-px-2 tw-py-1 tw-text-xs tw-font-medium tw-text-rose-800 dark:tw-text-rose-300"
                    >
                      {t('reports.reject')}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setSelectedReport(report); }}
                      className="tw-text-sm tw-text-slate-600 dark:tw-text-slate-400"
                    >
                      {t('reports.read')}
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {selectedReport && (
              <ReadDailyReportModal report={selectedReport} onClose={() => setSelectedReport(null)} />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default function ValidationPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useUrlState('tab', 'tasks');

  return (
    <div className="tw-mx-auto tw-w-full tw-max-w-[1680px] tw-space-y-6 tw-px-5 tw-py-7">
      <div className="tw-mb-4 tw-flex tw-flex-wrap tw-gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('tasks')}
          className={`tw-rounded-lg tw-px-4 tw-py-2 tw-text-sm tw-font-medium ${activeTab === 'tasks' ? 'tw-bg-slate-900 tw-text-white dark:tw-bg-slate-100 dark:tw-text-slate-900' : 'tw-bg-slate-100 dark:tw-bg-slate-800 tw-text-slate-700 dark:tw-text-slate-300 hover:tw-bg-slate-200 dark:hover:tw-bg-slate-700'}`}
        >
          {t('validation.tasks_tab')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          className={`tw-rounded-lg tw-px-4 tw-py-2 tw-text-sm tw-font-medium ${activeTab === 'reports' ? 'tw-bg-slate-900 tw-text-white dark:tw-bg-slate-100 dark:tw-text-slate-900' : 'tw-bg-slate-100 dark:tw-bg-slate-800 tw-text-slate-700 dark:tw-text-slate-300 hover:tw-bg-slate-200 dark:hover:tw-bg-slate-700'}`}
        >
          {t('validation.reports_tab')}
        </button>
      </div>

      {activeTab === 'tasks' && <TaskValidationTab />}
      {activeTab === 'reports' && <ReportValidationTab />}
    </div>
  );
}
