import { useEffect, useState } from 'react';
import DashboardLayout from '../components/templates/DashboardLayout';
import TimerWidget from '../components/organisms/TimerWidget';
import TimeEntryList from '../components/organisms/TimeEntryList';
import { getProjects, getTasks, getTimeEntries } from '../api/clockifyApi';

const fallbackProjects = [
  { id: 1, title: 'Projet Alpha' },
  { id: 2, title: 'Projet Beta' },
];

export default function DashboardPage() {
  const [projects, setProjects] = useState(fallbackProjects);
  const [tasks, setTasks] = useState([]);
  const [entries, setEntries] = useState([]);
  const [projectsError, setProjectsError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadProjects() {
      try {
        const mappedProjects = await getProjects(10);
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

    async function loadTasks() {
      try {
        const mappedTasks = await getTasks(20);
        if (isMounted) {
          setTasks(mappedTasks);
        }
      } catch {
        if (isMounted) {
          setTasks([]);
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
    loadTasks();
    loadEntries();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <DashboardLayout
      timer={<TimerWidget projects={projects} projectsError={projectsError} tasks={tasks} />}
      entryList={<TimeEntryList entries={entries} setEntries={setEntries} title="Entrées récentes" subtitle="Aperçu des sessions et validations" />}
      stats={entries}
    />
  );
}
