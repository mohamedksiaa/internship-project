import { useEffect, useState } from 'react';
import TimeEntryList from '../components/organisms/TimeEntryList';

export default function HistoryPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadEntries() {
      try {
        const response = await fetch('/api/index.php/clockify/timeentrys', {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Impossible de charger les entrées.');
        }

        const data = await response.json();
        if (isMounted) {
          setEntries(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message);
          setEntries([]);
        }
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

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Journal des temps</p>
            <h2 className="text-2xl font-semibold text-slate-900">Historique complet</h2>
          </div>
          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">{entries.length} entrées</span>
        </div>
        {loading && <p className="text-sm text-slate-600">Chargement…</p>}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {!loading && !error && <TimeEntryList entries={entries} setEntries={setEntries} />}
      </div>
    </div>
  );
}
