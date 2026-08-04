import { useState } from 'react';
import { createManualEntry } from '../../api/clockifyApi';
import { useTimer } from '../../hooks/UseTimer.js';
import ProjectSelector from '../molecules/ProjectSelector';
import TimeDisplay from '../atoms/TimeDisplay';

export default function TimerWidget({ projects = [], projectsError = '', tasks = [], onProjectChange = () => {}, onEntryCreated = () => {} }) {
  const { isRunning, seconds, loading, error, start, stop } = useTimer();
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState('');
  const [billable, setBillable] = useState(false);
  const [reason, setReason] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [manualStart, setManualStart] = useState('');
  const [manualEnd, setManualEnd] = useState('');
  const [manualBusy, setManualBusy] = useState(false);

  const pushEntry = (entry) => {
    if (entry) {
      onEntryCreated(entry);
    }
  };

  const handleStart = async () => {
    if (manualMode) {
      setManualBusy(true);
      try {
        const entry = await createManualEntry({
          fk_project: projectId ? Number(projectId) : 0,
          fk_task: taskId ? Number(taskId) : 0,
          date_start: manualStart,
          date_end: manualEnd,
          note: note.trim(),
          tags,
          billable: billable ? 1 : 0,
          reason: reason.trim(),
        });
        pushEntry(entry);
        setNote('');
        setTags('');
        setBillable(false);
        setReason('');
        setManualStart('');
        setManualEnd('');
        setManualMode(false);
      } finally {
        setManualBusy(false);
      }
      return;
    }

    const entry = await start(projectId ? Number(projectId) : 0, taskId ? Number(taskId) : 0, note.trim(), tags, billable ? 1 : 0);
    pushEntry(entry);
  };

  const handleProjectChange = (nextProjectId) => {
    setProjectId(nextProjectId);
    setTaskId('');
    onProjectChange(nextProjectId ? Number(nextProjectId) : 0);
  };

  return (
    <section>
      <div className="space-y-2 bg-white p-2 shadow-[0_3px_12px_rgba(35,61,79,.12)]">
        <div className="flex min-h-[60px] flex-col md:flex-row md:items-stretch">
          <input id="clockify-description" name="description" value={note} onChange={(e) => setNote(e.target.value)} aria-label="What are you working on?" placeholder={manualMode ? 'Description de la saisie manuelle' : 'What are you working on?'} className="min-w-0 flex-1 border border-[#9eafb9] px-3 text-sm outline-none placeholder:text-[#98a5ad] focus:border-[#03a9f4]" />
        {projects.length > 0 && <div className="flex min-h-[44px] items-center border-b border-[#dce5ea] px-3 md:border-b-0 md:border-l">
          <span className="mr-2 text-xl text-[#03a9f4]">⊕</span><ProjectSelector projects={projects} value={projectId} onChange={handleProjectChange} />
        </div>}
        {projectId && tasks.length > 0 && <div className="flex items-center gap-3 border-b border-[#dce5ea] px-4 text-[#78909c] md:border-b-0 md:border-l"><span>◇</span><select id="clockify-task" name="task" aria-label="Task" value={taskId} onChange={(e) => setTaskId(e.target.value)} className="max-w-36 bg-transparent text-sm outline-none"><option value="">Select task</option>{tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></div>}
        <div className="flex items-center justify-center px-5 font-semibold text-[#37474f]"><TimeDisplay seconds={seconds} /></div>
        <button type="button" onClick={isRunning ? stop : handleStart} disabled={loading || manualBusy} className="min-h-[44px] bg-[#03a9f4] px-7 text-sm font-medium text-white transition hover:bg-[#0398dc] disabled:cursor-not-allowed disabled:bg-[#a9c9d8]">{loading || manualBusy ? '…' : isRunning ? 'ARRÊTER' : manualMode ? 'ENREGISTRER' : 'DÉMARRER'}</button>
        <button type="button" className="px-3 text-xl text-[#78909c]" aria-label="Options du minuteur">☷</button>
      </div>
      <div className="grid gap-2 md:grid-cols-4">
        <label className="flex items-center gap-2 text-sm text-[#52656f]"><input type="checkbox" checked={manualMode} onChange={(e) => setManualMode(e.target.checked)} /> Saisie manuelle</label>
        {manualMode && <><input type="datetime-local" value={manualStart} onChange={(e) => setManualStart(e.target.value)} className="border border-[#dce5ea] px-3 py-2 text-sm" /><input type="datetime-local" value={manualEnd} onChange={(e) => setManualEnd(e.target.value)} className="border border-[#dce5ea] px-3 py-2 text-sm" /><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Raison de la modification" className="border border-[#dce5ea] px-3 py-2 text-sm col-span-2" /></>}
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags, séparés par virgules" className="border border-[#dce5ea] px-3 py-2 text-sm" />
        <label className="flex items-center gap-2 text-sm text-[#52656f]"><input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} /> Billable</label>
      </div>
      </div>
      {error && <p className="mt-2 text-sm text-[#d64c4c]">{error}</p>}
      {projectsError && <p className="mt-2 text-sm text-[#78909c]">{projectsError}. Vous pouvez tout de même démarrer un chrono sans projet.</p>}
    </section>
  );
}
