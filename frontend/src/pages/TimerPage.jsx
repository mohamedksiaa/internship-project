import { useEffect, useState } from 'react';
import TimerWidget from '../components/organisms/TimerWidget';
import TimeEntryList from '../components/organisms/TimeEntryList';
import { getProjects, getTasks, getTimeEntries, getTimeEntryUpdates } from '../api/timeflowApi';
import { useTimer } from '../hooks/UseTimer.js';

const canReadAll = typeof window !== 'undefined' && window.TIMEFLOW_CAN_READALL === true;

export default function TimerPage() {
  const timer = useTimer();
  const [projects, setProjects] = useState([]);
  const [historyTasks, setHistoryTasks] = useState([]); // Master list of tasks for the history
  const [entries, setEntries] = useState([]);
  const [projectsError, setProjectsError] = useState('');

  useEffect(() => {
    let isMounted = true;
    let marker = null;
    let polling = false;

    async function loadInitialData() {
      // Load projects and time entries in parallel
      const [projectsResult, entriesResult] = await Promise.allSettled([
        getProjects(),
        getTimeEntries(),
      ]);

      if (!isMounted) return;

      // Process Projects Result
      if (projectsResult.status === 'fulfilled') {
        const mapped = projectsResult.value || [];
        if (!mapped.length) {
          setProjectsError('Aucun projet disponible dans Dolibarr');
        } else {
          setProjects(mapped);
          setProjectsError('');
        }
      } else {
        setProjectsError(projectsResult.reason?.message || 'Erreur lors du chargement des projets');
        setProjects([]);
      }

      // Process Entries Result & Fetch their Tasks
      if (entriesResult.status === 'fulfilled') {
        const fetchedEntries = Array.isArray(entriesResult.value) ? entriesResult.value : [];
        setEntries(fetchedEntries);

        // FIX: Fetch tasks for all projects present in the history so names resolve
        try {
          // 1. Get unique project IDs from the history
          const uniqueProjectIds = [...new Set(fetchedEntries.map(e => e.projectId).filter(Boolean))];
          
          // 2. Fetch tasks for all these projects concurrently
          const taskPromises = uniqueProjectIds.map(id => getTasks(id));
          const taskResults = await Promise.all(taskPromises);
          
          // 3. Flatten the array of arrays into one big master task list
          if (isMounted) {
            setHistoryTasks(taskResults.flat());
          }
        } catch (error) {
          console.error("Impossible de charger les tâches pour l'historique", error);
        }
      } else {
        setEntries([]);
      }
    }

    async function checkForUpdates() {
      if (polling || document.visibilityState !== 'visible') return;
      polling = true;
      try {
        const update = await getTimeEntryUpdates('entries', marker || '');
        if (!isMounted) return;
        if (marker === null) {
          marker = update.marker;
        } else if (update.changed) {
          marker = update.marker;
          setEntries(update.entries);
        }
      } catch {
        // Keep the current history visible if a background check fails.
      } finally {
        polling = false;
      }
    }

    async function initialize() {
      // See ValidationPage: protect the initial list load from the race where
      // a new entry is written between the list query and marker capture.
      let markerBefore = null;
      try {
        markerBefore = (await getTimeEntryUpdates('entries')).marker;
      } catch {
        // Keep loading the page if only the marker request is unavailable.
      }
      await loadInitialData();
      try {
        const update = await getTimeEntryUpdates('entries', markerBefore || '');
        marker = update.marker;
        if (markerBefore !== null && update.changed && isMounted) {
          setEntries(update.entries);
        }
      } catch {
        // The interval will retry without disturbing the displayed list.
      }
    }

    initialize();
    const intervalId = window.setInterval(checkForUpdates, 15000);
    window.addEventListener('focus', checkForUpdates);
    document.addEventListener('visibilitychange', checkForUpdates);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', checkForUpdates);
      document.removeEventListener('visibilitychange', checkForUpdates);
    };
  }, []);

  const handleProjectChange = () => {
    // Le projet est désormais saisi librement en texte. Aucune charge de tâches
    // n’est déclenchée depuis ce champ.
  };

  const handleEntryCreated = (entry) => {
    setEntries((currentEntries) => {
      const nextEntries = currentEntries.filter((item) => item.id !== entry.id);
      return [entry, ...nextEntries];
    });
    
    // Optional: If a new entry has a brand new task, add it to historyTasks so it shows up immediately
    if (entry.taskId && historyTasks.length > 0) {
      const newTask = historyTasks.find(t => t.id === entry.taskId);
      if (newTask) {
        setHistoryTasks(prev => [...prev, newTask]);
      }
    }
  };

  const handleRestartEntry = async (entry) => {
    return timer.resume(entry.id);
  };

  return (
    <div className="mx-auto w-full max-w-[1680px] px-5 py-7">
      <TimerWidget 
        timer={timer}
        projects={projects} 
        projectsError={projectsError} 
        onProjectChange={handleProjectChange} 
        onEntryCreated={handleEntryCreated} 
      />

      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between text-sm text-[#52656f]">
          <h1 className="font-medium text-[#263746]">Historique des tâches</h1>
          <span>
            {entries.length} entrée{entries.length > 1 ? 's' : ''}
          </span>
        </div>
        <TimeEntryList 
          entries={entries} 
          setEntries={setEntries} 
          projects={projects} 
          tasks={historyTasks} // Pass the newly fetched master list here!
          showWorker={canReadAll}
          onRestartEntry={handleRestartEntry}
          activeEntryId={timer.activeEntry?.id}
          activeSeconds={timer.seconds}
        />
      </div>
    </div>
  );
}
