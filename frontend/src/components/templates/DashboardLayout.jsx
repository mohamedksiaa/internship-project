import { useMemo } from 'react';
import { summarizeWeek } from '../../utils/FormatDuration';

export default function DashboardLayout({ timer, entryList, stats = [] }) {
  const summary = useMemo(() => summarizeWeek(stats), [stats]);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 border rounded-lg bg-white shadow-sm">
          <p className="text-sm text-gray-500">Temps semaine</p>
          <p className="text-2xl font-semibold">{summary.totalSeconds ? `${Math.floor(summary.totalSeconds / 3600)}h` : '0h'}</p>
        </div>
        <div className="p-4 border rounded-lg bg-white shadow-sm">
          <p className="text-sm text-gray-500">Entrées</p>
          <p className="text-2xl font-semibold">{summary.entryCount}</p>
        </div>
        <div className="p-4 border rounded-lg bg-white shadow-sm">
          <p className="text-sm text-gray-500">Validées</p>
          <p className="text-2xl font-semibold text-green-600">{summary.validatedCount}</p>
        </div>
        <div className="p-4 border rounded-lg bg-white shadow-sm">
          <p className="text-sm text-gray-500">En attente</p>
          <p className="text-2xl font-semibold text-amber-600">{summary.pendingCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">{timer}</div>
        <div className="md:col-span-2">{entryList}</div>
      </div>
    </div>
  );
}