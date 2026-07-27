import { useEffect, useState } from 'react';
import TimerWidget from '../components/organisms/TimerWidget';
import TimeEntryList from '../components/organisms/TimeEntryList';
import { getProjects, getTasks, getTimeEntries } from '../api/clockifyApi';

const fallbackProjects = [
  { id: 1, title: 'Projet Alpha' },
  { id: 2, title: 'Projet Beta' },
];

export default function TimerPage() {
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
    <div className="mx-auto w-full max-w-full px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Time Tracker</p>
                <h1 className="mt-2 text-3xl font-semibold text-slate-900 sm:text-4xl">Suivez votre temps en un clic</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                  Choisissez un projet et une tâche, puis démarrez votre session pour suivre toutes vos heures directement depuis Dolibarr.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="rounded-full bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">{entries.length} entrées</div>
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> En ligne
                </div>
              </div>
            </div>

            <div className="mt-6">
              <TimerWidget projects={projects} projectsError={projectsError} tasks={tasks} />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Entrées</p>
                <h2 className="text-2xl font-semibold text-slate-900">Historique des sessions</h2>
              </div>
              <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                {entries.length} entrées
              </span>
            </div>
            <TimeEntryList
              entries={entries}
              setEntries={setEntries}
              title="Sessions récentes"
              subtitle="Dernières entrées enregistrées avec le tracker"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
