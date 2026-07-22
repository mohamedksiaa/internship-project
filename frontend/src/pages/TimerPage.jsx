import TimerWidget from '../components/organisms/TimerWidget';
import { useEffect, useState } from 'react';
import { normalizeProjects, normalizeTasks } from '../api/clockifyApi';

const fallbackProjects = [
  { id: 1, title: 'Projet Alpha' },
  { id: 2, title: 'Projet Beta' },
];

export default function TimerPage() {
  const [projects, setProjects] = useState(fallbackProjects);
  const [tasks, setTasks] = useState([]);
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

    loadProjects();
    loadTasks();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-2 text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Chronomètre</div>
        <TimerWidget projects={projects} projectsError={projectsError} tasks={tasks} />
      </div>
    </div>
  );
}
