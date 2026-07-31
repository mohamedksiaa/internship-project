import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/templates/AppLayout';
import DashboardPage from './pages/DashboardPage';
import TimerPage from './pages/TimerPage';
import HistoryPage from './pages/HistoryPage';
import ReportsPage from './pages/ReportsPage';
import ValidationPage from './pages/ValidationPage';

const canReadAll = typeof window !== 'undefined' && window.CLOCKIFY_CAN_READALL === true;

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/timer" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="timer" element={<TimerPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="reports" element={canReadAll ? <ReportsPage /> : <Navigate to="/dashboard" replace />} />
          <Route path="validation" element={canReadAll ? <ValidationPage /> : <Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
