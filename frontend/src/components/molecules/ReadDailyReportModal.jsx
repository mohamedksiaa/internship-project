export default function ReadDailyReportModal({ report, onClose }) {
  if (!report) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="report-title">
      <div className="w-full max-w-2xl space-y-4 rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 id="report-title" className="text-lg font-semibold text-[#263746]">{report.user_label} · {report.date_report}</h2>
            <p className="mt-1 text-sm text-[#52656f]">Compte-rendu complet</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="text-lg leading-none text-[#78909c] hover:text-[#2c3e49]"
          >
            ×
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto pr-1">
          <p className="whitespace-pre-wrap text-sm text-[#52656f]">{report.content}</p>
        </div>

        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700">Fermer</button>
        </div>
      </div>
    </div>
  );
}
