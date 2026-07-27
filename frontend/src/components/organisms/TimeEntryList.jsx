import { useState, useEffect } from 'react';
import { approveTimeEntry, rejectTimeEntry } from '../../api/clockifyApi';
import StatusBadge from '../atoms/StatusBadge';
import { formatDuration } from '../../utils/FormatDuration';
import Button from '../atoms/Button';

function formatEntryDate(value) {
  if (!value) return '—';

  const parsedValue = typeof value === 'number' || /^[0-9]+$/.test(String(value).trim())
    ? new Date(Number(value) * (String(value).length === 10 ? 1000 : 1))
    : new Date(value);

  if (Number.isNaN(parsedValue.getTime())) {
    return String(value);
  }

  return parsedValue.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TimeEntryList({
  entries: initialEntries = [],
  setEntries: setParentEntries,
  title = 'Historique',
  subtitle = 'Dernières entrées de temps enregistrées',
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  const handleDecision = async (entryId, nextStatus) => {
    setBusyId(entryId);
    setError('');

    try {
      if (nextStatus === 1) {
        await approveTimeEntry(entryId);
      } else {
        await rejectTimeEntry(entryId);
      }

      const nextEntries = entries.map((entry) => (
        entry.id === entryId ? { ...entry, status: nextStatus } : entry
      ));

      setEntries(nextEntries);
      if (setParentEntries) {
        setParentEntries(nextEntries);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-4 border rounded-lg shadow-sm bg-white space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">{title}</p>
          <p className="text-sm text-slate-600">{subtitle}</p>
        </div>
        <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">{entries.length} entrées</span>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {entries.length === 0 && !error && (
        <p className="text-sm text-slate-500">Aucune entrée de temps disponible pour le moment.</p>
      )}

      {entries.length > 0 && (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <p className="font-semibold text-slate-900">{entry.note || 'Sans description'}</p>
                  <p className="text-sm text-slate-500">{formatEntryDate(entry.date_start)}</p>
                  <div className="flex flex-wrap gap-2 text-sm text-slate-600">
                    {entry.fk_project && <span className="rounded-full bg-white px-3 py-1 shadow-sm">Projet #{entry.fk_project}</span>}
                    {entry.fk_task && <span className="rounded-full bg-white px-3 py-1 shadow-sm">Tâche #{entry.fk_task}</span>}
                  </div>
                </div>

                <div className="text-right">
                  <StatusBadge status={entry.status} />
                  <p className="text-sm text-slate-700 mt-2">{formatDuration(entry.duration || 0)}</p>
                  {entry.status === 0 && (
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <Button variant="primary" onClick={() => handleDecision(entry.id, 1)} disabled={busyId === entry.id}>
                        {busyId === entry.id ? '…' : 'Valider'}
                      </Button>
                      <Button variant="danger" onClick={() => handleDecision(entry.id, 9)} disabled={busyId === entry.id}>
                        {busyId === entry.id ? '…' : 'Refuser'}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}