import { useMemo } from 'react';
import { formatDuration, summarizeWeek } from '../../utils/FormatDuration.js';
import Card from '../atoms/Card';

export default function DashboardLayout({ timer, entryList, stats = [], summary: summaryData = null, children = null, canReadAll = false }) {
  const summary = useMemo(() => summaryData || summarizeWeek(stats), [summaryData, stats]);
  return (
    <div className="mx-auto max-w-[1680px] p-5 lg:p-7">
      {timer && <div className="mb-12">{timer}</div>}
      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <Card headerLabel="Total semaine" className="text-center" headerRight={canReadAll ? <span title="Total cumulé de l'équipe" className="text-xs text-[#71838f]">ℹ︎</span> : null}>
          <p className="mt-2 text-2xl font-semibold text-[#263746]">{formatDuration(summary.totalSeconds)}</p>
        </Card>
        <Card headerLabel="Soumises">
          <p className="mt-2 text-2xl font-semibold text-[#263746]">{summary.submittedCount}</p>
        </Card>
        <Card headerLabel="Validées">
          <p className="mt-2 text-2xl font-semibold text-[#263746]">{summary.validatedCount}</p>
        </Card>
      </div>
      {children}
      {entryList}
    </div>
  );
}
