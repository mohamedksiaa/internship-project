import { useTranslation } from 'react-i18next';

// Presence statuses the backend can send (getUsersPresence): anything else is
// shown as "not applicable" rather than trusted.
export const PRESENCE_STATUSES = ['present', 'absent', 'expected_absence', 'none'];

// Reason codes accepted by saveExpectedAbsence, in the order the picker lists them.
export const EXPECTED_ABSENCE_REASONS = ['leave', 'rtt', 'sick', 'other'];

export function normalizePresenceStatus(status) {
  return PRESENCE_STATUSES.includes(status) ? status : 'none';
}

/** Translated label of a recorded reason; unknown codes fall back to "other". */
export function useReasonLabel() {
  const { t } = useTranslation();
  return (reasonType) => t(`users_report.presence.reason.${EXPECTED_ABSENCE_REASONS.includes(reasonType) ? reasonType : 'other'}`);
}

/**
 * Text of a presence status, as shown in the badge and exported to CSV:
 * "Absence prévue · Congé" for an expected absence with its reason.
 */
export function usePresenceLabel() {
  const { t } = useTranslation();
  const reasonLabel = useReasonLabel();
  return (status, reasonType) => {
    const known = normalizePresenceStatus(status);
    if (known === 'expected_absence' && reasonType) {
      return t('users_report.presence.status.expected_absence_with_reason', { reason: reasonLabel(reasonType) });
    }
    return t(`users_report.presence.status.${known}`);
  };
}
