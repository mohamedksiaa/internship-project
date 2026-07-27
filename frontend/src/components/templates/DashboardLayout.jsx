import { useMemo } from 'react';
import { formatDuration, summarizeWeek } from '../../utils/FormatDuration';
import StatCard from '../molecules/StatCard';

export default function DashboardLayout({ timer, entryList, stats = [] }) {
  const summary = useMemo(() => summarizeWeek(stats), [stats]);

  return (
    <div className="w-full max-w-none p-6 space-y-6">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <StatCard
          label="Temps semaine"
          value={formatDuration(summary.totalSeconds)}
          description={`${summary.entryCount} entrées`}
        />
        <StatCard
          label="Entrées"
          value={summary.entryCount}
          description="Total enregistré"
        />
        <StatCard
          label="Validées"
          value={summary.validatedCount}
          description="Entrées prêtes"
          accent="green"
        />
        <StatCard
          label="En attente"
          value={summary.pendingCount}
          description="Entrées à valider"
          accent="amber"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">{timer}</div>
        <div className="space-y-6">{entryList}</div>
      </div>
    </div>
  );
}