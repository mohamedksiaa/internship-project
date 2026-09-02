import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Card from '../components/atoms/Card';
import ProjectFormModal from '../components/molecules/ProjectFormModal';
import { createTimeFlowProject, deleteTimeFlowProject, deleteTimeFlowProjects, getTimeFlowProjects, listActiveThirdParties, listActiveUsers, updateTimeFlowProject } from '../api/timeflowApi';
import { useUrlDateRange, useUrlState } from '../hooks/useUrlState.js';
import { useBulkSelection } from '../hooks/useBulkSelection.js';

const ASSIGNED_USERS_INLINE_LIMIT = 2;
const SEARCH_DEBOUNCE_MS = 300;
const canWrite = typeof window !== 'undefined' && window.TIMEFLOW_CAN_WRITE === true;

function userLabel(assignableUser) {
  return assignableUser.label || `${assignableUser.firstname || ''} ${assignableUser.lastname || ''}`.trim() || assignableUser.login;
}

/**
 * Resolves a project's assigned_user_ids (just ints from the API) into
 * display names using the `usersById` map already loaded for the assignment
 * form — no extra request per project/row, so this stays O(projects) with
 * no N+1 regardless of list size.
 *
 * - 0 ids => unrestricted project, "everyone" (this is the one legitimate
 *   case where "Tous" is correct — see ProjectFormModal's open/restricted
 *   hint, which uses the same rule when saving).
 * - up to ASSIGNED_USERS_INLINE_LIMIT ids => names shown inline.
 * - more => first N names + "+X autres", full list in the title tooltip.
 */
function formatAssignedUsers(project, usersById, t) {
  const ids = Array.isArray(project.assigned_user_ids) ? project.assigned_user_ids : [];
  if (ids.length === 0) {
    return { text: t('projects.everyone'), title: '' };
  }
  const labels = ids.map((id) => usersById.get(Number(id)) ? userLabel(usersById.get(Number(id))) : t('dashboard.user_fallback', { userId: id }));
  if (labels.length <= ASSIGNED_USERS_INLINE_LIMIT) {
    return { text: labels.join(', '), title: labels.join(', ') };
  }
  const shown = labels.slice(0, ASSIGNED_USERS_INLINE_LIMIT);
  const remaining = labels.length - shown.length;
  return {
    text: `${shown.join(', ')} ${t('projects.assigned_users_more', { count: remaining })}`,
    title: labels.join(', '),
  };
}

