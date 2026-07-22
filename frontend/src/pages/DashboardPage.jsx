import DashboardLayout from '../components/templates/DashboardLayout';
import TimerWidget from '../components/organisms/TimerWidget';
import TimeEntryList from '../components/organisms/TimeEntryList';
import { useEffect, useState } from 'react';
import { normalizeProjects, normalizeTasks } from '../api/clockifyApi';

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
        const projectResponse = await fetch('/api/index.php/projects?limit=10', {
          credentials: 'include',
        });

        if (!projectResponse.ok) {
          throw new Error('Impossible de charger les projets Dolibarr');
        }

        const projectData = await projectResponse.json();
        const mappedProjects = normalizeProjects(projectData);

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
        const taskResponse = await fetch('/api/index.php/tasks?limit=20', {
          credentials: 'include',
        });

        if (!taskResponse.ok) {
          return;
        }

        const taskData = await taskResponse.json();
        if (isMounted) {
          setTasks(normalizeTasks(taskData));
        }
      } catch {
        if (isMounted) {
          setTasks([]);
        }
      }
    }

    async function loadEntries() {
      try {
        const response = await fetch('/api/index.php/clockify/timeentrys', {
          credentials: 'include',
        });

        if (!response.ok) {
          return;
        }

        const data = await response.json();
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
      entryList={<TimeEntryList entries={entries} setEntries={setEntries} />}
      stats={entries}
    />
  );
}
