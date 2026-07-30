import { useState, useEffect, useMemo } from 'react';
import { approveTimeEntry, rejectTimeEntry } from '../../api/clockifyApi';
import { formatDuration } from '../../utils/FormatDuration';

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

export default function TimeEntryList({ entries: initialEntries = [], setEntries: setParentEntries, projects = [], tasks = [] }) {
  const [entries, setEntries] = useState(initialEntries);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  useEffect(() => setEntries(initialEntries), [initialEntries]);

  const groups = useMemo(() => entries.reduce((result, entry) => {
    const key = entryDate(entry.date_start).toDateString();
    (result[key] ||= []).push(entry); return result;
  }, {}), [entries]);

  const decide = async (id, status) => {
    setBusyId(id); setError('');
    try {
      if (status === 1) await approveTimeEntry(id); else await rejectTimeEntry(id);
      const next = entries.map((entry) => entry.id === id ? { ...entry, status } : entry);
      setEntries(next); setParentEntries?.(next);
    } catch (err) { setError(err.message); } finally { setBusyId(null); }
  };

  const projectName = (entry) => entry.project_name || entry.project || projects.find((project) => Number(project.id) === Number(entry.fk_project))?.title || 'Sans projet';
  const taskName = (entry) => entry.task_name || entry.task || tasks.find((task) => Number(task.id) === Number(entry.fk_task))?.title || '—';

  if (!entries.length) return <div className="border border-[#dce5ea] bg-white px-5 py-6 text-sm text-[#71838f]">Aucune entrée de temps disponible pour le moment.</div>;

  return (
    <section className="space-y-6">
      {error && <p className="text-sm text-[#d64c4c]">{error}</p>}
      {Object.entries(groups).map(([key, group]) => {
        const total = group.reduce((sum, entry) => sum + Number(entry.duration || 0), 0);
        return <div key={key} className="border-b-4 border-[#e3ebef] bg-white">
          <div className="flex items-center justify-between bg-[#e5edf1] px-5 py-2 text-sm text-[#52656f]">
            <span>{dateLabel(group[0].date_start)}</span><span>Total:&nbsp; <strong className="text-sm text-[#2a3c47]">{formatDuration(total)}</strong></span>
          </div>
          <div className="hidden grid-cols-[minmax(180px,1.6fr)_minmax(110px,1fr)_minmax(100px,1fr)_85px_85px_95px_105px] gap-4 border-b border-[#dce5ea] bg-white px-5 py-2 text-[11px] font-medium uppercase tracking-wide text-[#8a9aa4] lg:grid">
            <span>Description</span><span>Projet</span><span>Tâche</span><span>Début</span><span>Fin</span><span className="text-right">Durée</span><span className="text-right">Actions</span>
          </div>
          {group.map((entry) => <article key={entry.id} className="grid min-h-[64px] grid-cols-[minmax(160px,1fr)_auto] items-center gap-4 border-b border-[#dce5ea] px-5 py-3 last:border-b-0 lg:grid-cols-[minmax(180px,1.6fr)_minmax(110px,1fr)_minmax(100px,1fr)_85px_85px_95px_105px]">
            <div className="min-w-0"><p className="truncate text-sm font-medium text-[#2c3e49]">{entry.note || 'Sans description'}</p><p className="mt-1 text-xs text-[#03a9f4] lg:hidden">{projectName(entry)}{entry.fk_task ? ` · ${taskName(entry)}` : ''}</p></div>
            <span className="hidden truncate text-sm text-[#03a9f4] lg:block">{projectName(entry)}</span>
            <span className="hidden truncate text-sm text-[#52656f] lg:block">{taskName(entry)}</span>
            <span className="hidden text-sm text-[#4d606b] lg:block">{timeLabel(entry.date_start)}</span>
            <span className="hidden text-sm text-[#4d606b] lg:block">{endTimeLabel(entry)}</span>
            <strong className="text-right text-sm text-[#2b3d48]">{formatDuration(entry.duration || 0)}</strong>
            <div className="flex justify-end gap-2 border-l border-dotted border-[#b8c6cd] pl-4 text-[#78909c]">
              {entry.status === 0 && <><button title="Valider" onClick={() => decide(entry.id, 1)} disabled={busyId === entry.id} className="text-[#03a9f4]">{busyId === entry.id ? '…' : '✓'}</button><button title="Refuser" onClick={() => decide(entry.id, 9)} disabled={busyId === entry.id} className="text-[#d66]">×</button></>}
              {entry.status === 1 && <span title="Validée" className="text-[#35a66f]">✓</span>}<button title="Démarrer à nouveau">▷</button><button title="Plus d’options">⋮</button>
            </div>
          </article>)}
        </div>;
      })}
    </section>
  );
}
