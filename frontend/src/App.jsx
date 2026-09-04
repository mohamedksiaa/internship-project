import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/templates/AppLayout';
import DashboardPage from './pages/DashboardPage';
import TimerPage from './pages/TimerPage';
import HistoryPage from './pages/HistoryPage';
import ReportsPage from './pages/ReportsPage';
import ValidationPage from './pages/ValidationPage';
import DailyReportPage from './pages/DailyReportPage';

const canValidate = typeof window !== 'undefined' && window.TIMEFLOW_CAN_VALIDATE === true;

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/timer" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="timer" element={<TimerPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="daily-report" element={<DailyReportPage />} />
          {/* Rapports now hosts task/report history and the read-only project
              list (previously open to everyone at /processed-history and
              /projects) alongside the manager-only project breakdown that used
              to live here — none of its content requires canValidate anymore,
              so unlike /validation this route is not gated. */}
          <Route path="reports" element={<ReportsPage />} />
          <Route path="validation" element={canValidate ? <ValidationPage /> : <Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
