export default function StatCard({ label, value, description, accent = 'slate' }) {
  const accentClass = {
    slate: 'text-slate-900',
    green: 'text-emerald-700',
    amber: 'text-amber-700',
  }[accent] || 'text-slate-900';

  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5 shadow-sm overflow-hidden">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <div className="mt-4 flex items-end justify-between gap-4 min-w-0">
        <p className={`text-3xl font-semibold ${accentClass}`}>{value}</p>
      </div>
      {description && <p className="mt-3 text-sm text-slate-500">{description}</p>}
    </div>
  );
}
