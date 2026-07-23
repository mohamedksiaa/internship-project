export function formatDuration(totalSeconds) {
  const safeTotalSeconds = Number(totalSeconds) || 0;
  const h = Math.floor(safeTotalSeconds / 3600);
  const m = Math.floor((safeTotalSeconds % 3600) / 60);
  const s = safeTotalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function summarizeWeek(entries = []) {
  const totalSeconds = entries.reduce((sum, entry) => sum + Number(entry.duration || 0), 0);
  const validatedCount = entries.filter((entry) => Number(entry.status) === 1).length;
  const pendingCount = entries.filter((entry) => Number(entry.status) === 0).length;

  return {
    totalSeconds,
    entryCount: entries.length,
    validatedCount,
    pendingCount,
  };
}
