import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { approveTimeEntry, correctTimeEntry, deleteTimeEntry, rejectTimeEntry, submitEntry } from '../../api/timeflowApi';
import { formatDuration } from '../../utils/FormatDuration.js';
import StatusBadge from '../atoms/StatusBadge.jsx';
import EditHistoryModal from '../molecules/EditHistoryModal.jsx';

function entryDate(value) {
  // An absent date must never be rendered as 1 January 1970. It is either
  // displayed in the explicit “date non renseignée” group or rejected by
  // controls that require a persisted entry id.
  if (!value) return new Date(Number.NaN);
  const raw = String(value);
  return /^[0-9]+$/.test(raw) ? new Date(Number(raw) * (raw.length === 10 ? 1000 : 1)) : new Date(value);
}

function dateLabel(value, t) {
  const date = entryDate(value);
  if (Number.isNaN(date.getTime())) return t('timeentry.date_unknown');
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return t('timeentry.today');
  return date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function timeLabel(value, t) {
  const date = entryDate(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function endTimeLabel(entry, t) {
  if (entry.date_end) return timeLabel(entry.date_end, t);
  const start = entryDate(entry.date_start);
  if (!Number.isNaN(start.getTime()) && Number(entry.duration) > 0) {
    return timeLabel(new Date(start.getTime() + Number(entry.duration) * 1000), t);
  }
  return entry.status === 0 ? t('timeentry.in_progress') : '—';
}

// Groups entries that belong to the same "resumed" task: same project, same
// task, same description. A fresh resume always copies these three fields
// verbatim onto the new entry, so exact equality is enough — no fuzzy match.
export function taskClusterKey(entry) {
  return `${entry.fk_project ?? ''}|${entry.fk_task ?? ''}|${(entry.note || '').trim()}`;
}

export function isManuallyModifiedRecord(dateCreation, dateLastContentEdit) {
  if (!dateCreation || !dateLastContentEdit) return false;
  return String(dateLastContentEdit) !== String(dateCreation);
}

export function ModifiedManuallyBadge({ onClick, title, className='' }) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? t('timeentry.corrected_traced')}
      className={`tw-rounded-full tw-bg-amber-50 dark:tw-bg-amber-900/40 tw-px-2 tw-py-0.5 tw-text-xs tw-font-medium tw-text-amber-700 dark:tw-text-amber-300 ${className}`}
    >
      {t('timeentry.modified_manually')}
    </button>
  );
}

