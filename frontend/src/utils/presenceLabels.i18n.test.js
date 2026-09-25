import { describe, expect, it } from 'vitest';
import i18n from '../i18n';
import fr from '../locales/fr/translation.json';
import en from '../locales/en/translation.json';
import de from '../locales/de/translation.json';
import ar from '../locales/ar/translation.json';
import { EXPECTED_ABSENCE_REASONS, PRESENCE_STATUSES } from './presenceLabels.js';

// Every text of the Présence column / expected-absence dialog must exist, as a
// real translation (no key echoed back, no placeholder), in the 4 languages
// the app ships — and every key the source code asks for must be one of them.
const locales = { fr, en, de, ar };

function flatten(obj, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') flatten(value, path, out);
    else out[path] = value;
  }
  return out;
}

const presenceOf = (locale) => flatten(locale.users_report.presence, 'users_report.presence');
const frKeys = Object.keys(presenceOf(fr));
const variables = (text) => (String(text).match(/\{\{\s*\w+\s*\}\}/g) || []).map((v) => v.replace(/\s/g, '')).sort();

describe('users_report.presence i18n', () => {
  it('has a non-trivial set of keys', () => {
    expect(frKeys.length).toBeGreaterThanOrEqual(25); // sanity: the flatten walked the whole block
  });

  it.each(Object.keys(locales))('%s has exactly the same keys as fr (none missing, none extra)', (lang) => {
    expect(Object.keys(presenceOf(locales[lang])).sort()).toEqual([...frKeys].sort());
  });

  it.each(Object.keys(locales))('%s: every value is a real, non-empty translation (no placeholder marker, no key echo)', (lang) => {
    for (const [key, value] of Object.entries(presenceOf(locales[lang]))) {
      expect(typeof value, key).toBe('string');
      expect(value.trim(), key).not.toBe('');
      expect(value, key).not.toMatch(/À VÉRIFIER|TODO|TBD|FIXME|lorem/i);
      expect(value, key).not.toBe(key);
      expect(value, key).not.toMatch(/^users_report\./);
    }
  });

  it.each(Object.keys(locales))('%s: interpolation variables match fr for every key', (lang) => {
    const mine = presenceOf(locales[lang]);
    const reference = presenceOf(fr);
    for (const key of frKeys) {
      expect(variables(mine[key]), `${lang} ${key}`).toEqual(variables(reference[key]));
    }
  });

  it.each(Object.keys(locales))('%s: i18next resolves every key to its value (not the key)', async (lang) => {
    const t = i18n.getFixedT(lang);
    for (const key of frKeys) {
      expect(t(key), `${lang} ${key}`).not.toBe(key);
    }
  });

  it('every status and every reason the code can display has a label in all 4 languages', () => {
    for (const lang of Object.keys(locales)) {
      const flat = presenceOf(locales[lang]);
      for (const status of PRESENCE_STATUSES) {
        expect(flat[`users_report.presence.status.${status}`], `${lang} status ${status}`).toBeTruthy();
      }
      for (const reason of EXPECTED_ABSENCE_REASONS) {
        expect(flat[`users_report.presence.reason.${reason}`], `${lang} reason ${reason}`).toBeTruthy();
      }
    }
  });

  it('the retired "rtt" reason has no label left in any language, and the reasons are exactly leave / sick / other', () => {
    expect(EXPECTED_ABSENCE_REASONS).toEqual(['leave', 'sick', 'other']);
    for (const lang of Object.keys(locales)) {
      expect(presenceOf(locales[lang])['users_report.presence.reason.rtt'], lang).toBeUndefined();
      expect(JSON.stringify(locales[lang].users_report.presence), lang).not.toMatch(/RTT/);
    }
  });

  it.each(Object.keys(locales))('%s: the free-text reason has its label, its hint and a {{note}} slot', (lang) => {
    const flat = presenceOf(locales[lang]);
    expect(flat['users_report.presence.dialog.note_label'], lang).toBeTruthy();
    expect(flat['users_report.presence.dialog.note_required'], lang).toBeTruthy();
    expect(flat['users_report.presence.reason.other_with_note'], lang).toContain('{{note}}');
    expect(flat['users_report.presence.table_outdated'], lang).toBeTruthy();
  });

  it('the four languages are actually different for the visible labels (no fr copy-paste)', () => {
    // ("Absent" is legitimately the same word in French and English.)
    for (const key of ['status.present', 'status.expected_absence', 'col_presence', 'dialog.save']) {
      const values = Object.keys(locales).map((lang) => presenceOf(locales[lang])[`users_report.presence.${key}`]);
      expect(new Set(values).size, key).toBe(4);
    }
  });

  // Every literal key the source asks for exists. Dynamic keys (status.${…},
  // reason.${…}) are covered by the test above through the exported lists.
  const sources = import.meta.glob(
    [
      '../pages/ReportsPage.jsx',
      '../components/atoms/PresenceBadge.jsx',
      '../components/molecules/ExpectedAbsenceDialog.jsx',
      '../components/molecules/ConfirmRemoveAbsenceDialog.jsx',
      './presenceLabels.js',
    ],
    { query: '?raw', import: 'default', eager: true },
  );

  it('reads the five expected source files', () => {
    expect(Object.keys(sources).length).toBe(5);
  });

  it('every literal users_report.presence.* key used in the source exists in fr', () => {
    const used = new Set();
    for (const text of Object.values(sources)) {
      for (const match of text.matchAll(/['"`](users_report\.presence\.[A-Za-z0-9_.]+)['"`]/g)) {
        used.add(match[1]);
      }
    }
    expect(used.size).toBeGreaterThan(15);
    const missing = [...used].filter((key) => !frKeys.includes(key));
    expect(missing).toEqual([]);
  });

  it('no key of the block is dead: each literal key is used, or is a status/reason reached dynamically', () => {
    const text = Object.values(sources).join('\n');
    const dynamic = /^users_report\.presence\.(status|reason)\./;
    const unused = frKeys.filter((key) => !dynamic.test(key) && !text.includes(key));
    expect(unused).toEqual([]);
  });
});
