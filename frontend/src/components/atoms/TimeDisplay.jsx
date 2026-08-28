import { formatDuration } from '../../utils/FormatDuration.js';

export default function TimeDisplay({ seconds }) {
  return (
    <span className="tw-font-mono tw-text-2xl tw-tabular-nums">
      {formatDuration(seconds)}
    </span>
  );
}
