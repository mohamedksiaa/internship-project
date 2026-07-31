import { useEffect, useMemo, useState } from 'react';
import { getWeeklyTimesheet } from '../api/clockifyApi';

function dayName(dateString) {
  return new Date(dateString).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
}

function durationLabel(seconds) {
  const safeSeconds = Number(seconds) || 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

export default function HistoryPage() {
  // requestedWeekStart drives what we ask the server for; '' means "current week".
  const [requestedWeekStart, setRequestedWeekStart] = useState('');
  const [week, setWeek] = useState({ weekStart: '', weekEnd: '', rows: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function loadEntries() {
      setLoading(true);
      try {
        const data = await getWeeklyTimesheet(requestedWeekStart);
        if (isMounted) {
          setWeek(data || { weekStart: '', weekEnd: '', rows: [] });
          setError('');
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message);
          setWeek({ weekStart: '', weekEnd: '', rows: [] });
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadEntries();

    // Refetch whenever the tab regains focus/visibility, so switching back
    // from "Suivi du temps" after logging new time shows fresh data.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadEntries();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    // Light polling as a safety net (e.g. another user's entry changing a shared view).
    const intervalId = setInterval(loadEntries, 30000);

    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      clearInterval(intervalId);
    };
  }, [requestedWeekStart, refreshKey]);

  const goToWeek = (offsetWeeks) => {
    const base = week.weekStart ? new Date(`${week.weekStart}T00:00:00`) : new Date();
    base.setDate(base.getDate() + offsetWeeks * 7);
    setRequestedWeekStart(isoDate(base));
  };

  const goToCurrentWeek = () => setRequestedWeekStart('');
  const refreshNow = () => setRefreshKey((key) => key + 1);

  const columns = useMemo(() => {
    if (!week.weekStart) {
      return [];
    }
    const start = new Date(`${week.weekStart}T00:00:00`);
    return Array.from({ length: 7 }, (_, index) => {
      const current = new Date(start);
      current.setDate(start.getDate() + index);
      return current.toISOString().slice(0, 10);
    });
  }, [week.weekStart]);

  const rows = useMemo(() => {
    const map = new Map();
    for (const entry of week.rows || []) {
      const key = `${entry.fk_project || '0'}:${entry.fk_task || '0'}`;
      if (!map.has(key)) {
        map.set(key, { label: `${entry.fk_project ? (entry.project_label || `Projet #${entry.fk_project}`) : 'Sans projet'}${entry.fk_task ? ` / Tâche #${entry.fk_task}` : ''}`, cells: {} });
      }
      const row = map.get(key);
      row.cells[entry.day] = (row.cells[entry.day] || 0) + Number(entry.duration || 0);
    }
    return Array.from(map.values());
  }, [week.rows]);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Calendrier hebdomadaire</p>
            <h2 className="text-2xl font-semibold text-slate-900">Vue calendrier</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">{rows.length} lignes</span>
            <button type="button" onClick={() => goToWeek(-1)} title="Semaine précédente" className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50">←</button>
            <button type="button" onClick={goToCurrentWeek} title="Semaine en cours" className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50">Aujourd’hui</button>
            <button type="button" onClick={() => goToWeek(1)} title="Semaine suivante" className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50">→</button>
            <button type="button" onClick={refreshNow} title="Actualiser" className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50">⟳</button>
          </div>
        </div>
        {columns.length > 0 && (
          <p className="-mt-4 mb-4 text-xs text-slate-500">Semaine du {columns[0]} au {columns[columns.length - 1]}</p>
        )}
        {loading && <p className="text-sm text-slate-600">Chargement…</p>}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {!loading && !error && columns.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 border-b border-slate-200 bg-white px-4 py-3 text-left">Projet / Tâche</th>
                  {columns.map((day) => <th key={day} className="border-b border-slate-200 px-4 py-3 text-left">{dayName(day)}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label}>
                    <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-4 py-3 font-medium text-slate-900">{row.label}</td>
                    {columns.map((day) => (
                      <td key={day} className="border-b border-slate-100 px-4 py-3 text-slate-700">{row.cells[day] ? durationLabel(row.cells[day]) : '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
