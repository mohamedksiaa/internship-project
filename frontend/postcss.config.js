import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import prefixSelector from 'postcss-prefix-selector';

// TimeFlow's CSS is injected into <head> of a full Dolibarr page (see
// timeflowindex.php), not a page we own end to end — Tailwind's "prefix"
// config option (tailwind.config.js) only renames utility CLASSES
// (tw-flex, tw-bg-white, ...), it never touches Tailwind's base reset
// ("Preflight"), which targets bare element selectors (img, button, *, ...)
// with no class at all. Without this, Preflight's `img { display: block }`
// (among other resets) applied to the WHOLE page, including Dolibarr's own
// native chrome above #root (#id-top's avatar/username login block) —
// exactly the cause of a real, confirmed-in-browser bug where that block
// broke onto two lines only on TimeFlow pages, never on native ones.
//
// postcss-prefix-selector rewrites every selector Tailwind emits (both
// Preflight and utilities) to be scoped under #root, so none of it can
// ever apply outside the React tree — the same guarantee `prefix: 'tw-'`
// already gives for utility classes, extended to cover the reset too.
export default {
  plugins: [
    tailwindcss(),
    prefixSelector({
      prefix: '#root',
      transform(prefix, selector, prefixedSelector) {
        // html/body/:root are ancestors of #root, not descendants — "#root
        // html" would never match anything. Preflight's html/body/:root
        // rules (line-height, text-size-adjust, base margin, CSS custom
        // properties...) are instead applied straight to #root itself,
        // which is the effective page root as far as TimeFlow is concerned.
        if (selector === 'html' || selector === 'body' || selector === ':root') {
          return prefix;
        }
        // A selector already scoped to #root (index.css's own hand-written
        // rules, e.g. "#root.tw-dark { color-scheme: dark; ... }") must be
        // left untouched — the default behavior below would otherwise
        // double-prefix it into "#root #root.tw-dark", which can never
        // match anything (an element can't be its own ancestor via a
        // repeated ID). That silently killed the entire dark-mode
        // color-scheme/accent-color override, which is why native controls
        // (checkboxes) kept rendering with their light-mode appearance
        // even with the "tw-dark" class present on #root.
        if (selector === prefix || selector.startsWith(prefix + '.') || selector.startsWith(prefix + '#') || selector.startsWith(prefix + ':') || selector.startsWith(prefix + '[') || selector.startsWith(prefix + ' ') || selector.startsWith(prefix + '>')) {
          return selector;
        }
        return prefixedSelector;
      },
    }),
    autoprefixer(),
  ],
};
