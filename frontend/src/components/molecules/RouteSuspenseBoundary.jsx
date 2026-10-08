import { Component, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

// React 19 still has no hook-based error boundary — componentDidCatch/
// getDerivedStateFromError on a class component is the only way to catch a
// thrown error from a descendant, including a React.lazy() chunk that fails
// to load (e.g. the network drops mid-navigation, after the initial bundle
// already loaded). Without this, that failure would otherwise crash past
// AppLayout's header/nav entirely, leaving a blank page.
class RouteErrorBoundaryClass extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function RouteErrorFallback() {
  const { t } = useTranslation();
  return (
    <div className="tw-flex tw-min-h-[50vh] tw-items-center tw-justify-center tw-px-5">
      <p className="tw-rounded-lg tw-bg-rose-50 dark:tw-bg-rose-900/30 tw-px-4 tw-py-3 tw-text-sm tw-text-rose-600 dark:tw-text-rose-300">
        {t('app.service_unavailable')}
      </p>
    </div>
  );
}

function RouteLoadingFallback() {
  const { t } = useTranslation();
  return (
    <div className="tw-flex tw-min-h-[50vh] tw-items-center tw-justify-center">
      <p className="tw-text-sm tw-text-slate-500 dark:tw-text-slate-400">{t('loading')}</p>
    </div>
  );
}

// Wraps a route's lazy-loaded page (App.jsx) with both a translated loading
// state while its chunk downloads and a translated error message — the same
// "Service momentanément indisponible" wording used for a failed data fetch
// (api/timeflowApi.js) — if the chunk itself fails to download (same
// transient-failure meaning, same recovery advice: retry).
//
// Mounted once around <Outlet/> in AppLayout, not once per <Route>, so a
// chunk failure caught on one page must not keep showing the error fallback
// forever once the user navigates elsewhere — keying the boundary on the
// current pathname forces React to remount it (clearing getDerivedStateFromError's
// hasError) on every navigation, success or failure alike.
export default function RouteSuspenseBoundary({ children }) {
  const { pathname } = useLocation();
  return (
    <RouteErrorBoundaryClass key={pathname} fallback={<RouteErrorFallback />}>
      <Suspense fallback={<RouteLoadingFallback />}>{children}</Suspense>
    </RouteErrorBoundaryClass>
  );
}
