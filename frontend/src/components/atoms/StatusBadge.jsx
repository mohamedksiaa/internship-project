import { useTranslation } from 'react-i18next';

const STATUS_LABELS = {
  0: { key: 'status.draft', color: 'tw-bg-gray-200 tw-text-gray-700' },
  1: { key: 'status.submitted', color: 'tw-bg-yellow-50 tw-text-yellow-700' },
  2: { key: 'status.validated', color: 'tw-bg-emerald-50 tw-text-emerald-700' },
  3: { key: 'status.to_review', color: 'tw-bg-blue-50 tw-text-blue-700' },
  9: { key: 'status.rejected', color: 'tw-bg-rose-50 tw-text-rose-700' },
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
