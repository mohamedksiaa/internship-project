import { describe, expect, it } from 'vitest';
import { summarizeWeek } from './FormatDuration';

describe('summarizeWeek', () => {
  it('aggregates weekly duration and validation counts', () => {
    const summary = summarizeWeek([
      { duration: 3600, status: 1 },
      { duration: 5400, status: 0 },
    ]);

    expect(summary.totalSeconds).toBe(9000);
    expect(summary.entryCount).toBe(2);
    expect(summary.validatedCount).toBe(1);
    expect(summary.pendingCount).toBe(1);
  });
});
