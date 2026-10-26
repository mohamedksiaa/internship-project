import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Displays a rejection motif prefixed with a translated "Motif : " label (so
 * it reads as context, not as an error message), truncated with the full
 * text in the hover tooltip — and, since hover does not exist on a touch
 * screen, a click/tap toggles between truncated and fully wrapped text.
 * The caller's cell must still carry a tw-max-w-[…] for the truncated state
 * to actually clip (same contract as TruncatedText).
 */
export default function RejectReasonText({ reason, className = '' }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (!reason) {
    return null;
  }

  const text = `${t('timeentry.reject_reason_label')}${reason}`;

  return (
    <button
      type="button"
      onClick={() => setExpanded((prev) => !prev)}
      title={reason}
      aria-label={expanded ? t('timeentry.reject_reason_collapse_aria') : t('timeentry.reject_reason_expand_aria')}
      className={`tw-block tw-w-full tw-text-left tw-cursor-pointer ${expanded ? 'tw-whitespace-normal tw-break-words' : 'tw-truncate'} ${className}`}
    >
      {text}
    </button>
  );
}
