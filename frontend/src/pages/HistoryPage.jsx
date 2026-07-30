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

export default function HistoryPage() {
  const [week, setWeek] = useState({ weekStart: '', weekEnd: '', rows: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadEntries() {
      try {
        const data = await getWeeklyTimesheet();
        if (isMounted) {
          setWeek(data || { weekStart: '', weekEnd: '', rows: [] });
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
    return () => {
      isMounted = false;
    };
  }, []);

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
        map.set(key, { label: `${entry.fk_project ? `Projet #${entry.fk_project}` : 'Sans projet'}${entry.fk_task ? ` / Tâche #${entry.fk_task}` : ''}`, cells: {} });
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
          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">{rows.length} lignes</span>
        </div>
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
