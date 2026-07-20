import { useState } from 'react';
import { useTimer } from '../../hooks/UseTimer';
import ProjectSelector from '../molecules/ProjectSelector';
import NoteField from '../molecules/NoteField';
import TimerControls from '../molecules/TimeControls';
import TimeDisplay from '../atoms/TimeDisplay';

export default function TimerWidget({ projects }) {
  const { isRunning, seconds, loading, error, start, stop } = useTimer();
  const [projectId, setProjectId] = useState(null);
  const [note, setNote] = useState('');

  const handleStart = () => {
    if (!projectId) return; // validation simple côté frontend
    start(projectId, null, note);
  };

  return (
    <div className="p-4 border rounded-lg shadow-sm space-y-3">
      <h2 className="font-semibold text-lg">Chrono</h2>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <ProjectSelector projects={projects} value={projectId} onChange={setProjectId} />
      <NoteField value={note} onChange={setNote} />
      <TimeDisplay seconds={seconds} />
      <TimerControls isRunning={isRunning} onStart={handleStart} onStop={stop} loading={loading} />
    </div>
  );
}