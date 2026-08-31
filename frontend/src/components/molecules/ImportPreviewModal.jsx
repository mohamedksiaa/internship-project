import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getProjects, listActiveUsers, listUserGroups, resolveClockifyMapping } from '../../api/timeflowApi';

const STATUS_STYLES = {
  matched: 'tw-bg-emerald-50 tw-text-emerald-700 dark:tw-bg-emerald-900/40 dark:tw-text-emerald-300',
  create_confirmed: 'tw-bg-sky-50 tw-text-sky-700 dark:tw-bg-sky-900/40 dark:tw-text-sky-300',
  create_pending: 'tw-bg-orange-50 tw-text-orange-700 dark:tw-bg-orange-900/40 dark:tw-text-orange-300',
  ignored: 'tw-bg-gray-100 tw-text-gray-600 dark:tw-bg-slate-700 dark:tw-text-slate-300',
};

function rowKey(row) {
  return `${row.mapping_type}:${row.source_value}`;
}

function MappingStatusBadge({ status }) {
  const { t } = useTranslation();
  const colorClass = STATUS_STYLES[status] ?? STATUS_STYLES.ignored;
  return (
    <span className={`tw-inline-flex tw-shrink-0 tw-items-center tw-min-w-0 tw-px-2 tw-py-1 tw-rounded-full tw-text-xs tw-font-medium ${colorClass}`}>
      {t(`processed_history.import.status.${status}`, status)}
    </span>
  );
}

function defaultChoice(sourceValue) {
  return { mode: 'existing', targetId: '', title: sourceValue };
}

/**
 * Renders a mapping list where a create_pending row can be resolved either
 * by picking an existing target from a select, or by checking "create
 * automatically" with an editable, pre-filled title. Shared by the
 * "Projets détectés" and "Groupes détectés" sections, which follow the
 * exact same interaction pattern.
 */
