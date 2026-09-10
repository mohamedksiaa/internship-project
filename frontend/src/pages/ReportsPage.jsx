import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Card from '../components/atoms/Card';
import {
  exportGlobalCsv,
  exportProcessedHistory,
  getDailyReports,
  getMyDailyReports,
  getProcessedHistory,
  getProjects,
  getTimeFlowProjects,
  getTimeFlowUsers,
  listActiveThirdParties,
  listActiveUsers,
  previewClockifyImport,
} from '../api/timeflowApi';
import StatusBadge from '../components/atoms/StatusBadge';
import TruncatedText from '../components/atoms/TruncatedText';
import ProjectStatusBadge, { projectStatusLabelKey } from '../components/atoms/ProjectStatusBadge';
import OpportunityStatusBadge, { opportunityStatusLabelKey } from '../components/atoms/OpportunityStatusBadge';
import ReadDailyReportModal from '../components/molecules/ReadDailyReportModal.jsx';
import ImportPreviewModal from '../components/molecules/ImportPreviewModal.jsx';
import { BillableBadge, ModifiedManuallyBadge, isManuallyModifiedRecord, taskClusterKey } from '../components/organisms/TimeEntryList.jsx';
import { formatDuration } from '../utils/FormatDuration.js';
import { downloadCsv } from '../utils/csvExport.js';
import { useUrlDateRange, useUrlState } from '../hooks/useUrlState.js';

const initialFilters = {
  status: 'all',
  employee_id: '',
  project_id: '',
  date_from: '',
  date_to: '',
  manual_only: false,
  billable_only: false,
};

const dateTime = (value) => (value ? String(value).replace('T', ' ').slice(0, 16) : '—');

// Fixed, NEVER translated: previewClockifyImport() matches columns by these
// exact French labels (config/import_column_mapping_clockify.json), so the
// global "Export" file must carry them verbatim regardless of the active UI
// language for the round-trip re-import to work.
const GLOBAL_CSV_HEADER = [
  'Projet', 'Client', 'Groupe', 'Description', 'Email', 'Utilisateur',
  'Facturable', 'Date de début', 'Heure de début', 'Date de fin', 'Heure de fin', 'Durée (décimal)',
];

const ASSIGNED_USERS_INLINE_LIMIT = 2;
const SEARCH_DEBOUNCE_MS = 300;

function userLabel(assignableUser) {
  return assignableUser.label || `${assignableUser.firstname || ''} ${assignableUser.lastname || ''}`.trim() || assignableUser.login;
}

/**
 * Resolves a project's assigned_user_ids (just ints from the API) into
 * display names using the `usersById` map already loaded for the read-only
 * project listing — no extra request per project/row.
 *
 * - 0 ids => unrestricted project, "everyone".
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

/**
 * Read-only project listing (Réf/Titre/Client/Utilisateurs assignés/Entrées).
 * Project management (create/edit/delete) now lives exclusively in Dolibarr's
 * native Projects module — this tab is consultation only.
 */
