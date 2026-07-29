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

  useEffect(() => {
    let isMounted = true;

    async function loadProjects() {
      try {
        const mappedProjects = await getProjects();
        if (!mappedProjects.length) {
          throw new Error('Aucun projet disponible dans Dolibarr');
        }
        if (isMounted) {
          setProjects(mappedProjects);
        }
      } catch (err) {
        if (isMounted) {
          setProjectsError(err.message);
          setProjects(fallbackProjects);
        }
      }
    }

    async function loadEntries() {
      try {
        const data = await getTimeEntries();
        if (isMounted) {
          setEntries(Array.isArray(data) ? data : []);
        }
      } catch {
        if (isMounted) {
          setEntries([]);
        }
      }
    }

    loadProjects();
    loadEntries();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadTasks() {
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

  const handleProjectChange = async (projectId) => {
    setSelectedProjectId(projectId || 0);
    try {
      setTasks(await getTasks(projectId || 0));
    } catch {
      setTasks([]);
    }
  };

  return (
    <DashboardLayout
      timer={<TimerWidget projects={projects} projectsError={projectsError} tasks={tasks} onProjectChange={handleProjectChange} />}
      entryList={<TimeEntryList entries={entries} setEntries={setEntries} projects={projects} tasks={tasks} />}
      stats={entries}
    />
  );
}
