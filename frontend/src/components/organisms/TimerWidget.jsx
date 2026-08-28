import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import TimeDisplay from '../atoms/TimeDisplay';

export default function TimerWidget({ timer, projects: _projects = [], projectsError = '', onProjectChange = () => {}, onEntryCreated = () => {} }) {
  const { t } = useTranslation();
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
            id="timeflow-description"
            name="description"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label={t('timer_widget.description_label')}
            placeholder={t('timer_widget.description_placeholder')}
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-[#5B8FA8] focus:bg-white focus:ring-2 focus:ring-[#5B8FA8]/10"
          />
          <input
            id="timeflow-project"
            name="project"
            value={projectLabel}
            onChange={(e) => handleProjectChange(e.target.value)}
            aria-label={t('timer_widget.project_label')}
            placeholder={t('timer_widget.project_placeholder')}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-[#5B8FA8] focus:bg-white focus:ring-2 focus:ring-[#5B8FA8]/10 md:w-48"
          />
          <div className="flex items-center justify-center md:w-32">
            <TimeDisplay seconds={seconds} />
          </div>
          <button
            type="button"
            onClick={isRunning ? handleStop : handleStart}
            disabled={isDisabled}
            className="w-full rounded-xl bg-[#5B8FA8] px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-[#4A7690] hover:shadow-lg hover:shadow-[#4A7690]/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none md:w-auto"
          >
            {loading ? '...' : isRunning ? t('timer_widget.stop') : t('timer_widget.start')}
          </button>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-[#d64c4c]">{error}</p>}
      {!isRunning && !isDisabled && !error && (
        <p className="mt-2 text-sm text-slate-500">{t('timer_widget.ready_to_start')}</p>
      )}
      {projectsError && <p className="mt-2 text-sm text-slate-500">{projectsError}. {t('timer_widget.start_without_project')}</p>}
    </section>
  );
}
