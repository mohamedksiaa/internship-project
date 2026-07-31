import { useState, useEffect, useMemo } from 'react';
import { approveTimeEntry, rejectTimeEntry, roundTimeEntry, startTimer, submitEntry } from '../../api/clockifyApi';
import { formatDuration } from '../../utils/FormatDuration.js';
import StatusBadge from '../atoms/StatusBadge.jsx';

function entryDate(value) {
  if (!value) return new Date(0);
  const raw = String(value);
  return /^[0-9]+$/.test(raw) ? new Date(Number(raw) * (raw.length === 10 ? 1000 : 1)) : new Date(value);
}

function dateLabel(value) {
  const date = entryDate(value);
  if (Number.isNaN(date.getTime())) return 'Date non renseignée';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Aujourd’hui";
  return date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function timeLabel(value) {
  const date = entryDate(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function endTimeLabel(entry) {
  if (entry.date_end) return timeLabel(entry.date_end);
  const start = entryDate(entry.date_start);
  if (!Number.isNaN(start.getTime()) && Number(entry.duration) > 0) {
    return timeLabel(new Date(start.getTime() + Number(entry.duration) * 1000));
  }
  return entry.status === 0 ? 'En cours' : '—';
}

export default function TimeEntryList({
  entries: initialEntries = [],
  setEntries: setParentEntries,
  projects = [],
  tasks = [],
  showWorker = false,
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => setEntries(initialEntries), [initialEntries]);

  const workerName = (entry) =>
    entry.user_label ||
    entry.user_name ||
    entry.user_login ||
    (Number(entry.fk_user) > 0 ? `Utilisateur #${entry.fk_user}` : '—');

  const groups = useMemo(
    () =>
      entries.reduce((result, entry) => {
        const key = entryDate(entry.date_start).toDateString();
        (result[key] ||= []).push(entry);
        return result;
      }, {}),
    [entries]
  );

  const getTaskId = (entry) => Number(entry.fk_task || entry.taskId || entry.task_id || entry.task?.id || 0);
  const getProjectId = (entry) => Number(entry.fk_project || entry.projectId || entry.project_id || entry.project?.id || 0);

  const sessionIdentity = (entry) => {
    const who = entry.fk_user ?? entry.user_login ?? entry.user_label ?? 'unknown';
    const taskId = getTaskId(entry);
    const projectId = getProjectId(entry);
    const what = taskId > 0 ? `task:${taskId}` : projectId > 0 ? `project:${projectId}` : `note:${(entry.note || '').trim().toLowerCase()}`;
    return `${who}__${what}`;
  };

  const sessionCounts = useMemo(() => {
    const counts = new Map();
    for (const entry of entries) {
      const key = sessionIdentity(entry);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [entries]);

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

  const restartEntry = async (entry) => {
    setBusyId(entry.id);
    setError('');
    try {
      const created = await startTimer(
        getProjectId(entry),
        getTaskId(entry),
        entry.note || '',
        entry.tags || '',
        Number(entry.billable) || 0
      );
      const restartedEntry = {
        ...entry,
        id: created.id,
        rowid: created.id,
        status: 0,
        duration: 0,
        date_start: new Date().toISOString(),
        date_end: null,
      };
      const next = [restartedEntry, ...entries.filter((item) => item.id !== entry.id)];
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

  const roundEntry = async (entry) => {
    setBusyId(entry.id);
    setError('');
    try {
      const updated = await roundTimeEntry(entry.id, 15);
      const next = entries.map((item) => (item.id === entry.id ? { ...item, ...updated } : item));
      setEntries(next);
      setParentEntries?.(next);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const projectName = (entry) => {
    if (typeof entry.project_name === 'string' && entry.project_name) return entry.project_name;
    if (typeof entry.project === 'string' && entry.project) return entry.project;
    if (entry.project?.title || entry.project?.label || entry.project?.name) {
      return entry.project.title || entry.project.label || entry.project.name;
    }
    const targetId = getProjectId(entry);
    const found = projects.find((p) => Number(p.id || p.rowid || p.value) === targetId);
    return found ? (found.title || found.label || found.name || found.ref) : 'Sans projet';
  };

  const taskName = (entry) => {
    if (typeof entry.task_name === 'string' && entry.task_name) return entry.task_name;
    if (typeof entry.task === 'string' && entry.task) return entry.task;
    if (entry.task?.title || entry.task?.label || entry.task?.name) {
      return entry.task.title || entry.task.label || entry.task.name;
    }
    const targetId = getTaskId(entry);
    const found = tasks.find((t) => Number(t.id || t.rowid || t.value) === targetId);
    return found ? (found.title || found.label || found.name || found.ref) : '—';
  };

  if (!entries.length) {
    return (
      <div className="border border-[#dce5ea] bg-white px-5 py-6 text-sm text-[#71838f]">
        Aucune entrée de temps disponible pour le moment.
      </div>
    );
  }

  return (
    <section className="space-y-6">
      {error && <p className="text-sm text-[#d64c4c]">{error}</p>}
      {Object.entries(groups).map(([key, group]) => {
        const total = group.reduce((sum, entry) => sum + Number(entry.duration || 0), 0);
        return (
          <div key={key} className="border-b-4 border-[#e3ebef] bg-white overflow-x-auto">
            <div className="flex items-center justify-between bg-[#e5edf1] px-5 py-2 text-sm text-[#52656f]">
              <span>{dateLabel(group[0].date_start)}</span>
              <span>
                Total:&nbsp; <strong className="text-sm text-[#2a3c47]">{formatDuration(total)}</strong>
              </span>
            </div>

            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#dce5ea] bg-white text-[11px] font-medium uppercase tracking-wide text-[#8a9aa4]">
                  <th className="px-5 py-2">Description</th>
                  <th className="px-3 py-2">Projet</th>
                  <th className="px-3 py-2">Tâche</th>
                  {showWorker && <th className="px-3 py-2">Qui</th>}
                  <th className="px-3 py-2">Début</th>
                  <th className="px-3 py-2">Fin</th>
                  <th className="px-3 py-2">État</th>
                  <th className="px-3 py-2 text-right">Durée</th>
                  <th className="px-5 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {group.map((entry) => (
                  <tr key={entry.id} className="border-b border-[#dce5ea] hover:bg-[#f9fbfd] text-sm text-[#2c3e49]">
                    <td className="px-5 py-3 min-w-[180px]">
                      <p className="font-medium text-[#2c3e49] truncate">{entry.note || 'Sans description'}</p>
                      <p className="mt-0.5 text-xs text-[#71838f]">
                        {entry.tags || 'Sans tags'}{entry.billable ? ' · Billable' : ' · Non billable'}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-[#03a9f4] font-medium truncate min-w-[120px]">
                      {projectName(entry)}
                    </td>
                    <td className="px-3 py-3 text-[#52656f] truncate min-w-[120px]">
                      {taskName(entry)}
                    </td>
                    {showWorker && (
                      <td className="px-3 py-3 text-[#52656f] truncate">
                        {workerName(entry)}
                      </td>
                    )}
                    <td className="px-3 py-3 text-[#4d606b] whitespace-nowrap">
                      {timeLabel(entry.date_start)}
                    </td>
                    <td className="px-3 py-3 text-[#4d606b] whitespace-nowrap">
                      {endTimeLabel(entry)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <StatusBadge status={Number(entry.status)} />
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-[#2b3d48] whitespace-nowrap">
                      {formatDuration(entry.duration || 0)}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <div className="flex justify-end items-center gap-2 text-[#78909c]">
                        {entry.status === 0 && (
                          <button
                            title="Soumettre"
                            onClick={() => submitDraft(entry)}
                            disabled={busyId === entry.id}
                            className="text-[#03a9f4]"
                          >
                            {busyId === entry.id ? '…' : '⇪'}
                          </button>
                        )}
                        {entry.status === 1 && (
                          <>
                            <button
                              title="Valider"
                              onClick={() => decide(entry.id, 2)}
                              disabled={busyId === entry.id}
                              className="text-[#03a9f4]"
                            >
                              {busyId === entry.id ? '…' : '✓'}
                            </button>
                            <button
                              title="Refuser"
                              onClick={() => decide(entry.id, 9)}
                              disabled={busyId === entry.id}
                              className="text-[#d66]"
                            >
                              ×
                            </button>
                          </>
                        )}
                        {entry.status === 2 && <span title="Validée" className="text-[#35a66f]">✓</span>}
                        <button
                          title="Démarrer à nouveau"
                          onClick={() => restartEntry(entry)}
                          disabled={busyId === entry.id}
                          className="text-[#03a9f4]"
                        >
                          ▷
                        </button>
                        <span
                          title="Nombre de sessions sur cette tâche pour cet utilisateur"
                          className="rounded-full bg-[#eaf6fd] px-2 py-0.5 text-xs font-medium text-[#03a9f4]"
                        >
                          ×{sessionCounts.get(sessionIdentity(entry)) || 1}
                        </span>
                        <button
                          title="Arrondir à 15 minutes"
                          onClick={() => roundEntry(entry)}
                          disabled={busyId === entry.id}
                          className="text-xs text-[#78909c]"
                        >
                          ≈15
                        </button>
                        <button title="Plus d’options">⋮</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </section>
  );
}
