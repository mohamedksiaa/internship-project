import { useTranslation } from 'react-i18next';

// Opportunity status (fk_opp_status) badge for the read-only project listing
// ("Rapports > Projets"). Colors are a deliberate semantic palette, not
// Dolibarr's native (theme-configurable) status colors: early-stage codes are
// neutral, Négociation is a "needs attention" orange, Gagné is success green,
// Perdu is failure red. Label text always comes from i18n (keyed by the
// backend's language-neutral fk_opp_status code), never from a server-rendered
// string, so it follows the active UI language.
const OPPORTUNITY_STATUS = {
  PROSP: { key: 'projects.opp_status.prosp', color: 'tw-bg-gray-200 tw-text-gray-700 dark:tw-bg-slate-700 dark:tw-text-slate-300' },
  QUAL: { key: 'projects.opp_status.qual', color: 'tw-bg-gray-200 tw-text-gray-700 dark:tw-bg-slate-700 dark:tw-text-slate-300' },
  PROPO: { key: 'projects.opp_status.propo', color: 'tw-bg-gray-200 tw-text-gray-700 dark:tw-bg-slate-700 dark:tw-text-slate-300' },
  NEGO: { key: 'projects.opp_status.nego', color: 'tw-bg-orange-50 tw-text-orange-700 dark:tw-bg-orange-900/40 dark:tw-text-orange-300' },
  WON: { key: 'projects.opp_status.won', color: 'tw-bg-emerald-50 tw-text-emerald-700 dark:tw-bg-emerald-900/40 dark:tw-text-emerald-300' },
  LOST: { key: 'projects.opp_status.lost', color: 'tw-bg-rose-50 tw-text-rose-700 dark:tw-bg-rose-900/40 dark:tw-text-rose-300' },
  PENDING: { key: 'projects.opp_status.pending', color: 'tw-bg-gray-200 tw-text-gray-700 dark:tw-bg-slate-700 dark:tw-text-slate-300' },
};
const DEFAULT_COLOR = 'tw-bg-gray-200 tw-text-gray-700 dark:tw-bg-slate-700 dark:tw-text-slate-300';

export default function OpportunityStatusBadge({ code = '' }) {
  const { t } = useTranslation();
  if (!code) {
    return <span className="tw-text-slate-600 dark:tw-text-slate-300">—</span>;
  }
  const info = OPPORTUNITY_STATUS[code];
  const color = info?.color ?? DEFAULT_COLOR;
  const text = info ? t(info.key) : code;
  return (
    <span className={`tw-inline-flex tw-items-center tw-min-w-0 tw-px-2 tw-py-1 tw-rounded-full tw-text-xs tw-font-medium ${color}`}>
      {text}
    </span>
  );
}
