import { useMemo } from 'react';
import { formatDuration, summarizeWeek } from '../../utils/FormatDuration.js';

export default function DashboardLayout({ timer, entryList, stats = [], summary: summaryData = null, children = null }) {
  const summary = useMemo(() => summaryData || summarizeWeek(stats), [summaryData, stats]);
  return (
    <div className="mx-auto max-w-[1680px] p-5 lg:p-7">
      {timer && <div className="mb-12">{timer}</div>}
      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-[#dce5ea] bg-white px-6 py-5">
          <p className="text-xs uppercase tracking-[0.12em] text-[#8a9aa4]">Total semaine</p>
          <p className="mt-2 text-2xl font-semibold text-[#263746]">{formatDuration(summary.totalSeconds)}</p>
        </div>
        <div className="rounded-2xl border border-[#dce5ea] bg-white px-6 py-5">
          <p className="text-xs uppercase tracking-[0.12em] text-[#8a9aa4]">Soumises</p>
          <p className="mt-2 text-2xl font-semibold text-[#263746]">{summary.submittedCount}</p>
        </div>
        <div className="rounded-2xl border border-[#dce5ea] bg-white px-6 py-5">
          <p className="text-xs uppercase tracking-[0.12em] text-[#8a9aa4]">Validées</p>
          <p className="mt-2 text-2xl font-semibold text-[#263746]">{summary.validatedCount}</p>
        </div>
      </div>
      {children}
      {entryList}
    </div>
  );
}
