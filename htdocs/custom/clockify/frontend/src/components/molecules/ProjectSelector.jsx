export default function ProjectSelector({ projects = [], value, onChange = () => {} }) {
  const groups = projects.reduce((accumulator, project) => {
    const groupName = project.client || 'Sans client';
    (accumulator[groupName] ||= []).push(project);
    return accumulator;
  }, {});

  return (
    <select id="clockify-project" name="project" value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="min-w-[110px] bg-transparent text-sm text-[#03a9f4] outline-none">
      <option value="">Projet</option>
      {Object.entries(groups).map(([client, clientProjects]) => (
        <optgroup key={client} label={client}>
          {clientProjects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
