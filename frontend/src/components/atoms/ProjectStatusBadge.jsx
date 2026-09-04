import { useTranslation } from 'react-i18next';

// Deliberately NOT Dolibarr's native status colors for project état: Closed
// is shown in red here on purpose (an explicit product choice, not a mistake)
// even though native Dolibarr uses a neutral/blue tone for it — see the badge
// rendering discussion in ReportsPage's "Rapports > Projets" tab.
const PROJECT_STATUS = {
  0: { key: 'projects.status.draft', color: 'tw-bg-gray-200 tw-text-gray-700 dark:tw-bg-slate-700 dark:tw-text-slate-300' },
  1: { key: 'projects.status.opened', color: 'tw-bg-emerald-50 tw-text-emerald-700 dark:tw-bg-emerald-900/40 dark:tw-text-emerald-300' },
  2: { key: 'projects.status.closed', color: 'tw-bg-rose-50 tw-text-rose-700 dark:tw-bg-rose-900/40 dark:tw-text-rose-300' },
};

export default function ProjectStatusBadge({ status = 0 }) {
  const { t } = useTranslation();
  const info = PROJECT_STATUS[status] ?? PROJECT_STATUS[0];
  const text = t(info.key);
  return (
    <span className={`tw-inline-flex tw-items-center tw-min-w-0 tw-px-2 tw-py-1 tw-rounded-full tw-text-xs tw-font-medium ${info.color}`}>
      {text}
    </span>
  );
}
