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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <div className="w-full max-w-lg space-y-4 rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 id="history-title" className="text-lg font-semibold text-[#263746]">{t('history.history_title')}</h2>
            <p className="mt-1 text-sm text-[#52656f]">{t('history.history_description', { entryId: entry.id || entry.rowid })}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('history.close')}
            className="text-lg leading-none text-[#78909c] hover:text-[#2c3e49]"
          >
            ×
          </button>
        </div>

        {error && <p className="text-sm text-[#d64c4c]">{error}</p>}

        {!history && !error && <p className="text-sm text-[#52656f]">{t('history.loading')}</p>}

        {history && history.length === 0 && (
          <p className="text-sm text-[#52656f]">{t('history.no_corrections')}</p>
        )}

        {history && history.length > 0 && (
          <ul className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {history.map((row) => (
              <li key={row.id || row.rowid} className="rounded border border-[#e3ebef] bg-[#fbfdfe] p-4 text-sm">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-[#2c3e49]">{editorName(row, t)}</span>
                  <span className="text-xs text-[#71838f]">{formatDateTime(row.date_modification || row.date_creation)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[#4d606b]">
                  <span>{row.field_name === 'date_start' ? t('history.start') : row.field_name === 'date_end' ? t('history.end') : row.field_name}</span>
                  <span className="text-right"><span className="line-through text-[#a08]">{formatChangedValue(row.field_name, row.old_value)}</span>{' → '}<span className="font-medium text-[#2c3e49]">{formatChangedValue(row.field_name, row.new_value)}</span></span>
                </div>
                <p className="mt-2 border-t border-[#e3ebef] pt-2 text-[#52656f]">
                  <span className="font-medium text-[#2c3e49]">{t('history.reason')}</span> {row.reason}
                </p>
                {row.ip && (
                  <p className="mt-1 text-xs text-[#8a9aa4]">{t('history.ip')}: {row.ip}{row.user_agent ? ` · ${row.user_agent.slice(0, 60)}…` : ''}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
