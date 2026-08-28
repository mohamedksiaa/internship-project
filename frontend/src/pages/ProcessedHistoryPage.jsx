import { useEffect, useMemo, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  deleteDailyReport,
  exportProcessedHistory,
  getDailyReports,
  getMyDailyReports,
  getProcessedHistory,
  getProjects,
  hardDeleteTimeEntry,
  hardDeleteTimeEntries,
  hardDeleteDailyReport,
  hardDeleteDailyReports,
} from '../api/timeflowApi';
import StatusBadge from '../components/atoms/StatusBadge';
import ReadDailyReportModal from '../components/molecules/ReadDailyReportModal.jsx';
import { ModifiedManuallyBadge, isManuallyModifiedRecord } from '../components/organisms/TimeEntryList.jsx';
import { formatDuration } from '../utils/FormatDuration.js';

const initialFilters = {
  status: 'all',
  employee_id: '',
  project_id: '',
  date_from: '',
  date_to: '',
  manual_only: false,
};

const dateTime = (value) => (value ? String(value).replace('T', ' ').slice(0, 16) : '—');

export default function ProcessedHistoryPage() {
  const { t } = useTranslation();
  const canReadAll = typeof window !== 'undefined' && window.TIMEFLOW_CAN_READALL === true;
  const [activeTab, setActiveTab] = useState('tasks');
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], pagination: {}, stats: {} });
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleteRequest, setDeleteRequest] = useState(null);
  const [reportHistory, setReportHistory] = useState([]);
  const [reportHistoryLoading, setReportHistoryLoading] = useState(true);
  const [reportHistoryError, setReportHistoryError] = useState('');
  const [reportEmployees, setReportEmployees] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const globalCheckboxRef = useRef(null);

  useEffect(() => {
    getProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (!canReadAll && filters.employee_id !== '') {
      setFilters((current) => ({ ...current, employee_id: '' }));
    }
  }, [canReadAll, filters.employee_id]);

  useEffect(() => {
    if (activeTab !== 'reports') return;

    let active = true;
    setReportHistoryLoading(true);
    setReportHistoryError('');

    const payload = {
      history: true,
      employee_id: filters.employee_id,
      date_from: filters.date_from,
      date_to: filters.date_to,
      manual_only: filters.manual_only,
      status: filters.status,
    };
    const request = canReadAll ? getDailyReports(payload) : getMyDailyReports(payload);

    request
      .then((res) => {
        if (!active) return;
        const nextReports = Array.isArray(res?.reports) ? res.reports : Array.isArray(res) ? res : [];
        setReportHistory(nextReports);
        if (Array.isArray(res?.employees)) setReportEmployees(res.employees);
      })
      .catch((err) => {
        if (active) setReportHistoryError(err.message);
      })
      .finally(() => {
        if (active) setReportHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeTab, canReadAll, filters.employee_id, filters.date_from, filters.date_to, filters.manual_only, filters.status]);

  const isModifiedReport = (report) => {
    if (!report || !report.date_last_content_edit || !report.date_creation) return false;
    return String(report.date_last_content_edit) !== String(report.date_creation);
  };

  const visibleReportHistory = useMemo(
    () => reportHistory.filter((report) => Number(report.status) !== 1),
    [reportHistory]
  );

  const groupedReports = useMemo(() => {
    return visibleReportHistory.reduce((all, report) => {
      const key = String(report.date_report || '').slice(0, 10);
      (all[key] ||= []).push(report);
      return all;
    }, {});
  }, [visibleReportHistory]);

  const selectReportGroup = (rows, checked) => {
    const ids = rows.map((r) => Number(r.id));
    setSelectedIds((current) => {
      if (checked) return Array.from(new Set([...current, ...ids]));
      return current.filter((id) => !ids.includes(Number(id)));
    });
  };

  const handleHardDeleteReport = async (id) => {
    if (!canReadAll) return;
    try {
      await hardDeleteDailyReport(id);
      setReportHistory((items) => items.filter((item) => Number(item.id) !== Number(id)));
    } catch (err) {
      setReportHistoryError(err.message);
    }
  };

  const handleHardDeleteMultiple = async (ids) => {
    if (!canReadAll || !Array.isArray(ids) || ids.length === 0) return;
    try {
      await hardDeleteDailyReports(ids);
      setReportHistory((items) => items.filter((item) => !ids.includes(Number(item.id))));
      setSelectedIds((current) => current.filter((id) => !ids.includes(Number(id))));
    } catch (err) {
      setReportHistoryError(err.message);
    }
  };

  const refreshHistory = async () => {
    const next = await getProcessedHistory({ ...filters, page, per_page: 20 });
    setData(next);
    setSelectedIds([]);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setSuccess('');
    getProcessedHistory({ ...filters, page, per_page: 20 })
      .then((next) => {
        if (active) setData(next);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filters, page]);

  useEffect(() => {
    setSelectedIds([]);
  }, [data.rows]);

  const update = (key, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const grouped = useMemo(() => {
    return data.rows.reduce((all, entry) => {
      const key = String(entry.date_start || '').slice(0, 10);
      (all[key] ||= []).push(entry);
      return all;
    }, {});
  }, [data.rows]);

  const toggleSelected = (id) => {
    setSelectedIds((current) => {
      const numericId = Number(id);
      return current.includes(numericId)
        ? current.filter((currentId) => Number(currentId) !== numericId)
        : [...current, numericId];
    });
  };

  const selectAllForPage = (checked) => {
    const rowIds = data.rows.map((row) => Number(row.id));
    setSelectedIds((current) => {
      if (checked) {
        return Array.from(new Set([...current, ...rowIds]));
      }
      return current.filter((id) => !rowIds.includes(Number(id)));
    });
  };

  const selectAllReportsForPage = (checked) => {
    const rowIds = reportHistory.map((row) => Number(row.id));
    setSelectedIds((current) => {
      if (checked) return Array.from(new Set([...current, ...rowIds]));
      return current.filter((id) => !rowIds.includes(Number(id)));
    });
  };

  const selectAllForGroup = (rows, checked) => {
    const rowIds = rows.map((row) => Number(row.id));
    setSelectedIds((current) => {
      if (checked) {
        return Array.from(new Set([...current, ...rowIds]));
      }
      return current.filter((id) => !rowIds.includes(Number(id)));
    });
  };

  const handleDeleteReport = async (id) => {
    if (!canReadAll) return;

    try {
      await deleteDailyReport(id);
      setReportHistory((items) => items.filter((item) => Number(item.id) !== Number(id)));
    } catch (err) {
      setReportHistoryError(err.message);
    }
  };

  const csv = async () => {
    if (activeTab === 'reports') {
      const rows = Array.isArray(reportHistory) ? reportHistory : [];
      const header = [t('daily_report.date_label'), t('processed_history.columns.who'), t('daily_report.content_label')];
      const lines = [
        header,
        ...rows.map((report) => [
          report.date_report || report.date_creation || '',
          report.user_label || '',
          report.content || report.note || '',
        ]),
      ];

      const csvContent = `\uFEFF${lines
        .map((line) => line.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';'))
        .join('\n')}`;

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = t('processed_history.csv.filename');
      link.click();
      URL.revokeObjectURL(url);
      return;
    }

    const rows = await exportProcessedHistory(filters);
    const header = [
      t('processed_history.columns.task'), t('processed_history.columns.project'), t('processed_history.columns.who'),
      t('processed_history.columns.start'), t('processed_history.columns.end'), t('processed_history.columns.status'),
      t('processed_history.columns.duration'), t('processed_history.columns.modification'),
      t('processed_history.csv.processed_by'), t('processed_history.csv.processed_at'),
    ];
    const lines = [
      header,
      ...rows.map((entry) => [
        entry.note,
        entry.project_label,
        entry.user_label,
        dateTime(entry.date_start),
        dateTime(entry.date_end),
        Number(entry.status) === 2 ? t('status.validated') : t('status.rejected'),
        formatDuration(entry.duration),
        entry.manual_modified ? t('processed_history.modified_manually') : '',
        entry.processed_by_label,
        dateTime(entry.processed_at),
      ]),
    ];

    const csvContent = `\uFEFF${lines
      .map((line) => line.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';'))
      .join('\n')}`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = t('processed_history.csv.filename');
    link.click();
    URL.revokeObjectURL(url);
  };

  const submitHardDelete = async () => {
    if (!deleteRequest) return;

    const { type, ids } = deleteRequest;

    try {
      if (activeTab === 'reports') {
        if (type === 'single') {
          await hardDeleteDailyReport(ids[0]);
        } else {
          await hardDeleteDailyReports(ids);
        }
        setDeleteRequest(null);
        // Remove from local state instead of refreshing full processed history
        setReportHistory((items) => items.filter((item) => !ids.includes(Number(item.id))));
        setSelectedIds((current) => current.filter((id) => !ids.includes(Number(id))));
      } else {
        if (type === 'single') {
          await hardDeleteTimeEntry(ids[0]);
        } else {
          await hardDeleteTimeEntries(ids);
        }
        setDeleteRequest(null);
        await refreshHistory();
      }
      setSuccess(t('processed_history.delete.success', { count: ids.length }));
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err.message);
      setDeleteRequest(null);
    }
  };

  return (
    <div className="tw-mx-auto tw-w-full tw-max-w-[1680px] tw-space-y-6 tw-px-5 tw-py-7">
      <div className="tw-rounded-3xl tw-border tw-border-slate-200 tw-bg-white tw-p-4 tw-shadow-sm">
        <div className="tw-mb-4 tw-flex tw-flex-wrap tw-gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('tasks')}
            className={`tw-rounded-lg tw-px-4 tw-py-2 tw-text-sm tw-font-medium ${activeTab === 'tasks' ? 'tw-bg-slate-900 tw-text-white' : 'tw-bg-slate-100 tw-text-slate-700 tw-hover:bg-slate-200'}`}
          >
            {t('history.task_history')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            className={`tw-rounded-lg tw-px-4 tw-py-2 tw-text-sm tw-font-medium ${activeTab === 'reports' ? 'tw-bg-slate-900 tw-text-white' : 'tw-bg-slate-100 tw-text-slate-700 tw-hover:bg-slate-200'}`}
          >
            {t('history.report_history')}
          </button>
        </div>
        <div className="tw-mb-4 tw-flex tw-items-center tw-justify-end">
          <button type="button" onClick={csv} className="tw-rounded tw-bg-[#5B8FA8] tw-px-4 tw-py-2 tw-text-white">
            {t('processed_history.export_csv')}
          </button>
        </div>

        {activeTab === 'tasks' && (
          <>
            <section className="tw-rounded-3xl tw-border tw-border-slate-200 tw-bg-white tw-p-5 tw-shadow-sm">
              <div className="tw-mb-4 tw-flex tw-items-center tw-justify-between">
                <div>
                  <p className="tw-text-xs tw-font-semibold tw-uppercase tw-tracking-[.24em] tw-text-slate-500">{t('app.section_manage')}</p>
                  <h1 className="tw-text-2xl tw-font-semibold">{t('processed_history.title')}</h1>
                </div>
                <div className="tw-flex tw-items-center tw-gap-3">
                  {canReadAll && (
                    <>
                      <label className="tw-flex tw-items-center tw-gap-2">
                        <input
                          ref={globalCheckboxRef}
                          aria-label={t('processed_history.select_page_aria')}
                          type="checkbox"
                          checked={data.rows.length > 0 && data.rows.every((row) => selectedIds.includes(Number(row.id)))}
                          onChange={(event) => selectAllForPage(event.target.checked)}
                        />
                        <span className="tw-text-sm tw-text-slate-700">{t('processed_history.select_page')}</span>
                      </label>
                      {selectedIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setDeleteRequest({ type: 'multiple', ids: Array.from(selectedIds) })}
                          className="tw-rounded tw-bg-[#d64c4c] tw-px-4 tw-py-2 tw-text-white"
                        >
                          {t('processed_history.delete.selection', { count: selectedIds.length })}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="tw-grid tw-gap-3 tw-md:grid-cols-3 tw-xl:grid-cols-6">
                <select aria-label={t('processed_history.filters.status')} value={filters.status} onChange={(event) => update('status', event.target.value)} className="tw-rounded tw-border tw-p-2">
                  <option value="all">{t('processed_history.filters.validated_and_rejected')}</option>
                  <option value="validated">{t('status.validated')}</option>
                  <option value="refused">{t('status.rejected')}</option>
                </select>

                {!canReadAll && (
                  <div className="tw-rounded tw-border tw-border-slate-200 tw-bg-slate-50 tw-px-3 tw-py-2 tw-text-sm tw-text-slate-600">
                    {t('processed_history.filters.all_employees')}
                  </div>
                )}
                {canReadAll && (
                  <select aria-label={t('processed_history.filters.employee')} value={filters.employee_id} onChange={(event) => update('employee_id', event.target.value)} className="tw-rounded tw-border tw-p-2">
                    <option value="">{t('processed_history.filters.all_employees')}</option>
                    {data.employees?.map((user) => (
                      <option key={user.id} value={user.id}>{user.label}</option>
                    ))}
                  </select>
                )}

                <select aria-label={t('processed_history.filters.project')} value={filters.project_id} onChange={(event) => update('project_id', event.target.value)} className="tw-rounded tw-border tw-p-2">
                  <option value="">{t('processed_history.filters.all_projects')}</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.title}</option>
                  ))}
                </select>

                <input aria-label={t('processed_history.filters.start_date')} type="date" value={filters.date_from} onChange={(event) => update('date_from', event.target.value)} className="tw-rounded tw-border tw-p-2" />
                <input aria-label={t('processed_history.filters.end_date')} type="date" value={filters.date_to} onChange={(event) => update('date_to', event.target.value)} className="tw-rounded tw-border tw-p-2" />

                <label className="tw-flex tw-items-center tw-gap-2">
                  <input type="checkbox" checked={filters.manual_only} onChange={(event) => update('manual_only', event.target.checked)} />
                  {t('processed_history.filters.modified_only')}
                </label>
              </div>
            </section>

            <section className="tw-grid tw-gap-4 tw-md:grid-cols-4">
              <div className="tw-rounded tw-bg-white tw-p-4">
                {t('processed_history.total')} <strong>{data.pagination?.total || 0}</strong>
              </div>
              <div className="tw-rounded tw-bg-white tw-p-4">
                {t('processed_history.stats.validated_entries')} <strong>{data.stats.validated_count || 0}</strong>
              </div>
              <div className="tw-rounded tw-bg-white tw-p-4">
                {t('processed_history.stats.rejected_entries')} <strong>{data.stats.refused_count || 0}</strong>
              </div>
              <div className="tw-rounded tw-bg-white tw-p-4">
                {t('processed_history.stats.modified_entries')} <strong>{data.stats.manual_count || 0}</strong>
              </div>
            </section>

            {error && <p className="tw-text-red-600">{error}</p>}
            {success && <p className="tw-text-green-600">{success}</p>}
            {loading && <p>{t('loading')}</p>}

            {!loading && Object.entries(grouped).map(([day, rows]) => (
              <section key={day} className="tw-overflow-x-auto tw-bg-white">
                <div className="tw-flex tw-justify-between tw-bg-slate-100 tw-p-3">
                  <strong>{day}</strong>
                  <span>{t('processed_history.total')}: {formatDuration(rows.reduce((sum, row) => sum + Number(row.duration || 0), 0))}</span>
                </div>

                <table className="tw-w-full tw-text-left tw-text-sm tw-border-collapse">
                  <thead>
                    <tr>
                      {canReadAll && (
                        <th className="tw-w-10 tw-px-2 tw-py-2 tw-text-center tw-border-r tw-border-[#dce5ea] tw-last:border-r-0">
                          <input
                            aria-label={t('processed_history.select_group_aria', { day })}
                            type="checkbox"
                            checked={rows.every((row) => selectedIds.includes(Number(row.id)))}
                            ref={(el) => {
                              if (el) {
                                const groupAll = rows.every((row) => selectedIds.includes(Number(row.id)));
                                const groupSome = rows.some((row) => selectedIds.includes(Number(row.id))) && !groupAll;
                                el.indeterminate = groupSome;
                              }
                            }}
                            onChange={(event) => selectAllForGroup(rows, event.target.checked)}
                          />
                        </th>
                      )}
                      <th className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] tw-last:border-r-0">{t('processed_history.columns.task')}</th>
                      <th className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] tw-last:border-r-0">{t('processed_history.columns.project')}</th>
                      <th className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] tw-last:border-r-0">{t('processed_history.columns.who')}</th>
                      <th className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] tw-last:border-r-0">{t('processed_history.columns.start')}</th>
                      <th className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] tw-last:border-r-0">{t('processed_history.columns.end')}</th>
                      <th className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] tw-last:border-r-0">{t('processed_history.columns.status')}</th>
                      <th className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] tw-last:border-r-0">{t('processed_history.columns.duration')}</th>
                      <th className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] tw-last:border-r-0">{t('processed_history.columns.modification')}</th>
                      <th className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] tw-last:border-r-0">{t('processed_history.columns.processed_by_at')}</th>
                      {canReadAll && <th className="tw-px-2 tw-py-2 tw-text-right">{t('processed_history.columns.actions')}</th>}
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((entry) => (
                      <tr key={entry.id} className="tw-border-t">
                          {canReadAll && (
                            <td className="tw-px-2 tw-py-2 tw-text-center tw-border-r tw-border-[#dce5ea] tw-last:border-r-0">
                            <input
                              aria-label={t('processed_history.select_entry_aria')}
                              type="checkbox"
                              checked={selectedIds.includes(Number(entry.id))}
                              onChange={() => toggleSelected(entry.id)}
                            />
                          </td>
                        )}
                        <td className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] tw-last:border-r-0">{entry.note || t('timeentry.no_description')}</td>
                        <td className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] tw-last:border-r-0">{entry.project_label}</td>
                        <td className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] tw-last:border-r-0">{entry.user_label}</td>
                        <td className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] tw-last:border-r-0">{dateTime(entry.date_start)}</td>
                        <td className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] tw-last:border-r-0">{dateTime(entry.date_end)}</td>
                        <td className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] tw-last:border-r-0"><StatusBadge status={Number(entry.status)} /></td>
                        <td className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] tw-last:border-r-0">{formatDuration(entry.duration)}</td>
                        <td className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] tw-last:border-r-0">{entry.manual_modified ? t('processed_history.modified_manually') : '—'}</td>
                        <td className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] tw-last:border-r-0">
                          {entry.processed_by_label || '—'}
                          <br />
                          {dateTime(entry.processed_at)}
                        </td>
                        {canReadAll && (
                          <td className="tw-px-2 tw-py-2 tw-text-right">
                            <button
                              type="button"
                              aria-label={t('processed_history.delete.entry_aria')}
                              onClick={() => setDeleteRequest({ type: 'single', ids: [Number(entry.id)] })}
                              className="tw-rounded tw-bg-[#d64c4c] tw-px-2 tw-py-1 tw-text-xs tw-font-medium tw-text-white"
                            >
                              {t('processed_history.delete.action')}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}

            {/* Pagination controls for tasks history */}
            {!loading && data.rows.length > 0 && (
              <div className="tw-mt-4 tw-flex tw-items-center tw-justify-center tw-gap-4">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className={`tw-rounded tw-px-4 tw-py-2 ${page <= 1 ? 'tw-bg-slate-200 tw-text-slate-500' : 'tw-bg-slate-100 tw-text-slate-700 tw-hover:bg-slate-200'}`}
                >
                  {t('processed_history.pagination.previous')}
                </button>

                <div className="tw-text-sm tw-text-slate-700">
                  {t('processed_history.pagination.page', { current: data.pagination?.page || page, total: data.pagination?.pages || 1 })}
                </div>

                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(data.pagination?.pages || p, p + 1))}
                  disabled={page >= (data.pagination?.pages || 1)}
                  className={`tw-rounded tw-px-4 tw-py-2 ${page >= (data.pagination?.pages || 1) ? 'tw-bg-slate-200 tw-text-slate-500' : 'tw-bg-slate-100 tw-text-slate-700 tw-hover:bg-slate-200'}`}
                >
                  {t('processed_history.pagination.next')}
                </button>
              </div>
            )}

            {!loading && !data.rows.length && <p className="tw-rounded tw-bg-white tw-p-5">{t('processed_history.empty')}</p>}
          </>
        )}

        {activeTab === 'reports' && (
          <div className="tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-4">
            {reportHistoryLoading && <p className="tw-text-sm tw-text-slate-500">{t('loading')}</p>}
            {reportHistoryError && <p className="tw-text-sm tw-text-rose-600">{reportHistoryError}</p>}

            <div className="tw-mb-4 tw-flex tw-items-center tw-justify-between">
              <div>
                <p className="tw-text-xs tw-font-semibold tw-uppercase tw-tracking-[.24em] tw-text-slate-500">{t('app.section_manage')}</p>
                <h1 className="tw-text-2xl tw-font-semibold">{t('history.report_history')}</h1>
              </div>
              <div className="tw-flex tw-items-center tw-gap-3">
                {canReadAll && (
                  <>
                    <label className="tw-flex tw-items-center tw-gap-2">
                      <input
                        ref={(el) => {
                          if (el) {
                            const all = reportHistory.length > 0 && reportHistory.every((r) => selectedIds.includes(Number(r.id)));
                            const some = reportHistory.some((r) => selectedIds.includes(Number(r.id))) && !all;
                            el.indeterminate = some;
                          }
                        }}
                        aria-label={t('processed_history.select_page_aria')}
                        type="checkbox"
                        checked={reportHistory.length > 0 && reportHistory.every((r) => selectedIds.includes(Number(r.id)))}
                        onChange={(event) => selectAllReportsForPage(event.target.checked)}
                      />
                      <span className="tw-text-sm tw-text-slate-700">{t('processed_history.select_page')}</span>
                    </label>

                    {selectedIds.length > 0 && (
                      <button type="button" onClick={() => setDeleteRequest({ type: 'multiple', ids: Array.from(selectedIds) })} className="tw-rounded tw-bg-[#d64c4c] tw-px-4 tw-py-2 tw-text-white">
                        {t('processed_history.delete.selection', { count: selectedIds.length })}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            <section className="tw-rounded-3xl tw-border tw-border-slate-200 tw-bg-white tw-p-5 tw-shadow-sm">
              <div className="tw-grid tw-gap-3 tw-md:grid-cols-3 tw-xl:grid-cols-6">
                <select aria-label={t('processed_history.filters.status')} value={filters.status} onChange={(event) => update('status', event.target.value)} className="tw-rounded tw-border tw-p-2">
                  <option value="all">{t('processed_history.filters.validated_and_rejected')}</option>
                  <option value="validated">{t('status.validated')}</option>
                  <option value="refused">{t('status.rejected')}</option>
                </select>

                {!canReadAll && (
                  <div className="tw-rounded tw-border tw-border-slate-200 tw-bg-slate-50 tw-px-3 tw-py-2 tw-text-sm tw-text-slate-600">
                    {t('processed_history.filters.all_employees')}
                  </div>
                )}
                {canReadAll && (
                  <select aria-label={t('processed_history.filters.employee')} value={filters.employee_id} onChange={(event) => update('employee_id', event.target.value)} className="tw-rounded tw-border tw-p-2">
                    <option value="">{t('processed_history.filters.all_employees')}</option>
                    {reportEmployees.map((user) => (
                      <option key={user.id} value={user.id}>{user.label}</option>
                    ))}
                  </select>
                )}

                <input aria-label={t('processed_history.filters.start_date')} type="date" value={filters.date_from} onChange={(event) => update('date_from', event.target.value)} className="tw-rounded tw-border tw-p-2" />
                <input aria-label={t('processed_history.filters.end_date')} type="date" value={filters.date_to} onChange={(event) => update('date_to', event.target.value)} className="tw-rounded tw-border tw-p-2" />

                <label className="tw-flex tw-items-center tw-gap-2">
                  <input type="checkbox" checked={filters.manual_only} onChange={(event) => update('manual_only', event.target.checked)} />
                  {t('processed_history.filters.modified_only')}
                </label>
              </div>
            </section>

            <section className="tw-mt-4 tw-grid tw-gap-4 tw-md:grid-cols-4">
              <div className="tw-rounded tw-bg-white tw-p-4">
                {t('processed_history.total')} <strong>{visibleReportHistory.length}</strong>
              </div>
              <div className="tw-rounded tw-bg-white tw-p-4">
                {t('status.validated')} <strong>{visibleReportHistory.filter((r) => Number(r.status) === 2).length}</strong>
              </div>
              <div className="tw-rounded tw-bg-white tw-p-4">
                {t('status.rejected')} <strong>{visibleReportHistory.filter((r) => Number(r.status) === 9).length}</strong>
              </div>
              <div className="tw-rounded tw-bg-white tw-p-4">
                {t('processed_history.stats.modified_entries')} <strong>{visibleReportHistory.filter((r) => isModifiedReport(r)).length}</strong>
              </div>
            </section>

            {!reportHistoryLoading && visibleReportHistory.length === 0 && (
              <p className="tw-mt-4 tw-text-sm tw-text-slate-500">{t('history.no_report_history')}</p>
            )}

            {!reportHistoryLoading && visibleReportHistory.length > 0 && (
              <div className="tw-mt-4 tw-space-y-3">
                {Object.entries(groupedReports).map(([day, rows]) => (
                  <div key={day} className="tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-p-4">
                    <div className="tw-flex tw-items-start tw-justify-between tw-gap-3">
                      <div>
                        <p className="tw-font-semibold tw-text-slate-900">{day}</p>
                        <p className="tw-text-sm tw-text-slate-500">{t('processed_history.total')}: {rows.length}</p>
                      </div>
                      {canReadAll && (
                        <label className="tw-flex tw-items-center tw-gap-2">
                          <input type="checkbox" checked={rows.every((r) => selectedIds.includes(Number(r.id)))} onChange={(e) => selectReportGroup(rows, e.target.checked)} />
                          <span className="tw-text-sm tw-text-slate-700">{t('processed_history.select_group_aria', { day })}</span>
                        </label>
                      )}
                    </div>
                    <div className="tw-mt-3">
                      {rows.map((report) => (
                        <div key={report.id} className="tw-mb-4 tw-rounded tw-border tw-border-slate-200 tw-p-3">
                          <div className="tw-flex tw-items-start tw-justify-between tw-gap-3">
                            <div>
                              <p className="tw-font-semibold tw-text-slate-900">{report.user_label}</p>
                              <p className="tw-text-sm tw-text-slate-500">{report.date_report}</p>
                            </div>
                            <div className="tw-flex tw-items-center tw-gap-2">
                              <StatusBadge status={Number(report.status)} />
                              {isManuallyModifiedRecord(report.date_creation, report.date_last_content_edit) && (
                                <ModifiedManuallyBadge title={t('timeentry.corrected_traced')} />
                              )}
                              {canReadAll && (
                                <>
                                  <input aria-label={t('processed_history.select_entry_aria')} type="checkbox" checked={selectedIds.includes(Number(report.id))} onChange={() => toggleSelected(report.id)} />
                                  <button type="button" onClick={() => setDeleteRequest({ type: 'single', ids: [Number(report.id)] })} className="tw-rounded-lg tw-border tw-border-rose-200 tw-bg-rose-50 tw-px-3 tw-py-1.5 tw-text-xs tw-font-medium tw-text-rose-700 tw-hover:bg-rose-100">
                                    {t('daily_report.delete')}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="tw-mt-3 tw-flex tw-items-center tw-justify-end">
                            <button
                              type="button"
                              onClick={() => setSelectedReport(report)}
                              className="tw-rounded-lg tw-border tw-border-sky-200 tw-bg-sky-50 tw-px-3 tw-py-1.5 tw-text-xs tw-font-medium tw-text-sky-700 tw-hover:bg-sky-100"
                            >
                              {t('daily_report.read_report')}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {deleteRequest && (
        <div className="tw-fixed tw-inset-0 tw-z-50 tw-flex tw-items-center tw-justify-center tw-bg-slate-900/40 tw-px-4">
          <div className="tw-w-full tw-max-w-md tw-rounded-2xl tw-bg-white tw-p-6 tw-shadow-xl">
            <h3 className="tw-text-lg tw-font-semibold tw-text-slate-900">{t('processed_history.delete.confirm_title')}</h3>
            <p className="tw-mt-2 tw-text-sm tw-text-slate-600">{t('processed_history.delete.confirm_text', { count: deleteRequest.ids.length })}</p>
            <div className="tw-mt-5 tw-flex tw-justify-end tw-gap-3">
              <button type="button" onClick={() => setDeleteRequest(null)} className="tw-rounded tw-border tw-border-slate-200 tw-px-4 tw-py-2 tw-text-sm tw-text-slate-700">
                {t('common.cancel')}
              </button>
              <button type="button" onClick={submitHardDelete} className="tw-rounded tw-bg-[#d64c4c] tw-px-4 tw-py-2 tw-text-sm tw-text-white">
                {t('timeentry.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedReport && <ReadDailyReportModal report={selectedReport} onClose={() => setSelectedReport(null)} />}
    </div>
  );
}
