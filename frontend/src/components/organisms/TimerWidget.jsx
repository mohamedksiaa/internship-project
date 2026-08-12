import { useState } from 'react';
import TimeDisplay from '../atoms/TimeDisplay';

export default function TimerWidget({ timer, projects: _projects = [], projectsError = '', onProjectChange = () => {}, onEntryCreated = () => {} }) {
  const { isRunning, seconds, loading, error, start, stop } = timer;
  const [projectLabel, setProjectLabel] = useState('');
  const [note, setNote] = useState('');

  const projectTrimmed = projectLabel.trim();
  const noteTrimmed = note.trim();
  const isProjectValid = projectTrimmed !== '';
  const isNoteValid = noteTrimmed.length >= 3;
  const isDisabled = loading || (!isRunning && (!isProjectValid || !isNoteValid));

  const pushEntry = (entry) => {
    if (entry) {
      onEntryCreated(entry);
    }
  };

  const handleStart = async () => {
    if (isDisabled) return;
    const entry = await start(projectTrimmed, 0, noteTrimmed);
    pushEntry(entry);
  };

  const handleStop = async () => {
    const entry = await stop();
    if (entry) {
      setNote('');
      setProjectLabel('');
      onProjectChange('');
      pushEntry(entry);
    }
  };

  const handleProjectChange = (nextProjectLabel) => {
    setProjectLabel(nextProjectLabel);
    onProjectChange(nextProjectLabel.trim());
  };

  return (
    <section>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(35,61,79,0.08)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <input
            id="clockify-description"
            name="description"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="What are you working on?"
            placeholder="Que faites-vous ?"
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-[#03a9f4] focus:bg-white focus:ring-2 focus:ring-[#03a9f4]/10"
          />
          <input
            id="clockify-project"
            name="project"
            value={projectLabel}
            onChange={(e) => handleProjectChange(e.target.value)}
            aria-label="Projet"
            placeholder="Projet"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-[#03a9f4] focus:bg-white focus:ring-2 focus:ring-[#03a9f4]/10 md:w-48"
          />
          <div className="flex items-center justify-center md:w-32">
            <TimeDisplay seconds={seconds} />
          </div>
          <button
            type="button"
            onClick={isRunning ? handleStop : handleStart}
            disabled={isDisabled}
            className="w-full rounded-xl bg-[#03a9f4] px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-[#0398dc] hover:shadow-lg hover:shadow-[#03a9f4]/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none md:w-auto"
          >
            {loading ? '...' : isRunning ? 'ARRÊTER' : 'DÉMARRER'}
          </button>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-[#d64c4c]">{error}</p>}
      {!isRunning && !isDisabled && !error && (
        <p className="mt-2 text-sm text-slate-500">Prêt à démarrer.</p>
      )}
      {projectsError && <p className="mt-2 text-sm text-slate-500">{projectsError}. Vous pouvez tout de même démarrer un chrono sans projet.</p>}
    </section>
  );
}
