import { useEffect, useState } from 'react';
import TimerWidget from '../components/organisms/TimerWidget';
import TimeEntryList from '../components/organisms/TimeEntryList';
import { getProjects, getTasks, getTimeEntries } from '../api/clockifyApi';

export default function TimerPage() {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [entries, setEntries] = useState([]);
  const [projectsError, setProjectsError] = useState('');

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
          setProjects([]);
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
    // Tasks are loaded only after the user chooses a project.
    loadEntries();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleProjectChange = async (projectId) => {
    setTasks([]);
    if (!projectId) return;
    try {
      setTasks(await getTasks(projectId));
    } catch {
      setTasks([]);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1680px] px-5 py-7">
      <TimerWidget projects={projects} projectsError={projectsError} tasks={tasks} onProjectChange={handleProjectChange} />

      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between text-sm text-[#52656f]">
          <h1 className="font-medium text-[#263746]">Historique des tâches</h1>
          <span>{entries.length} entrée{entries.length > 1 ? 's' : ''}</span>
        </div>
        <TimeEntryList entries={entries} setEntries={setEntries} projects={projects} tasks={tasks} />
      </div>
    </div>
  );
}
