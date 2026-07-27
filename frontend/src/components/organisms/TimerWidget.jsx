import { useState } from 'react';
import { useTimer } from '../../hooks/UseTimer';
import ProjectSelector from '../molecules/ProjectSelector';
import TimeDisplay from '../atoms/TimeDisplay';

export default function TimerWidget({ projects = [], projectsError = '', tasks = [], onProjectChange = () => {} }) {
  const { isRunning, seconds, loading, error, start, stop } = useTimer();
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [note, setNote] = useState('');
  const handleStart = () => start(projectId ? Number(projectId) : 0, taskId ? Number(taskId) : 0, note.trim());
  const handleProjectChange = (nextProjectId) => {
    setProjectId(nextProjectId);
    setTaskId('');
    onProjectChange(nextProjectId ? Number(nextProjectId) : 0);
  };

  return (
    <section>
      <div className="flex min-h-[60px] flex-col bg-white p-2 shadow-[0_3px_12px_rgba(35,61,79,.12)] md:flex-row md:items-stretch">
        <input id="clockify-description" name="description" value={note} onChange={(e) => setNote(e.target.value)} aria-label="What are you working on?" placeholder="What are you working on?" className="min-w-0 flex-1 border border-[#9eafb9] px-3 text-sm outline-none placeholder:text-[#98a5ad] focus:border-[#03a9f4]" />
        {projects.length > 0 && <div className="flex min-h-[44px] items-center border-b border-[#dce5ea] px-3 md:border-b-0 md:border-l">
          <span className="mr-2 text-xl text-[#03a9f4]">⊕</span><ProjectSelector projects={projects} value={projectId} onChange={handleProjectChange} />
        </div>}
        {projectId && tasks.length > 0 && <div className="flex items-center gap-3 border-b border-[#dce5ea] px-4 text-[#78909c] md:border-b-0 md:border-l"><span>◇</span><select id="clockify-task" name="task" aria-label="Task" value={taskId} onChange={(e) => setTaskId(e.target.value)} className="max-w-36 bg-transparent text-sm outline-none"><option value="">Select task</option>{tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></div>}
        <div className="flex items-center justify-center px-5 font-semibold text-[#37474f]"><TimeDisplay seconds={seconds} /></div>
        <button type="button" onClick={isRunning ? stop : handleStart} disabled={loading} className="min-h-[44px] bg-[#03a9f4] px-7 text-sm font-medium text-white transition hover:bg-[#0398dc] disabled:cursor-not-allowed disabled:bg-[#a9c9d8]">{loading ? '…' : isRunning ? 'ARRÊTER' : 'DÉMARRER'}</button>
        <button type="button" className="px-3 text-xl text-[#78909c]" aria-label="Options du minuteur">☷</button>
      </div>
      {error && <p className="mt-2 text-sm text-[#d64c4c]">{error}</p>}
      {projectsError && <p className="mt-2 text-sm text-[#78909c]">{projectsError}. Vous pouvez tout de même démarrer un chrono sans projet.</p>}
    </section>
  );
}
