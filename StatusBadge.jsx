const STATUS_LABELS = {
  0: { label: 'Brouillon', color: 'bg-gray-200 text-gray-700' },
  1: { label: 'Validé', color: 'bg-green-100 text-green-800' },
  2: { label: 'Soumis', color: 'bg-yellow-100 text-yellow-800' },
  3: { label: 'À vérifier', color: 'bg-blue-100 text-blue-800' },
  9: { label: 'Refusé', color: 'bg-red-100 text-red-800' },
};

export default function StatusBadge({ status }) {
  const info = STATUS_LABELS[status] ?? STATUS_LABELS[0];
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${info.color}`}>
      {info.label}
    </span>
  );
}