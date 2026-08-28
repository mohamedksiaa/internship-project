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
      <div className="tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-white tw-p-5 tw-shadow-[0_1px_3px_rgba(35,61,79,0.08)]">
        <div className="tw-flex tw-flex-col tw-gap-4 tw-md:flex-row tw-md:items-center">
          <input
            id="timeflow-description"
            name="description"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label={t('timer_widget.description_label')}
            placeholder={t('timer_widget.description_placeholder')}
            className="tw-flex-1 tw-rounded-xl tw-border tw-border-slate-200 tw-bg-slate-50 tw-px-4 tw-py-3 tw-text-sm tw-text-slate-700 tw-outline-none tw-transition tw-placeholder:text-slate-400 tw-focus:border-[#5B8FA8] tw-focus:bg-white tw-focus:ring-2 tw-focus:ring-[#5B8FA8]/10"
          />
          <input
            id="timeflow-project"
            name="project"
            value={projectLabel}
            onChange={(e) => handleProjectChange(e.target.value)}
            aria-label={t('timer_widget.project_label')}
            placeholder={t('timer_widget.project_placeholder')}
            className="tw-w-full tw-rounded-xl tw-border tw-border-slate-200 tw-bg-slate-50 tw-px-4 tw-py-3 tw-text-sm tw-text-slate-700 tw-outline-none tw-transition tw-placeholder:text-slate-400 tw-focus:border-[#5B8FA8] tw-focus:bg-white tw-focus:ring-2 tw-focus:ring-[#5B8FA8]/10 tw-md:w-48"
          />
          <div className="tw-flex tw-items-center tw-justify-center tw-md:w-32">
            <TimeDisplay seconds={seconds} />
          </div>
          <button
            type="button"
            onClick={isRunning ? handleStop : handleStart}
            disabled={isDisabled}
            className="tw-w-full tw-rounded-xl tw-bg-[#5B8FA8] tw-px-6 tw-py-3 tw-text-sm tw-font-semibold tw-text-white tw-transition-all tw-hover:bg-[#4A7690] tw-hover:shadow-lg tw-hover:shadow-[#4A7690]/20 tw-disabled:cursor-not-allowed tw-disabled:opacity-50 tw-disabled:hover:shadow-none tw-md:w-auto"
          >
            {loading ? '...' : isRunning ? t('timer_widget.stop') : t('timer_widget.start')}
          </button>
        </div>
      </div>
      {error && <p className="tw-mt-3 tw-text-sm tw-text-[#d64c4c]">{error}</p>}
      {!isRunning && !isDisabled && !error && (
        <p className="tw-mt-2 tw-text-sm tw-text-slate-500">{t('timer_widget.ready_to_start')}</p>
      )}
      {projectsError && <p className="tw-mt-2 tw-text-sm tw-text-slate-500">{projectsError}. {t('timer_widget.start_without_project')}</p>}
    </section>
  );
}
