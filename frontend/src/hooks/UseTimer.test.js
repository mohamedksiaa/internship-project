import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimer } from './UseTimer.js';
import * as api from '../api/timeflowApi';

vi.mock('../api/timeflowApi');

describe('useTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // vi.mock()'s automocked exports are plain vi.fn() instances, not
    // vi.spyOn() spies — restoreAllMocks() is a no-op for them; clearAllMocks()
    // is what actually resets call counts and queued mockResolvedValueOnce()s
    // between tests.
    vi.clearAllMocks();
  });

  it('silently repoints activeEntry to a new id from a background resync, without ever resetting the displayed seconds', async () => {
    api.getActiveTimer.mockResolvedValueOnce(null); // nothing active on mount
    api.startTimer.mockResolvedValue({ id: 1, duration: 0, date_start: new Date().toISOString() });

    const { result, unmount } = renderHook(() => useTimer());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // flush the initial mount getActiveTimer() check
    });

    await act(async () => {
      await result.current.start(10, 0, 'test');
    });
    expect(result.current.activeEntry.id).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    const secondsBeforeResync = result.current.seconds;
    expect(secondsBeforeResync).toBeGreaterThan(0);

    // The nightly cron (TimeEntry::closeStaleActiveTimersAtMidnight()) closed
    // entry 1 at midnight and moved the live session to entry 2.
    api.getActiveTimer.mockResolvedValueOnce({ id: 2, duration: 5, fk_split_previous: 1 });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });

    expect(result.current.activeEntry.id).toBe(2);
    // The displayed counter must never jump backward or reset just because
    // the underlying row changed identity server-side.
    expect(result.current.seconds).toBeGreaterThanOrEqual(secondsBeforeResync);

    // Unmount explicitly (clearing the running intervals) while fake timers
    // are still active for this test, so no leftover interval leaks into a
    // later test after vi.useRealTimers() runs in afterEach.
    unmount();
  });

  it('does not resync while no timer is running', async () => {
    api.getActiveTimer.mockResolvedValueOnce(null);
    renderHook(() => useTimer());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    });

    // Only the initial mount check — no background polling while idle.
    expect(api.getActiveTimer).toHaveBeenCalledTimes(1);
  });
});
