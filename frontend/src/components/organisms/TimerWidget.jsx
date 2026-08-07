import { useState } from 'react';
import { createManualEntry } from '../../api/clockifyApi';
import TimeDisplay from '../atoms/TimeDisplay';

export default function TimerWidget({ timer, projects = [], projectsError = '', onProjectChange = () => {}, onEntryCreated = () => {} }) {
  const { isRunning, seconds, loading, error, start, stop } = timer;
  const [projectLabel, setProjectLabel] = useState('');
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
          fk_project: 0,
          fk_task: 0,
          date_start: manualStart,
          date_end: manualEnd,
          note: note.trim(),
          project_label: projectLabel.trim(),
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

    const entry = await start(projectLabel.trim(), 0, note.trim(), tags, billable ? 1 : 0);
    pushEntry(entry);
  };

  const handleStop = async () => {
    const entry = await stop();
    pushEntry(entry);
  };

  const handleProjectChange = (nextProjectLabel) => {
    setProjectLabel(nextProjectLabel);
    onProjectChange(nextProjectLabel.trim());
  };

  return (
    <section>
      <div className="space-y-2 bg-white p-2 shadow-[0_3px_12px_rgba(35,61,79,.12)]">
        <div className="flex min-h-[60px] flex-col md:flex-row md:items-stretch">
          <input id="clockify-description" name="description" value={note} onChange={(e) => setNote(e.target.value)} aria-label="What are you working on?" placeholder={manualMode ? 'Description de la saisie manuelle' : 'What are you working on?'} className="min-w-0 flex-1 border border-[#9eafb9] px-3 text-sm outline-none placeholder:text-[#98a5ad] focus:border-[#03a9f4]" />
          <div className="flex min-h-[44px] items-center border-b border-[#dce5ea] px-3 md:border-b-0 md:border-l">
            <span className="mr-2 text-xl text-[#03a9f4]">⊕</span>
            <input id="clockify-project" name="project" value={projectLabel} onChange={(e) => handleProjectChange(e.target.value)} aria-label="Projet" placeholder="Projet" className="min-w-[160px] bg-transparent text-sm text-[#03a9f4] outline-none placeholder:text-[#98a5ad]" />
          </div>
        <div className="flex items-center justify-center px-5 font-semibold text-[#37474f]"><TimeDisplay seconds={seconds} /></div>
        <button type="button" onClick={isRunning ? handleStop : handleStart} disabled={loading || manualBusy} className="min-h-[44px] bg-[#03a9f4] px-7 text-sm font-medium text-white transition hover:bg-[#0398dc] disabled:cursor-not-allowed disabled:bg-[#a9c9d8]">{loading || manualBusy ? '…' : isRunning ? 'ARRÊTER' : manualMode ? 'ENREGISTRER' : 'DÉMARRER'}</button>
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
