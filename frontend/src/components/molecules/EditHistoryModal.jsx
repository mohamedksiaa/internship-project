import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getModificationHistory } from '../../api/timeflowApi';

function formatDateTime(value) {
  if (!value) return '—';
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(raw)) {
    return raw.replace('T', ' ').slice(0, 16);
  }
  return raw;
}

function formatChangedValue(fieldName, value) {
  if (fieldName !== 'date_start' && fieldName !== 'date_end') return formatDateTime(value);
  const raw = String(value ?? '');
  // The API returns date audit values as ISO8601. This keeps the server and
  // browser timezones from being applied twice.
  const date = /^\d+$/.test(raw) ? new Date(Number(raw) * 1000) : new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  const match = raw.match(/\b(\d{2}:\d{2})/);
  return match ? match[1] : raw || '—';
}

// TimeEntry::STATUS_* (see class/timeentry.class.php): raw values stored by
// logModifications() for field_name='status' — meaningless to a manager
// without translation (A-08's submit/validate/reject rows all touch this
// field).
const STATUS_VALUE_LABEL_KEYS = {
  0: 'history.status_draft',
  1: 'history.status_submitted',
  2: 'history.status_validated',
  9: 'history.status_canceled',
};

// TimeEntry::MOD_ACTION_SUBMIT/VALIDATE/REJECT: the only actions whose
// reason column is not user-facing text (see TimeEntry::submitEntry()/
// validateEntry()) — shown instead as a translated action label.
const ACTION_LABEL_KEYS = {
  submit: 'history.action_submit',
  validate: 'history.action_validate',
  reject: 'history.action_reject',
};

function fieldLabel(fieldName, t) {
  if (fieldName === 'date_start') return t('history.start');
  if (fieldName === 'date_end') return t('history.end');
  if (fieldName === 'status') return t('history.status_field');
  return fieldName;
}

function displayValue(row, value, t) {
  if (row.field_name === 'status') {
    const key = STATUS_VALUE_LABEL_KEYS[Number(value)];
    return key ? t(key) : formatChangedValue(row.field_name, value);
  }
  return formatChangedValue(row.field_name, value);
}

function isActualChange(row) {
  const oldValue = String(row.old_value ?? '');
  const newValue = String(row.new_value ?? '');
  if (row.field_name !== 'date_start' && row.field_name !== 'date_end') return oldValue !== newValue;

  // The popup renders times (not raw DB representations). Older rows can
  // contain the same instant once as a MySQL datetime and once as a timestamp;
  // hide them when their displayed values are identical.
  if (formatChangedValue(row.field_name, oldValue) === formatChangedValue(row.field_name, newValue)) return false;

  const asLocalTime = (value) => (/^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value.replace(' ', 'T')));
  const oldTime = asLocalTime(oldValue);
  const newTime = asLocalTime(newValue);
  return Number.isNaN(oldTime) || Number.isNaN(newTime) ? oldValue !== newValue : oldTime !== newTime;
}

function editorName(row, t) {
  const fullName = [row.user_firstname, row.user_lastname].filter(Boolean).join(' ').trim();
  return fullName || row.user_label || row.user_login || (Number(row.fk_user || row.fk_user_editor) > 0 ? t('dashboard.user_fallback', { userId: row.fk_user || row.fk_user_editor }) : '—');
}

/**
 * Popup showing the full manual-correction history of a time entry.
 * Each entry displays the original vs corrected times, the reason, the
 * editor and the modification date, straight from llx_timeflow_time_edit_log.
 */
export default function EditHistoryModal({ entry, onClose }) {
  const { t } = useTranslation();
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;
    getModificationHistory(entry.id)
      .then((rows) => {
        if (isMounted) setHistory(Array.isArray(rows) ? rows.filter(isActualChange) : []);
      })
      .catch((err) => {
        if (isMounted) setError(err.message);
      });
    return () => {
      isMounted = false;
    };
  }, [entry.id]);

  return (
    <div className="tw-fixed tw-inset-0 tw-z-50 tw-flex tw-items-center tw-justify-center tw-bg-black/40 tw-p-4" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <div className="tw-w-full tw-max-w-lg tw-space-y-4 tw-rounded-lg tw-bg-white tw-p-6 tw-shadow-xl">
        <div className="tw-flex tw-items-start tw-justify-between">
          <div>
            <h2 id="history-title" className="tw-text-lg tw-font-semibold tw-text-[#263746]">{t('history.history_title')}</h2>
            <p className="tw-mt-1 tw-text-sm tw-text-[#52656f]">{t('history.history_description', { entryId: entry.id || entry.rowid })}</p>
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

        {error && <p className="tw-text-sm tw-text-[#d64c4c]">{error}</p>}

        {!history && !error && <p className="tw-text-sm tw-text-[#52656f]">{t('history.loading')}</p>}

        {history && history.length === 0 && (
          <p className="tw-text-sm tw-text-[#52656f]">{t('history.no_corrections')}</p>
        )}

        {history && history.length > 0 && (
          <ul className="tw-max-h-[60vh] tw-space-y-3 tw-overflow-y-auto tw-pr-1">
            {history.map((row) => (
              <li key={row.id || row.rowid} className="tw-rounded tw-border tw-border-[#e3ebef] tw-bg-[#fbfdfe] tw-p-4 tw-text-sm">
                <div className="tw-mb-2 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
                  <span className="tw-font-medium tw-text-[#2c3e49]">{editorName(row, t)}</span>
                  <span className="tw-text-xs tw-text-[#71838f]">{formatDateTime(row.date_modification || row.date_creation)}</span>
                </div>
                {ACTION_LABEL_KEYS[row.action] && (
                  <p className="tw-mb-2 tw-text-xs tw-font-semibold tw-uppercase tw-tracking-wide tw-text-[#3f8ae0]">{t(ACTION_LABEL_KEYS[row.action])}</p>
                )}
                <div className="tw-grid tw-grid-cols-2 tw-gap-2 tw-text-[#4d606b]">
                  <span>{fieldLabel(row.field_name, t)}</span>
                  <span className="tw-text-right"><span className="tw-line-through tw-text-[#a08]">{displayValue(row, row.old_value, t)}</span>{' → '}<span className="tw-font-medium tw-text-[#2c3e49]">{displayValue(row, row.new_value, t)}</span></span>
                </div>
                {/* submit/validate store a non-displayed technical sentinel in `reason`
                    (see TimeEntry::submitEntry()/validateEntry()) — only a reject carries
                    a real, manager-typed motif worth showing. */}
                {row.action !== 'submit' && row.action !== 'validate' && (
                  <p className="tw-mt-2 tw-border-t tw-border-[#e3ebef] tw-pt-2 tw-text-[#52656f]">
                    <span className="tw-font-medium tw-text-[#2c3e49]">{t('history.reason')}</span> {row.reason}
                  </p>
                )}
                {row.ip && (
                  <p className="tw-mt-1 tw-text-xs tw-text-[#8a9aa4]">{t('history.ip')}: {row.ip}{row.user_agent ? ` · ${row.user_agent.slice(0, 60)}…` : ''}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
