import { useTranslation } from 'react-i18next';

// Presence statuses the backend can send (getUsersPresence): anything else is
// shown as "not applicable" rather than trusted.
export const PRESENCE_STATUSES = ['present', 'absent', 'expected_absence', 'none'];

// Reason codes accepted by saveExpectedAbsence, in the order the picker lists
// them. "other" comes with a mandatory free-text precision (reason_note).
// "rtt" used to be a fourth reason and was retired; a row that still carries it
// (or any code this list does not know) is shown as the generic "Autre".
export const EXPECTED_ABSENCE_REASONS = ['leave', 'sick', 'other'];

export const EXPECTED_ABSENCE_NOTE_MAX_LENGTH = 255;

export function normalizePresenceStatus(status) {
  return PRESENCE_STATUSES.includes(status) ? status : 'none';
}

/** Translated label of a recorded reason code; unknown or retired codes fall back to "other". */
export function useReasonLabel() {
  const { t } = useTranslation();
  return (reasonType) => t(`users_report.presence.reason.${EXPECTED_ABSENCE_REASONS.includes(reasonType) ? reasonType : 'other'}`);
}

/**
 * The reason as shown to the manager: "Congé", "Maladie", "Autre", or — for
 * "Autre" with its free-text precision — "Autre : <précision>". The note is
 * only ever used with the "other" reason.
 */
export function useReasonText() {
  const { t } = useTranslation();
  const reasonLabel = useReasonLabel();
  return (reasonType, reasonNote) => {
    const note = typeof reasonNote === 'string' ? reasonNote.trim() : '';
    if (reasonType === 'other' && note !== '') {
      return t('users_report.presence.reason.other_with_note', { note });
    }
    return reasonLabel(reasonType);
  };
}

/**
 * Text of a presence status, as shown in the badge and exported to CSV:
 * "Absence prévue · Congé", or "Absence prévue · Autre : <précision>".
 */
export function usePresenceLabel() {
  const { t } = useTranslation();
  const reasonText = useReasonText();
  return (status, reasonType, reasonNote) => {
    const known = normalizePresenceStatus(status);
    if (known === 'expected_absence' && reasonType) {
      return t('users_report.presence.status.expected_absence_with_reason', { reason: reasonText(reasonType, reasonNote) });
    }
    return t(`users_report.presence.status.${known}`);
  };
}
