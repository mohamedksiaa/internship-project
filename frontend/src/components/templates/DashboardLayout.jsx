import { useMemo } from 'react';
import { formatDuration, summarizeWeek } from '../../utils/FormatDuration';

export default function DashboardLayout({ timer, entryList, stats = [] }) {
  const summary = useMemo(() => summarizeWeek(stats), [stats]);
  return (
    <div className="mx-auto max-w-[1680px] p-5 lg:p-7">
      <div className="mb-12">{timer}</div>
      <div className="mb-4 flex items-center justify-between text-sm text-[#263746]">
        <span className="font-medium">Cette semaine</span>
        <span className="text-[#8a9ba6]">Total de la semaine:&nbsp;&nbsp;<strong className="text-base text-[#263746]">{formatDuration(summary.totalSeconds)}</strong></span>
      </div>
      {entryList}
    </div>
  );
}
