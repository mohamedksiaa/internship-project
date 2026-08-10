import { useEffect, useState } from 'react';
import { getTimeEditHistory } from '../../api/clockifyApi';

function formatDateTime(value) {
  if (!value) return '—';
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(raw)) {
    return raw.replace('T', ' ').slice(0, 16);
  }
  return raw;
}

function editorName(row) {
  const fullName = [row.user_firstname, row.user_lastname].filter(Boolean).join(' ').trim();
  return fullName || row.user_label || row.user_login || (Number(row.fk_user_editor) > 0 ? `Utilisateur #${row.fk_user_editor}` : '—');
}

/**
 * Popup showing the full manual-correction history of a time entry.
 * Each entry displays the original vs corrected times, the reason, the
 * editor and the modification date, straight from llx_clockify_time_edit_log.
 */
export default function EditHistoryModal({ entry, onClose }) {
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;
    getTimeEditHistory(entry.id)
      .then((rows) => {
        if (isMounted) setHistory(Array.isArray(rows) ? rows : []);
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
            <h2 id="history-title" className="text-lg font-semibold text-[#263746]">Historique des corrections</h2>
            <p className="mt-1 text-sm text-[#52656f]">Entrée #{entry.id || entry.rowid} — heure d’origine vs heure corrigée</p>
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

        {error && <p className="text-sm text-[#d64c4c]">{error}</p>}

        {!history && !error && <p className="text-sm text-[#52656f]">Chargement…</p>}

        {history && history.length === 0 && (
          <p className="text-sm text-[#52656f]">Aucune correction enregistrée pour cette entrée.</p>
        )}

        {history && history.length > 0 && (
          <ul className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {history.map((row) => (
              <li key={row.id} className="rounded border border-[#e3ebef] bg-[#fbfdfe] p-4 text-sm">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-[#2c3e49]">{editorName(row)}</span>
                  <span className="text-xs text-[#71838f]">{formatDateTime(row.date_modification)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[#4d606b]">
                  <span>Début</span>
                  <span className="text-right">
                    <span className="line-through text-[#a08]">{formatDateTime(row.old_start)}</span>
                    {' → '}
                    <span className="font-medium text-[#2c3e49]">{formatDateTime(row.new_start)}</span>
                  </span>
                  <span>Fin</span>
                  <span className="text-right">
                    <span className="line-through text-[#a08]">{formatDateTime(row.old_end)}</span>
                    {' → '}
                    <span className="font-medium text-[#2c3e49]">{formatDateTime(row.new_end)}</span>
                  </span>
                </div>
                <p className="mt-2 border-t border-[#e3ebef] pt-2 text-[#52656f]">
                  <span className="font-medium text-[#2c3e49]">Raison :</span> {row.reason}
                </p>
                {row.ip && (
                  <p className="mt-1 text-xs text-[#8a9aa4]">IP : {row.ip}{row.user_agent ? ` · ${row.user_agent.slice(0, 60)}…` : ''}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
