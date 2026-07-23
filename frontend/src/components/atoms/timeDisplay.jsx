import { formatDuration } from '../../utils/formatDuration';

export default function TimeDisplay({ seconds }) {
  return (
    <span className="font-mono text-2xl tabular-nums">
      {formatDuration(seconds)}
    </span>
  );
}