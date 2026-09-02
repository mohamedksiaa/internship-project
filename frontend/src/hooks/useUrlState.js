import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

// ---------------------------------------------------------------------------
// useUrlState — the URL is the single source of truth for one piece of UI
// state (an active tab, a date filter, a select value...).
//
// The app uses a HashRouter, so a URL looks like:
//   #/reports?tab=employees&dateFrom=2026-09-01&dateTo=2026-09-30
// Everything after "#/reports" is a normal query string that react-router's
// useSearchParams() already parses/writes for us, and it already listens to
// browser back/forward — we don't need to touch history.pushState/replaceState
// by hand, we just need a small, generic wrapper so every page doesn't
// reimplement the same read/write/default-value plumbing.
//
// Usage (this IS the generic "bindFilterToURL" — for React, "binding" a
// filter to the URL means using this hook instead of useState, since inputs
// are controlled by value/onChange rather than read imperatively from the DOM):
//
//   const [tab, setTab] = useUrlState('tab', 'activity');
//   <button onClick={() => setTab('employees')} />
//
// Behavior:
// - Reading: value comes from the URL if the param is present, otherwise
//   falls back to `defaultValue`. This is synchronous on first render, so a
//   page can read its filters from the URL BEFORE firing its data-fetching
//   effect (no flash of default values while the real ones load).
// - Writing: setValue() updates ONLY its own param, merging with whatever
//   other params are already in the URL (tab, dates, employee, etc. never
//   stomp on each other). It uses history.replaceState under the hood
//   (react-router's `{ replace: true }`), so changing a filter does NOT add
//   a new browser-history entry per keystroke/click — only real navigation
//   between pages (via the sidebar's <NavLink>) does that, which is what
//   makes the back button behave sanely.
// - Cleanliness: setting a value back to its default REMOVES the param from
//   the URL instead of writing it explicitly, so default state doesn't
//   clutter shareable links (?tab=employees appears, but not ?tab=activity).
// ---------------------------------------------------------------------------

/**
 * Sync one piece of state with one URL query parameter.
 *
 * @param {string} key - query param name, e.g. 'tab', 'dateFrom', 'employee'
 * @param {string} defaultValue - centralized default, used when the param is
 *   absent from the URL and written back when the value matches (see above)
 * @param {{ push?: boolean }} [options] - pass `push: true` to add a history
 *   entry instead of replacing (rarely needed — default is replace)
 * @returns {[string, (nextValue: string) => void]}
 */
export function useUrlState(key, defaultValue, options = {}) {
  const { push = false } = options;
  const [searchParams, setSearchParams] = useSearchParams();

  const rawValue = searchParams.get(key);
  const value = rawValue === null || rawValue === undefined ? defaultValue : rawValue;

  const setValue = useCallback((nextValue) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (nextValue === defaultValue || nextValue === '' || nextValue === null || nextValue === undefined) {
        next.delete(key);
      } else {
        next.set(key, nextValue);
      }
      return next;
    }, { replace: !push });
  }, [key, defaultValue, push, setSearchParams]);

  return [value, setValue];
}

/**
 * getStateFromURL — one-shot, read-only snapshot of every current query
 * param as a plain object. Safe to call anywhere (no react-router context
 * needed) since reading never risks desyncing the router. Useful for the
 * rare one-off read outside a component (logging, building a "copy link").
 *
 * There is deliberately no imperative `setStateInURL(partialState)` sibling:
 * with a HashRouter, writing to the URL from outside react-router's own
 * setSearchParams (e.g. a raw history.replaceState call) is not guaranteed
 * to be picked up by the router and risks a silent desync between what the
 * address bar shows and what react-router thinks the current params are.
 * Every write in this app goes through useUrlState()/useUrlDateRange() below
 * instead, which call the hook's setSearchParams and are guaranteed in sync.
 */
export function getStateFromURL() {
  const hashQuery = window.location.hash.split('?')[1] || '';
  return Object.fromEntries(new URLSearchParams(hashQuery));
}

/**
 * useUrlDateRange — convenience for the "dateFrom/dateTo" pair that shows up
 * on every filtered page. Keeps the two params independent in the URL (so
 * either can be shared/bookmarked/changed on its own) while giving callers
 * back a single stable { from, to } object, memoized so it's safe to use as
 * a useEffect/useMemo dependency without causing refetch loops.
 *
 * @param {{ from: string, to: string }} defaultRange
 */
export function useUrlDateRange(defaultRange, keys = { from: 'dateFrom', to: 'dateTo' }) {
  const [from, setFrom] = useUrlState(keys.from, defaultRange.from);
  const [to, setTo] = useUrlState(keys.to, defaultRange.to);
  const range = useMemo(() => ({ from, to }), [from, to]);
  return [range, setFrom, setTo];
}
