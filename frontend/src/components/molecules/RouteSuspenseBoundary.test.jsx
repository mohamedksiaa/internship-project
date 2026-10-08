import { lazy } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import RouteSuspenseBoundary from './RouteSuspenseBoundary';

function ThrowingPage() {
  throw new Error('chunk load failed');
}

// A lazily-loaded page whose dynamic import() rejects — the same shape a
// real network failure mid-navigation produces for a React.lazy() chunk
// (App.jsx), as opposed to ThrowingPage's synchronous throw above (used
// where a plain, already-loaded error is enough and keeps the test simpler).
const RejectingLazyPage = lazy(() => Promise.reject(new Error('network error')));

function GoodPage() {
  return <p>Real page content</p>;
}

function renderAtPath(path, element) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/a"
          element={
            <RouteSuspenseBoundary>
              <GoodPage />
            </RouteSuspenseBoundary>
          }
        />
        <Route
          path="/b"
          element={
            <RouteSuspenseBoundary>
              {element}
            </RouteSuspenseBoundary>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RouteSuspenseBoundary', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });
  afterEach(() => cleanup());

  it('renders the page normally when nothing fails', () => {
    renderAtPath('/a', <GoodPage />);
    expect(screen.getByText('Real page content')).toBeInTheDocument();
  });

  it('shows a translated loading state while a lazy chunk is still resolving', async () => {
    let resolveChunk;
    const SlowLazyPage = lazy(
      () =>
        new Promise((resolve) => {
          resolveChunk = () => resolve({ default: GoodPage });
        }),
    );
    renderAtPath('/b', <SlowLazyPage />);
    expect(screen.getByText(i18n.t('loading'))).toBeInTheDocument();
    resolveChunk();
    await waitFor(() => expect(screen.getByText('Real page content')).toBeInTheDocument());
  });

  it('shows the translated "service unavailable" message when a lazy chunk fails to load', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderAtPath('/b', <RejectingLazyPage />);
    await waitFor(() => expect(screen.getByText(i18n.t('app.service_unavailable'))).toBeInTheDocument());
    consoleError.mockRestore();
  });

  it('shows the same message for a page that throws synchronously, not just a chunk-load rejection', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderAtPath('/b', <ThrowingPage />);
    expect(screen.getByText(i18n.t('app.service_unavailable'))).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
