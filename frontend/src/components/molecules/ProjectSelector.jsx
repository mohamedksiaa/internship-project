export default function ProjectSelector({ projects = [], value, onChange = () => {} }) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(Number(e.target.value))}
      className="border rounded px-3 py-2 w-full"
    >
      <option value="" disabled>Choisir un projet</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>{p.title}</option>
      ))}
    </select>
  );
}