import { useTranslation } from 'react-i18next';

export default function ProjectSelector({
  projects = [],
  value,
  onChange = () => {},
  onFocus = () => {},
  id = 'timeflow-project',
  ariaLabel = '',
  disabled = false,
  className = 'tw-min-w-[110px] tw-bg-transparent tw-text-sm tw-text-[#5B8FA8] tw-outline-none',
}) {
  const { t } = useTranslation();
  const groups = projects.reduce((accumulator, project) => {
    const groupName = project.client || t('project_selector.no_client');
    (accumulator[groupName] ||= []).push(project);
    return accumulator;
  }, {});

  return (
    <select
      id={id}
      name="project"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      onMouseDown={onFocus}
      aria-label={ariaLabel || undefined}
      disabled={disabled}
      className={className}
    >
      <option value="">{t('project_selector.placeholder')}</option>
      {Object.entries(groups).map(([client, clientProjects]) => (
        <optgroup key={client} label={client}>
          {clientProjects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
