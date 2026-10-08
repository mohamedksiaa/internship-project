import { lazy } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/templates/AppLayout';

// F1 (SCAL-11): each page is its own chunk, fetched only when its route is
// first visited, instead of all 6 being in the one main bundle every user
// downloads regardless of which pages they ever open. AppLayout itself
// (header/nav) stays a normal, eager import — only its content changes per
// route, so the shell must never disappear while a page chunk loads; see
// RouteSuspenseBoundary, mounted once around AppLayout's <Outlet/>, for the
// loading/error states this introduces.
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const TimerPage = lazy(() => import('./pages/TimerPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const ValidationPage = lazy(() => import('./pages/ValidationPage'));
const DailyReportPage = lazy(() => import('./pages/DailyReportPage'));

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
