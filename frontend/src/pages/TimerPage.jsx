import { useEffect, useState } from 'react';
import TimerWidget from '../components/organisms/TimerWidget';
import TimeEntryList from '../components/organisms/TimeEntryList';
import { getProjects, getTasks, getTimeEntries } from '../api/clockifyApi';

const canReadAll = typeof window !== 'undefined' && window.CLOCKIFY_CAN_READALL === true;

export default function TimerPage() {
  const [projects, setProjects] = useState([]);
  const [historyTasks, setHistoryTasks] = useState([]); // Master list of tasks for the history
  const [entries, setEntries] = useState([]);
  const [projectsError, setProjectsError] = useState('');

  useEffect(() => {
    let isMounted = true;

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

    loadInitialData();

    return () => {
      isMounted = false;
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

  return (
    <div className="mx-auto w-full max-w-[1680px] px-5 py-7">
      <TimerWidget 
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
        />
      </div>
    </div>
  );
}