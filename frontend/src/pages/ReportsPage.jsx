export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Rapports</p>
          <h2 className="text-2xl font-semibold text-slate-900">Rapports d&apos;activité</h2>
          <p className="mt-2 text-sm text-slate-600">Visualisez vos temps, exportez vos entrées et surveillez les tendances.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-500">Export PDF</p>
            <p className="mt-2 text-slate-700">Générez des rapports pour la validation ou le suivi client.</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-500">Analyse de temps</p>
            <p className="mt-2 text-slate-700">Comparez les durées par projet et par utilisateur.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
