import { useState, useEffect } from 'react';
import DashboardLayout from '../components/templates/DashboardLayout';
import TimerWidget from '../components/organisms/TimerWidget';
import TimeEntryList from '../components/organisms/TimeEntryList';
import { getProjects, getTasks, getTimeEntries } from '../api/clockifyApi';

const fallbackProjects = [
  { id: 1, title: 'Projet Alpha' },
  { id: 2, title: 'Projet Beta' },
];

export default function TimeTrackerPage() {
  const [projects, setProjects] = useState(fallbackProjects);
  const [tasks, setTasks] = useState([]);
  const [entries, setEntries] = useState([]);
  const [projectsError, setProjectsError] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState(0);

  // 1. Fetch initial Projects and Time Entries concurrently
  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      const [projectsResult, entriesResult] = await Promise.allSettled([
        getProjects(),
        getTimeEntries(),
      ]);

      if (!isMounted) return;

      // Handle Projects
      if (projectsResult.status === 'fulfilled' && projectsResult.value?.length) {
        setProjects(projectsResult.value);
        setProjectsError('');
      } else {
        const errorMsg = projectsResult.reason?.message || 'Aucun projet disponible dans Dolibarr';
        setProjectsError(errorMsg);
        setProjects(fallbackProjects);
      }

      // Handle Entries
      if (entriesResult.status === 'fulfilled') {
        setEntries(Array.isArray(entriesResult.value) ? entriesResult.value : []);
      } else {
        setEntries([]);
      }
    }

    loadInitialData();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Fetch Tasks whenever selectedProjectId changes (Declarative Approach)
  useEffect(() => {
    let isMounted = true;

    async function loadTasks() {
      if (!selectedProjectId) {
        setTasks([]);
        return;
      }

      try {
        const mappedTasks = await getTasks(selectedProjectId);
        if (isMounted) {
          setTasks(mappedTasks);
        }
      } catch {
        if (isMounted) {
          setTasks([]);
        }
      }
    }

    loadTasks();

    return () => {
      isMounted = false;
    };
  }, [selectedProjectId]);

  // Clean handler: Just update state, let useEffect handle side-effects!
  const handleProjectChange = (projectId) => {
    setSelectedProjectId(projectId || 0);
  };

  return (
    <DashboardLayout
      timer={
        <TimerWidget
          projects={projects}
          projectsError={projectsError}
          tasks={tasks}
          onProjectChange={handleProjectChange}
        />
      }
      entryList={
        <TimeEntryList
          entries={entries}
          setEntries={setEntries}
          projects={projects}
          tasks={tasks}
        />
      }
      stats={entries}
    />
  );
}
