import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Card from '../atoms/Card';
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
      <Card size="section">
        <div className="tw-flex tw-flex-col tw-gap-4 md:tw-flex-row md:tw-items-center">
          <input
            id="timeflow-description"
            name="description"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label={t('timer_widget.description_label')}
            placeholder={t('timer_widget.description_placeholder')}
            className="tw-flex-1 tw-rounded-xl tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-bg-slate-50 dark:tw-bg-slate-800 tw-px-4 tw-py-3 tw-text-sm tw-text-slate-700 dark:tw-text-slate-200 tw-outline-none tw-transition placeholder:tw-text-slate-400 dark:placeholder:tw-text-slate-500 focus:tw-border-[#5B8FA8] focus:tw-bg-white dark:focus:tw-bg-slate-900 focus:tw-ring-2 focus:tw-ring-[#5B8FA8]/10"
          />
          <input
            id="timeflow-project"
            name="project"
            value={projectLabel}
            onChange={(e) => handleProjectChange(e.target.value)}
            aria-label={t('timer_widget.project_label')}
            placeholder={t('timer_widget.project_placeholder')}
            className="tw-w-full tw-rounded-xl tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-bg-slate-50 dark:tw-bg-slate-800 tw-px-4 tw-py-3 tw-text-sm tw-text-slate-700 dark:tw-text-slate-200 tw-outline-none tw-transition placeholder:tw-text-slate-400 dark:placeholder:tw-text-slate-500 focus:tw-border-[#5B8FA8] focus:tw-bg-white dark:focus:tw-bg-slate-900 focus:tw-ring-2 focus:tw-ring-[#5B8FA8]/10 md:tw-w-48"
          />
          <div className="tw-flex tw-items-center tw-justify-center md:tw-w-32">
            <TimeDisplay seconds={seconds} />
          </div>
          <button
            type="button"
            onClick={isRunning ? handleStop : handleStart}
            disabled={isDisabled}
            className="tw-w-full tw-rounded-xl tw-bg-[#5B8FA8] tw-px-6 tw-py-3 tw-text-sm tw-font-semibold tw-text-white tw-transition-all hover:tw-bg-[#4A7690] dark:hover:tw-bg-[#6ea0ba] hover:tw-shadow-lg hover:tw-shadow-[#4A7690]/20 disabled:tw-cursor-not-allowed disabled:tw-opacity-50 disabled:hover:tw-shadow-none md:tw-w-auto"
          >
            {loading ? '...' : isRunning ? t('timer_widget.stop') : t('timer_widget.start')}
          </button>
        </div>
      </Card>
      {error && <p className="tw-mt-3 tw-text-sm tw-text-[#d64c4c] dark:tw-text-[#f0908f]">{error}</p>}
      {!isRunning && !isDisabled && !error && (
        <p className="tw-mt-2 tw-text-sm tw-text-slate-500 dark:tw-text-slate-400">{t('timer_widget.ready_to_start')}</p>
      )}
      {projectsError && <p className="tw-mt-2 tw-text-sm tw-text-slate-500 dark:tw-text-slate-400">{projectsError}. {t('timer_widget.start_without_project')}</p>}
    </section>
  );
}
