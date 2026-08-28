import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Card from '../components/atoms/Card';
import { getDailyReports, getSummaryReports, rejectDailyReport, validateDailyReport } from '../api/timeflowApi';
import ReadDailyReportModal from '../components/molecules/ReadDailyReportModal.jsx';
import { ModifiedManuallyBadge, isManuallyModifiedRecord } from '../components/organisms/TimeEntryList.jsx';
import { formatDuration } from '../utils/FormatDuration.js';

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
  const [activeTab, setActiveTab] = useState('activity');
  const [dateRange, setDateRange] = useState(currentMonthRange);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dailyReports, setDailyReports] = useState([]);
  const [dailyEmployees, setDailyEmployees] = useState([]);
  const [dailyEmployeeId, setDailyEmployeeId] = useState('');
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
    <div className="mx-auto w-full max-w-[1680px] space-y-6 px-5 py-7">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('activity')}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${activeTab === 'activity' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            {t('reports.activity_title')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('employees')}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${activeTab === 'employees' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            {t('reports.daily_reports_title')}
          </button>
        </div>

        {activeTab === 'activity' && (
          <Card size="section" titleSize="xl" headerLabel={t('reports.title')} title={t('reports.activity_title')} className="overflow-hidden">
            <p className="mt-2 text-sm text-slate-600">{t('reports.summary_text')}</p>
            <div className="mb-6 flex flex-wrap gap-4">
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700" htmlFor="reports-date-from">
                {t('reports.from')}
                <input
                  id="reports-date-from"
                  type="date"
                  value={dateRange.from}
                  onChange={(event) => setDateRange((range) => ({ ...range, from: event.target.value }))}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700" htmlFor="reports-date-to">
                {t('reports.to')}
                <input
                  id="reports-date-to"
                  type="date"
                  value={dateRange.to}
                  onChange={(event) => setDateRange((range) => ({ ...range, to: event.target.value }))}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
                />
              </label>
            </div>
            {loading && <p className="text-sm text-slate-600">{t('reports.loading')}</p>}
            {error && <p className="text-sm text-rose-600">{error}</p>}
            {!loading && !error && summary && (
              <div className="mb-6 flex justify-center">
                <div className="w-full max-w-2xl rounded-lg bg-slate-50 p-6 border border-slate-200 text-center">
                  <p className="text-sm font-semibold text-slate-500">{t('reports.total')}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{formatDuration(summary.total_seconds)}</p>
                </div>
              </div>
            )}
            {!loading && !error && summary && (
              <div className="mt-6 rounded-3xl border border-slate-200 p-5">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm font-semibold text-slate-500">{t('reports.by_project')}</p>
                  <div className="w-full md:max-w-sm">
                    <input
                      type="search"
                      value={projectSearch}
                      onChange={(event) => setProjectSearch(event.target.value)}
                      placeholder={t('reports.search_project')}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    />
                  </div>
                </div>

                <div className="space-y-3 text-sm text-slate-700">
                  {visibleProjectRows.length === 0 ? (
                    <p className="text-sm text-slate-500">{t('reports.no_project_match')}</p>
                  ) : (
                    visibleProjectRows.map((project) => (
                      <div key={project.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate pr-2">{project.label}</span>
                          <strong>{formatDuration(project.total)}</strong>
                        </div>
                        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-[#4d5fca]"
                            style={{ width: `${(project.total / maxProjectTotal) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}

                  {otherProjectRows.length > 0 && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50">
                      <button
                        type="button"
                        onClick={() => setShowOtherProjects((value) => !value)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm font-medium text-slate-700"
                      >
                        <span>
                          {t('reports.other_projects', { count: otherProjectRows.length })} — {formatDuration(totalOtherSeconds)}
                        </span>
                        <span>{showOtherProjects ? '▾' : '▸'}</span>
                      </button>
                      {showOtherProjects && (
                        <div className="space-y-2 border-t border-slate-200 p-3">
                          {otherProjectRows.map((project) => (
                            <div key={`other-${project.id}`} className="flex items-center justify-between gap-3 text-sm text-slate-700">
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
                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
                    <button
                      type="button"
                      onClick={() => setProjectPage((page) => Math.max(1, page - 1))}
                      disabled={projectPage === 1}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t('processed_history.pagination.previous')}
                    </button>
                    <span className="text-sm text-slate-600">{t('reports.pagination.page', { current: projectPage, total: totalPages })}</span>
                    <button
                      type="button"
                      onClick={() => setProjectPage((page) => Math.min(totalPages, page + 1))}
                      disabled={projectPage >= totalPages}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
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
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm overflow-hidden">
            <div className="mb-6"><p className="text-sm font-semibold uppercase tracking-[.24em] text-slate-500">{t('reports.daily_reports')}</p><h2 className="text-2xl font-semibold text-slate-900">{t('reports.daily_reports_title')}</h2><p className="mt-2 text-sm text-slate-600">{t('reports.daily_reports_description')}</p></div>
            <div>
              <div className="mb-4 flex flex-wrap items-end gap-4"><label className="flex flex-col gap-1 text-sm font-medium text-slate-700">{t('reports.employee')}<select aria-label={t('reports.filter_employee')} value={dailyEmployeeId} onChange={(event) => setDailyEmployeeId(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2"><option value="">{t('reports.all_employees')}</option>{dailyEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.label}</option>)}</select></label><span className="text-sm text-slate-500">{t('reports.period')} : {dateRange.from} → {dateRange.to}</span></div>
              {dailyError && <p className="mb-3 text-sm text-rose-600">{dailyError}</p>}
              {dailyReports.length === 0 ? (
                <p className="text-sm text-slate-500">{t('reports.no_reports_for_period')}</p>
              ) : (
                <div className="space-y-3">
                  {dailyReports.map((report) => (
                    <article key={report.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
                        <div className="min-w-0 flex items-center gap-2">
                          <strong className="text-slate-900">{report.user_label}</strong>
                          <span className="text-sm text-slate-500">{report.date_report}</span>
                          {isManuallyModifiedRecord(report.date_creation, report.date_last_content_edit) && (
                            <ModifiedManuallyBadge title={t('timeentry.corrected_traced')} />
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDailyReportDecision(report.id, 'validate'); }}
                            className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800"
                          >
                            {t('reports.validate')}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDailyReportDecision(report.id, 'reject'); }}
                            className="rounded-full bg-rose-100 px-2 py-1 text-xs font-medium text-rose-800"
                          >
                            {t('reports.reject')}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openReportModal(report); }}
                            className="text-sm text-slate-600"
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
      </div>
    </div>
  );
}