function ProjectsReportTab() {
  const { t } = useTranslation();
  const [projectRows, setProjectRows] = useState([]);
  const [pagination, setPagination] = useState({});
  const [thirdParties, setThirdParties] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const usersById = useMemo(() => new Map(users.map((assignableUser) => [Number(assignableUser.id), assignableUser])), [users]);

  // Filters persisted in the URL (?client=&projDateFrom=&projDateTo=&projSearch=),
  // same pattern as the tasks/reports filters below — distinct keys so both
  // filter sets can coexist in the URL without clashing.
  const [clientId, setClientId] = useUrlState('client', '');
  const [dateRange, setDateFrom, setDateTo] = useUrlDateRange({ from: '', to: '' }, { from: 'projDateFrom', to: 'projDateTo' });
  const [searchFilter, setSearchFilter] = useUrlState('projSearch', '');
  const [searchInput, setSearchInput] = useState(searchFilter);
  const [page, setPage] = useState(1);

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

  // Any filter change invalidates the current page number (a narrower filter
  // can easily have fewer pages than where the user was browsing) — same
  // rule as ValidationPage's ReportValidationTab.
  function resetFilters() {
    setClientId('');
    setDateFrom('');
    setDateTo('');
    setSearchInput('');
    setSearchFilter('');
    setPage(1);
  }
  function handleClientChange(value) {
    setClientId(value);
    setPage(1);
  }
  function handleDateFromChange(value) {
    setDateFrom(value);
    setPage(1);
  }
  function handleDateToChange(value) {
    setDateTo(value);
    setPage(1);
  }
  function handleSearchInputChange(value) {
    setSearchInput(value);
    setPage(1);
  }
  // Backend pagination (page/per_page=20, same {rows, pagination} contract
  // as the rest of the module) — the volume here (dozens of projects) does
  // not force this today, but consistency means every list-bearing page uses
  // the same querying discipline rather than special-casing "small" ones.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getTimeFlowProjects(filters, page, 20)
      .then((res) => {
        if (!active) return;
        setProjectRows(res.rows);
        setPagination(res.pagination);
      })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters, page]);

  useEffect(() => {
    listActiveThirdParties().then(setThirdParties).catch(() => setThirdParties([]));
    listActiveUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  // The on-screen table is paginated (page/per_page), so the export
  // re-fetches the SAME filters across every page (per_page=100, the
  // backend's own max) instead of just serializing the current page — every
  // filtered row, not just the ones currently visible. Same approach as the
  // "tasks" tab's exportProcessedHistory() below.
  const exportCsv = async () => {
    let allRows = [];
    let fetchPage = 1;
    for (;;) {
      const res = await getTimeFlowProjects(filters, fetchPage, 100);
      allRows = allRows.concat(res.rows);
      const pages = res.pagination?.pages || 1;
      if (fetchPage >= pages || res.rows.length === 0) break;
      fetchPage += 1;
    }

    const header = [
      t('projects.col_ref'), t('projects.col_title'), t('projects.col_client'),
      t('projects.col_assigned_users'), t('projects.col_statut'), t('projects.col_etat'),
    ];
    downloadCsv('projets', header, allRows.map((project) => {
      const { text, title } = formatAssignedUsers(project, usersById, t);
      const oppKey = opportunityStatusLabelKey(project.opp_status_code);
      return [
        project.ref,
        project.title,
        project.client || t('dashboard.no_client'),
        title || text,
        oppKey ? t(oppKey) : '—',
        t(projectStatusLabelKey(Number(project.fk_statut ?? 0))),
      ];
    }));
  };

  return (
    <section className="tw-rounded-3xl tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-bg-white dark:tw-bg-slate-900 tw-p-5 tw-shadow-sm dark:tw-shadow-none">
      <div className="tw-mb-4 tw-flex tw-items-center tw-justify-end">
        <button
          type="button"
          onClick={exportCsv}
          disabled={projectRows.length === 0}
          className="tw-rounded tw-bg-[#5B8FA8] tw-px-4 tw-py-2 tw-text-white hover:tw-bg-[#4A7690] dark:hover:tw-bg-[#6ea0ba] disabled:tw-cursor-not-allowed disabled:tw-opacity-50"
        >
          {t('processed_history.export_csv')}
        </button>
      </div>
      <div className="tw-mb-4 tw-grid tw-gap-3 md:tw-grid-cols-2 xl:tw-grid-cols-6">
        <select
          aria-label={t('projects.filters.client_label')}
          value={clientId}
          onChange={(event) => handleClientChange(event.target.value)}
          className="tw-rounded tw-border tw-p-2 dark:tw-border-slate-600 dark:tw-bg-slate-800 dark:tw-text-slate-100"
        >
          <option value="">{t('projects.filters.all_clients')}</option>
          {thirdParties.map((party) => <option key={party.id} value={party.id}>{party.title}</option>)}
        </select>
        <input
          aria-label={t('projects.filters.date_from')}
          type="date"
          value={dateRange.from}
          onChange={(event) => handleDateFromChange(event.target.value)}
          className="tw-rounded tw-border tw-p-2 dark:tw-border-slate-600 dark:tw-bg-slate-800 dark:tw-text-slate-100"
        />
        <input
          aria-label={t('projects.filters.date_to')}
          type="date"
          value={dateRange.to}
          onChange={(event) => handleDateToChange(event.target.value)}
          className="tw-rounded tw-border tw-p-2 dark:tw-border-slate-600 dark:tw-bg-slate-800 dark:tw-text-slate-100"
        />
        <input
          aria-label={t('projects.filters.search_label')}
          type="search"
          value={searchInput}
          onChange={(event) => handleSearchInputChange(event.target.value)}
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

      {loading && <p className="tw-text-sm tw-text-slate-600 dark:tw-text-slate-400">{t('loading')}</p>}
      {error && <p className="tw-text-sm tw-text-rose-600 dark:tw-text-rose-400">{error}</p>}

      {!loading && (
        projectRows.length === 0 ? (
          <p className="tw-text-sm tw-text-slate-500 dark:tw-text-slate-400">{t('projects.empty')}</p>
        ) : (
          <div className="tw-overflow-x-auto">
            <table className="tw-w-full tw-text-left tw-text-sm tw-border-collapse dark:tw-text-slate-200">
              <thead>
                <tr className="tw-border-b tw-border-slate-200 dark:tw-border-slate-700 tw-text-xs tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-500 dark:tw-text-slate-400">
                  <th className="tw-px-3 tw-py-2">{t('projects.col_ref')}</th>
                  <th className="tw-px-3 tw-py-2">{t('projects.col_title')}</th>
                  <th className="tw-px-3 tw-py-2">{t('projects.col_client')}</th>
                  <th className="tw-px-3 tw-py-2">{t('projects.col_assigned_users')}</th>
                  <th className="tw-px-3 tw-py-2">{t('projects.col_statut')}</th>
                  <th className="tw-px-3 tw-py-2">{t('projects.col_etat')}</th>
                </tr>
              </thead>
              <tbody>
                {projectRows.map((project) => (
                  <tr key={project.id} className="tw-border-b tw-border-slate-100 dark:tw-border-slate-800">
                    <td className="tw-px-3 tw-py-3 tw-whitespace-nowrap tw-text-slate-500 dark:tw-text-slate-400">{project.ref}</td>
                    <td className="tw-px-3 tw-py-3 tw-font-medium tw-text-slate-900 dark:tw-text-slate-100">
                      {project.title}
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
                    <td className="tw-px-3 tw-py-3">
                      <OpportunityStatusBadge code={project.opp_status_code} />
                    </td>
                    <td className="tw-px-3 tw-py-3 tw-tabular-nums">
                      <ProjectStatusBadge status={Number(project.fk_statut ?? 0)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      {!loading && projectRows.length > 0 && (
        <div className="tw-mt-4 tw-flex tw-items-center tw-justify-center tw-gap-4">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
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
            onClick={() => setPage((p) => Math.min(pagination.pages || p, p + 1))}
            disabled={page >= (pagination.pages || 1)}
            className={`tw-rounded tw-px-4 tw-py-2 ${page >= (pagination.pages || 1) ? 'tw-bg-slate-200 dark:tw-bg-slate-800 tw-text-slate-500 dark:tw-text-slate-500' : 'tw-bg-slate-100 dark:tw-bg-slate-700 tw-text-slate-700 dark:tw-text-slate-200 hover:tw-bg-slate-200 dark:hover:tw-bg-slate-600'}`}
          >
            {t('processed_history.pagination.next')}
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * Read-only listing of every user with at least one TimeFlow time entry
 * (any status — draft/submitted/validated/refused all count), with contact
 * info and TimeFlow group membership. No filters, unlike ProjectsReportTab
 * above — the source list is already small (one row per person, not per
 * entry) and there is no obvious axis to filter it by.
 */
function UsersReportTab() {
  const { t } = useTranslation();
  const [userRows, setUserRows] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  // Backend pagination (page/per_page=20, same {rows, pagination} contract
  // as the rest of the module) — same "consistency over necessity" rationale
  // as ProjectsReportTab above: today's ~15-25 users don't force it, but
  // every list-bearing page here uses the same querying discipline.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getTimeFlowUsers(page, 20)
      .then((res) => {
        if (!active) return;
        setUserRows(res.rows);
        setPagination(res.pagination);
      })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page]);

  // The on-screen table is paginated (page/per_page), so the export
  // re-fetches every page (per_page=100, the backend's own max) instead of
  // just serializing the current page — same reasoning as ProjectsReportTab
  // above. Same 4 columns as the on-screen table, in the same order —
  // groups joined with ", " in a single cell exactly like the table already
  // renders them.
  const exportCsv = async () => {
    let allRows = [];
    let fetchPage = 1;
    for (;;) {
      const res = await getTimeFlowUsers(fetchPage, 100);
      allRows = allRows.concat(res.rows);
      const pages = res.pagination?.pages || 1;
      if (fetchPage >= pages || res.rows.length === 0) break;
      fetchPage += 1;
    }

    const header = [
      t('users_report.col_name'), t('users_report.col_email'),
      t('users_report.col_phone'), t('users_report.col_groups'),
    ];
    downloadCsv('utilisateurs', header, allRows.map((row) => {
      const phones = [row.office_phone, row.user_mobile].filter(Boolean);
      const groups = Array.isArray(row.groups) ? row.groups.filter(Boolean) : [];
      return [
        row.label,
        row.email || '',
        phones.join(' · '),
        groups.length > 0 ? groups.join(', ') : t('users_report.no_group'),
      ];
    }));
  };

  return (
    <section className="tw-rounded-3xl tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-bg-white dark:tw-bg-slate-900 tw-p-5 tw-shadow-sm dark:tw-shadow-none">
      <div className="tw-mb-4 tw-flex tw-items-center tw-justify-end">
        <button
          type="button"
          onClick={exportCsv}
          disabled={userRows.length === 0}
          className="tw-rounded tw-bg-[#5B8FA8] tw-px-4 tw-py-2 tw-text-white hover:tw-bg-[#4A7690] dark:hover:tw-bg-[#6ea0ba] disabled:tw-cursor-not-allowed disabled:tw-opacity-50"
        >
          {t('processed_history.export_csv')}
        </button>
      </div>
      {loading && <p className="tw-text-sm tw-text-slate-600 dark:tw-text-slate-400">{t('loading')}</p>}
      {error && <p className="tw-text-sm tw-text-rose-600 dark:tw-text-rose-400">{error}</p>}

      {!loading && (
        userRows.length === 0 ? (
          <p className="tw-text-sm tw-text-slate-500 dark:tw-text-slate-400">{t('users_report.empty')}</p>
        ) : (
          <div className="tw-overflow-x-auto">
            <table className="tw-w-full tw-text-left tw-text-sm tw-border-collapse dark:tw-text-slate-200">
              <thead>
                <tr className="tw-border-b tw-border-slate-200 dark:tw-border-slate-700 tw-text-xs tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-500 dark:tw-text-slate-400">
                  <th className="tw-px-3 tw-py-2">{t('users_report.col_name')}</th>
                  <th className="tw-px-3 tw-py-2">{t('users_report.col_email')}</th>
                  <th className="tw-px-3 tw-py-2">{t('users_report.col_phone')}</th>
                  <th className="tw-px-3 tw-py-2">{t('users_report.col_groups')}</th>
                </tr>
              </thead>
              <tbody>
                {userRows.map((row) => {
                  const phones = [row.office_phone, row.user_mobile].filter(Boolean);
                  const groups = Array.isArray(row.groups) ? row.groups.filter(Boolean) : [];
                  return (
                    <tr key={row.id} className="tw-border-b tw-border-slate-100 dark:tw-border-slate-800">
                      <td className="tw-px-3 tw-py-3 tw-max-w-[220px] tw-font-medium tw-text-slate-900 dark:tw-text-slate-100">
                        <TruncatedText text={row.label} />
                      </td>
                      <td className="tw-px-3 tw-py-3 tw-max-w-[240px] tw-text-slate-600 dark:tw-text-slate-300">
                        <TruncatedText text={row.email || '—'} />
                      </td>
                      <td className="tw-px-3 tw-py-3 tw-whitespace-nowrap tw-text-slate-600 dark:tw-text-slate-300">
                        {phones.length > 0 ? phones.join(' · ') : '—'}
                      </td>
                      <td className="tw-px-3 tw-py-3 tw-max-w-[240px] tw-text-slate-600 dark:tw-text-slate-300">
                        <TruncatedText text={groups.length > 0 ? groups.join(', ') : t('users_report.no_group')} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
      {!loading && userRows.length > 0 && (
        <div className="tw-mt-4 tw-flex tw-items-center tw-justify-center tw-gap-4">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
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
            onClick={() => setPage((p) => Math.min(pagination.pages || p, p + 1))}
            disabled={page >= (pagination.pages || 1)}
            className={`tw-rounded tw-px-4 tw-py-2 ${page >= (pagination.pages || 1) ? 'tw-bg-slate-200 dark:tw-bg-slate-800 tw-text-slate-500 dark:tw-text-slate-500' : 'tw-bg-slate-100 dark:tw-bg-slate-700 tw-text-slate-700 dark:tw-text-slate-200 hover:tw-bg-slate-200 dark:hover:tw-bg-slate-600'}`}
          >
            {t('processed_history.pagination.next')}
          </button>
        </div>
      )}
    </section>
  );
}

export default function ReportsPage() {
  const { t } = useTranslation();
  const canReadAll = typeof window !== 'undefined' && window.TIMEFLOW_CAN_READALL === true;
  // Tab and filters all live in the URL (?tab=&dateFrom=&dateTo=&employee=…)
  // instead of plain useState, so a refresh (or a shared link) restores the
  // exact same view. See src/hooks/useUrlState.js for how this works.
  const [activeTab, setActiveTab] = useUrlState('tab', 'tasks');
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], pagination: {}, stats: {} });
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reportHistory, setReportHistory] = useState([]);
  const [reportHistoryLoading, setReportHistoryLoading] = useState(true);
  const [reportHistoryError, setReportHistoryError] = useState('');
  const [reportHistoryPage, setReportHistoryPage] = useState(1);
  const [reportHistoryPagination, setReportHistoryPagination] = useState({});
  const [reportHistoryStats, setReportHistoryStats] = useState({ validated_count: 0, refused_count: 0, manual_count: 0 });
  const [reportEmployees, setReportEmployees] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [importState, setImportState] = useState({ open: false, loading: false, error: '', data: null, file: null });
  const importFileInputRef = useRef(null);

  useEffect(() => {
    getProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (!canReadAll && filters.employee_id !== '') {
      setFilters((current) => ({ ...current, employee_id: '' }));
    }
  }, [canReadAll, filters.employee_id]);

  useEffect(() => {
    if (activeTab !== 'reports') return;

    let active = true;
    setReportHistoryLoading(true);
    setReportHistoryError('');

    // history:true already makes the backend's own default restrict to
    // status IN (2,9) — Validé/Refusé, never Soumis — and the "reports" tab's
    // own status filter only ever offers all/validated/refused (no
    // "submitted" option), so status=1 can never come back here. A
    // client-side re-filter used to sit on top of this and has been removed
    // (see visibleReportHistory below) — it was redundant, and with
    // pagination it would have desynced the displayed rows from
    // pagination.total the moment a page held more than one status mix.
    const payload = {
      history: true,
      // Audit history intentionally includes employee-soft-deleted reports.
      // The backend only honors this in the manager history scope.
      include_deleted: canReadAll,
      employee_id: filters.employee_id,
      date_from: filters.date_from,
      date_to: filters.date_to,
      manual_only: filters.manual_only,
      status: filters.status,
      page: reportHistoryPage,
      per_page: 20,
    };
    const request = canReadAll ? getDailyReports(payload) : getMyDailyReports(payload);

    request
      .then((res) => {
        if (!active) return;
        const nextReports = Array.isArray(res?.reports) ? res.reports : Array.isArray(res) ? res : [];
        setReportHistory(nextReports);
        setReportHistoryPagination(res?.pagination || {});
        setReportHistoryStats(res?.stats || { validated_count: 0, refused_count: 0, manual_count: 0 });
        if (Array.isArray(res?.employees)) setReportEmployees(res.employees);
      })
      .catch((err) => {
        if (active) setReportHistoryError(err.message);
      })
      .finally(() => {
        if (active) setReportHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeTab, canReadAll, filters.employee_id, filters.date_from, filters.date_to, filters.manual_only, filters.status, reportHistoryPage]);

  // Already exactly what the backend returns for this tab (status IN (2,9),
  // current page only) — kept as its own name since the JSX below and the
  // stats cards were written against "visibleReportHistory".
  const visibleReportHistory = reportHistory;

  // Grouped AFTER pagination, not before: groupedReports only ever sees the
  // current page's rows (reportHistory), exactly like the "tasks" tab's own
  // `grouped` groups data.rows (also already paginated) by day. A single
  // day's entries can end up split across two pages at the boundary — same
  // trade-off the tasks tab already makes, kept consistent rather than
  // inventing a different rule for this tab.
  const groupedReports = useMemo(() => {
    return visibleReportHistory.reduce((all, report) => {
      const key = String(report.date_report || '').slice(0, 10);
      (all[key] ||= []).push(report);
      return all;
    }, {});
  }, [visibleReportHistory]);

  const refreshHistory = async () => {
    const next = await getProcessedHistory({ ...filters, page, per_page: 20 });
    setData(next);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getProcessedHistory({ ...filters, page, per_page: 20 })
      .then((next) => {
        if (active) setData(next);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filters, page]);

  const update = (key, value) => {
    setPage(1);
    setReportHistoryPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const grouped = useMemo(() => {
    return data.rows.reduce((all, entry) => {
      const key = String(entry.date_start || '').slice(0, 10);
      (all[key] ||= []).push(entry);
      return all;
    }, {});
  }, [data.rows]);

  const csv = async () => {
    if (activeTab === 'reports') {
      const rows = Array.isArray(reportHistory) ? reportHistory : [];
      const header = [t('daily_report.date_label'), t('processed_history.columns.who'), t('daily_report.content_label')];
      downloadCsv('historique_comptes_rendus', header, rows.map((report) => [
        report.date_report || report.date_creation || '',
        report.user_label || '',
        report.content || report.note || '',
      ]));
      return;
    }

    // "tasks" tab: the on-screen table is paginated (page/per_page), so the
    // export re-fetches the SAME filters with no page cap instead of just
    // serializing the current page — every filtered row, not just the ones
    // currently visible.
    const rows = await exportProcessedHistory(filters);
    const header = [
      t('processed_history.columns.task'), t('processed_history.columns.project'), t('processed_history.columns.who'),
      t('processed_history.columns.start'), t('processed_history.columns.end'), t('processed_history.columns.status'),
      t('processed_history.columns.duration'), t('processed_history.columns.billable'), t('processed_history.columns.modification'),
      t('processed_history.csv.processed_by'), t('processed_history.csv.processed_at'),
    ];
    // 'Oui'/'Non', not translated — same fixed format as the global export's
    // own Facturable column (timeflowBuildGlobalCsvRows), so this reads
    // consistently no matter which of the two CSVs a "Oui"/"Non" cell came from.
    downloadCsv('rapports_taches', header, rows.map((entry) => [
      entry.note,
      entry.project_label,
      entry.user_label,
      dateTime(entry.date_start),
      dateTime(entry.date_end),
      Number(entry.status) === 2 ? t('status.validated') : t('status.rejected'),
      formatDuration(entry.duration),
      Number(entry.billable) === 1 ? 'Oui' : 'Non',
      entry.manual_modified ? t('processed_history.modified_manually') : '',
      entry.processed_by_label,
      dateTime(entry.processed_at),
    ]));
  };

  const openImportFilePicker = () => {
    importFileInputRef.current?.click();
  };

  const handleImportFileSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!/\.csv$/i.test(file.name)) {
      setImportState({ open: true, loading: false, error: t('processed_history.import.invalid_file_type'), data: null, file: null });
      return;
    }

    // The File object is kept in state (not just passed once) so the modal
    // can resubmit the exact same CSV to executeClockifyImport() once the
    // user has resolved every mapping — see the backend design note on
    // TimeImportClockify::executeImportFromCsvPath() for why re-upload is
    // necessary (row-level data is never persisted by the preview step).
    setImportState({ open: true, loading: true, error: '', data: null, file });
    try {
      const preview = await previewClockifyImport(file);
      setImportState({ open: true, loading: false, error: '', data: preview, file });
    } catch (err) {
      setImportState({ open: true, loading: false, error: err.message || t('processed_history.import.generic_error'), data: null, file });
    }
  };

  const closeImportModal = () => {
    setImportState({ open: false, loading: false, error: '', data: null, file: null });
    refreshHistory();
  };

  // One row per time entry, joining project/client/user/groups server-side —
  // in the exact column shape previewClockifyImport() expects, so the file
  // can be re-imported as-is. Delimiter is ',' (not the ';' the per-tab
  // exports use) to match config/import_column_mapping_clockify.json.
  const handleExportGlobalCsv = async () => {
    const rows = await exportGlobalCsv();
    downloadCsv('consolide', GLOBAL_CSV_HEADER, rows, ',');
  };

  return (
    <div className="tw-mx-auto tw-w-full tw-max-w-[1680px] tw-space-y-6 tw-px-5 tw-py-7">
      <div className="tw-flex tw-items-center tw-justify-end tw-gap-2">
        <button type="button" onClick={openImportFilePicker} className="tw-rounded tw-border tw-border-[#5B8FA8] tw-px-4 tw-py-2 tw-text-[#5B8FA8] dark:tw-text-[#8fc0d9] hover:tw-bg-[#5B8FA8]/10 dark:hover:tw-bg-[#5B8FA8]/20">
          {t('processed_history.import_csv_global')}
        </button>
        <input
          ref={importFileInputRef}
          type="file"
          accept=".csv"
          onChange={handleImportFileSelected}
          className="tw-hidden"
        />
        <button type="button" onClick={handleExportGlobalCsv} className="tw-rounded tw-bg-[#5B8FA8] tw-px-4 tw-py-2 tw-text-white hover:tw-bg-[#4A7690] dark:hover:tw-bg-[#6ea0ba]">
          {t('processed_history.export_csv_global')}
        </button>
      </div>

      <Card size="section">
        <div className="tw-mb-4 tw-flex tw-flex-wrap tw-gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('tasks')}
            className={`tw-rounded-lg tw-px-4 tw-py-2 tw-text-sm tw-font-medium ${activeTab === 'tasks' ? 'tw-bg-slate-900 tw-text-white dark:tw-bg-slate-100 dark:tw-text-slate-900' : 'tw-bg-slate-100 dark:tw-bg-slate-800 tw-text-slate-700 dark:tw-text-slate-300 hover:tw-bg-slate-200 dark:hover:tw-bg-slate-700'}`}
          >
            {t('history.task_history')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('projects')}
            className={`tw-rounded-lg tw-px-4 tw-py-2 tw-text-sm tw-font-medium ${activeTab === 'projects' ? 'tw-bg-slate-900 tw-text-white dark:tw-bg-slate-100 dark:tw-text-slate-900' : 'tw-bg-slate-100 dark:tw-bg-slate-800 tw-text-slate-700 dark:tw-text-slate-300 hover:tw-bg-slate-200 dark:hover:tw-bg-slate-700'}`}
          >
            {t('projects.title')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            className={`tw-rounded-lg tw-px-4 tw-py-2 tw-text-sm tw-font-medium ${activeTab === 'reports' ? 'tw-bg-slate-900 tw-text-white dark:tw-bg-slate-100 dark:tw-text-slate-900' : 'tw-bg-slate-100 dark:tw-bg-slate-800 tw-text-slate-700 dark:tw-text-slate-300 hover:tw-bg-slate-200 dark:hover:tw-bg-slate-700'}`}
          >
            {t('history.report_history')}
          </button>
          {canReadAll && (
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`tw-rounded-lg tw-px-4 tw-py-2 tw-text-sm tw-font-medium ${activeTab === 'users' ? 'tw-bg-slate-900 tw-text-white dark:tw-bg-slate-100 dark:tw-text-slate-900' : 'tw-bg-slate-100 dark:tw-bg-slate-800 tw-text-slate-700 dark:tw-text-slate-300 hover:tw-bg-slate-200 dark:hover:tw-bg-slate-700'}`}
            >
              {t('users_report.title')}
            </button>
          )}
        </div>

        {activeTab !== 'projects' && activeTab !== 'users' && (
          <div className="tw-mb-4 tw-flex tw-items-center tw-justify-end tw-gap-2">
            <button type="button" onClick={csv} className="tw-rounded tw-bg-[#5B8FA8] tw-px-4 tw-py-2 tw-text-white hover:tw-bg-[#4A7690] dark:hover:tw-bg-[#6ea0ba]">
              {t('processed_history.export_csv')}
            </button>
          </div>
        )}

        {activeTab === 'tasks' && (
          <>
            <section className="tw-rounded-3xl tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-bg-white dark:tw-bg-slate-900 tw-p-5 tw-shadow-sm dark:tw-shadow-none">
              <div className="tw-mb-4 tw-flex tw-items-center tw-justify-between">
                <div>
                  <p className="tw-text-xs tw-font-semibold tw-uppercase tw-tracking-[.24em] tw-text-slate-500 dark:tw-text-slate-400">{t('app.section_analyze')}</p>
                  <h1 className="tw-text-2xl tw-font-semibold dark:tw-text-slate-100">{t('processed_history.title')}</h1>
                </div>
              </div>

              <div className="tw-grid tw-gap-3 md:tw-grid-cols-3 xl:tw-grid-cols-6">
                <select aria-label={t('processed_history.filters.status')} value={filters.status} onChange={(event) => update('status', event.target.value)} className="tw-rounded tw-border tw-p-2 dark:tw-border-slate-600 dark:tw-bg-slate-800 dark:tw-text-slate-100">
                  <option value="all">{t('processed_history.filters.validated_and_rejected')}</option>
                  <option value="validated">{t('status.validated')}</option>
                  <option value="refused">{t('status.rejected')}</option>
                </select>

                {!canReadAll && (
                  <div className="tw-rounded tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-bg-slate-50 dark:tw-bg-slate-800/60 tw-px-3 tw-py-2 tw-text-sm tw-text-slate-600 dark:tw-text-slate-400">
                    {t('processed_history.filters.all_employees')}
                  </div>
                )}
                {canReadAll && (
                  <select aria-label={t('processed_history.filters.employee')} value={filters.employee_id} onChange={(event) => update('employee_id', event.target.value)} className="tw-rounded tw-border tw-p-2 dark:tw-border-slate-600 dark:tw-bg-slate-800 dark:tw-text-slate-100">
                    <option value="">{t('processed_history.filters.all_employees')}</option>
                    {data.employees?.map((user) => (
                      <option key={user.id} value={user.id}>{user.label}</option>
                    ))}
                  </select>
                )}

                <select aria-label={t('processed_history.filters.project')} value={filters.project_id} onChange={(event) => update('project_id', event.target.value)} className="tw-rounded tw-border tw-p-2 dark:tw-border-slate-600 dark:tw-bg-slate-800 dark:tw-text-slate-100">
                  <option value="">{t('processed_history.filters.all_projects')}</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.title}</option>
                  ))}
                </select>

                <input aria-label={t('processed_history.filters.start_date')} type="date" value={filters.date_from} onChange={(event) => update('date_from', event.target.value)} className="tw-rounded tw-border tw-p-2 dark:tw-border-slate-600 dark:tw-bg-slate-800 dark:tw-text-slate-100" />
                <input aria-label={t('processed_history.filters.end_date')} type="date" value={filters.date_to} onChange={(event) => update('date_to', event.target.value)} className="tw-rounded tw-border tw-p-2 dark:tw-border-slate-600 dark:tw-bg-slate-800 dark:tw-text-slate-100" />

                <label className="tw-flex tw-items-center tw-gap-2 dark:tw-text-slate-300">
                  <input type="checkbox" checked={filters.manual_only} onChange={(event) => update('manual_only', event.target.checked)} />
                  {t('processed_history.filters.modified_only')}
                </label>
                <label className="tw-flex tw-items-center tw-gap-2 dark:tw-text-slate-300">
                  <input type="checkbox" checked={filters.billable_only} onChange={(event) => update('billable_only', event.target.checked)} />
                  {t('processed_history.filters.billable_only')}
                </label>
              </div>
            </section>

            <section className="tw-grid tw-gap-4 md:tw-grid-cols-4">
              <div className="tw-rounded tw-bg-white dark:tw-bg-slate-900 dark:tw-border dark:tw-border-slate-700 tw-p-4 dark:tw-text-slate-200">
                {t('processed_history.total')} <strong>{data.pagination?.total || 0}</strong>
              </div>
              <div className="tw-rounded tw-bg-white dark:tw-bg-slate-900 dark:tw-border dark:tw-border-slate-700 tw-p-4 dark:tw-text-slate-200">
                {t('processed_history.stats.validated_entries')} <strong>{data.stats.validated_count || 0}</strong>
              </div>
              <div className="tw-rounded tw-bg-white dark:tw-bg-slate-900 dark:tw-border dark:tw-border-slate-700 tw-p-4 dark:tw-text-slate-200">
                {t('processed_history.stats.rejected_entries')} <strong>{data.stats.refused_count || 0}</strong>
              </div>
              <div className="tw-rounded tw-bg-white dark:tw-bg-slate-900 dark:tw-border dark:tw-border-slate-700 tw-p-4 dark:tw-text-slate-200">
                {t('processed_history.stats.modified_entries')} <strong>{data.stats.manual_count || 0}</strong>
              </div>
            </section>

            {error && <p className="tw-text-red-600 dark:tw-text-red-400">{error}</p>}
            {loading && <p className="dark:tw-text-slate-300">{t('loading')}</p>}

            {!loading && Object.entries(grouped).map(([day, rows]) => {
              // Several rows can belong to the same task (a resume now always
              // creates a new entry instead of reopening the old one) — cluster
              // them by project+task+note so the last row of each cluster can
              // carry a "×N segments · total" summary badge.
              const taskClusters = new Map();
              rows.forEach((row) => {
                const clusterKey = taskClusterKey(row);
                const cluster = taskClusters.get(clusterKey) || { count: 0, total: 0, lastId: null };
                cluster.count += 1;
                cluster.total += Number(row.duration || 0);
                cluster.lastId = row.id;
                taskClusters.set(clusterKey, cluster);
              });

              return (
              <section key={day} className="tw-overflow-x-auto tw-bg-white dark:tw-bg-slate-900 dark:tw-border dark:tw-border-slate-700 tw-rounded">
                <div className="tw-flex tw-justify-between tw-bg-slate-100 dark:tw-bg-slate-800 tw-p-3 dark:tw-text-slate-200">
                  <strong>{day}</strong>
                  <span>{t('processed_history.total')}: {formatDuration(rows.reduce((sum, row) => sum + Number(row.duration || 0), 0))}</span>
                </div>

                <table className="tw-w-full tw-text-left tw-text-sm tw-border-collapse dark:tw-text-slate-200">
                  <thead>
                    <tr>
                      <th className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] dark:tw-border-slate-700 last:tw-border-r-0">{t('processed_history.columns.task')}</th>
                      <th className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] dark:tw-border-slate-700 last:tw-border-r-0">{t('processed_history.columns.project')}</th>
                      <th className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] dark:tw-border-slate-700 last:tw-border-r-0">{t('processed_history.columns.who')}</th>
                      <th className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] dark:tw-border-slate-700 last:tw-border-r-0">{t('processed_history.columns.start')}</th>
                      <th className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] dark:tw-border-slate-700 last:tw-border-r-0">{t('processed_history.columns.end')}</th>
                      <th className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] dark:tw-border-slate-700 last:tw-border-r-0">{t('processed_history.columns.status')}</th>
                      <th className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] dark:tw-border-slate-700 last:tw-border-r-0">{t('processed_history.columns.duration')}</th>
                      <th className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] dark:tw-border-slate-700 last:tw-border-r-0">{t('processed_history.columns.billable')}</th>
                      <th className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] dark:tw-border-slate-700 last:tw-border-r-0">{t('processed_history.columns.modification')}</th>
                      <th className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] dark:tw-border-slate-700 last:tw-border-r-0">{t('processed_history.columns.processed_by_at')}</th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((entry) => (
                      <tr key={entry.id} className="tw-border-t dark:tw-border-slate-700">
                        <td className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] dark:tw-border-slate-700 last:tw-border-r-0 tw-max-w-[280px]">
                          <TruncatedText text={entry.note || t('timeentry.no_description')} />
                        </td>
                        <td className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] dark:tw-border-slate-700 last:tw-border-r-0">{entry.project_label}</td>
                        <td className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] dark:tw-border-slate-700 last:tw-border-r-0">{entry.user_label}</td>
                        <td className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] dark:tw-border-slate-700 last:tw-border-r-0">{dateTime(entry.date_start)}</td>
                        <td className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] dark:tw-border-slate-700 last:tw-border-r-0">{dateTime(entry.date_end)}</td>
                        <td className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] dark:tw-border-slate-700 last:tw-border-r-0"><StatusBadge status={Number(entry.status)} /></td>
                        <td className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] dark:tw-border-slate-700 last:tw-border-r-0">
                          {formatDuration(entry.duration)}
                          {(() => {
                            const cluster = taskClusters.get(taskClusterKey(entry));
                            if (!cluster || cluster.count <= 1 || cluster.lastId !== entry.id) return null;
                            return (
                              <span
                                title={t('timeentry.title_task_segments')}
                                className="tw-ml-2 tw-rounded-full tw-bg-[#eaf6fd] dark:tw-bg-[#5B8FA8]/20 tw-px-2 tw-py-0.5 tw-text-xs tw-font-medium tw-text-[#5B8FA8] dark:tw-text-[#8fc0d9]"
                              >
                                ×{cluster.count} · {formatDuration(cluster.total)}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] dark:tw-border-slate-700 last:tw-border-r-0">{Number(entry.billable) === 1 ? <BillableBadge /> : '—'}</td>
                        <td className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] dark:tw-border-slate-700 last:tw-border-r-0">{entry.manual_modified ? t('processed_history.modified_manually') : '—'}</td>
                        <td className="tw-px-2 tw-py-2 tw-border-r tw-border-[#dce5ea] dark:tw-border-slate-700 last:tw-border-r-0">
                          {entry.processed_by_label || '—'}
                          <br />
                          {dateTime(entry.processed_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              );
            })}

            {!loading && data.rows.length > 0 && (
              <div className="tw-mt-4 tw-flex tw-items-center tw-justify-center tw-gap-4">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className={`tw-rounded tw-px-4 tw-py-2 ${page <= 1 ? 'tw-bg-slate-200 dark:tw-bg-slate-800 tw-text-slate-500 dark:tw-text-slate-500' : 'tw-bg-slate-100 dark:tw-bg-slate-700 tw-text-slate-700 dark:tw-text-slate-200 hover:tw-bg-slate-200 dark:hover:tw-bg-slate-600'}`}
                >
                  {t('processed_history.pagination.previous')}
                </button>

                <div className="tw-text-sm tw-text-slate-700 dark:tw-text-slate-300">
                  {t('processed_history.pagination.page', { current: data.pagination?.page || page, total: data.pagination?.pages || 1 })}
                </div>

                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(data.pagination?.pages || p, p + 1))}
                  disabled={page >= (data.pagination?.pages || 1)}
                  className={`tw-rounded tw-px-4 tw-py-2 ${page >= (data.pagination?.pages || 1) ? 'tw-bg-slate-200 dark:tw-bg-slate-800 tw-text-slate-500 dark:tw-text-slate-500' : 'tw-bg-slate-100 dark:tw-bg-slate-700 tw-text-slate-700 dark:tw-text-slate-200 hover:tw-bg-slate-200 dark:hover:tw-bg-slate-600'}`}
                >
                  {t('processed_history.pagination.next')}
                </button>
              </div>
            )}

            {!loading && !data.rows.length && <p className="tw-rounded tw-bg-white dark:tw-bg-slate-900 dark:tw-border dark:tw-border-slate-700 tw-p-5 dark:tw-text-slate-300">{t('processed_history.empty')}</p>}
          </>
        )}

        {activeTab === 'projects' && <ProjectsReportTab />}

        {/* Guarded on canReadAll too, not just the hidden tab button above —
            a normal employee crafting ?tab=users directly must never reach
            a component that would call getTimeFlowUsers() (backend refuses
            it anyway, but there is no reason to even attempt the request). */}
        {activeTab === 'users' && canReadAll && <UsersReportTab />}

        {activeTab === 'reports' && (
          <div className="tw-rounded-2xl tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-bg-slate-50 dark:tw-bg-slate-800/60 tw-p-4">
            {reportHistoryLoading && <p className="tw-text-sm tw-text-slate-500 dark:tw-text-slate-400">{t('loading')}</p>}
            {reportHistoryError && <p className="tw-text-sm tw-text-rose-600 dark:tw-text-rose-400">{reportHistoryError}</p>}

            <div className="tw-mb-4 tw-flex tw-items-center tw-justify-between">
              <div>
                <p className="tw-text-xs tw-font-semibold tw-uppercase tw-tracking-[.24em] tw-text-slate-500 dark:tw-text-slate-400">{t('app.section_analyze')}</p>
                <h1 className="tw-text-2xl tw-font-semibold dark:tw-text-slate-100">{t('history.report_history')}</h1>
              </div>
            </div>

            <section className="tw-rounded-3xl tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-bg-white dark:tw-bg-slate-900 tw-p-5 tw-shadow-sm dark:tw-shadow-none">
              <div className="tw-grid tw-gap-3 md:tw-grid-cols-3 xl:tw-grid-cols-6">
                <select aria-label={t('processed_history.filters.status')} value={filters.status} onChange={(event) => update('status', event.target.value)} className="tw-rounded tw-border tw-p-2 dark:tw-border-slate-600 dark:tw-bg-slate-800 dark:tw-text-slate-100">
                  <option value="all">{t('processed_history.filters.validated_and_rejected')}</option>
                  <option value="validated">{t('status.validated')}</option>
                  <option value="refused">{t('status.rejected')}</option>
                </select>

                {!canReadAll && (
                  <div className="tw-rounded tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-bg-slate-50 dark:tw-bg-slate-800/60 tw-px-3 tw-py-2 tw-text-sm tw-text-slate-600 dark:tw-text-slate-400">
                    {t('processed_history.filters.all_employees')}
                  </div>
                )}
                {canReadAll && (
                  <select aria-label={t('processed_history.filters.employee')} value={filters.employee_id} onChange={(event) => update('employee_id', event.target.value)} className="tw-rounded tw-border tw-p-2 dark:tw-border-slate-600 dark:tw-bg-slate-800 dark:tw-text-slate-100">
                    <option value="">{t('processed_history.filters.all_employees')}</option>
                    {reportEmployees.map((user) => (
                      <option key={user.id} value={user.id}>{user.label}</option>
                    ))}
                  </select>
                )}

                <input aria-label={t('processed_history.filters.start_date')} type="date" value={filters.date_from} onChange={(event) => update('date_from', event.target.value)} className="tw-rounded tw-border tw-p-2 dark:tw-border-slate-600 dark:tw-bg-slate-800 dark:tw-text-slate-100" />
                <input aria-label={t('processed_history.filters.end_date')} type="date" value={filters.date_to} onChange={(event) => update('date_to', event.target.value)} className="tw-rounded tw-border tw-p-2 dark:tw-border-slate-600 dark:tw-bg-slate-800 dark:tw-text-slate-100" />

                <label className="tw-flex tw-items-center tw-gap-2 dark:tw-text-slate-300">
                  <input type="checkbox" checked={filters.manual_only} onChange={(event) => update('manual_only', event.target.checked)} />
                  {t('processed_history.filters.modified_only')}
                </label>
              </div>
            </section>

            <section className="tw-mt-4 tw-grid tw-gap-4 md:tw-grid-cols-4">
              <div className="tw-rounded tw-bg-white dark:tw-bg-slate-900 dark:tw-border dark:tw-border-slate-700 tw-p-4 dark:tw-text-slate-200">
                {t('processed_history.total')} <strong>{reportHistoryPagination.total ?? visibleReportHistory.length}</strong>
              </div>
              <div className="tw-rounded tw-bg-white dark:tw-bg-slate-900 dark:tw-border dark:tw-border-slate-700 tw-p-4 dark:tw-text-slate-200">
                {t('status.validated')} <strong>{reportHistoryStats.validated_count}</strong>
              </div>
              <div className="tw-rounded tw-bg-white dark:tw-bg-slate-900 dark:tw-border dark:tw-border-slate-700 tw-p-4 dark:tw-text-slate-200">
                {t('status.rejected')} <strong>{reportHistoryStats.refused_count}</strong>
              </div>
              <div className="tw-rounded tw-bg-white dark:tw-bg-slate-900 dark:tw-border dark:tw-border-slate-700 tw-p-4 dark:tw-text-slate-200">
                {t('processed_history.stats.modified_entries')} <strong>{reportHistoryStats.manual_count}</strong>
              </div>
            </section>

            {!reportHistoryLoading && visibleReportHistory.length === 0 && (
              <p className="tw-mt-4 tw-text-sm tw-text-slate-500 dark:tw-text-slate-400">{t('history.no_report_history')}</p>
            )}

            {!reportHistoryLoading && visibleReportHistory.length > 0 && (
              <div className="tw-mt-4 tw-space-y-3">
                {Object.entries(groupedReports).map(([day, rows]) => (
                  <div key={day} className="tw-rounded-xl tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-bg-white dark:tw-bg-slate-900 tw-p-4">
                    <div className="tw-flex tw-items-start tw-justify-between tw-gap-3">
                      <div>
                        <p className="tw-font-semibold tw-text-slate-900 dark:tw-text-slate-100">{day}</p>
                        <p className="tw-text-sm tw-text-slate-500 dark:tw-text-slate-400">{t('processed_history.total')}: {rows.length}</p>
                      </div>
                    </div>
                    <div className="tw-mt-3">
                      {rows.map((report) => (
                        <div key={report.id} className="tw-mb-4 tw-rounded tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-p-3">
                          <div className="tw-flex tw-items-start tw-justify-between tw-gap-3">
                            <div>
                              <p className="tw-font-semibold tw-text-slate-900 dark:tw-text-slate-100">{report.user_label}</p>
                              <p className="tw-text-sm tw-text-slate-500 dark:tw-text-slate-400">{report.date_report}</p>
                            </div>
                            <div className="tw-flex tw-items-center tw-gap-2">
                              <StatusBadge status={Number(report.status)} />
                              {isManuallyModifiedRecord(report.date_creation, report.date_last_content_edit) && (
                                <ModifiedManuallyBadge title={t('timeentry.corrected_traced')} />
                              )}
                            </div>
                          </div>
                          <div className="tw-mt-3 tw-flex tw-items-center tw-justify-end">
                            <button
                              type="button"
                              onClick={() => setSelectedReport(report)}
                              className="tw-rounded-lg tw-border tw-border-sky-200 dark:tw-border-sky-800 tw-bg-sky-50 dark:tw-bg-sky-900/30 tw-px-3 tw-py-1.5 tw-text-xs tw-font-medium tw-text-sky-700 dark:tw-text-sky-300 hover:tw-bg-sky-100 dark:hover:tw-bg-sky-900/50"
                            >
                              {t('daily_report.read_report')}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!reportHistoryLoading && visibleReportHistory.length > 0 && (
              <div className="tw-mt-4 tw-flex tw-items-center tw-justify-center tw-gap-4">
                <button
                  type="button"
                  onClick={() => setReportHistoryPage((p) => Math.max(1, p - 1))}
                  disabled={reportHistoryPage <= 1}
                  className={`tw-rounded tw-px-4 tw-py-2 ${reportHistoryPage <= 1 ? 'tw-bg-slate-200 dark:tw-bg-slate-800 tw-text-slate-500 dark:tw-text-slate-500' : 'tw-bg-slate-100 dark:tw-bg-slate-700 tw-text-slate-700 dark:tw-text-slate-200 hover:tw-bg-slate-200 dark:hover:tw-bg-slate-600'}`}
                >
                  {t('processed_history.pagination.previous')}
                </button>
                <div className="tw-text-sm tw-text-slate-700 dark:tw-text-slate-300">
                  {t('processed_history.pagination.page', { current: reportHistoryPagination.page || reportHistoryPage, total: reportHistoryPagination.pages || 1 })}
                </div>
                <button
                  type="button"
                  onClick={() => setReportHistoryPage((p) => Math.min(reportHistoryPagination.pages || p, p + 1))}
                  disabled={reportHistoryPage >= (reportHistoryPagination.pages || 1)}
                  className={`tw-rounded tw-px-4 tw-py-2 ${reportHistoryPage >= (reportHistoryPagination.pages || 1) ? 'tw-bg-slate-200 dark:tw-bg-slate-800 tw-text-slate-500 dark:tw-text-slate-500' : 'tw-bg-slate-100 dark:tw-bg-slate-700 tw-text-slate-700 dark:tw-text-slate-200 hover:tw-bg-slate-200 dark:hover:tw-bg-slate-600'}`}
                >
                  {t('processed_history.pagination.next')}
                </button>
              </div>
            )}
          </div>
        )}
      </Card>

      {selectedReport && <ReadDailyReportModal report={selectedReport} onClose={() => setSelectedReport(null)} />}
      <ImportPreviewModal
        open={importState.open}
        loading={importState.loading}
        error={importState.error}
        data={importState.data}
        file={importState.file}
        onClose={closeImportModal}
      />
    </div>
  );
}
