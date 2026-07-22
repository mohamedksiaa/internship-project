import { useEffect, useState } from 'react';
import { approveTimeEntry, getTimeEntries, rejectTimeEntry } from '../../api/clockifyApi';
import StatusBadge from '../atoms/StatusBadge';
import { formatDuration } from '../../utils/FormatDuration';
import Button from '../atoms/Button';

function formatEntryDate(value) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TimeEntryList({ entries: initialEntries = [], setEntries: setParentEntries }) {
  const [entries, setEntries] = useState(initialEntries);
  const [loading, setLoading] = useState(!initialEntries.length);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    setEntries(initialEntries);
    setLoading(!initialEntries.length);
  }, [initialEntries]);

  useEffect(() => {
    let isMounted = true;

    async function loadEntries() {
      setLoading(true);
      setError('');

      try {
        const data = await getTimeEntries();
        if (!isMounted) {
          return;
        }
        const nextEntries = Array.isArray(data) ? data : [];
        setEntries(nextEntries);
        if (setParentEntries) {
          setParentEntries(nextEntries);
        }
      } catch (err) {
        if (!isMounted) {
          return;
        }
        setError(err.message);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadEntries();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleDecision = async (entryId, nextStatus) => {
    setBusyId(entryId);
    setError('');

    try {
      if (nextStatus === 1) {
        await approveTimeEntry(entryId);
      } else {
        await rejectTimeEntry(entryId);
      }

      setEntries((currentEntries) => {
        const nextEntries = currentEntries.map((entry) => (
          entry.id === entryId ? { ...entry, status: nextStatus } : entry
        ));
        if (setParentEntries) {
          setParentEntries(nextEntries);
        }
        return nextEntries;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-4 border rounded-lg shadow-sm bg-white space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Historique</h2>
        <span className="text-sm text-gray-500">{entries.length} entrées</span>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {loading && <p className="text-sm text-gray-500">Chargement des entrées…</p>}

      {!loading && !error && entries.length === 0 && (
        <p className="text-sm text-gray-500">Aucune entrée de temps pour le moment.</p>
      )}

      {!loading && !error && entries.length > 0 && (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="border rounded p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{entry.note || 'Sans description'}</p>
                  <p className="text-sm text-gray-500">{formatEntryDate(entry.date_start)}</p>
                </div>
                <div className="text-right">
                  <StatusBadge status={entry.status} />
                  <p className="text-sm text-gray-600 mt-1">{formatDuration(entry.duration || 0)}</p>
                  {entry.status === 0 && (
                    <div className="flex gap-2 mt-2 justify-end">
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