import { useState, useEffect, useMemo } from 'react';
import { approveTimeEntry, correctTimeEntry, rejectTimeEntry, submitEntry } from '../../api/clockifyApi';
import { formatDuration } from '../../utils/FormatDuration.js';
import StatusBadge from '../atoms/StatusBadge.jsx';
import EditHistoryModal from '../molecules/EditHistoryModal.jsx';

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
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [entryToCorrect, setEntryToCorrect] = useState(null);
  const [correction, setCorrection] = useState({ date_start: '', date_end: '', reason: '' });
  const [historyEntry, setHistoryEntry] = useState(null);
  const [correctionError, setCorrectionError] = useState('');

  useEffect(() => setEntries(initialEntries), [initialEntries]);

  const workerName = (entry) =>
    entry.user_label ||
    entry.user_name ||
    entry.user_login ||
    (Number(entry.fk_user) > 0 ? `Utilisateur #${entry.fk_user}` : '—');

  const displayedDuration = (entry) => (
    Number(entry.id) === Number(activeEntryId) ? Number(activeSeconds || 0) : Number(entry.duration || 0)
  );

  const groups = useMemo(
    () =>
      entries.reduce((result, entry) => {
        const key = entryDate(entry.date_start).toDateString();
        (result[key] ||= []).push(entry);
        return result;
      }, {}),
    [entries]
  );

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

  const restartEntry = async (entry) => {
    setBusyId(entry.id);
    setError('');
    try {
      if (!onRestartEntry) throw new Error('Relance du chrono indisponible.');
      const resumed = await onRestartEntry(entry);
      if (!resumed?.id) throw new Error('Le serveur n’a pas renvoyé le chrono repris.');
      const resumedEntry = {
        ...entry,
        ...resumed,
        id: resumed.id,
        rowid: resumed.rowid ?? resumed.id,
      };
      // The server resumes this same row. Move it to the top without a duplicate.
      const next = [resumedEntry, ...entries.filter((item) => item.id !== entry.id)];
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

  const openCorrection = (entry) => {
    setError('');
    setCorrectionError('');
    setEntryToCorrect(entry);
    setCorrection({
      date_start: toDateTimeLocal(entry.date_start),
      date_end: toDateTimeLocal(entry.date_end),
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
      setCorrectionError('L’heure de fin doit être postérieure à l’heure de début.');
      return;
    }
    if (reason.length < 5) {
      setCorrectionError('La raison est obligatoire et doit contenir au moins 5 caractères.');
      return;
    }
    setBusyId(entryToCorrect.id);
    setCorrectionError('');
    try {
      const payload = {
        ...correction,
        date_start: correction.date_start,
        date_end: correction.date_end,
      };
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
    return found ? (found.title || found.label || found.name || found.ref) : 'Sans projet';
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
      {error && <p className="whitespace-pre-line text-sm text-[#d64c4c]">{error}</p>}
      {Object.entries(groups).map(([key, group]) => {
        const total = group.reduce((sum, entry) => sum + displayedDuration(entry), 0);
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
                  <th className="px-5 py-2">Tâche</th>
                  <th className="px-3 py-2">Projet</th>
                  {showWorker && <th className="px-3 py-2">Qui</th>}
                  <th className="px-3 py-2">Début</th>
                  <th className="px-3 py-2">Fin</th>
                  <th className="px-3 py-2">État</th>
                  <th className="px-3 py-2 text-right">Durée</th>
                  <th className="px-3 py-2 text-center">Modification</th>
                  <th className="px-5 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {group.map((entry) => (
                  <tr key={entry.id} className="border-b border-[#dce5ea] hover:bg-[#f9fbfd] text-sm text-[#2c3e49]">
                    <td className="px-5 py-3 min-w-[180px]">
                      <p className="font-medium text-[#2c3e49] truncate">{entry.note || 'Sans description'}</p>
                    </td>
                    <td className="px-3 py-3 text-[#03a9f4] font-medium truncate min-w-[120px]">
                      {projectName(entry)}
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
                      {formatDuration(displayedDuration(entry))}
                    </td>
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      {entry.manual_modified ? (
                        <button
                          type="button"
                          onClick={() => setHistoryEntry(entry)}
                          title={entry.manual_reason ? `Temps corrigé : ${entry.manual_reason}` : 'Temps corrigé et tracé'}
                          className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                        >
                          Modifié manuellement
                        </button>
                      ) : '—'}
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
                        {showValidationActions && entry.status === 1 && (
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
                        {onRestartEntry && <button
                          title="Démarrer à nouveau"
                          onClick={() => restartEntry(entry)}
                          disabled={busyId !== null}
                          className="text-[#03a9f4]"
                        >
                          ▷
                        </button>}
                        {/* Validation is a strictly read/approve/reject manager view.
                            Never render a manual-edit control there, even if an API
                            payload incorrectly flags an entry as editable. */}
                        {!showValidationActions && entry.manual_editable && (
                          <button
                            type="button"
                            title="Modifier cette entrée"
                            aria-label="Modifier cette entrée"
                            onClick={() => openCorrection(entry)}
                            disabled={busyId !== null}
                            className="text-[#03a9f4]"
                          >
                            Modifier
                          </button>
                        )}
                        <span
                          title="Nombre de reprises de cette entrée"
                          className="rounded-full bg-[#eaf6fd] px-2 py-0.5 text-xs font-medium text-[#03a9f4]"
                        >
                          ×{Math.max(1, Number(entry.occurrence_count || 1))}
                        </span>
                                              </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      {entryToCorrect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="correction-title">
          <form onSubmit={saveCorrection} className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-xl">
            <div>
              <h2 id="correction-title" className="text-lg font-semibold text-[#263746]">Modifier l’entrée de temps</h2>
              <p className="mt-1 text-sm text-[#52656f]">
                {entryToCorrect.manual_edit_message || 'Cette correction sera tracée.'}
              </p>
            </div>
            {correctionError && (
              <p className="whitespace-pre-line rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-600">{correctionError}</p>
            )}
            <label className="block text-sm font-medium text-[#2c3e49]">
              Début
              <input
                type="datetime-local"
                value={correction.date_start}
                disabled={entryToCorrect.manual_edit_end_only}
                onChange={(event) => setCorrection((current) => ({ ...current, date_start: event.target.value }))}
                className="mt-1 w-full rounded border border-[#cfd9df] px-3 py-2 disabled:bg-slate-100"
                required
              />
            </label>
            <label className="block text-sm font-medium text-[#2c3e49]">
              Fin
              <input
                type="datetime-local"
                value={correction.date_end}
                onChange={(event) => setCorrection((current) => ({ ...current, date_end: event.target.value }))}
                className="mt-1 w-full rounded border border-[#cfd9df] px-3 py-2"
                required
              />
            </label>
            <label className="block text-sm font-medium text-[#2c3e49]">
              Raison (obligatoire, 5 caractères minimum)
              <textarea
                value={correction.reason}
                onChange={(event) => setCorrection((current) => ({ ...current, reason: event.target.value }))}
                className="mt-1 w-full rounded border border-[#cfd9df] px-3 py-2"
                rows="3"
              />
            </label>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setEntryToCorrect(null)} disabled={busyId !== null} className="text-sm text-[#52656f]">Annuler</button>
              <button type="submit" disabled={busyId === entryToCorrect.id || correction.reason.trim().length < 5} className="rounded bg-[#03a9f4] px-4 py-2 text-sm font-medium text-white">
                {busyId === entryToCorrect.id ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}
      {historyEntry && <EditHistoryModal entry={historyEntry} onClose={() => setHistoryEntry(null)} />}
    </section>
  );
}
