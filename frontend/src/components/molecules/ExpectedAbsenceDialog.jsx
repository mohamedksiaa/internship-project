import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EXPECTED_ABSENCE_NOTE_MAX_LENGTH, EXPECTED_ABSENCE_REASONS, useReasonLabel } from '../../utils/presenceLabels.js';

/**
 * Small form to record an expected absence: an employee (fixed, picked from
 * the Users table), a date (pre-filled with the day shown in the table) and a
 * reason. Picking "Autre" reveals a free-text field (up to 255 characters) that
 * must be filled in: Save stays disabled while it is blank. The caller does the
 * request and reports the outcome through `saving` / `error`.
 *
 * onSave receives { date, reasonType, reasonNote }; reasonNote is '' unless the
 * reason is "other" (a text typed and then abandoned is never sent).
 */
export default function ExpectedAbsenceDialog({ user, initialDate, initialReason, initialNote = '', saving = false, error = '', onSave, onClose }) {
  const { t } = useTranslation();
  const reasonLabel = useReasonLabel();
  const [date, setDate] = useState(initialDate || '');
  const [reasonType, setReasonType] = useState(EXPECTED_ABSENCE_REASONS.includes(initialReason) ? initialReason : 'leave');
  const [reasonNote, setReasonNote] = useState(typeof initialNote === 'string' ? initialNote : '');
  const [noteTouched, setNoteTouched] = useState(false);

  useEffect(() => {
    if (!user) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [user, saving, onClose]);

  if (!user) return null;

  const isOther = reasonType === 'other';
  const noteMissing = isOther && reasonNote.trim() === '';
  const canSave = Boolean(date) && !noteMissing && !saving;

  const fieldClass = 'tw-w-full tw-rounded-lg tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-bg-white dark:tw-bg-slate-800 tw-px-3 tw-py-2 tw-text-sm tw-text-slate-900 dark:tw-text-slate-100';
  const labelClass = 'tw-mb-1 tw-block tw-text-xs tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-500 dark:tw-text-slate-400';

  const submit = (event) => {
    event.preventDefault();
    if (!canSave) return;
    onSave({ date, reasonType, reasonNote: isOther ? reasonNote.trim() : '' });
  };

  return (
    <div className="tw-fixed tw-inset-0 tw-z-50 tw-flex tw-items-center tw-justify-center tw-bg-black/40 tw-p-4" role="dialog" aria-modal="true" aria-labelledby="expected-absence-title">
      <form onSubmit={submit} className="tw-w-full tw-max-w-md tw-space-y-4 tw-rounded-lg tw-bg-white dark:tw-bg-slate-900 tw-p-6 tw-shadow-xl">
        <div className="tw-flex tw-items-start tw-justify-between">
          <h2 id="expected-absence-title" className="tw-text-lg tw-font-semibold tw-text-[#263746] dark:tw-text-slate-100">{t('users_report.presence.dialog.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label={t('history.close')}
            className="tw-text-lg tw-leading-none tw-text-[#78909c] hover:tw-text-[#2c3e49] dark:hover:tw-text-slate-200"
          >
            ×
          </button>
        </div>

        <div>
          <span className={labelClass}>{t('users_report.presence.dialog.employee')}</span>
          <p className="tw-text-sm tw-font-medium tw-text-slate-900 dark:tw-text-slate-100">{user.label}</p>
        </div>

        <div>
          <label htmlFor="expected-absence-date" className={labelClass}>{t('users_report.presence.dialog.date')}</label>
          <input id="expected-absence-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required className={fieldClass} />
        </div>

        <div>
          <label htmlFor="expected-absence-reason" className={labelClass}>{t('users_report.presence.dialog.reason')}</label>
          <select id="expected-absence-reason" value={reasonType} onChange={(event) => setReasonType(event.target.value)} className={fieldClass}>
            {EXPECTED_ABSENCE_REASONS.map((reason) => (
              <option key={reason} value={reason}>{reasonLabel(reason)}</option>
            ))}
          </select>
        </div>

        {isOther && (
          <div>
            <label htmlFor="expected-absence-note" className={labelClass}>{t('users_report.presence.dialog.note_label')}</label>
            <input
              id="expected-absence-note"
              type="text"
              value={reasonNote}
              maxLength={EXPECTED_ABSENCE_NOTE_MAX_LENGTH}
              required
              aria-required="true"
              aria-describedby={noteMissing ? 'expected-absence-note-hint' : undefined}
              aria-invalid={noteMissing && noteTouched ? 'true' : undefined}
              onChange={(event) => setReasonNote(event.target.value)}
              onBlur={() => setNoteTouched(true)}
              className={fieldClass}
            />
            {noteMissing && (
              <p id="expected-absence-note-hint" className={`tw-mt-1 tw-text-xs ${noteTouched ? 'tw-text-rose-600 dark:tw-text-rose-400' : 'tw-text-slate-500 dark:tw-text-slate-400'}`}>
                {t('users_report.presence.dialog.note_required')}
              </p>
            )}
          </div>
        )}

        {error && <p role="alert" className="tw-text-sm tw-text-rose-600 dark:tw-text-rose-400">{error}</p>}

        <div className="tw-flex tw-justify-end tw-gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="tw-rounded-lg tw-bg-slate-100 dark:tw-bg-slate-700 tw-px-4 tw-py-2 tw-text-sm tw-text-slate-700 dark:tw-text-slate-200">{t('users_report.presence.dialog.cancel')}</button>
          <button type="submit" disabled={!canSave} className="tw-rounded-lg tw-bg-[#5B8FA8] tw-px-4 tw-py-2 tw-text-sm tw-text-white hover:tw-bg-[#4A7690] disabled:tw-cursor-not-allowed disabled:tw-opacity-50">
            {saving ? t('users_report.presence.dialog.saving') : t('users_report.presence.dialog.save')}
          </button>
        </div>
      </form>
    </div>
  );
}
