import { useTranslation } from 'react-i18next';

export default function ReadDailyReportModal({ report, onClose }) {
  const { t } = useTranslation();
  if (!report) return null;
  return (
    <div className="tw-fixed tw-inset-0 tw-z-50 tw-flex tw-items-center tw-justify-center tw-bg-black/40 tw-p-4" role="dialog" aria-modal="true" aria-labelledby="report-title">
      <div className="tw-w-full tw-max-w-2xl tw-space-y-4 tw-rounded-lg tw-bg-white tw-p-6 tw-shadow-xl">
        <div className="tw-flex tw-items-start tw-justify-between">
          <div>
            <h2 id="report-title" className="tw-text-lg tw-font-semibold tw-text-[#263746]">{report.user_label} · {report.date_report}</h2>
            <p className="tw-mt-1 tw-text-sm tw-text-[#52656f]">{t('history.complete_report')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('history.close')}
            className="tw-text-lg tw-leading-none tw-text-[#78909c] hover:tw-text-[#2c3e49]"
          >
            ×
          </button>
        </div>

        <div className="tw-max-h-[70vh] tw-overflow-y-auto tw-pr-1">
          <p className="tw-whitespace-pre-wrap tw-text-sm tw-text-[#52656f]">{report.content}</p>
        </div>

        <div className="tw-flex tw-justify-end">
          <button type="button" onClick={onClose} className="tw-rounded-lg tw-bg-slate-100 tw-px-4 tw-py-2 tw-text-sm tw-text-slate-700">{t('history.close')}</button>
        </div>
      </div>
    </div>
  );
}
