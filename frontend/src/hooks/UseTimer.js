import { useState, useEffect, useRef, useCallback } from 'react';
import { getActiveTimer, restartTimer, startTimer, stopTimer } from '../api/timeflowApi';

export function useTimer() {
  const [isRunning, setIsRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [activeEntry, setActiveEntry] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  // Au chargement de la page, on vérifie si un chrono est déjà actif (ex: si l'utilisateur a rechargé la page)
  useEffect(() => {
    getActiveTimer()
      .then((data) => {
        if (data && data.id) {
          setActiveEntry(data);
          setIsRunning(true);

          const startDate = typeof data.date_start === 'number'
            ? new Date(data.date_start * 1000)
            : new Date(data.date_start);

          if (!Number.isNaN(startDate.getTime())) {
            const elapsed = Math.floor((Date.now() - startDate.getTime()) / 1000);
            setSeconds(Number(data.duration || 0) + elapsed);
          }
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  const setRunningEntry = useCallback((entry) => {
    setActiveEntry(entry);
    setIsRunning(true);
    setSeconds(Number(entry.duration || 0));
  }, []);

  // The nightly cron (TimeEntry::closeStaleActiveTimersAtMidnight()) can
  // close the entry this tab is tracking at midnight and move the still-
  // running session to a brand-new row server-side — invisible in the UI
  // (`seconds` keeps counting up locally, unaffected either way) until the
  // user tries to stop or otherwise act on the timer with the now-stale id.
  // Silently re-point `activeEntry` to whatever the server currently
  // considers active, on the same ~5min cadence as that cron job, WITHOUT
  // ever touching `seconds` — the displayed counter must never jump or
  // reset just because the underlying row changed identity.
  useEffect(() => {
    if (!isRunning || activeEntry?.id == null) return undefined;
    const RESYNC_INTERVAL_MS = 5 * 60 * 1000;
    const resync = async () => {
      try {
        const data = await getActiveTimer();
        if (data && data.id != null && Number(data.id) !== Number(activeEntry.id)) {
          setActiveEntry((current) => (current ? { ...current, ...data } : data));
        }
      } catch {
        // Best-effort only: a failed background resync must never disturb the
        // running timer or surface an error to the user.
      }
    };
    const intervalId = setInterval(resync, RESYNC_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [isRunning, activeEntry?.id]);

  // Fait défiler le compteur affiché chaque seconde, seulement si un chrono tourne
  useEffect(() => {
    if (isRunning) {
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    }
    return () => {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [isRunning]);

  const start = useCallback(async (fkProject, fkTask, note) => {
    setLoading(true);
    setError(null);
    try {
      const result = await startTimer(fkProject, fkTask, note);
      const activeEntryPayload = {
        ...result,
        fk_project: result.fk_project ?? fkProject,
        fk_task: result.fk_task ?? fkTask,
        note: result.note ?? note,
      };

      setRunningEntry(activeEntryPayload);
      return activeEntryPayload;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de démarrer le chrono.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [setRunningEntry]);

  const resume = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      const entry = await restartTimer(id);
      setRunningEntry(entry);
      return entry;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de reprendre le chrono.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [setRunningEntry]);

  const stop = useCallback(async () => {
    if (!activeEntry?.id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await stopTimer(activeEntry.id);
      // Reset the local timer only after the server has confirmed the stop.
      // This also makes the interval effect clean up its active interval.
      setIsRunning(false);
      setActiveEntry(null);
      setSeconds(0);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’arrêter le chrono.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [activeEntry]);

  return { activeEntry, isRunning, seconds, loading, error, start, resume, stop };
}