function CreatableMappingList({ title, emptyLabel, rows, choices, onChoiceChange, options, selectPlaceholder, checkboxLabel, titleAriaLabel }) {
  return (
    <div>
      <p className="tw-mb-2 tw-text-sm tw-font-semibold tw-text-slate-700 dark:tw-text-slate-300">{title}</p>
      {rows.length === 0 ? (
        <p className="tw-text-sm tw-text-slate-500 dark:tw-text-slate-400">{emptyLabel}</p>
      ) : (
        <ul className="tw-space-y-2">
          {rows.map((row) => {
            const choice = choices[row.source_value] || defaultChoice(row.source_value);
            const isCreatePending = row.target_action === 'create_pending';
            return (
              <li key={rowKey(row)} className="tw-space-y-2 tw-rounded-xl tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-bg-slate-50 dark:tw-bg-slate-800/60 tw-px-3 tw-py-2">
                <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
                  <span className="tw-truncate tw-text-sm tw-text-slate-700 dark:tw-text-slate-200">{row.source_value || '—'}</span>
                  {!isCreatePending && <MappingStatusBadge status={row.target_action} />}
                </div>

                {isCreatePending && (
                  <div className="tw-space-y-2">
                    {choice.mode !== 'create' && (
                      <select
                        aria-label={selectPlaceholder}
                        value={choice.targetId}
                        onChange={(event) => onChoiceChange(row.source_value, { mode: 'existing', targetId: event.target.value })}
                        className="tw-w-full tw-rounded-lg tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-px-2 tw-py-1 tw-text-sm tw-text-slate-700 dark:tw-bg-slate-800 dark:tw-text-slate-200"
                      >
                        <option value="">{selectPlaceholder}</option>
                        {options.map((option) => (
                          <option key={option.id} value={option.id}>{option.title}</option>
                        ))}
                      </select>
                    )}

                    <label className="tw-flex tw-items-center tw-gap-2 tw-text-sm tw-text-slate-700 dark:tw-text-slate-300">
                      <input
                        type="checkbox"
                        checked={choice.mode === 'create'}
                        onChange={(event) => onChoiceChange(row.source_value, { mode: event.target.checked ? 'create' : 'existing', targetId: '' })}
                      />
                      {checkboxLabel}
                    </label>

                    {choice.mode === 'create' && (
                      <input
                        type="text"
                        aria-label={titleAriaLabel}
                        value={choice.title}
                        onChange={(event) => onChoiceChange(row.source_value, { title: event.target.value })}
                        className="tw-w-full tw-rounded-lg tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-px-2 tw-py-1 tw-text-sm tw-text-slate-700 dark:tw-bg-slate-800 dark:tw-text-slate-200"
                      />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function buildCreatableDecisions(mappingType, rows, choices) {
  const decisions = [];
  for (const row of rows) {
    const choice = choices[row.source_value] || defaultChoice(row.source_value);
    if (choice.mode === 'create') {
      const title = (choice.title ?? row.source_value).trim();
      if (title !== '') {
        decisions.push({ mapping_type: mappingType, source_value: row.source_value, resolution: 'create_new', new_title: title });
      }
    } else if (choice.targetId) {
      decisions.push({ mapping_type: mappingType, source_value: row.source_value, resolution: 'matched', target_id: Number(choice.targetId) });
    }
  }
  return decisions;
}

export default function ImportPreviewModal({ open, loading, error, data, onClose }) {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [groups, setGroups] = useState([]);
  const [activeUsers, setActiveUsers] = useState([]);
  const [availableProjects, setAvailableProjects] = useState([]);
  const [availableGroups, setAvailableGroups] = useState([]);
  const [userChoices, setUserChoices] = useState({});
  const [projectChoices, setProjectChoices] = useState({});
  const [groupChoices, setGroupChoices] = useState({});
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState('');

  useEffect(() => {
    setUsers(Array.isArray(data?.users) ? data.users : []);
    setProjects(Array.isArray(data?.projects) ? data.projects : []);
    setGroups(Array.isArray(data?.groups) ? data.groups : []);
    setUserChoices({});
    setProjectChoices({});
    setGroupChoices({});
    setResolveError('');
  }, [data]);

  useEffect(() => {
    if (!open || loading || error) return;
    let active = true;
    listActiveUsers().then((rows) => { if (active) setActiveUsers(rows); }).catch(() => {});
    getProjects().then((rows) => { if (active) setAvailableProjects(rows); }).catch(() => {});
    listUserGroups().then((rows) => { if (active) setAvailableGroups(rows); }).catch(() => {});
    return () => { active = false; };
  }, [open, loading, error]);

  if (!open) return null;

  const pendingUsers = users.filter((row) => row.target_action === 'create_pending');
  const pendingProjects = projects.filter((row) => row.target_action === 'create_pending');
  const pendingGroups = groups.filter((row) => row.target_action === 'create_pending');
  const pendingCount = pendingUsers.length + pendingProjects.length + pendingGroups.length;
  const hasResolvableData = !loading && !error && data;

  function makeChoiceUpdater(setChoices) {
    return (sourceValue, patch) => {
      setChoices((current) => ({
        ...current,
        [sourceValue]: { ...defaultChoice(sourceValue), ...current[sourceValue], ...patch },
      }));
    };
  }

  function buildDecisions() {
    const decisions = [];

    for (const row of pendingUsers) {
      const targetId = userChoices[row.source_value];
      if (targetId) {
        decisions.push({ mapping_type: 'user', source_value: row.source_value, resolution: 'matched', target_id: Number(targetId) });
      }
    }

    decisions.push(...buildCreatableDecisions('project', pendingProjects, projectChoices));
    decisions.push(...buildCreatableDecisions('group', pendingGroups, groupChoices));

    return decisions;
  }

  async function handleResolveSubmit() {
    const decisions = buildDecisions();
    if (decisions.length === 0) {
      setResolveError(t('processed_history.import.selection_required'));
      return;
    }

    setResolving(true);
    setResolveError('');
    try {
      const updatedRows = await resolveClockifyMapping(decisions);
      const updatedByKey = new Map(updatedRows.map((row) => [rowKey(row), row]));

      setUsers((current) => current.map((row) => updatedByKey.get(rowKey(row)) ?? row));
      setProjects((current) => current.map((row) => updatedByKey.get(rowKey(row)) ?? row));
      setGroups((current) => current.map((row) => updatedByKey.get(rowKey(row)) ?? row));
      setUserChoices({});
      setProjectChoices({});
      setGroupChoices({});
    } catch (err) {
      setResolveError(err.message || t('processed_history.import.resolve_generic_error'));
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="tw-fixed tw-inset-0 tw-z-50 tw-flex tw-items-center tw-justify-center tw-bg-black/40 tw-p-4" role="dialog" aria-modal="true" aria-labelledby="import-preview-title">
      <div className="tw-w-full tw-max-w-2xl tw-space-y-4 tw-rounded-lg tw-bg-white dark:tw-bg-slate-900 tw-p-6 tw-shadow-xl dark:tw-border dark:tw-border-slate-700">
        <div className="tw-flex tw-items-start tw-justify-between">
          <div>
            <h2 id="import-preview-title" className="tw-text-lg tw-font-semibold tw-text-[#263746] dark:tw-text-slate-100">{t('processed_history.import.modal_title')}</h2>
            <p className="tw-mt-1 tw-text-sm tw-text-[#52656f] dark:tw-text-slate-400">{t('processed_history.import.modal_subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('processed_history.import.close')}
            className="tw-text-lg tw-leading-none tw-text-[#78909c] dark:tw-text-slate-400 hover:tw-text-[#2c3e49] dark:hover:tw-text-slate-100"
          >
            ×
          </button>
        </div>

        <div className="tw-max-h-[70vh] tw-space-y-5 tw-overflow-y-auto tw-pr-1">
          {loading && (
            <div className="tw-flex tw-items-center tw-justify-center tw-gap-3 tw-py-10">
              <div className="tw-h-6 tw-w-6 tw-animate-spin tw-rounded-full tw-border-2 tw-border-[#5B8FA8] tw-border-t-transparent"></div>
              <span className="tw-text-sm tw-text-slate-600 dark:tw-text-slate-400">{t('processed_history.import.loading')}</span>
            </div>
          )}

          {!loading && error && (
            <div className="tw-rounded-lg tw-bg-rose-50 dark:tw-bg-rose-900/30 tw-p-3 tw-text-sm tw-text-rose-600 dark:tw-text-rose-300">{error}</div>
          )}

          {hasResolvableData && (
            <>
              <div className="tw-grid tw-grid-cols-3 tw-gap-3">
                <div className="tw-rounded-xl tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-bg-slate-50 dark:tw-bg-slate-800/60 tw-p-3 tw-text-center">
                  <p className="tw-text-xs tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-500 dark:tw-text-slate-400">{t('processed_history.import.summary.total_rows')}</p>
                  <p className="tw-mt-1 tw-text-xl tw-font-semibold tw-text-slate-900 dark:tw-text-slate-100">{Number(data.total_rows || 0)}</p>
                </div>
                <div className="tw-rounded-xl tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-bg-slate-50 dark:tw-bg-slate-800/60 tw-p-3 tw-text-center">
                  <p className="tw-text-xs tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-500 dark:tw-text-slate-400">{t('processed_history.import.summary.blocked_rows')}</p>
                  <p className="tw-mt-1 tw-text-xl tw-font-semibold tw-text-slate-900 dark:tw-text-slate-100">{Number(data.blocked_rows || 0)}</p>
                </div>
                <div className="tw-rounded-xl tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-bg-slate-50 dark:tw-bg-slate-800/60 tw-p-3 tw-text-center">
                  <p className="tw-text-xs tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-500 dark:tw-text-slate-400">{t('processed_history.import.summary.skipped_rows')}</p>
                  <p className="tw-mt-1 tw-text-xl tw-font-semibold tw-text-slate-900 dark:tw-text-slate-100">{Number(data.skipped_rows || 0)}</p>
                </div>
              </div>

              {pendingCount > 0 ? (
                <div className="tw-rounded-lg tw-bg-orange-50 dark:tw-bg-orange-900/30 tw-p-3 tw-text-sm tw-text-orange-700 dark:tw-text-orange-300">
                  {t('processed_history.import.pending_mapping_warning', { count: pendingCount })}
                </div>
              ) : (
                <div className="tw-rounded-lg tw-bg-emerald-50 dark:tw-bg-emerald-900/30 tw-p-3 tw-text-sm tw-text-emerald-700 dark:tw-text-emerald-300">
                  {t('processed_history.import.ready_message')}
                </div>
              )}

              <div>
                <p className="tw-mb-2 tw-text-sm tw-font-semibold tw-text-slate-700 dark:tw-text-slate-300">{t('processed_history.import.users_title')}</p>
                {users.length === 0 ? (
                  <p className="tw-text-sm tw-text-slate-500 dark:tw-text-slate-400">{t('processed_history.import.no_users')}</p>
                ) : (
                  <ul className="tw-space-y-2">
                    {users.map((row) => (
                      <li
                        key={rowKey(row)}
                        className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3 tw-rounded-xl tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-bg-slate-50 dark:tw-bg-slate-800/60 tw-px-3 tw-py-2"
                      >
                        <span className="tw-truncate tw-text-sm tw-text-slate-700 dark:tw-text-slate-200">{row.source_value || '—'}</span>
                        {row.target_action === 'create_pending' ? (
                          <select
                            aria-label={t('processed_history.import.select_user_placeholder')}
                            value={userChoices[row.source_value] || ''}
                            onChange={(event) => setUserChoices((current) => ({ ...current, [row.source_value]: event.target.value }))}
                            className="tw-rounded-lg tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-px-2 tw-py-1 tw-text-sm tw-text-slate-700 dark:tw-bg-slate-800 dark:tw-text-slate-200"
                          >
                            <option value="">{t('processed_history.import.select_user_placeholder')}</option>
                            {activeUsers.map((activeUser) => (
                              <option key={activeUser.id} value={activeUser.id}>{activeUser.label}</option>
                            ))}
                          </select>
                        ) : (
                          <MappingStatusBadge status={row.target_action} />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <CreatableMappingList
                title={t('processed_history.import.projects_title')}
                emptyLabel={t('processed_history.import.no_projects')}
                rows={projects}
                choices={projectChoices}
                onChoiceChange={makeChoiceUpdater(setProjectChoices)}
                options={availableProjects}
                selectPlaceholder={t('processed_history.import.select_project_placeholder')}
                checkboxLabel={t('processed_history.import.create_new_project_checkbox')}
                titleAriaLabel={t('processed_history.import.new_project_title_aria')}
              />

              <CreatableMappingList
                title={t('processed_history.import.groups_title')}
                emptyLabel={t('processed_history.import.no_groups')}
                rows={groups}
                choices={groupChoices}
                onChoiceChange={makeChoiceUpdater(setGroupChoices)}
                options={availableGroups}
                selectPlaceholder={t('processed_history.import.select_group_placeholder')}
                checkboxLabel={t('processed_history.import.create_new_group_checkbox')}
                titleAriaLabel={t('processed_history.import.new_group_title_aria')}
              />

              {resolveError && (
                <div className="tw-rounded-lg tw-bg-rose-50 dark:tw-bg-rose-900/30 tw-p-3 tw-text-sm tw-text-rose-600 dark:tw-text-rose-300">{resolveError}</div>
              )}
            </>
          )}
        </div>

        <div className="tw-flex tw-justify-end tw-gap-2">
          <button
            type="button"
            onClick={onClose}
            className="tw-rounded-lg tw-bg-slate-100 dark:tw-bg-slate-800 tw-px-4 tw-py-2 tw-text-sm tw-text-slate-700 dark:tw-text-slate-200 hover:tw-bg-slate-200 dark:hover:tw-bg-slate-700"
          >
            {t('processed_history.import.close')}
          </button>
          {hasResolvableData && pendingCount > 0 && (
            <button
              type="button"
              onClick={handleResolveSubmit}
              disabled={resolving}
              className="tw-rounded-lg tw-bg-[#5B8FA8] tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-white hover:tw-bg-[#4A7690] dark:hover:tw-bg-[#6ea0ba] disabled:tw-opacity-50"
            >
              {resolving ? t('processed_history.import.resolving') : t('processed_history.import.resolve_button')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
