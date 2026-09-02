import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Card from '../components/atoms/Card';
import { getDailyReports, getSummaryReports, rejectDailyReport, validateDailyReport } from '../api/timeflowApi';
import ReadDailyReportModal from '../components/molecules/ReadDailyReportModal.jsx';
import { ModifiedManuallyBadge, isManuallyModifiedRecord } from '../components/organisms/TimeEntryList.jsx';
import { formatDuration } from '../utils/FormatDuration.js';
import { useUrlDateRange, useUrlState } from '../hooks/useUrlState.js';

const PROJECTS_PER_PAGE = 15;
const OTHER_PROJECTS_THRESHOLD_SECONDS = 5 * 60;

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
  const { t } = useTranslation();
  // Tab, date range and employee filter all live in the URL (?tab=&dateFrom=&dateTo=&employee=)
  // instead of plain useState, so a refresh (or a shared link) restores the
  // exact same view. See src/hooks/useUrlState.js for how this works.
  const [activeTab, setActiveTab] = useUrlState('tab', 'activity');
  const [dateRange, setDateFrom, setDateTo] = useUrlDateRange(currentMonthRange());
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dailyReports, setDailyReports] = useState([]);
  const [dailyEmployees, setDailyEmployees] = useState([]);
  const [dailyEmployeeId, setDailyEmployeeId] = useUrlState('employee', '');
  const [dailyError, setDailyError] = useState('');
  const [selectedReport, setSelectedReport] = useState(null);
  const [projectSearch, setProjectSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [projectPage, setProjectPage] = useState(1);
  const [showOtherProjects, setShowOtherProjects] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(projectSearch.trim().toLowerCase()), 300);
    return () => window.clearTimeout(timer);
  }, [projectSearch]);

  useEffect(() => {
    setProjectPage(1);
  }, [dateRange.from, dateRange.to, debouncedSearch]);

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

  const projectRows = useMemo(() => {
    const byProject = summary?.by_project || {};
    const labels = summary?.project_labels || {};

    return Object.entries(byProject)
      .map(([projectId, total]) => ({
        id: projectId,
        label: labels?.[projectId] || labels?.[String(projectId)] || t('dashboard.project_fallback', { projectId }),
        total: Number(total || 0),
      }))
      .filter((project) => project.total > 0)
      .sort((left, right) => right.total - left.total);
  }, [summary, t]);

  const filteredProjectRows = useMemo(() => {
    if (!debouncedSearch) return projectRows;
    return projectRows.filter((project) => project.label.toLowerCase().includes(debouncedSearch));
  }, [projectRows, debouncedSearch]);

  const primaryProjectRows = useMemo(
    () => filteredProjectRows.filter((project) => project.total >= OTHER_PROJECTS_THRESHOLD_SECONDS),
    [filteredProjectRows],
  );
  const otherProjectRows = useMemo(
    () => filteredProjectRows.filter((project) => project.total < OTHER_PROJECTS_THRESHOLD_SECONDS),
    [filteredProjectRows],
  );

  const maxProjectTotal = primaryProjectRows.length > 0 ? Math.max(...primaryProjectRows.map((project) => project.total)) : 1;
  const totalPages = Math.max(1, Math.ceil(primaryProjectRows.length / PROJECTS_PER_PAGE));
  const visibleProjectRows = primaryProjectRows.slice((projectPage - 1) * PROJECTS_PER_PAGE, projectPage * PROJECTS_PER_PAGE);
  const totalOtherSeconds = otherProjectRows.reduce((sum, project) => sum + project.total, 0);

  function openReportModal(report) {
    setSelectedReport(report);
  }

  function closeReportModal() {
    setSelectedReport(null);
  }

  return (
    <div className="tw-mx-auto tw-w-full tw-max-w-[1680px] tw-space-y-6 tw-px-5 tw-py-7">
      <Card size="section">
        <div className="tw-mb-4 tw-flex tw-flex-wrap tw-gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('activity')}
            className={`tw-rounded-lg tw-px-4 tw-py-2 tw-text-sm tw-font-medium ${activeTab === 'activity' ? 'tw-bg-slate-900 tw-text-white dark:tw-bg-slate-100 dark:tw-text-slate-900' : 'tw-bg-slate-100 dark:tw-bg-slate-800 tw-text-slate-700 dark:tw-text-slate-300 hover:tw-bg-slate-200 dark:hover:tw-bg-slate-700'}`}
          >
            {t('reports.activity_title')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('employees')}
            className={`tw-rounded-lg tw-px-4 tw-py-2 tw-text-sm tw-font-medium ${activeTab === 'employees' ? 'tw-bg-slate-900 tw-text-white dark:tw-bg-slate-100 dark:tw-text-slate-900' : 'tw-bg-slate-100 dark:tw-bg-slate-800 tw-text-slate-700 dark:tw-text-slate-300 hover:tw-bg-slate-200 dark:hover:tw-bg-slate-700'}`}
          >
            {t('reports.daily_reports_title')}
          </button>
        </div>

        {activeTab === 'activity' && (
          <Card size="section" titleSize="xl" headerLabel={t('reports.title')} title={t('reports.activity_title')} className="tw-overflow-hidden">
            <p className="tw-mt-2 tw-text-sm tw-text-slate-600">{t('reports.summary_text')}</p>
            <div className="tw-mb-6 tw-flex tw-flex-wrap tw-gap-4">
              <label className="tw-flex tw-flex-col tw-gap-1 tw-text-sm tw-font-medium tw-text-slate-700" htmlFor="reports-date-from">
                {t('reports.from')}
                <input
                  id="reports-date-from"
                  type="date"
                  value={dateRange.from}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="tw-rounded-xl tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-px-3 tw-py-2 tw-text-slate-900 dark:tw-bg-slate-800 dark:tw-text-slate-100"
                />
              </label>
              <label className="tw-flex tw-flex-col tw-gap-1 tw-text-sm tw-font-medium tw-text-slate-700" htmlFor="reports-date-to">
                {t('reports.to')}
                <input
                  id="reports-date-to"
                  type="date"
                  value={dateRange.to}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="tw-rounded-xl tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-px-3 tw-py-2 tw-text-slate-900 dark:tw-bg-slate-800 dark:tw-text-slate-100"
                />
              </label>
            </div>
            {loading && <p className="tw-text-sm tw-text-slate-600">{t('reports.loading')}</p>}
            {error && <p className="tw-text-sm tw-text-rose-600">{error}</p>}
            {!loading && !error && summary && (
              <div className="tw-mb-6 tw-flex tw-justify-center">
                <div className="tw-w-full tw-max-w-2xl tw-rounded-lg tw-bg-slate-50 dark:tw-bg-slate-800/60 tw-p-6 tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-text-center">
                  <p className="tw-text-sm tw-font-semibold tw-text-slate-500 dark:tw-text-slate-400">{t('reports.total')}</p>
                  <p className="tw-mt-2 tw-text-2xl tw-font-semibold tw-text-slate-900 dark:tw-text-slate-100">{formatDuration(summary.total_seconds)}</p>
                </div>
              </div>
            )}
            {!loading && !error && summary && (
              <div className="tw-mt-6 tw-rounded-3xl tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-p-5">
                <div className="tw-mb-4 tw-flex tw-flex-col tw-gap-3 md:tw-flex-row md:tw-items-center md:tw-justify-between">
                  <p className="tw-text-sm tw-font-semibold tw-text-slate-500 dark:tw-text-slate-400">{t('reports.by_project')}</p>
                  <div className="tw-w-full md:tw-max-w-sm">
                    <input
                      type="search"
                      value={projectSearch}
                      onChange={(event) => setProjectSearch(event.target.value)}
                      placeholder={t('reports.search_project')}
                      className="tw-w-full tw-rounded-xl tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-px-3 tw-py-2 tw-text-sm tw-text-slate-900 dark:tw-bg-slate-800 dark:tw-text-slate-100"
                    />
                  </div>
                </div>

                <div className="tw-space-y-3 tw-text-sm tw-text-slate-700 dark:tw-text-slate-300">
                  {visibleProjectRows.length === 0 ? (
                    <p className="tw-text-sm tw-text-slate-500 dark:tw-text-slate-400">{t('reports.no_project_match')}</p>
                  ) : (
                    visibleProjectRows.map((project) => (
                      <div key={project.id} className="tw-rounded-xl tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-bg-slate-50 dark:tw-bg-slate-800/60 tw-p-3">
                        <div className="tw-flex tw-items-center tw-justify-between tw-gap-3">
                          <span className="tw-truncate tw-pr-2">{project.label}</span>
                          <strong>{formatDuration(project.total)}</strong>
                        </div>
                        <div className="tw-mt-2 tw-h-2.5 tw-overflow-hidden tw-rounded-full tw-bg-slate-200 dark:tw-bg-slate-700">
                          <div
                            className="tw-h-full tw-rounded-full tw-bg-[#4d5fca]"
                            style={{ width: `${(project.total / maxProjectTotal) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}

                  {otherProjectRows.length > 0 && (
                    <div className="tw-rounded-xl tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-bg-slate-50 dark:tw-bg-slate-800/60">
                      <button
                        type="button"
                        onClick={() => setShowOtherProjects((value) => !value)}
                        className="tw-flex tw-w-full tw-items-center tw-justify-between tw-gap-3 tw-px-3 tw-py-3 tw-text-left tw-text-sm tw-font-medium tw-text-slate-700 dark:tw-text-slate-300"
                      >
                        <span>
                          {t('reports.other_projects', { count: otherProjectRows.length })} — {formatDuration(totalOtherSeconds)}
                        </span>
                        <span>{showOtherProjects ? '▾' : '▸'}</span>
                      </button>
                      {showOtherProjects && (
                        <div className="tw-space-y-2 tw-border-t tw-border-slate-200 dark:tw-border-slate-700 tw-p-3">
                          {otherProjectRows.map((project) => (
                            <div key={`other-${project.id}`} className="tw-flex tw-items-center tw-justify-between tw-gap-3 tw-text-sm tw-text-slate-700 dark:tw-text-slate-300">
                              <span>{project.label}</span>
                              <strong>{formatDuration(project.total)}</strong>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {primaryProjectRows.length > PROJECTS_PER_PAGE && (
                  <div className="tw-mt-5 tw-flex tw-items-center tw-justify-between tw-gap-3 tw-border-t tw-border-slate-200 dark:tw-border-slate-700 tw-pt-4">
                    <button
                      type="button"
                      onClick={() => setProjectPage((page) => Math.max(1, page - 1))}
                      disabled={projectPage === 1}
                      className="tw-rounded-xl tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-px-3 tw-py-2 tw-text-sm tw-font-medium tw-text-slate-700 dark:tw-text-slate-300 disabled:tw-cursor-not-allowed disabled:tw-opacity-50"
                    >
                      {t('processed_history.pagination.previous')}
                    </button>
                    <span className="tw-text-sm tw-text-slate-600 dark:tw-text-slate-400">{t('reports.pagination.page', { current: projectPage, total: totalPages })}</span>
                    <button
                      type="button"
                      onClick={() => setProjectPage((page) => Math.min(totalPages, page + 1))}
                      disabled={projectPage >= totalPages}
                      className="tw-rounded-xl tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-px-3 tw-py-2 tw-text-sm tw-font-medium tw-text-slate-700 dark:tw-text-slate-300 disabled:tw-cursor-not-allowed disabled:tw-opacity-50"
                    >
                      {t('processed_history.pagination.next')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {activeTab === 'employees' && (
          <section className="tw-rounded-3xl tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-bg-white dark:tw-bg-slate-900 tw-p-6 tw-shadow-sm dark:tw-shadow-none tw-overflow-hidden">
            <div className="tw-mb-6"><p className="tw-text-sm tw-font-semibold tw-uppercase tw-tracking-[.24em] tw-text-slate-500 dark:tw-text-slate-400">{t('reports.daily_reports')}</p><h2 className="tw-text-2xl tw-font-semibold tw-text-slate-900 dark:tw-text-slate-100">{t('reports.daily_reports_title')}</h2><p className="tw-mt-2 tw-text-sm tw-text-slate-600 dark:tw-text-slate-400">{t('reports.daily_reports_description')}</p></div>
            <div>
              <div className="tw-mb-4 tw-flex tw-flex-wrap tw-items-end tw-gap-4"><label className="tw-flex tw-flex-col tw-gap-1 tw-text-sm tw-font-medium tw-text-slate-700 dark:tw-text-slate-300">{t('reports.employee')}<select aria-label={t('reports.filter_employee')} value={dailyEmployeeId} onChange={(event) => setDailyEmployeeId(event.target.value)} className="tw-rounded-xl tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-px-3 tw-py-2 dark:tw-bg-slate-800 dark:tw-text-slate-100"><option value="">{t('reports.all_employees')}</option>{dailyEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.label}</option>)}</select></label><span className="tw-text-sm tw-text-slate-500 dark:tw-text-slate-400">{t('reports.period')} : {dateRange.from} → {dateRange.to}</span></div>
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
                            onClick={(e) => { e.stopPropagation(); openReportModal(report); }}
                            className="tw-text-sm tw-text-slate-600 dark:tw-text-slate-400"
                          >
                            {t('reports.read')}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                  {selectedReport && (
                    <ReadDailyReportModal report={selectedReport} onClose={closeReportModal} />
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </Card>
    </div>
  );
}
