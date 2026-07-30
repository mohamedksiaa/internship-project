import { useState, useEffect, useRef, useCallback } from 'react';
import { getActiveTimer, startTimer, stopTimer } from '../api/clockifyApi';

export function useTimer() {
  const [isRunning, setIsRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [activeId, setActiveId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  // Au chargement de la page, on vérifie si un chrono est déjà actif (ex: si l'utilisateur a rechargé la page)
  useEffect(() => {
    getActiveTimer()
      .then((data) => {
        if (data && data.id) {
          setActiveId(data.id);
          setIsRunning(true);
          const elapsed = Math.floor(Date.now() / 1000) - data.date_start;
          setSeconds(elapsed);
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

  const start = useCallback(async (fkProject, fkTask, note) => {
    setLoading(true);
    setError(null);
    try {
      const result = await startTimer(fkProject, fkTask, note);
      setActiveId(result.id);
      setIsRunning(true);
      setSeconds(0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const stop = useCallback(async () => {
    if (!activeId) return;
    setLoading(true);
    setError(null);
    try {
      await stopTimer(activeId);
      setIsRunning(false);
      setActiveId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeId]);

  return { isRunning, seconds, loading, error, start, stop };
}