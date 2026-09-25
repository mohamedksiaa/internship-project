import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useReasonText } from '../../utils/presenceLabels.js';

/**
 * "Are you sure?" before an expected absence is removed, so a stray click on
 * "Retirer" cannot silently delete a record. Same modal look as the delete
 * confirmation in TimeEntryList (red confirm button); Cancel has the focus.
 *
 * `absence` is { name, date, reasonType, reasonNote }, or null when closed. The
 * caller does the request and reports the outcome through `busy` / `error`.
 */
export default function ConfirmRemoveAbsenceDialog({ absence, busy = false, error = '', onConfirm, onCancel }) {
  const { t } = useTranslation();
  const reasonText = useReasonText();

  useEffect(() => {
    if (!absence) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [absence, busy, onCancel]);

  if (!absence) return null;

  return (
    <div className="tw-fixed tw-inset-0 tw-z-50 tw-flex tw-items-center tw-justify-center tw-bg-black/40 tw-p-4" role="alertdialog" aria-modal="true" aria-labelledby="remove-absence-title" aria-describedby="remove-absence-message">
      <div className="tw-w-full tw-max-w-md tw-space-y-4 tw-rounded-lg tw-bg-white dark:tw-bg-slate-900 tw-p-6 tw-shadow-xl">
        <div className="tw-flex tw-items-start tw-justify-between">
          <h2 id="remove-absence-title" className="tw-text-lg tw-font-semibold tw-text-[#263746] dark:tw-text-slate-100">{t('users_report.presence.remove_dialog.title')}</h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label={t('history.close')}
            className="tw-text-lg tw-leading-none tw-text-[#78909c] dark:tw-text-slate-400 hover:tw-text-[#2c3e49] dark:hover:tw-text-slate-100"
          >
            ×
          </button>
        </div>

        <p id="remove-absence-message" className="tw-break-words tw-text-sm tw-text-[#52656f] dark:tw-text-slate-400">
          {t('users_report.presence.remove_dialog.message', { name: absence.name, date: absence.date, reason: reasonText(absence.reasonType, absence.reasonNote) })}
        </p>

        {error && <p role="alert" className="tw-text-sm tw-text-rose-600 dark:tw-text-rose-400">{error}</p>}

        <div className="tw-flex tw-justify-end tw-gap-3">
          <button type="button" autoFocus onClick={onCancel} disabled={busy} className="tw-text-sm tw-text-[#52656f] dark:tw-text-slate-300 disabled:tw-opacity-50">{t('users_report.presence.dialog.cancel')}</button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="tw-rounded tw-bg-[#d64c4c] tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-white hover:tw-bg-[#b93d3d] disabled:tw-cursor-not-allowed disabled:tw-opacity-50"
          >
            {busy ? t('users_report.presence.remove_dialog.removing') : t('users_report.presence.actions.remove')}
          </button>
        </div>
      </div>
    </div>
  );
}
