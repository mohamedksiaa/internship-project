export default function StatCard({ label, value, description, accent = 'slate' }) {
  const accentClass = {
    slate: 'text-slate-900',
    green: 'text-emerald-700',
    amber: 'text-amber-700',
  }[accent] || 'text-slate-900';

  return (
    <div className="tw-rounded-[1.75rem] tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-5 tw-shadow-sm tw-overflow-hidden">
      <p className="tw-text-sm tw-font-semibold tw-uppercase tw-tracking-[0.24em] tw-text-slate-500">{label}</p>
      <div className="tw-mt-4 tw-flex tw-items-end tw-justify-between tw-gap-4 tw-min-w-0">
        <p className={`tw-text-3xl tw-font-semibold ${accentClass}`}>{value}</p>
      </div>
      {description && <p className="tw-mt-3 tw-text-sm tw-text-slate-500">{description}</p>}
    </div>
  );
}