function toDateTimeLocal(value) {
  const date = entryDate(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function TimeEntryList({
  entries: initialEntries = [],
  setEntries: setParentEntries,
  projects = [],
  showWorker = false,
  showValidationActions = false,
  onRestartEntry,
  activeEntryId = null,
  activeSeconds = 0,
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [busyBatch, setBusyBatch] = useState(false);
  const [entryToCorrect, setEntryToCorrect] = useState(null);
  const [correction, setCorrection] = useState({ date_start: '', date_end: '', reason: '' });
  const [originalCorrection, setOriginalCorrection] = useState({ date_start: '', date_end: '' });
  const [historyEntry, setHistoryEntry] = useState(null);
  const [entryToDelete, setEntryToDelete] = useState(null);
  const [correctionError, setCorrectionError] = useState('');

  useEffect(() => setEntries(initialEntries), [initialEntries]);
  // Reset selection when the entries list changes
  useEffect(() => setSelectedIds(new Set()), [entries]);

  const { t } = useTranslation();

  const workerName = (entry) =>
    entry.user_label ||
    entry.user_name ||
    entry.user_login ||
    (Number(entry.fk_user) > 0 ? t('dashboard.user_fallback', { userId: entry.fk_user }) : '—');

  const displayedDuration = (entry) => (
    activeEntryId != null && entry.id != null && Number(entry.id) === Number(activeEntryId)
      ? Number(activeSeconds || 0)
      : Number(entry.duration || 0)
  );

  const groups = useMemo(
    () =>
      entries.reduce((result, entry) => {
        const date = entryDate(entry.date_start);
        const key = Number.isNaN(date.getTime()) ? 'unknown-date' : date.toDateString();
        (result[key] ||= []).push(entry);
        return result;
      }, {}),
    [entries]
  );

  // A timer left running past the max-duration cap is split at midnight into
  // several entries server-side (see TimeEntry::stopTimer()), chained via
  // fk_split_previous. This is a single continuous session interrupted only
  // for calendar-day bookkeeping — never a voluntary resume — so it must
  // never be confused with the "×N segments" cluster badge above, which
  // groups same-day same-task rows. Looked up across the whole entries list
  // (not just the current day group), since the linked half always lives in
  // a different day's group.
  const splitSuccessorIds = useMemo(() => {
    const ids = new Set();
    entries.forEach((entry) => {
      if (entry.fk_split_previous != null) ids.add(Number(entry.fk_split_previous));
    });
    return ids;
  }, [entries]);

  // Pagination for groups: split into pages where each page contains at most
  // `maxEntriesPerPage` entries (sum of group lengths). A single group that
  // exceeds the limit occupies its own page.
  const [currentPage, setCurrentPage] = useState(1);
  const paginateGroups = (groupsObj, maxEntriesPerPage = 15) => {
    const entriesArr = Object.entries(groupsObj || {});
    const pagesArr = [];
    let currentPageGroups = [];
    let currentCount = 0;
    for (const [key, group] of entriesArr) {
      const groupSize = (group && group.length) || 0;
      // If adding this group would exceed the max for the current page,
      // start a new page (unless the current page is empty — then the
      // large group still occupies that page alone).
      if (currentCount > 0 && currentCount + groupSize > maxEntriesPerPage) {
        pagesArr.push(currentPageGroups);
        currentPageGroups = [];
        currentCount = 0;
      }
      currentPageGroups.push([key, group]);
      currentCount += groupSize;
    }
    if (currentPageGroups.length) pagesArr.push(currentPageGroups);
    return pagesArr;
  };
  const pages = useMemo(() => paginateGroups(groups, 15), [groups]);
  // Reset to first page whenever the underlying entries change.
  useEffect(() => setCurrentPage(1), [entries]);
  const currentGroups = pages.length ? pages[currentPage - 1] : Object.entries(groups);

  const getProjectId = (entry) => Number(entry.fk_project || entry.projectId || entry.project_id || entry.project?.id || 0);

  const decide = async (id, status) => {
    setBusyId(id);
    setError('');
    try {
      if (status === 2) await approveTimeEntry(id);
      else await rejectTimeEntry(id);
      const next = entries.map((entry) => (entry.id === id ? { ...entry, status } : entry));
      setEntries(next);
      setParentEntries?.(next);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  // Toggle individual selection
  const toggleSelect = (id) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Toggle all entries in a group (by day)
  const toggleSelectGroup = (group) => {
    const ids = group.map((e) => e.id).filter(Boolean);
    setSelectedIds((current) => {
      const next = new Set(current);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  // Batch delete selected entries (reuses deleteTimeEntry API)
  const confirmDeleteSelection = async () => {
    const toDelete = Array.from(selectedIds).filter(Boolean);
    if (!toDelete.length) return;
    if (!window.confirm(t('processed_history.delete.multiple_confirmation', { count: toDelete.length }))) return;
    setBusyBatch(true);
    setError('');
    try {
      const results = await Promise.allSettled(toDelete.map((id) => deleteTimeEntry(id)));
      const succeeded = results
        .map((r, idx) => (r.status === 'fulfilled' ? toDelete[idx] : null))
        .filter(Boolean);
      if (succeeded.length) {
        const deletedSet = new Set(succeeded);
        const next = entries.filter((entry) => !deletedSet.has(entry.id));
        setEntries(next);
        setParentEntries?.(next);
      }
      // If some deletions failed, surface an error
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length) {
        setError(t('processed_history.delete.partial_error', { failed: failed.length }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyBatch(false);
      setSelectedIds(new Set());
    }
  };

  const restartEntry = async (entry) => {
    setBusyId(entry.id);
    setError('');
    try {
      if (!onRestartEntry) throw new Error('Relance du chrono indisponible.');
      const resumed = await onRestartEntry(entry);
      if (!resumed?.id) throw new Error('Le serveur n’a pas renvoyé le chrono repris.');
      const newEntry = {
        ...entry,
        ...resumed,
        id: resumed.id,
        rowid: resumed.rowid ?? resumed.id,
      };
      // The server always creates a brand new entry on resume — the previous
      // row is never rewritten, so it stays exactly where it already is.
      const next = [newEntry, ...entries];
      setEntries(next);
      setParentEntries?.(next);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const submitDraft = async (entry) => {
    setBusyId(entry.id);
    setError('');
    try {
      const updated = await submitEntry(entry.id);
      const next = entries.map((item) => (item.id === entry.id ? { ...item, ...updated, status: 1 } : item));
      setEntries(next);
      setParentEntries?.(next);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const confirmDeleteEntry = async () => {
    if (!entryToDelete) return;
    const entry = entryToDelete;
    setEntryToDelete(null);
    setBusyId(entry.id);
    setError('');
    try {
      await deleteTimeEntry(entry.id);
      const next = entries.filter((item) => Number(item.id) !== Number(entry.id));
      setEntries(next);
      setParentEntries?.(next);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const deleteEntry = (entry) => {
    setEntryToDelete(entry);
  };

  const openCorrection = (entry) => {
    setError('');
    setCorrectionError('');
    setEntryToCorrect(entry);
    const original = {
      date_start: toDateTimeLocal(entry.date_start),
      date_end: toDateTimeLocal(entry.date_end),
    };
    setOriginalCorrection(original);
    setCorrection({
      ...original,
      reason: '',
    });
  };

  const saveCorrection = async (event) => {
    event.preventDefault();
    if (!entryToCorrect) return;
    const start = new Date(correction.date_start);
    const end = new Date(correction.date_end);
    const reason = correction.reason.trim();
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        setCorrectionError(t('timeentry.error_end_after_start'));
      return;
    }
    if (reason.length < 5) {
        setCorrectionError(t('timeentry.error_reason_required'));
      return;
    }
    setBusyId(entryToCorrect.id);
    setCorrectionError('');
    try {
      // datetime-local has no offset. Convert changed fields to ISO explicitly
      // so PHP receives the employee's instant, not a server-local wall time.
      // Do not send an untouched field: the server must preserve it verbatim.
      const payload = { reason };
      if (correction.date_start !== originalCorrection.date_start) payload.date_start = start.toISOString();
      if (correction.date_end !== originalCorrection.date_end) payload.date_end = end.toISOString();
      if (!Object.prototype.hasOwnProperty.call(payload, 'date_start') && !Object.prototype.hasOwnProperty.call(payload, 'date_end')) {
        setCorrectionError('Aucune heure n’a été modifiée.');
        return;
      }
      const updated = await correctTimeEntry(entryToCorrect.id, payload);
      const next = entries.map((entry) => (entry.id === entryToCorrect.id ? { ...entry, ...updated } : entry));
      setEntries(next);
      setParentEntries?.(next);
      setEntryToCorrect(null);
    } catch (err) {
      setCorrectionError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const projectName = (entry) => {
    if (typeof entry.project_label === 'string' && entry.project_label) return entry.project_label;
    if (typeof entry.project_name === 'string' && entry.project_name) return entry.project_name;
    if (typeof entry.project === 'string' && entry.project) return entry.project;
    if (entry.project?.title || entry.project?.label || entry.project?.name) {
      return entry.project.title || entry.project.label || entry.project.name;
    }
    const targetId = getProjectId(entry);
    const found = projects.find((p) => Number(p.id || p.rowid || p.value) === targetId);
    return found ? (found.title || found.label || found.name || found.ref) : t('timeentry.project_unknown');
  };

  if (!entries.length) {
    return (
      <div className="tw-border tw-border-[#dce5ea] dark:tw-border-slate-700 tw-bg-white dark:tw-bg-slate-900 tw-px-5 tw-py-6 tw-text-sm tw-text-[#71838f] dark:tw-text-slate-400">
        {t('timeentry.no_entries')}
      </div>
    );
  }

  return (
    <section className="tw-space-y-6">
      {error && <p className="tw-whitespace-pre-line tw-text-sm tw-text-[#d64c4c] dark:tw-text-[#f0908f]">{error}</p>}
      {selectedIds.size > 0 && (
        <div className="tw-flex tw-justify-end">
          <button
            type="button"
            onClick={confirmDeleteSelection}
            disabled={busyBatch}
            className="tw-rounded tw-bg-[#d64c4c] tw-px-3 tw-py-1 tw-text-sm tw-font-medium tw-text-white hover:tw-bg-[#b93d3d] disabled:tw-opacity-50"
          >
            {t('processed_history.delete.selection', { count: selectedIds.size })}
          </button>
        </div>
      )}
      {currentGroups.map(([key, group]) => {
        const total = group.reduce((sum, entry) => sum + displayedDuration(entry), 0);
        // Several entries can share the same task (project + task + note) —
        // typically a "resumed" task, which now always creates a brand new
        // entry rather than reopening the old one. Cluster them by that key
        // so the last row of each cluster can carry a "×N segments · total"
        // summary badge instead of one badge per row.
        const taskClusters = new Map();
        group.forEach((entry) => {
          const clusterKey = taskClusterKey(entry);
          const cluster = taskClusters.get(clusterKey) || { count: 0, total: 0, lastId: null };
          cluster.count += 1;
          cluster.total += displayedDuration(entry);
          cluster.lastId = entry.id;
          taskClusters.set(clusterKey, cluster);
        });
        return (
          <div key={key} className="tw-border-b-4 tw-border-[#e3ebef] dark:tw-border-slate-800 tw-bg-white dark:tw-bg-slate-900 tw-overflow-x-auto">
            <div className="tw-flex tw-items-center tw-justify-between tw-bg-[#e5edf1] dark:tw-bg-slate-800 tw-px-5 tw-py-2 tw-text-sm tw-text-[#52656f] dark:tw-text-slate-300">
              <div className="tw-flex tw-items-center tw-gap-3">
                {/** group selection checkbox */}
                {(() => {
                  const allSelected = group.every((e) => selectedIds.has(e.id));
                  return (
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => toggleSelectGroup(group)}
                      aria-label={t('processed_history.select_group_aria', { day: key })}
                      className="tw-h-4 tw-w-4"
                    />
                  );
                })()}
                <span>{key === 'unknown-date' ? t('timeentry.date_unknown') : dateLabel(group[0].date_start, t)}</span>
              </div>
              <span>
                {t('timeentry.total')}:&nbsp; <strong className="tw-text-sm tw-text-[#2a3c47] dark:tw-text-slate-100">{formatDuration(total)}</strong>
              </span>
            </div>

            <table className="tw-w-full tw-text-left tw-border-collapse">
              <thead>
                <tr className="tw-border-b tw-border-[#dce5ea] dark:tw-border-slate-700 tw-bg-white dark:tw-bg-slate-900 tw-text-[11px] tw-font-medium tw-uppercase tw-tracking-wide tw-text-[#8a9aa4] dark:tw-text-slate-500">
                  <th className="tw-px-3 tw-py-2" />
                  <th className="tw-px-5 tw-py-2">{t('timeentry.col_task')}</th>
                  <th className="tw-px-3 tw-py-2">{t('timeentry.col_project')}</th>
                  {showWorker && <th className="tw-px-3 tw-py-2">{t('timeentry.col_who')}</th>}
                  <th className="tw-px-3 tw-py-2">{t('timeentry.col_start')}</th>
                  <th className="tw-px-3 tw-py-2">{t('timeentry.col_end')}</th>
                  <th className="tw-px-3 tw-py-2">{t('timeentry.col_status')}</th>
                  <th className="tw-px-3 tw-py-2 tw-text-right">{t('timeentry.col_duration')}</th>
                  <th className="tw-px-3 tw-py-2 tw-text-center">{t('timeentry.col_modified')}</th>
                  <th className="tw-px-5 tw-py-2 tw-text-right">{t('timeentry.col_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {group.map((entry) => (
                  <tr key={entry.id} className="tw-border-b tw-border-[#dce5ea] dark:tw-border-slate-700 hover:tw-bg-[#f9fbfd] dark:hover:tw-bg-slate-800 tw-text-sm tw-text-[#2c3e49] dark:tw-text-slate-200">
                    <td className="tw-px-3 tw-py-3 tw-w-8">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(entry.id)}
                        onChange={() => toggleSelect(entry.id)}
                        aria-label={t('processed_history.select_entry_aria')}
                        className="tw-h-4 tw-w-4"
                      />
                    </td>
                    <td className="tw-px-5 tw-py-3 tw-min-w-[180px]">
                      <p className="tw-font-medium tw-text-[#2c3e49] dark:tw-text-slate-200 tw-truncate">{entry.note || t('timeentry.no_description')}</p>
                    </td>
                    <td className="tw-px-3 tw-py-3 tw-text-[#5B8FA8] dark:tw-text-[#8fc0d9] tw-font-medium tw-truncate tw-min-w-[120px]">
                      {projectName(entry)}
                    </td>
                    {showWorker && (
                      <td className="tw-px-3 tw-py-3 tw-text-[#52656f] dark:tw-text-slate-400 tw-truncate">
                        {workerName(entry)}
                      </td>
                    )}
                    <td className="tw-px-3 tw-py-3 tw-text-[#4d606b] dark:tw-text-slate-400 tw-whitespace-nowrap">
                      {entry.fk_split_previous != null && (
                        <span
                          title={t('timeentry.split_previous_day')}
                          aria-label={t('timeentry.split_previous_day')}
                          className="tw-mr-1 tw-text-[#9aa9b1] dark:tw-text-slate-500"
                        >
                          ⤴
                        </span>
                      )}
                      {timeLabel(entry.date_start, t)}
                    </td>
                    <td className="tw-px-3 tw-py-3 tw-text-[#4d606b] dark:tw-text-slate-400 tw-whitespace-nowrap">
                      {endTimeLabel(entry, t)}
                      {entry.id != null && splitSuccessorIds.has(Number(entry.id)) && (
                        <span
                          title={t('timeentry.split_next_day')}
                          aria-label={t('timeentry.split_next_day')}
                          className="tw-ml-1 tw-text-[#9aa9b1] dark:tw-text-slate-500"
                        >
                          ⤵
                        </span>
                      )}
                    </td>
                    <td className="tw-px-3 tw-py-3 tw-whitespace-nowrap">
                      <StatusBadge status={Number(entry.status)} />
                    </td>
                    <td className="tw-px-3 tw-py-3 tw-text-right tw-font-bold tw-text-[#2b3d48] dark:tw-text-slate-100 tw-whitespace-nowrap">
                      {formatDuration(displayedDuration(entry))}
                    </td>
                    <td className="tw-px-3 tw-py-3 tw-text-center tw-whitespace-nowrap">
                      {entry.manual_modified ? (
                        <ModifiedManuallyBadge
                          onClick={() => setHistoryEntry(entry)}
                          title={entry.manual_reason ? `${t('timeentry.corrected_with_reason')}: ${entry.manual_reason}` : t('timeentry.corrected_traced')}
                        />
                      ) : '—'}
                    </td>
                    <td className="tw-px-5 tw-py-3 tw-text-right tw-whitespace-nowrap">
                      <div className="tw-flex tw-justify-end tw-items-center tw-gap-2 tw-text-[#78909c] dark:tw-text-slate-400">
                        {entry.id != null && entry.status === 0 && entry.date_end && (
                          <button
                            title={t('timeentry.title_submit')}
                            onClick={() => submitDraft(entry)}
                            disabled={busyId === entry.id}
                            className="tw-text-[#5B8FA8]"
                          >
                            {busyId === entry.id ? '…' : '⇪'}
                          </button>
                        )}
                        {showValidationActions && entry.status === 1 && (
                          <>
                              <button
                              title={t('timeentry.title_validate')}
                              onClick={() => decide(entry.id, 2)}
                              disabled={busyId === entry.id}
                              className="tw-text-[#5B8FA8]"
                            >
                              {busyId === entry.id ? '…' : '✓'}
                            </button>
                            <button
                              title={t('timeentry.title_reject')}
                              onClick={() => decide(entry.id, 9)}
                              disabled={busyId === entry.id}
                              className="tw-text-[#d66]"
                            >
                              ×
                            </button>
                          </>
                        )}
                        {entry.id != null && onRestartEntry && <button
                          title={t('timeentry.title_restart')}
                          onClick={() => restartEntry(entry)}
                          disabled={busyId !== null}
                          className="tw-text-[#5B8FA8]"
                        >
                          ▷
                        </button>}
                        {/* Validation is a strictly read/approve/reject manager view.
                            Never render a manual-edit control there, even if an API
                            payload incorrectly flags an entry as editable. */}
                        {!showValidationActions && entry.id != null && entry.manual_editable && (
                          <button
                            type="button"
                            title={t('timeentry.title_edit')}
                            aria-label={t('timeentry.title_edit')}
                            onClick={() => openCorrection(entry)}
                            disabled={busyId !== null}
                            className="tw-text-[#5B8FA8]"
                          >
                            {t('timeentry.title_edit')}
                          </button>
                        )}
                        {!showValidationActions && entry.id != null && entry.delete_allowed && (
                          <button
                            type="button"
                            title={t('timeentry.title_delete')}
                            aria-label={t('timeentry.title_delete')}
                            onClick={() => deleteEntry(entry)}
                            disabled={busyId !== null}
                            className="tw-text-[#d64c4c] dark:tw-text-[#f0908f] disabled:tw-opacity-50"
                          >
                            {busyId === entry.id ? '…' : '🗑'}
                          </button>
                        )}
                        {(() => {
                          const cluster = taskClusters.get(taskClusterKey(entry));
                          if (!cluster || cluster.count <= 1 || cluster.lastId !== entry.id) return null;
                          return (
                            <span
                              title={t('timeentry.title_task_segments')}
                              className="tw-rounded-full tw-bg-[#eaf6fd] dark:tw-bg-[#5B8FA8]/20 tw-px-2 tw-py-0.5 tw-text-xs tw-font-medium tw-text-[#5B8FA8] dark:tw-text-[#8fc0d9]"
                            >
                              ×{cluster.count} · {formatDuration(cluster.total)}
                            </span>
                          );
                        })()}
                                              </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      {pages.length > 1 && (
        <div className="tw-flex tw-items-center tw-justify-between">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="tw-rounded tw-bg-[#e5edf1] dark:tw-bg-slate-800 tw-px-3 tw-py-1 tw-text-sm tw-text-[#52656f] dark:tw-text-slate-300 disabled:tw-opacity-50"
          >
            ← {t('processed_history.pagination.previous')}
          </button>
          <span className="tw-text-sm tw-text-slate-600 dark:tw-text-slate-400">{t('processed_history.pagination.page', { current: currentPage, total: pages.length })}</span>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(pages.length, p + 1))}
            disabled={currentPage >= pages.length}
            className="tw-rounded tw-bg-[#e5edf1] dark:tw-bg-slate-800 tw-px-3 tw-py-1 tw-text-sm tw-text-[#52656f] dark:tw-text-slate-300 disabled:tw-opacity-50"
          >
            {t('processed_history.pagination.next')} →
          </button>
        </div>
      )}
      {entryToDelete && (
        <div className="tw-fixed tw-inset-0 tw-z-50 tw-flex tw-items-center tw-justify-center tw-bg-black/40 tw-p-4" role="dialog" aria-modal="true" aria-labelledby="delete-title">
          <div className="tw-w-full tw-max-w-md tw-space-y-4 tw-rounded-lg tw-bg-white dark:tw-bg-slate-900 dark:tw-border dark:tw-border-slate-700 tw-p-6 tw-shadow-xl">
            <div className="tw-flex tw-items-start tw-justify-between tw-gap-4">
              <div>
                <h2 id="delete-title" className="tw-text-lg tw-font-semibold tw-text-[#263746] dark:tw-text-slate-100">{t('timeentry.delete_title')}</h2>
                <p className="tw-mt-1 tw-text-sm tw-text-[#52656f] dark:tw-text-slate-400">{t('timeentry.delete_irreversible')}</p>
              </div>
              <button
                type="button"
                onClick={() => setEntryToDelete(null)}
                aria-label={t('timeentry.close')}
                className="tw-text-lg tw-leading-none tw-text-[#78909c] dark:tw-text-slate-400 hover:tw-text-[#2c3e49] dark:hover:tw-text-slate-100"
              >
                ×
              </button>
            </div>

            <p className="tw-text-sm tw-text-[#52656f] dark:tw-text-slate-400">
                {entryToDelete.delete_requires_strong_confirmation
                ? t('timeentry.delete_requires_confirmation')
                : t('timeentry.delete_confirm')}
            </p>

            <div className="tw-flex tw-justify-end tw-gap-3">
              <button type="button" onClick={() => setEntryToDelete(null)} className="tw-text-sm tw-text-[#52656f] dark:tw-text-slate-300">{t('timeentry.cancel')}</button>
              <button type="button" onClick={confirmDeleteEntry} className="tw-rounded tw-bg-[#d64c4c] tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-white hover:tw-bg-[#b93d3d]">
                {t('timeentry.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
      {entryToCorrect && (
        <div className="tw-fixed tw-inset-0 tw-z-50 tw-flex tw-items-center tw-justify-center tw-bg-black/40 tw-p-4" role="dialog" aria-modal="true" aria-labelledby="correction-title">
          <form onSubmit={saveCorrection} className="tw-w-full tw-max-w-md tw-space-y-4 tw-rounded-lg tw-bg-white dark:tw-bg-slate-900 dark:tw-border dark:tw-border-slate-700 tw-p-6 tw-shadow-xl">
            <div>
              <h2 id="correction-title" className="tw-text-lg tw-font-semibold tw-text-[#263746] dark:tw-text-slate-100">{t('timeentry.edit_title')}</h2>
              <p className="tw-mt-1 tw-text-sm tw-text-[#52656f] dark:tw-text-slate-400">
                {entryToCorrect.manual_edit_message || t('timeentry.edit_manual_message')}
              </p>
            </div>
            {correctionError && (
              <p className="tw-whitespace-pre-line tw-rounded-md tw-bg-rose-50 dark:tw-bg-rose-900/30 tw-px-3 tw-py-2 tw-text-sm tw-text-rose-600 dark:tw-text-rose-300">{correctionError}</p>
            )}
            <label className="tw-block tw-text-sm tw-font-medium tw-text-[#2c3e49] dark:tw-text-slate-200">
              {t('timeentry.col_start')}
              <input
                type="datetime-local"
                value={correction.date_start}
                disabled={entryToCorrect.manual_edit_end_only}
                onChange={(event) => setCorrection((current) => ({ ...current, date_start: event.target.value }))}
                className="tw-mt-1 tw-w-full tw-rounded tw-border tw-border-[#cfd9df] dark:tw-border-slate-600 tw-px-3 tw-py-2 dark:tw-bg-slate-800 dark:tw-text-slate-100 disabled:tw-bg-slate-100 dark:disabled:tw-bg-slate-700"
                required
              />
            </label>
            <label className="tw-block tw-text-sm tw-font-medium tw-text-[#2c3e49] dark:tw-text-slate-200">
              {t('timeentry.col_end')}
              <input
                type="datetime-local"
                value={correction.date_end}
                onChange={(event) => setCorrection((current) => ({ ...current, date_end: event.target.value }))}
                className="tw-mt-1 tw-w-full tw-rounded tw-border tw-border-[#cfd9df] dark:tw-border-slate-600 tw-px-3 tw-py-2 dark:tw-bg-slate-800 dark:tw-text-slate-100"
                required
              />
            </label>
            <label className="tw-block tw-text-sm tw-font-medium tw-text-[#2c3e49] dark:tw-text-slate-200">
              {t('timeentry.edit_reason')}
              <textarea
                value={correction.reason}
                onChange={(event) => setCorrection((current) => ({ ...current, reason: event.target.value }))}
                className="tw-mt-1 tw-w-full tw-rounded tw-border tw-border-[#cfd9df] dark:tw-border-slate-600 tw-px-3 tw-py-2 dark:tw-bg-slate-800 dark:tw-text-slate-100"
                rows="3"
              />
            </label>
            <div className="tw-flex tw-justify-end tw-gap-3">
              <button type="button" onClick={() => setEntryToCorrect(null)} disabled={busyId !== null} className="tw-text-sm tw-text-[#52656f] dark:tw-text-slate-300">{t('cancel')}</button>
              <button type="submit" disabled={busyId === entryToCorrect.id || correction.reason.trim().length < 5} className="tw-rounded tw-bg-[#5B8FA8] tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-white disabled:tw-opacity-50">
                {busyId === entryToCorrect.id ? t('timeentry.saving') : t('save')}
              </button>
            </div>
          </form>
        </div>
      )}
      {historyEntry && <EditHistoryModal entry={historyEntry} onClose={() => setHistoryEntry(null)} />}
    </section>
  );
}
