import { formatDuration } from '../../utils/FormatDuration.js';

export default function TimeDisplay({ seconds }) {
  return (
    <span className="font-mono text-2xl tabular-nums">
      {formatDuration(seconds)}
    </span>
  );
}