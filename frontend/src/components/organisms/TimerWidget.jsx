import { useState } from 'react';
import { useTimer } from '../../hooks/UseTimer';
import ProjectSelector from '../molecules/ProjectSelector';
import NoteField from '../molecules/NoteField';
import TimerControls from '../molecules/TimeControls';
import TimeDisplay from '../atoms/TimeDisplay';

export default function TimerWidget({ projects = [], projectsError = '', tasks = [] }) {
  const { isRunning, seconds, loading, error, start, stop } = useTimer();
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [note, setNote] = useState('');

  const handleStart = () => {
    if (!projectId) {
      return;
    }

    start(Number(projectId), taskId ? Number(taskId) : null, note.trim());
  };

  return (
    <div className="p-4 border rounded-lg shadow-sm space-y-3 bg-white">
      <h2 className="font-semibold text-lg">Chrono</h2>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {projectsError && <p className="text-amber-700 text-sm">{projectsError}</p>}
      <ProjectSelector projects={projects} value={projectId} onChange={setProjectId} />
      {tasks.length > 0 && (
        <select
          value={taskId}
          onChange={(event) => setTaskId(event.target.value)}
          className="border rounded px-3 py-2 w-full"
        >
          <option value="">Choisir une tâche</option>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>{task.title}</option>
          ))}
        </select>
      )}
      <NoteField value={note} onChange={setNote} />
      <TimeDisplay seconds={seconds} />
      <TimerControls
        isRunning={isRunning}
        onStart={handleStart}
        onStop={stop}
        loading={loading}
        disabled={!projectId}
      />
    </div>
  );
}