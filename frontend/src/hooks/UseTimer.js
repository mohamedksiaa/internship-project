import { useState, useEffect, useRef, useCallback } from 'react';
import { getActiveTimer, startTimer, stopTimer } from '../api/clockifyApi';

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
            setSeconds(elapsed);
          }
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  // Fait défiler le compteur affiché chaque seconde, seulement si un chrono tourne
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    }
    return () => clearInterval(intervalRef.current); // nettoyage, évite les fuites mémoire
  }, [isRunning]);

  const start = useCallback(async (projectLabel, fkTask, note, tags = '', billable = 0, projectId = 0) => {
    setLoading(true);
    setError(null);
    try {
      const result = await startTimer(projectLabel, fkTask, note, tags, billable, projectId);
      const activeEntryPayload = {
        id: result.id,
        fk_project: Number(projectId || 0),
        project_label: projectLabel,
        fk_task: fkTask,
        note,
        tags,
        billable,
        date_start: new Date().toISOString(),
        duration: 0,
        status: 0,
      };

      setActiveEntry(activeEntryPayload);
      setIsRunning(true);
      setSeconds(0);
      return activeEntryPayload;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de démarrer le chrono.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const stop = useCallback(async () => {
    if (!activeEntry?.id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await stopTimer(activeEntry.id);
      setIsRunning(false);
      setActiveEntry(null);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’arrêter le chrono.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [activeEntry]);

  return { isRunning, seconds, loading, error, start, stop };
}
