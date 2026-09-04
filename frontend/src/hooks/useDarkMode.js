import { useEffect, useState } from 'react';

// Mirrors admin/ihm.php "Dark theme mode" (THEME_DARKMODEENABLED), injected
// server-side as window.TIMEFLOW_DARK_MODE by timeflowindex.php — Dolibarr
// applies that setting to its own chrome purely via server-rendered CSS,
// with no DOM class/attribute to detect, so we read the same underlying
// value ourselves instead of trying to sniff Dolibarr's theme output.
const MODE_ALWAYS_DISABLED = 0;
const MODE_FOLLOW_BROWSER = 1;
const MODE_ALWAYS_ENABLED = 2;

function readDarkModeSetting() {
  const raw = typeof window !== 'undefined' ? window.TIMEFLOW_DARK_MODE : undefined;
  return raw === MODE_ALWAYS_DISABLED || raw === MODE_ALWAYS_ENABLED ? raw : MODE_FOLLOW_BROWSER;
}

function prefersDarkFromBrowser() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);
}

function resolveIsDark(setting) {
  if (setting === MODE_ALWAYS_ENABLED) return true;
  if (setting === MODE_ALWAYS_DISABLED) return false;
  return prefersDarkFromBrowser();
}

/**
 * Resolves the effective dark-mode state (Dolibarr setting first, browser
 * preference only as the "follow browser" fallback) and keeps the "dark"
 * class on our React root (#root) in sync with it, so Tailwind's
 * `darkMode: 'class'` variants activate consistently everywhere in the
 * module — not just in the components that call this hook directly.
 * Also returns the boolean, for the few spots that compute colors in JS
 * rather than via `dark:` classes (FullCalendar events, Recharts SVG props).
 */
export default function useDarkMode() {
  const setting = readDarkModeSetting();
  const [isDark, setIsDark] = useState(() => resolveIsDark(setting));

  useEffect(() => {
    if (setting !== MODE_FOLLOW_BROWSER) {
      setIsDark(setting === MODE_ALWAYS_ENABLED);
      return;
    }
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDark(query.matches);
    const handleChange = (event) => setIsDark(event.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, [setting]);

  useEffect(() => {
    // Tailwind's `class` dark-mode strategy prefixes the toggle class itself
    // when a custom `prefix` is configured (tailwind.config.js prefix: 'tw-')
    // — the generated selectors expect "tw-dark" on an ancestor, not "dark".
    // Verified against the compiled CSS (`:is(.tw-dark *)`).
    const root = document.getElementById('root');
    root?.classList.toggle('tw-dark', isDark);
  }, [isDark]);

  return isDark;
}
