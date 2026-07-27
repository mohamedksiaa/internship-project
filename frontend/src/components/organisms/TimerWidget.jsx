import { useState } from 'react';
import { useTimer } from '../../hooks/UseTimer';
import ProjectSelector from '../molecules/ProjectSelector';
import NoteField from '../molecules/NoteField';
import TimerControls from '../molecules/TimeControls';
import TimeDisplay from '../atoms/TimeDisplay';

export default function TimerWidget({ projects = [], projectsError = '', tasks = [] }) {
  const { isRunning, seconds, loading, error, start, stop } = useTimer();
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [note, setNote] = useState('');

  const handleStart = () => {
    if (!projectId) {
      return;
    }

    start(Number(projectId), taskId ? Number(taskId) : 0, note.trim());
  };

  const selectedProject = projects.find((project) => project.id === Number(projectId));
  const selectedTask = tasks.find((task) => task.id === Number(taskId));

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_360px]">
        <div className="space-y-6">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Chrono</p>
            <h2 className="text-3xl font-semibold text-slate-900">Démarrer un suivi</h2>
            <p className="max-w-2xl text-sm leading-6 text-slate-500">
              Lancez le minuteur, ajoutez une note et suivez vos heures directement depuis Dolibarr.
            </p>
          </div>

          {(error || projectsError) && (
            <div className="rounded-3xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
              {error || projectsError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Projet</label>
              <ProjectSelector projects={projects} value={projectId} onChange={setProjectId} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Tâche</label>
              <select
                value={taskId}
                onChange={(event) => setTaskId(event.target.value)}
                className="block w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none"
              >
                <option value="">Sélectionner une tâche</option>
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>{task.title}</option>
                ))}
              </select>
            </div>
          </div>

          <NoteField value={note} onChange={setNote} />

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Projet</p>
              <p className="mt-2 text-sm text-slate-900">{selectedProject?.title || 'Aucun projet'}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Tâche</p>
              <p className="mt-2 text-sm text-slate-900">{selectedTask?.title || 'Aucune tâche'}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Note</p>
              <p className="mt-2 min-h-[1.5rem] text-sm text-slate-900">{note || 'Pas de note'}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
          <div className="flex flex-col gap-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Temps</p>
                <TimeDisplay seconds={seconds} />
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isRunning ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800/80 text-slate-300'}`}>
                {isRunning ? 'EN COURS' : 'EN PAUSE'}
              </span>
            </div>

            <div className="rounded-[1.5rem] bg-slate-900 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Statut</p>
              <p className={`mt-3 text-lg font-semibold ${isRunning ? 'text-emerald-300' : 'text-slate-300'}`}>
                {isRunning ? 'Actif' : 'Inactif'}
              </p>
            </div>

            <div className="grid gap-4">
              <div className="rounded-[1.5rem] bg-slate-900 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Projet</p>
                <p className="mt-2 text-sm text-white">{selectedProject?.title || 'Aucun projet'}</p>
              </div>
              <div className="rounded-[1.5rem] bg-slate-900 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Tâche</p>
                <p className="mt-2 text-sm text-white">{selectedTask?.title || 'Aucune tâche'}</p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <TimerControls
                isRunning={isRunning}
                onStart={handleStart}
                onStop={stop}
                loading={loading}
                disabled={!projectId}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
