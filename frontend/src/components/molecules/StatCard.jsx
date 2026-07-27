export default function StatCard({ label, value, description, accent = 'slate' }) {
  const accentClass = {
    slate: 'text-slate-900 bg-slate-50',
    green: 'text-emerald-700 bg-emerald-100',
    amber: 'text-amber-700 bg-amber-100',
  }[accent] || 'text-slate-900 bg-slate-50';

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className={`mt-4 text-3xl font-semibold ${accentClass}`}>{value}</p>
      {description && <p className="mt-2 text-sm text-slate-500">{description}</p>}
    </div>
  );
}
