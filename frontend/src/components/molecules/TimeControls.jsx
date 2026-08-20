import { useTranslation } from 'react-i18next';
import Button from '../atoms/Button.jsx';

export default function TimerControls({ isRunning, onStart, onStop, loading, disabled = false }) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2">
      {!isRunning && (
        <Button variant="primary" onClick={onStart} disabled={loading || disabled}>
          {t('timer_widget.start')}
        </Button>
      )}
      {isRunning && (
        <Button variant="danger" onClick={onStop} disabled={loading}>
          {t('timer_widget.stop')}
        </Button>
      )}
    </div>
  );
}