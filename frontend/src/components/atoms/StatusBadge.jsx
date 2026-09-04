import { useTranslation } from 'react-i18next';

const STATUS_LABELS = {
  0: { key: 'status.draft', color: 'tw-bg-gray-200 tw-text-gray-700 dark:tw-bg-slate-700 dark:tw-text-slate-300' },
  1: { key: 'status.submitted', color: 'tw-bg-yellow-50 tw-text-yellow-700 dark:tw-bg-yellow-900/40 dark:tw-text-yellow-300' },
  2: { key: 'status.validated', color: 'tw-bg-emerald-50 tw-text-emerald-700 dark:tw-bg-emerald-900/40 dark:tw-text-emerald-300' },
  3: { key: 'status.to_review', color: 'tw-bg-blue-50 tw-text-blue-700 dark:tw-bg-blue-900/40 dark:tw-text-blue-300' },
  9: { key: 'status.rejected', color: 'tw-bg-rose-50 tw-text-rose-700 dark:tw-bg-rose-900/40 dark:tw-text-rose-300' },
};

export default function StatusBadge({ status }) {
  const { t } = useTranslation();
  const info = STATUS_LABELS[status] ?? STATUS_LABELS[0];
  return (
    <span className={`tw-inline-flex tw-items-center tw-min-w-0 tw-px-2 tw-py-1 tw-rounded-full tw-text-xs tw-font-medium ${info.color}`}>
      {t(info.key)}
    </span>
  );
}
