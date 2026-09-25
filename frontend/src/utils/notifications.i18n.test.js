import { describe, expect, it } from 'vitest';
import i18n from '../i18n';
import fr from '../locales/fr/translation.json';
import en from '../locales/en/translation.json';
import de from '../locales/de/translation.json';
import ar from '../locales/ar/translation.json';

// Every text of the bell must exist, as a real translation, in the 4 languages
// the app ships, and every key the source asks for must be one of them.
const locales = { fr, en, de, ar };

function flatten(obj, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') flatten(value, path, out);
    else out[path] = value;
  }
  return out;
}
const groupOf = (locale) => flatten(locale.notifications, 'notifications');
const frKeys = Object.keys(groupOf(fr));
const variables = (text) => (String(text).match(/\{\{\s*\w+\s*\}\}/g) || []).map((v) => v.replace(/\s/g, '')).sort();

describe('notifications i18n', () => {
  it('has a real set of keys', () => {
    expect(frKeys.length).toBeGreaterThanOrEqual(20);
  });

  it.each(Object.keys(locales))('%s has exactly the same keys as fr', (lang) => {
    expect(Object.keys(groupOf(locales[lang])).sort()).toEqual([...frKeys].sort());
  });

  it.each(Object.keys(locales))('%s: every value is a real translation (non-empty, no placeholder marker, no key echo)', (lang) => {
    for (const [key, value] of Object.entries(groupOf(locales[lang]))) {
      expect(typeof value, key).toBe('string');
      expect(value.trim(), key).not.toBe('');
      expect(value, key).not.toMatch(/À VÉRIFIER|TODO|TBD|FIXME|lorem/i);
      expect(value, key).not.toBe(key);
      expect(value, key).not.toMatch(/^notifications\./);
    }
  });

  it.each(Object.keys(locales))('%s: interpolation variables match fr for every key', (lang) => {
    const mine = groupOf(locales[lang]);
    const reference = groupOf(fr);
    for (const key of frKeys) {
      expect(variables(mine[key]), `${lang} ${key}`).toEqual(variables(reference[key]));
    }
  });

  it.each(Object.keys(locales))('%s: i18next resolves every key to its value (not the key)', (lang) => {
    const t = i18n.getFixedT(lang);
    for (const key of frKeys) {
      expect(t(key), `${lang} ${key}`).not.toBe(key);
    }
  });

  it('the visible labels differ between the four languages (no fr copy-paste)', () => {
    for (const key of ['mark_all_read', 'email_pref.label', 'empty', 'late_arrivals.cutoff']) {
      const values = Object.keys(locales).map((lang) => groupOf(locales[lang])[`notifications.${key}`]);
      expect(new Set(values).size, key).toBe(4);
    }
  });

  const sources = import.meta.glob(['../components/organisms/NotificationBell.jsx'], { query: '?raw', import: 'default', eager: true });

  it('every literal notifications.* key used by the bell exists in fr', () => {
    const text = Object.values(sources).join('\n');
    expect(Object.keys(sources).length).toBe(1);
    const used = new Set([...text.matchAll(/['"`](notifications\.[A-Za-z0-9_.]+)['"`]/g)].map((m) => m[1]));
    expect(used.size).toBeGreaterThanOrEqual(15);
    expect([...used].filter((key) => !frKeys.includes(key))).toEqual([]);
  });

  it('no key of the group is dead: each one is used by the bell', () => {
    const text = Object.values(sources).join('\n');
    expect(frKeys.filter((key) => !text.includes(key))).toEqual([]);
  });
});