export default function ProjectsPage() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState([]);
  const [thirdParties, setThirdParties] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingProject, setEditingProject] = useState(null);
  const [creating, setCreating] = useState(false);
  const [deleteRequest, setDeleteRequest] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [failedDeleteIds, setFailedDeleteIds] = useState([]);
  const [failedDeleteMessages, setFailedDeleteMessages] = useState({});
  const usersById = useMemo(() => new Map(users.map((assignableUser) => [Number(assignableUser.id), assignableUser])), [users]);

  // Filters are persisted in the URL (?client=&dateFrom=&dateTo=&search=)
  // via the same useUrlState layer used by ReportsPage/DashboardPage — see
  // src/hooks/useUrlState.js. A refresh or a shared link keeps the exact
  // same filtered view.
  const [clientId, setClientId] = useUrlState('client', '');
  const [dateRange, setDateFrom, setDateTo] = useUrlDateRange({ from: '', to: '' });
  const [searchFilter, setSearchFilter] = useUrlState('search', '');
  // Free-text search is debounced locally before it's written to the URL/
  // triggers a fetch, same pattern as ReportsPage's project search — avoids
  // one AJAX call (and one history replaceState) per keystroke.
  const [searchInput, setSearchInput] = useState(searchFilter);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchFilter(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const filters = useMemo(() => ({
    clientId: clientId ? Number(clientId) : 0,
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    search: searchFilter,
  }), [clientId, dateRange, searchFilter]);

  const hasActiveFilters = Boolean(clientId || dateRange.from || dateRange.to || searchFilter);

  function resetFilters() {
    setClientId('');
    setDateFrom('');
    setDateTo('');
    setSearchInput('');
    setSearchFilter('');
  }

  async function loadProjects() {
    setLoading(true);
    setError('');
    try {
      const rows = await getTimeFlowProjects(filters);
      setProjects(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // AJAX refetch on every filter change (no full page reload), same pattern
  // as ReportsPage/ProcessedHistoryPage's date-range effects.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getTimeFlowProjects(filters)
      .then((rows) => { if (active) setProjects(Array.isArray(rows) ? rows : []); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters]);

  useEffect(() => {
    listActiveThirdParties().then(setThirdParties).catch(() => setThirdParties([]));
    listActiveUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  const selection = useBulkSelection(projects);

  async function handleSave({ id, title, fkSoc, description, assignedUserIds }) {
    if (id) {
      await updateTimeFlowProject(id, title, fkSoc, description, assignedUserIds);
    } else {
      await createTimeFlowProject(title, fkSoc, description, assignedUserIds);
    }
    setEditingProject(null);
    setCreating(false);
    await loadProjects();
  }

  async function submitDelete() {
    if (!deleteRequest) return;
    setDeleteError('');
    try {
      if (deleteRequest.type === 'single') {
        await deleteTimeFlowProject(deleteRequest.ids[0]);
        setDeleteRequest(null);
        await loadProjects();
        setSuccess(t('projects.delete_success', { count: 1 }));
      } else {
        const result = await deleteTimeFlowProjects(deleteRequest.ids);
        setDeleteRequest(null);
        selection.clear();
        // Refresh the list immediately; preserve any error message but
        // keep the refreshed table visible. Mark failed ids so rows can be
        // highlighted and annotated for the user.
        const deletedCount = Array.isArray(result?.deleted) ? result.deleted.length : 0;
        const failed = Array.isArray(result?.failed) ? result.failed : [];
        const failedCount = failed.length;
        // Build a map of id->message for display
        const failedMsgMap = {};
        if (failedCount > 0) {
          for (const f of failed) {
            failedMsgMap[Number(f.id)] = String(f.message || 'Échec');
          }
          setFailedDeleteIds(failed.map((f) => Number(f.id)));
          setFailedDeleteMessages(failedMsgMap);
        }
        await loadProjects();
        if (deletedCount > 0) {
          setSuccess(t('projects.delete_success', { count: deletedCount }));
        }
        if (failedCount > 0) {
          setError(t('projects.delete_partial_failure', { count: failedCount }));
          // Clear the temporary markers after a few seconds so UI returns to normal
          window.setTimeout(() => {
            setFailedDeleteIds([]);
            setFailedDeleteMessages({});
          }, 8000);
        }
      }
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setDeleteError(err.message);
    }
  }

  const showFormModal = creating || Boolean(editingProject);

  return (
    <div className="tw-mx-auto tw-w-full tw-max-w-[1680px] tw-space-y-6 tw-px-5 tw-py-7">
      <Card
        size="section"
        titleSize="xl"
        headerLabel={t('app.section_manage')}
        title={t('projects.title')}
        headerRight={(
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="tw-rounded tw-bg-[#5B8FA8] tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-white hover:tw-bg-[#4A7690] dark:hover:tw-bg-[#6ea0ba]"
          >
            {t('projects.new_project')}
          </button>
        )}
      >
        <div className="tw-mb-4 tw-grid tw-gap-3 md:tw-grid-cols-2 xl:tw-grid-cols-5">
          <select
            aria-label={t('projects.filters.client_label')}
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            className="tw-rounded tw-border tw-p-2 dark:tw-border-slate-600 dark:tw-bg-slate-800 dark:tw-text-slate-100"
          >
            <option value="">{t('projects.filters.all_clients')}</option>
            {thirdParties.map((party) => <option key={party.id} value={party.id}>{party.title}</option>)}
          </select>
          <input
            aria-label={t('projects.filters.date_from')}
            type="date"
            value={dateRange.from}
            onChange={(event) => setDateFrom(event.target.value)}
            className="tw-rounded tw-border tw-p-2 dark:tw-border-slate-600 dark:tw-bg-slate-800 dark:tw-text-slate-100"
          />
          <input
            aria-label={t('projects.filters.date_to')}
            type="date"
            value={dateRange.to}
            onChange={(event) => setDateTo(event.target.value)}
            className="tw-rounded tw-border tw-p-2 dark:tw-border-slate-600 dark:tw-bg-slate-800 dark:tw-text-slate-100"
          />
          <input
            aria-label={t('projects.filters.search_label')}
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t('projects.filters.search_placeholder')}
            className="tw-rounded tw-border tw-p-2 dark:tw-border-slate-600 dark:tw-bg-slate-800 dark:tw-text-slate-100"
          />
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="tw-rounded tw-border tw-border-slate-200 dark:tw-border-slate-600 tw-px-3 tw-py-2 tw-text-sm tw-text-slate-600 dark:tw-text-slate-300 hover:tw-bg-slate-50 dark:hover:tw-bg-slate-800"
            >
              {t('projects.filters.reset')}
            </button>
          )}
        </div>

        {canWrite && selection.count > 0 && (
          <div className="tw-mb-4 tw-flex tw-items-center tw-justify-end">
            <button
              type="button"
              onClick={() => setDeleteRequest({ type: 'multiple', ids: Array.from(selection.selectedIds) })}
              className="tw-rounded tw-bg-[#d64c4c] tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-white hover:tw-bg-[#b23f3f]"
            >
              {t('projects.delete_selection', { count: selection.count })}
            </button>
          </div>
        )}

        {loading && <p className="tw-text-sm tw-text-slate-600 dark:tw-text-slate-400">{t('loading')}</p>}
        {error && <p className="tw-text-sm tw-text-rose-600 dark:tw-text-rose-400">{error}</p>}
        {success && <p className="tw-text-sm tw-text-emerald-600 dark:tw-text-emerald-400">{success}</p>}

        {!loading && (
          projects.length === 0 ? (
            <p className="tw-text-sm tw-text-slate-500 dark:tw-text-slate-400">{t('projects.empty')}</p>
          ) : (
            <div className="tw-overflow-x-auto">
              <table className="tw-w-full tw-text-left tw-text-sm tw-border-collapse dark:tw-text-slate-200">
                <thead>
                  <tr className="tw-border-b tw-border-slate-200 dark:tw-border-slate-700 tw-text-xs tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-500 dark:tw-text-slate-400">
                    {canWrite && (
                      <th className="tw-w-10 tw-px-3 tw-py-2 tw-text-center">
                        <input
                          ref={selection.headerCheckboxRef}
                          aria-label={t('projects.select_page_aria')}
                          type="checkbox"
                          checked={selection.isAllSelected}
                          onChange={(event) => selection.selectAll(event.target.checked)}
                        />
                      </th>
                    )}
                    <th className="tw-px-3 tw-py-2">{t('projects.col_ref')}</th>
                    <th className="tw-px-3 tw-py-2">{t('projects.col_title')}</th>
                    <th className="tw-px-3 tw-py-2">{t('projects.col_client')}</th>
                    <th className="tw-px-3 tw-py-2">{t('projects.col_assigned_users')}</th>
                    <th className="tw-px-3 tw-py-2 tw-text-right">{t('projects.col_entries')}</th>
                    <th className="tw-px-3 tw-py-2 tw-text-right">{t('projects.col_actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project) => {
                    const isFailed = failedDeleteIds.includes(Number(project.id));
                    const failMsg = failedDeleteMessages[Number(project.id)];
                    return (
                      <tr key={project.id} className={`tw-border-b tw-border-slate-100 dark:tw-border-slate-800 ${isFailed ? 'tw-bg-rose-50 dark:tw-bg-rose-900/30' : ''}`}>
                      {canWrite && (
                        <td className="tw-px-3 tw-py-3 tw-text-center">
                          <input
                            aria-label={t('projects.select_entry_aria')}
                            type="checkbox"
                            checked={selection.isSelected(project.id)}
                            onChange={() => selection.toggle(project.id)}
                          />
                        </td>
                      )}
                      <td className="tw-px-3 tw-py-3 tw-whitespace-nowrap tw-text-slate-500 dark:tw-text-slate-400">{project.ref}</td>
                      <td className="tw-px-3 tw-py-3 tw-font-medium tw-text-slate-900 dark:tw-text-slate-100">
                        <span>{project.title}</span>
                        {isFailed && (
                          <span title={failMsg || ''} className="tw-ml-2 tw-text-rose-600 dark:tw-text-rose-300" aria-hidden>
                            ⚠️
                          </span>
                        )}
                      </td>
                      <td className="tw-px-3 tw-py-3 tw-text-slate-600 dark:tw-text-slate-300">{project.client || t('dashboard.no_client')}</td>
                      <td className="tw-px-3 tw-py-3 tw-max-w-[240px]">
                        {(() => {
                          const { text, title } = formatAssignedUsers(project, usersById, t);
                          return (
                            <span title={title || undefined} className="tw-block tw-truncate tw-text-slate-600 dark:tw-text-slate-300">
                              {text}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="tw-px-3 tw-py-3 tw-text-right tw-tabular-nums">{project.entry_count}</td>
                      <td className="tw-px-3 tw-py-3 tw-text-right tw-whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setEditingProject(project)}
                          className="tw-mr-3 tw-text-sm tw-text-[#5B8FA8] dark:tw-text-[#8fc0d9]"
                        >
                          {t('projects.edit_action')}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setDeleteError(''); setDeleteRequest({ type: 'single', ids: [Number(project.id)], title: project.title }); }}
                          className="tw-text-sm tw-text-[#d64c4c] dark:tw-text-[#f0908f]"
                        >
                          {t('projects.delete_action')}
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </Card>

      {showFormModal && (
        <ProjectFormModal
          project={editingProject}
          thirdParties={thirdParties}
          users={users}
          onSave={handleSave}
          onClose={() => { setEditingProject(null); setCreating(false); }}
        />
      )}

      {deleteRequest && (
        <div className="tw-fixed tw-inset-0 tw-z-50 tw-flex tw-items-center tw-justify-center tw-bg-black/40 tw-p-4" role="dialog" aria-modal="true" aria-labelledby="project-delete-title">
          <div className="tw-w-full tw-max-w-md tw-space-y-4 tw-rounded-lg tw-bg-white dark:tw-bg-slate-900 dark:tw-border dark:tw-border-slate-700 tw-p-6 tw-shadow-xl">
            <h3 id="project-delete-title" className="tw-text-lg tw-font-semibold tw-text-slate-900 dark:tw-text-slate-100">
              {deleteRequest.type === 'single' ? t('projects.delete_confirm_title') : t('projects.delete_selection_confirm_title')}
            </h3>
            <p className="tw-text-sm tw-text-slate-600 dark:tw-text-slate-400">
              {deleteRequest.type === 'single'
                ? t('projects.delete_confirm_text', { title: deleteRequest.title })
                : t('projects.delete_selection_confirm_text', { count: deleteRequest.ids.length })}
            </p>
            {deleteError && <p className="tw-rounded-md tw-bg-rose-50 dark:tw-bg-rose-900/30 tw-px-3 tw-py-2 tw-text-sm tw-text-rose-600 dark:tw-text-rose-300">{deleteError}</p>}
            <div className="tw-flex tw-justify-end tw-gap-3">
              <button type="button" onClick={() => setDeleteRequest(null)} className="tw-rounded tw-border tw-border-slate-200 dark:tw-border-slate-600 tw-px-4 tw-py-2 tw-text-sm tw-text-slate-700 dark:tw-text-slate-200 hover:tw-bg-slate-50 dark:hover:tw-bg-slate-800">
                {t('cancel')}
              </button>
              <button type="button" onClick={submitDelete} className="tw-rounded tw-bg-[#d64c4c] tw-px-4 tw-py-2 tw-text-sm tw-text-white hover:tw-bg-[#b23f3f]">
                {t('timeentry.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
