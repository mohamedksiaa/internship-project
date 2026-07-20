import Button from '../atoms/Button';

export default function TimerControls({ isRunning, onStart, onStop, loading }) {
  return (
    <div className="flex gap-2">
      {!isRunning && (
        <Button variant="primary" onClick={onStart} disabled={loading}>
          Démarrer
        </Button>
      )}
      {isRunning && (
        <Button variant="danger" onClick={onStop} disabled={loading}>
          Arrêter
        </Button>
      )}
    </div>
  );
}