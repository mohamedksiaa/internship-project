import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDuration, summarizeWeek } from '../../utils/FormatDuration.js';
import Card from '../atoms/Card';

export default function DashboardLayout({ timer, entryList, stats = [], summary: summaryData = null, children = null, canReadAll = false }) {
  const { t } = useTranslation();
  const summary = useMemo(() => summaryData || summarizeWeek(stats), [summaryData, stats]);
  return (
    <div className="tw-mx-auto tw-max-w-[1680px] tw-p-5 tw-lg:p-7">
      {timer && <div className="tw-mb-12">{timer}</div>}
      <div className="tw-mb-4 tw-grid tw-gap-4 tw-md:grid-cols-3">
        <Card headerLabel={t('dashboard.total_week')} className="tw-text-center" headerRight={canReadAll ? <span title={t('dashboard.team_total_tooltip')} className="tw-text-xs tw-text-[#71838f]">ℹ︎</span> : null}>
          <p className="tw-mt-2 tw-text-2xl tw-font-semibold tw-text-[#263746]">{formatDuration(summary.totalSeconds)}</p>
        </Card>
        <Card headerLabel={t('dashboard.submitted')}>
          <p className="tw-mt-2 tw-text-2xl tw-font-semibold tw-text-[#263746]">{summary.submittedCount}</p>
        </Card>
        <Card headerLabel={t('dashboard.validated')}>
          <p className="tw-mt-2 tw-text-2xl tw-font-semibold tw-text-[#263746]">{summary.validatedCount}</p>
        </Card>
      </div>
      {children}
      {entryList}
    </div>
  );
}
