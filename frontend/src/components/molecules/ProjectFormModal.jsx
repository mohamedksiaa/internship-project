import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function ProjectFormModal({ project = null, thirdParties = [], users = [], onSave, onClose }) {
  const { t } = useTranslation();
  const isEdit = Boolean(project);
  const [title, setTitle] = useState(project?.title || '');
  const [fkSoc, setFkSoc] = useState(project?.fk_soc ? String(project.fk_soc) : '');
  const [description, setDescription] = useState(project?.description || '');
  const [assignedUserIds, setAssignedUserIds] = useState(
    Array.isArray(project?.assigned_user_ids) ? project.assigned_user_ids.map(String) : []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setTitle(project?.title || '');
    setFkSoc(project?.fk_soc ? String(project.fk_soc) : '');
    setDescription(project?.description || '');
    setAssignedUserIds(Array.isArray(project?.assigned_user_ids) ? project.assigned_user_ids.map(String) : []);
    setError('');
  }, [project]);

  function toggleAssignedUser(userId) {
    const id = String(userId);
    setAssignedUserIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (trimmedTitle === '') {
      setError(t('projects.title_required'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        id: project?.id,
        title: trimmedTitle,
        fkSoc: fkSoc ? Number(fkSoc) : 0,
        description: description.trim(),
        assignedUserIds: assignedUserIds.map(Number),
      });
    } catch (err) {
      setError(err.message || t('projects.save_error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tw-fixed tw-inset-0 tw-z-50 tw-flex tw-items-center tw-justify-center tw-bg-black/40 tw-p-4" role="dialog" aria-modal="true" aria-labelledby="project-form-title">
      <form onSubmit={handleSubmit} className="tw-w-full tw-max-w-md tw-space-y-4 tw-rounded-lg tw-bg-white dark:tw-bg-slate-900 dark:tw-border dark:tw-border-slate-700 tw-p-6 tw-shadow-xl">
        <div className="tw-flex tw-items-start tw-justify-between">
          <h2 id="project-form-title" className="tw-text-lg tw-font-semibold tw-text-[#263746] dark:tw-text-slate-100">
            {isEdit ? t('projects.edit_title') : t('projects.new_title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('history.close')}
            className="tw-text-lg tw-leading-none tw-text-[#78909c] dark:tw-text-slate-400 hover:tw-text-[#2c3e49] dark:hover:tw-text-slate-100"
          >
            ×
          </button>
        </div>

        {error && <p className="tw-rounded-md tw-bg-rose-50 dark:tw-bg-rose-900/30 tw-px-3 tw-py-2 tw-text-sm tw-text-rose-600 dark:tw-text-rose-300">{error}</p>}

        <label className="tw-block tw-text-sm tw-font-medium tw-text-slate-700 dark:tw-text-slate-300">
          {t('projects.field_title')}
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            className="tw-mt-1 tw-w-full tw-rounded-xl tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-px-3 tw-py-2 dark:tw-bg-slate-800 dark:tw-text-slate-100"
          />
        </label>

        <label className="tw-block tw-text-sm tw-font-medium tw-text-slate-700 dark:tw-text-slate-300">
          {t('projects.field_client')}
          <select
            value={fkSoc}
            onChange={(event) => setFkSoc(event.target.value)}
            className="tw-mt-1 tw-w-full tw-rounded-xl tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-px-3 tw-py-2 dark:tw-bg-slate-800 dark:tw-text-slate-100"
          >
            <option value="">{t('projects.no_client_option')}</option>
            {thirdParties.map((party) => <option key={party.id} value={party.id}>{party.title}</option>)}
          </select>
        </label>

        <label className="tw-block tw-text-sm tw-font-medium tw-text-slate-700 dark:tw-text-slate-300">
          {t('projects.field_description')}
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows="3"
            className="tw-mt-1 tw-w-full tw-rounded-xl tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-px-3 tw-py-2 dark:tw-bg-slate-800 dark:tw-text-slate-100"
          />
        </label>

        <div className="tw-block tw-text-sm tw-font-medium tw-text-slate-700 dark:tw-text-slate-300">
          {t('projects.field_assigned_users')}
          <div className="tw-mt-1 tw-max-h-40 tw-overflow-y-auto tw-rounded-xl tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-p-2 dark:tw-bg-slate-800">
            {users.length === 0 ? (
              <p className="tw-text-sm tw-font-normal tw-text-slate-400">{t('projects.no_users_available')}</p>
            ) : (
              users.map((assignableUser) => (
                <label key={assignableUser.id} className="tw-flex tw-items-center tw-gap-2 tw-py-1 tw-text-sm tw-font-normal tw-text-slate-700 dark:tw-text-slate-200">
                  <input
                    type="checkbox"
                    checked={assignedUserIds.includes(String(assignableUser.id))}
                    onChange={() => toggleAssignedUser(assignableUser.id)}
                  />
                  {assignableUser.label || `${assignableUser.firstname || ''} ${assignableUser.lastname || ''}`.trim() || assignableUser.login}
                </label>
              ))
            )}
          </div>
          <p className="tw-mt-1 tw-text-xs tw-font-normal tw-text-slate-500 dark:tw-text-slate-400">
            {assignedUserIds.length === 0 ? t('projects.assigned_users_open_hint') : t('projects.assigned_users_restricted_hint', { count: assignedUserIds.length })}
          </p>
        </div>

        <div className="tw-flex tw-justify-end tw-gap-3">
          <button type="button" onClick={onClose} disabled={saving} className="tw-text-sm tw-text-[#52656f] dark:tw-text-slate-300">
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="tw-rounded-xl tw-bg-[#5B8FA8] tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-white hover:tw-bg-[#4A7690] dark:hover:tw-bg-[#6ea0ba] disabled:tw-opacity-50"
          >
            {saving ? t('projects.saving') : t('save')}
          </button>
        </div>
      </form>
    </div>
  );
}
