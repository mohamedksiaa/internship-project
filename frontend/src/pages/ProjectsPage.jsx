import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Card from '../components/atoms/Card';
import ProjectFormModal from '../components/molecules/ProjectFormModal';
import { createTimeFlowProject, deleteTimeFlowProject, getTimeFlowProjects, listActiveThirdParties, listActiveUsers, updateTimeFlowProject } from '../api/timeflowApi';

export default function ProjectsPage() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState([]);
  const [thirdParties, setThirdParties] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingProject, setEditingProject] = useState(null);
  const [creating, setCreating] = useState(false);
  const [deleteRequest, setDeleteRequest] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  async function loadProjects() {
    setLoading(true);
    setError('');
    try {
      const rows = await getTimeFlowProjects();
      setProjects(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProjects();
    listActiveThirdParties().then(setThirdParties).catch(() => setThirdParties([]));
    listActiveUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

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

  async function confirmDelete() {
    if (!deleteRequest) return;
    setDeleteError('');
    try {
      await deleteTimeFlowProject(deleteRequest.id);
      setDeleteRequest(null);
      await loadProjects();
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
        {loading && <p className="tw-text-sm tw-text-slate-600 dark:tw-text-slate-400">{t('loading')}</p>}
        {error && <p className="tw-text-sm tw-text-rose-600 dark:tw-text-rose-400">{error}</p>}

        {!loading && !error && (
          projects.length === 0 ? (
            <p className="tw-text-sm tw-text-slate-500 dark:tw-text-slate-400">{t('projects.empty')}</p>
          ) : (
            <div className="tw-overflow-x-auto">
              <table className="tw-w-full tw-text-left tw-text-sm tw-border-collapse dark:tw-text-slate-200">
                <thead>
                  <tr className="tw-border-b tw-border-slate-200 dark:tw-border-slate-700 tw-text-xs tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-500 dark:tw-text-slate-400">
                    <th className="tw-px-3 tw-py-2">{t('projects.col_ref')}</th>
                    <th className="tw-px-3 tw-py-2">{t('projects.col_title')}</th>
                    <th className="tw-px-3 tw-py-2">{t('projects.col_client')}</th>
                    <th className="tw-px-3 tw-py-2 tw-text-right">{t('projects.col_assigned_users')}</th>
                    <th className="tw-px-3 tw-py-2 tw-text-right">{t('projects.col_entries')}</th>
                    <th className="tw-px-3 tw-py-2 tw-text-right">{t('projects.col_actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project) => (
                    <tr key={project.id} className="tw-border-b tw-border-slate-100 dark:tw-border-slate-800">
                      <td className="tw-px-3 tw-py-3 tw-whitespace-nowrap tw-text-slate-500 dark:tw-text-slate-400">{project.ref}</td>
                      <td className="tw-px-3 tw-py-3 tw-font-medium tw-text-slate-900 dark:tw-text-slate-100">{project.title}</td>
                      <td className="tw-px-3 tw-py-3 tw-text-slate-600 dark:tw-text-slate-300">{project.client || t('dashboard.no_client')}</td>
                      <td className="tw-px-3 tw-py-3 tw-text-right tw-tabular-nums">
                        {project.assigned_count > 0 ? project.assigned_count : t('projects.everyone')}
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
                          onClick={() => { setDeleteError(''); setDeleteRequest(project); }}
                          className="tw-text-sm tw-text-[#d64c4c] dark:tw-text-[#f0908f]"
                        >
                          {t('projects.delete_action')}
                        </button>
                      </td>
                    </tr>
                  ))}
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
            <h3 id="project-delete-title" className="tw-text-lg tw-font-semibold tw-text-slate-900 dark:tw-text-slate-100">{t('projects.delete_confirm_title')}</h3>
            <p className="tw-text-sm tw-text-slate-600 dark:tw-text-slate-400">{t('projects.delete_confirm_text', { title: deleteRequest.title })}</p>
            {deleteError && <p className="tw-rounded-md tw-bg-rose-50 dark:tw-bg-rose-900/30 tw-px-3 tw-py-2 tw-text-sm tw-text-rose-600 dark:tw-text-rose-300">{deleteError}</p>}
            <div className="tw-flex tw-justify-end tw-gap-3">
              <button type="button" onClick={() => setDeleteRequest(null)} className="tw-rounded tw-border tw-border-slate-200 dark:tw-border-slate-600 tw-px-4 tw-py-2 tw-text-sm tw-text-slate-700 dark:tw-text-slate-200 hover:tw-bg-slate-50 dark:hover:tw-bg-slate-800">
                {t('cancel')}
              </button>
              <button type="button" onClick={confirmDelete} className="tw-rounded tw-bg-[#d64c4c] tw-px-4 tw-py-2 tw-text-sm tw-text-white hover:tw-bg-[#b23f3f]">
                {t('timeentry.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
