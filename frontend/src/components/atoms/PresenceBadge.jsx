import { normalizePresenceStatus, usePresenceLabel } from '../../utils/presenceLabels.js';

// Status -> colours. Colour is never the only signal: every badge also carries
// its text label ("—" for "not applicable" carries it as aria-label/title).
const PRESENCE_STYLES = {
  present: 'tw-bg-emerald-50 tw-text-emerald-700 dark:tw-bg-emerald-900/40 dark:tw-text-emerald-300',
  absent: 'tw-bg-rose-50 tw-text-rose-700 dark:tw-bg-rose-900/40 dark:tw-text-rose-300',
  expected_absence: 'tw-bg-sky-50 tw-text-sky-700 dark:tw-bg-sky-900/40 dark:tw-text-sky-300',
  none: 'tw-bg-gray-100 tw-text-gray-500 dark:tw-bg-slate-700 dark:tw-text-slate-300',
};

export default function PresenceBadge({ status, reasonType }) {
  const known = normalizePresenceStatus(status);
  const label = usePresenceLabel()(known, reasonType);
  const isNone = known === 'none';
  return (
    <span
      className={`tw-inline-flex tw-items-center tw-min-w-0 tw-whitespace-nowrap tw-px-2 tw-py-1 tw-rounded-full tw-text-xs tw-font-medium ${PRESENCE_STYLES[known]}`}
      data-presence-status={known}
      {...(isNone ? { 'aria-label': label, title: label } : {})}
    >
      {isNone ? '—' : label}
    </span>
  );
}
