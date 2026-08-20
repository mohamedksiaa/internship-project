import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  exportProcessedHistory,
  getProcessedHistory,
  getProjects,
  hardDeleteTimeEntry,
  hardDeleteTimeEntries,
} from '../api/timeflowApi';
import StatusBadge from '../components/atoms/StatusBadge';
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
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], pagination: {}, stats: {} });
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleteRequest, setDeleteRequest] = useState(null);
  const globalCheckboxRef = useRef(null);

  useEffect(() => {
    getProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  const refreshHistory = async () => {
    const next = await getProcessedHistory({ ...filters, page, per_page: 50 });
    setData(next);
    setSelectedIds([]);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setSuccess('');
    getProcessedHistory({ ...filters, page, per_page: 50 })
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

  // Reset selections whenever the visible data changes (filters, page)
  useEffect(() => {
    setSelectedIds([]);
  }, [data.rows]);

  const update = (key, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const grouped = data.rows.reduce((all, entry) => {
    const key = String(entry.date_start || '').slice(0, 10);
    (all[key] ||= []).push(entry);
    return all;
  }, {});

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

  const selectAllForGroup = (rows, checked) => {
    const rowIds = rows.map((row) => Number(row.id));
    setSelectedIds((current) => {
      if (checked) {
        return Array.from(new Set([...current, ...rowIds]));
      }
      return current.filter((id) => !rowIds.includes(Number(id)));
    });
  };

  const csv = async () => {
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
      if (type === 'single') {
        await hardDeleteTimeEntry(ids[0]);
      } else {
        await hardDeleteTimeEntries(ids);
      }
      setDeleteRequest(null);
      await refreshHistory();
      // Show success toast/message
      setSuccess(t('processed_history.delete.success', { count: ids.length }));
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err.message);
      setDeleteRequest(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-6 px-5 py-7">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.24em] text-slate-500">{t('app.section_manage')}</p>
            <h1 className="text-2xl font-semibold">{t('processed_history.title')}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={csv} className="rounded bg-[#03a9f4] px-4 py-2 text-white">
              {t('processed_history.export_csv')}
            </button>
            <label className="flex items-center gap-2">
              <input
                ref={globalCheckboxRef}
                aria-label={t('processed_history.select_page_aria')}
                type="checkbox"
                checked={data.rows.length > 0 && data.rows.every((row) => selectedIds.includes(Number(row.id)))}
                onChange={(event) => selectAllForPage(event.target.checked)}
              />
              <span className="text-sm text-slate-700">{t('processed_history.select_page')}</span>
            </label>
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => setDeleteRequest({ type: 'multiple', ids: Array.from(selectedIds) })}
                className="rounded bg-[#d64c4c] px-4 py-2 text-white"
              >
                {t('processed_history.delete.selection', { count: selectedIds.length })}
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <select aria-label={t('processed_history.filters.status')} value={filters.status} onChange={(event) => update('status', event.target.value)} className="rounded border p-2">
            <option value="all">{t('processed_history.filters.validated_and_rejected')}</option>
            <option value="validated">{t('status.validated')}</option>
            <option value="refused">{t('status.rejected')}</option>
          </select>

          <select aria-label={t('processed_history.filters.employee')} value={filters.employee_id} onChange={(event) => update('employee_id', event.target.value)} className="rounded border p-2">
            <option value="">{t('processed_history.filters.all_employees')}</option>
            {data.employees?.map((user) => (
              <option key={user.id} value={user.id}>{user.label}</option>
            ))}
          </select>

          <select aria-label={t('processed_history.filters.project')} value={filters.project_id} onChange={(event) => update('project_id', event.target.value)} className="rounded border p-2">
            <option value="">{t('processed_history.filters.all_projects')}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.title}</option>
            ))}
          </select>

          <input aria-label={t('processed_history.filters.start_date')} type="date" value={filters.date_from} onChange={(event) => update('date_from', event.target.value)} className="rounded border p-2" />
          <input aria-label={t('processed_history.filters.end_date')} type="date" value={filters.date_to} onChange={(event) => update('date_to', event.target.value)} className="rounded border p-2" />

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={filters.manual_only} onChange={(event) => update('manual_only', event.target.checked)} />
            {t('processed_history.filters.modified_only')}
          </label>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded bg-white p-4">
          {t('processed_history.stats.validated_hours')} <strong>{formatDuration(data.stats.validated_seconds)}</strong>
        </div>
        <div className="rounded bg-white p-4">
          {t('processed_history.stats.rejected_entries')} <strong>{data.stats.refused_count || 0}</strong>
        </div>
        <div className="rounded bg-white p-4">
          {t('processed_history.stats.modified_entries')} <strong>{data.stats.manual_count || 0}</strong>
        </div>
      </section>

      {error && <p className="text-red-600">{error}</p>}
      {success && <p className="text-green-600">{success}</p>}
      {loading && <p>{t('loading')}</p>}

      {!loading && Object.entries(grouped).map(([day, rows]) => (
        <section key={day} className="overflow-x-auto bg-white">
          <div className="flex justify-between bg-slate-100 p-3">
            <strong>{day}</strong>
            <span>{t('processed_history.total')}: {formatDuration(rows.reduce((sum, row) => sum + Number(row.duration || 0), 0))}</span>
          </div>

          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {canReadAll && (
                  <th className="w-10 px-2 py-2 text-center">
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
                <th className="px-2 py-2">{t('processed_history.columns.task')}</th>
                <th className="px-2 py-2">{t('processed_history.columns.project')}</th>
                <th className="px-2 py-2">{t('processed_history.columns.who')}</th>
                <th className="px-2 py-2">{t('processed_history.columns.start')}</th>
                <th className="px-2 py-2">{t('processed_history.columns.end')}</th>
                <th className="px-2 py-2">{t('processed_history.columns.status')}</th>
                <th className="px-2 py-2">{t('processed_history.columns.duration')}</th>
                <th className="px-2 py-2">{t('processed_history.columns.modification')}</th>
                <th className="px-2 py-2">{t('processed_history.columns.processed_by_at')}</th>
                {canReadAll && <th className="px-2 py-2 text-right">{t('processed_history.columns.actions')}</th>}
              </tr>
            </thead>

            <tbody>
              {rows.map((entry) => (
                <tr key={entry.id} className="border-t">
                  {canReadAll && (
                    <td className="px-2 py-2 text-center">
                      <input
                        aria-label={t('processed_history.select_entry_aria')}
                        type="checkbox"
                        checked={selectedIds.includes(Number(entry.id))}
                        onChange={() => toggleSelected(entry.id)}
                      />
                    </td>
                  )}
                  <td className="px-2 py-2">{entry.note || t('timeentry.no_description')}</td>
                  <td className="px-2 py-2">{entry.project_label}</td>
                  <td className="px-2 py-2">{entry.user_label}</td>
                  <td className="px-2 py-2">{dateTime(entry.date_start)}</td>
                  <td className="px-2 py-2">{dateTime(entry.date_end)}</td>
                  <td className="px-2 py-2"><StatusBadge status={Number(entry.status)} /></td>
                  <td className="px-2 py-2">{formatDuration(entry.duration)}</td>
                  <td className="px-2 py-2">{entry.manual_modified ? t('processed_history.modified_manually') : '—'}</td>
                  <td className="px-2 py-2">
                    {entry.processed_by_label || '—'}
                    <br />
                    {dateTime(entry.processed_at)}
                  </td>
                  {canReadAll && (
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        aria-label={t('processed_history.delete.entry_aria')}
                        onClick={() => setDeleteRequest({ type: 'single', ids: [Number(entry.id)] })}
                        className="rounded bg-[#d64c4c] px-2 py-1 text-xs font-medium text-white"
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

      {!loading && !data.rows.length && <p className="rounded bg-white p-5">{t('processed_history.empty')}</p>}

      <div className="flex justify-between">
        <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
          {t('processed_history.pagination.previous')}
        </button>
        <span>{t('processed_history.pagination.page', { current: data.pagination.page || 1, total: data.pagination.pages || 1 })}</span>
        <button type="button" disabled={page >= (data.pagination.pages || 1)} onClick={() => setPage((current) => current + 1)}>
          {t('processed_history.pagination.next')}
        </button>
      </div>

      {deleteRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-history-title">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 id="delete-history-title" className="text-lg font-semibold text-[#263746]">{t('processed_history.delete.title')}</h2>
                <p className="mt-1 text-sm text-[#52656f]">{t('processed_history.delete.irreversible')}</p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteRequest(null)}
                aria-label={t('timeentry.close')}
                className="text-lg leading-none text-[#78909c] hover:text-[#2c3e49]"
              >
                ×
              </button>
            </div>

            <p className="mt-4 text-sm text-[#52656f]">
              {deleteRequest.type === 'single'
                ? t('processed_history.delete.single_confirmation')
                : t('processed_history.delete.multiple_confirmation', { count: deleteRequest.ids.length })}
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteRequest(null)} className="text-sm text-[#52656f]">
                {t('cancel')}
              </button>
              <button type="button" onClick={submitHardDelete} className="rounded bg-[#d64c4c] px-4 py-2 text-sm font-medium text-white">
                {t('timeentry.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
