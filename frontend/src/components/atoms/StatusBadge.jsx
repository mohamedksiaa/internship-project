import { useTranslation } from 'react-i18next';

const STATUS_LABELS = {
  0: { key: 'status.draft', color: 'bg-gray-200 text-gray-700' },
  1: { key: 'status.submitted', color: 'bg-yellow-100 text-yellow-800' },
  2: { key: 'status.validated', color: 'bg-green-100 text-green-800' },
  3: { key: 'status.to_review', color: 'bg-blue-100 text-blue-800' },
  9: { key: 'status.rejected', color: 'bg-red-100 text-red-800' },
};

export default function StatusBadge({ status }) {
  const { t } = useTranslation();
  const info = STATUS_LABELS[status] ?? STATUS_LABELS[0];
  return (
    <span className={`inline-flex items-center min-w-0 px-2 py-1 rounded-full text-xs font-medium ${info.color}`}>
      {t(info.key)}
    </span>
  );
}