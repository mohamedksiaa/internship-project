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

  const start = useCallback(async (projectLabel, fkTask, note) => {
    setLoading(true);
    setError(null);
    try {
      const result = await startTimer(projectLabel, fkTask, note);
      const activeEntryPayload = {
        ...result,
        project_label: result.project_label || projectLabel,
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
