import { useTranslation } from 'react-i18next';

// "Source TimeFlow" (timeflow_source project extrafield) badge — how the
// project was created: TimeFlow's own "Nouveau projet" button, the Clockify
// import, or Dolibarr's native Projects module (see the PROJECT_CREATE
// trigger in core/triggers/interface_99_modTimeFlow_TimeFlowTriggers.class.php,
// which fills 'native' automatically whenever nothing else already did).
// Single neutral color throughout — unlike ProjectStatusBadge/
// OpportunityStatusBadge, none of these 3 values is "better" than another.
const SOURCE_KEYS = {
  manual: 'projects.source.manual',
  clockify: 'projects.source.clockify',
  native: 'projects.source.native',
};
const COLOR = 'tw-bg-slate-100 tw-text-slate-700 dark:tw-bg-slate-700 dark:tw-text-slate-300';

export default function ProjectSourceBadge({ source = '' }) {
  const { t } = useTranslation();
  const key = SOURCE_KEYS[source];
  const text = key ? t(key) : (source || '—');
  return (
    <span className={`tw-inline-flex tw-items-center tw-min-w-0 tw-px-2 tw-py-1 tw-rounded-full tw-text-xs tw-font-medium ${COLOR}`}>
      {text}
    </span>
  );
}
