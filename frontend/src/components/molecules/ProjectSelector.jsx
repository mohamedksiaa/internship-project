export default function ProjectSelector({ projects = [], value, onChange = () => {} }) {
  return <select id="clockify-project" name="project" value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="min-w-[110px] bg-transparent text-sm text-[#03a9f4] outline-none"><option value="">Projet</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>;
}
