/**
 * Contexte React pour partager l'état du timer
 * entre tous les composants de l'application
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

// Création du contexte
const TimerContext = createContext(null);

// Hook pour utiliser le contexte
export const useTimerContext = () => {
  const context = useContext(TimerContext);
  if (!context) {
    throw new Error('useTimerContext doit être utilisé dans TimerProvider');
  }
  return context;
};

// Provider qui enveloppe l'application
export const TimerProvider = ({ children }) => {
  const [activeEntry, setActiveEntry] = useState(null); // Entrée de temps en cours
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  
  // Démarrer un nouveau timer
  const startTimer = useCallback((projectId, taskId = null, note = '') => {
    const newEntry = {
      id: 'temp-' + Date.now(), // ID temporaire
      projectId,
      taskId,
      note,
      dateStart: new Date().toISOString(),
      dateEnd: null,
      duration: 0,
    };
    setActiveEntry(newEntry);
    setSelectedProject(projectId);
    setSelectedTask(taskId);
  }, []);
  
  // Arrêter le timer
  const stopTimer = useCallback(() => {
    if (activeEntry) {
      const stopped = {
        ...activeEntry,
        dateEnd: new Date().toISOString(),
      };
      setActiveEntry(null);
      return stopped;
    }
    return null;
  }, [activeEntry]);
  
  // Valeur fournie aux enfants
  const value = {
    activeEntry,
    selectedProject,
    selectedTask,
    startTimer,
    stopTimer,
    setSelectedProject,
    setSelectedTask,
    isTimerActive: !!activeEntry,
  };
  
  return (
    <TimerContext.Provider value={value}>
      {children}
    </TimerContext.Provider>
  );
};