import { useTranslation } from 'react-i18next';
import { canOfferUserCreation, defaultUserChoice, readConfirmedIdentity } from '../../utils/importUsers';

const INPUT_CLASS = 'tw-w-full tw-rounded-lg tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-px-2 tw-py-1 tw-text-sm tw-text-slate-700 dark:tw-bg-slate-800 dark:tw-text-slate-200';

/**
 * "Utilisateurs détectés": a pending row is resolved either by picking an existing
 * active account, or — for an actor allowed to create accounts — by checking
 * "create this user automatically" with an editable login / first name / last name,
 * the same interaction as projects, groups and clients. A row whose email belongs to
 * a DISABLED account never offers creation and says which account it is.
 */
export default function ImportUserMappingList({ rows, choices, onChoiceChange, activeUsers, canCreateUsers, renderBadge }) {
  const { t } = useTranslation();

  if (rows.length === 0) {
    return <p className="tw-text-sm tw-text-slate-500 dark:tw-text-slate-400">{t('processed_history.import.no_users')}</p>;
  }

  return (
    <ul className="tw-space-y-2">
      {rows.map((row) => {
        const isPending = row.target_action === 'create_pending';
        const choice = choices[row.source_value] || defaultUserChoice(row);
        const offerCreation = isPending && canOfferUserCreation(row, canCreateUsers);
        const identity = row.target_action === 'create_confirmed' ? readConfirmedIdentity(row) : null;
        const creating = offerCreation && choice.mode === 'create';

        return (
          <li
            key={`${row.mapping_type}:${row.source_value}`}
            className="tw-space-y-2 tw-rounded-xl tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-bg-slate-50 dark:tw-bg-slate-800/60 tw-px-3 tw-py-2"
          >
            <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
              <span className="tw-truncate tw-text-sm tw-text-slate-700 dark:tw-text-slate-200">{row.source_value || '—'}</span>
              {!isPending && renderBadge(row.target_action)}
            </div>

            {identity && (
              <p className="tw-text-xs tw-text-slate-600 dark:tw-text-slate-400">
                {t('processed_history.import.user_to_create_summary', { login: identity.login, name: `${identity.firstname} ${identity.lastname}`.trim() })}
              </p>
            )}

            {isPending && row.warning === 'disabled_account' && (
              <p role="alert" className="tw-rounded-lg tw-bg-amber-50 dark:tw-bg-amber-900/30 tw-p-2 tw-text-xs tw-text-amber-800 dark:tw-text-amber-300">
                {t('processed_history.import.disabled_account_warning', { login: row.disabled_login })}
              </p>
            )}

            {isPending && (
              <div className="tw-space-y-2">
                {!creating && (
                  <select
                    aria-label={t('processed_history.import.select_user_placeholder')}
                    value={choice.targetId}
                    onChange={(event) => onChoiceChange(row.source_value, { mode: 'existing', targetId: event.target.value })}
                    className="tw-w-full tw-rounded-lg tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-px-2 tw-py-1 tw-text-sm tw-text-slate-700 dark:tw-bg-slate-800 dark:tw-text-slate-200"
                  >
                    <option value="">{t('processed_history.import.select_user_placeholder')}</option>
                    {activeUsers.map((activeUser) => (
                      <option key={activeUser.id} value={activeUser.id}>{activeUser.label}</option>
                    ))}
                  </select>
                )}

                {offerCreation && (
                  <label className="tw-flex tw-items-center tw-gap-2 tw-text-sm tw-text-slate-700 dark:tw-text-slate-300">
                    <input
                      type="checkbox"
                      checked={creating}
                      onChange={(event) => onChoiceChange(row.source_value, { mode: event.target.checked ? 'create' : 'existing', targetId: '' })}
                    />
                    {t('processed_history.import.create_new_user_checkbox')}
                  </label>
                )}

                {creating && (
                  <div className="tw-space-y-2">
                    <div className="tw-grid tw-grid-cols-1 tw-gap-2 sm:tw-grid-cols-3">
                      <label className="tw-text-xs tw-text-slate-600 dark:tw-text-slate-400">
                        {t('processed_history.import.new_user_login_label')}
                        <input
                          type="text"
                          aria-label={t('processed_history.import.new_user_login_label')}
                          value={choice.login}
                          onChange={(event) => onChoiceChange(row.source_value, { login: event.target.value })}
                          className={INPUT_CLASS}
                          dir="ltr"
                        />
                      </label>
                      <label className="tw-text-xs tw-text-slate-600 dark:tw-text-slate-400">
                        {t('processed_history.import.new_user_firstname_label')}
                        <input
                          type="text"
                          aria-label={t('processed_history.import.new_user_firstname_label')}
                          value={choice.firstname}
                          onChange={(event) => onChoiceChange(row.source_value, { firstname: event.target.value })}
                          className={INPUT_CLASS}
                        />
                      </label>
                      <label className="tw-text-xs tw-text-slate-600 dark:tw-text-slate-400">
                        {t('processed_history.import.new_user_lastname_label')}
                        <input
                          type="text"
                          aria-label={t('processed_history.import.new_user_lastname_label')}
                          value={choice.lastname}
                          onChange={(event) => onChoiceChange(row.source_value, { lastname: event.target.value })}
                          className={INPUT_CLASS}
                        />
                      </label>
                    </div>
                    <p className="tw-text-xs tw-text-slate-600 dark:tw-text-slate-400">
                      {t('processed_history.import.create_user_info', { email: row.source_value })}
                    </p>
                  </div>
                )}

                {!offerCreation && row.warning !== 'disabled_account' && row.email_valid === false && (
                  <p className="tw-text-xs tw-text-slate-500 dark:tw-text-slate-400">{t('processed_history.import.create_user_invalid_email')}</p>
                )}
                {!offerCreation && row.warning !== 'disabled_account' && row.email_valid !== false && canCreateUsers === false && (
                  <p className="tw-text-xs tw-text-slate-500 dark:tw-text-slate-400">{t('processed_history.import.create_user_not_allowed')}</p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
