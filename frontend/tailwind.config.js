/** @type {import('tailwindcss').Config} */
export default {
  prefix: 'tw-',
  // Driven by useDarkMode(), which toggles a "dark" class on #root based on
  // Dolibarr's THEME_DARKMODEENABLED setting (falling back to
  // prefers-color-scheme when that setting is "follow browser"). Not the
  // Tailwind default 'media' strategy, which only understands the browser
  // preference and can't be overridden by the Dolibarr admin setting.
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
};
