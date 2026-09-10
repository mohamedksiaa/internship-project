import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import TimerWidget from '../components/organisms/TimerWidget';
import TimeEntryList from '../components/organisms/TimeEntryList';
import { getProjects, getTasks, getTimeEntries, getTimeEntryUpdates } from '../api/timeflowApi';
import { useTimer } from '../hooks/UseTimer.js';

const canReadAll = typeof window !== 'undefined' && window.TIMEFLOW_CAN_READALL === true;

export default function TimerPage() {
  const { t } = useTranslation();
  const timer = useTimer();
  const [projects, setProjects] = useState([]);
  const [historyTasks, setHistoryTasks] = useState([]); // Master list of tasks for the history
  const [entries, setEntries] = useState([]);
  const [projectsError, setProjectsError] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  // No UI sets this anymore (the "Facturable uniquement" checkbox was
  // removed) — kept as a permanently-false value rather than stripped out,
  // since loadEntries()/getTimeEntries()/getTimeEntryUpdates() still take a
  // billableOnly argument through several call sites (pagination, polling,
  // reload), and removing it there would be a much larger, riskier change
  // for no behavioral difference (it would just always pass false too).
  const [billableOnly] = useState(false);

  // Re-run on every mount AND every time the project selector is opened, so a
  // project closed elsewhere (fk_statut -> CLOSED) disappears from the picker
  // without requiring a full page reload — getProjects() already excludes
  // closed projects server-side, this just keeps the client list from going stale.
  const refreshProjects = useCallback(async () => {
    try {
      const mapped = await getProjects();
      setProjects(mapped || []);
      setProjectsError(mapped && mapped.length ? '' : t('timer_page.no_projects'));
    } catch (err) {
      setProjectsError(err?.message || t('timer_page.load_projects_error'));
      setProjects([]);
    }
  }, [t]);

  const pageRef = useRef(1);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  const billableOnlyRef = useRef(false);
  useEffect(() => {
    billableOnlyRef.current = billableOnly;
  }, [billableOnly]);

  // Backend pagination (page/per_page=20, same contract as
  // timeflowFetchDailyReports / "Rapports des tâches") replaces the old
  // implicit fetchAll(..., limit=100) cap — getTimeEntries() now returns
  // {entries, pagination} for exactly one page instead of an unbounded array.
  // billableOnly is taken as an explicit argument (like targetPage) rather
  // than read from the `billableOnly` state directly, so this function
  // behaves the same whether called from a fresh render's closure (the
  // pagination buttons, the checkbox) or from the mount-effect's long-lived
  // closure below (which must go through billableOnlyRef instead).
  async function loadEntries(targetPage, billableOnlyFilter) {
    try {
      const data = await getTimeEntries(targetPage, 20, billableOnlyFilter);
      const pages = data.pagination?.pages || 1;
      if (targetPage > pages && pages >= 1 && targetPage !== pages) {
        return loadEntries(pages, billableOnlyFilter);
      }
      const fetchedEntries = Array.isArray(data.entries) ? data.entries : [];
      setEntries(fetchedEntries);
      setPagination(data.pagination || {});
      setPage(targetPage);

      // FIX: Fetch tasks for all projects present in the history so names resolve
      try {
        const uniqueProjectIds = [...new Set(fetchedEntries.map((e) => e.projectId).filter(Boolean))];
        const taskResults = await Promise.all(uniqueProjectIds.map((id) => getTasks(id)));
        setHistoryTasks(taskResults.flat());
      } catch (error) {
        console.error("Impossible de charger les tâches pour l'historique", error);
      }
    } catch {
      setEntries([]);
    }
    return undefined;
  }

  useEffect(() => {
    let isMounted = true;
    let marker = null;
    let polling = false;

    async function checkForUpdates() {
      if (polling || document.visibilityState !== 'visible') return;
      polling = true;
      try {
        const update = await getTimeEntryUpdates('entries', marker || '', pageRef.current, 20, billableOnlyRef.current);
        if (!isMounted) return;
        if (marker === null) {
          marker = update.marker;
        } else if (update.changed) {
          marker = update.marker;
          setEntries(update.entries);
        }
      } catch {
        // Keep the current history visible if a background check fails.
      } finally {
        polling = false;
      }
    }

    async function initialize() {
      // See ValidationPage: protect the initial list load from the race where
      // a new entry is written between the list query and marker capture.
      let markerBefore = null;
      try {
        markerBefore = (await getTimeEntryUpdates('entries', '', 1, 20)).marker;
      } catch {
        // Keep loading the page if only the marker request is unavailable.
      }
      await Promise.allSettled([refreshProjects(), loadEntries(1, billableOnlyRef.current)]);
      if (!isMounted) return;
      try {
        const update = await getTimeEntryUpdates('entries', markerBefore || '', pageRef.current, 20, billableOnlyRef.current);
        marker = update.marker;
        if (markerBefore !== null && update.changed && isMounted) {
          setEntries(update.entries);
        }
      } catch {
        // The interval will retry without disturbing the displayed list.
      }
    }

    initialize();
    const intervalId = window.setInterval(checkForUpdates, 15000);
    window.addEventListener('focus', checkForUpdates);
    document.addEventListener('visibilitychange', checkForUpdates);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', checkForUpdates);
      document.removeEventListener('visibilitychange', checkForUpdates);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProjectChange = () => {
    // Le projet est désormais saisi librement en texte. Aucune charge de tâches
    // n’est déclenchée depuis ce champ.
  };

  const handleEntryCreated = () => {
    // A brand new entry always sorts first (DESC on date_start) — jump back
    // to page 1 and refetch from the backend instead of splicing locally, so
    // pagination.total stays accurate and a page >1 view doesn't end up with
    // a page-1 entry mixed into it.
    loadEntries(1, billableOnly);
  };

  const handleRestartEntry = async (entry) => {
    return timer.resume(entry.id);
  };

  return (
    <div className="tw-mx-auto tw-w-full tw-max-w-[1680px] tw-px-5 tw-py-7">
      <TimerWidget
        timer={timer}
        projects={projects}
        projectsError={projectsError}
        onProjectChange={handleProjectChange}
        onProjectSelectorOpen={refreshProjects}
        onEntryCreated={handleEntryCreated}
      />

      <div className="tw-mt-10">
        <div className="tw-mb-4 tw-flex tw-items-center tw-justify-between tw-text-sm tw-text-[#52656f] dark:tw-text-slate-400">
          <h1 className="tw-font-medium tw-text-[#263746] dark:tw-text-slate-400">{t('timer_page.task_history')}</h1>
          <div className="tw-flex tw-items-center tw-gap-4">
            <span>
              {t(entries.length > 1 ? 'timer_page.entries_plural' : 'timer_page.entries_one', { count: entries.length })}
            </span>
          </div>
        </div>
        <TimeEntryList
          entries={entries}
          setEntries={setEntries}
          reloadEntries={() => loadEntries(page, billableOnly)}
          projects={projects}
          tasks={historyTasks} // Pass the newly fetched master list here!
          showWorker={canReadAll}
          onRestartEntry={handleRestartEntry}
          activeEntryId={timer.activeEntry?.id}
          activeSeconds={timer.seconds}
        />
        {entries.length > 0 && (
          <div className="tw-mt-4 tw-flex tw-items-center tw-justify-center tw-gap-4">
            <button
              type="button"
              onClick={() => loadEntries(Math.max(1, page - 1), billableOnly)}
              disabled={page <= 1}
              className={`tw-rounded tw-px-4 tw-py-2 ${page <= 1 ? 'tw-bg-slate-200 dark:tw-bg-slate-800 tw-text-slate-500 dark:tw-text-slate-500' : 'tw-bg-slate-100 dark:tw-bg-slate-700 tw-text-slate-700 dark:tw-text-slate-200 hover:tw-bg-slate-200 dark:hover:tw-bg-slate-600'}`}
            >
              {t('processed_history.pagination.previous')}
            </button>
            <div className="tw-text-sm tw-text-slate-700 dark:tw-text-slate-300">
              {t('processed_history.pagination.page', { current: pagination.page || page, total: pagination.pages || 1 })}
            </div>
            <button
              type="button"
              onClick={() => loadEntries(Math.min(pagination.pages || page, page + 1), billableOnly)}
              disabled={page >= (pagination.pages || 1)}
              className={`tw-rounded tw-px-4 tw-py-2 ${page >= (pagination.pages || 1) ? 'tw-bg-slate-200 dark:tw-bg-slate-800 tw-text-slate-500 dark:tw-text-slate-500' : 'tw-bg-slate-100 dark:tw-bg-slate-700 tw-text-slate-700 dark:tw-text-slate-200 hover:tw-bg-slate-200 dark:hover:tw-bg-slate-600'}`}
            >
              {t('processed_history.pagination.next')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
