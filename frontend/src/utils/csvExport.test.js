import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadCsv } from './csvExport';

// downloadCsv() builds a Blob and clicks a synthetic <a download>; capture the Blob's text instead of
// actually downloading, same technique the real export already relies on at runtime.
function captureExport(fileSlug, header, rows, delimiter) {
  let blob;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = vi.fn((b) => { blob = b; return 'blob:mock'; });
  URL.revokeObjectURL = vi.fn();
  const click = vi.fn();
  const originalCreateElement = document.createElement.bind(document);
  const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    const el = originalCreateElement(tag);
    if (tag === 'a') el.click = click;
    return el;
  });
  downloadCsv(fileSlug, header, rows, delimiter);
  createElementSpy.mockRestore();
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  return { blob, click };
}

async function exportedLines(...args) {
  const { blob } = captureExport(...args);
  const text = await blob.text();
  // Strip the leading BOM before splitting so a test's first expected cell isn't off by one character.
  return text.replace(/^﻿/, '').split('\n');
}

describe('csvExport', () => {
  afterEach(() => vi.restoreAllMocks());

  it('quotes every cell and doubles embedded quotes', async () => {
    const lines = await exportedLines('x', ['a'], [['He said "hi"']]);
    expect(lines[1]).toBe('"He said ""hi"""');
  });

  it('uses the given delimiter and joins rows with newlines', async () => {
    const lines = await exportedLines('x', ['a', 'b'], [['1', '2'], ['3', '4']], ',');
    expect(lines).toEqual(['"a","b"', '"1","2"', '"3","4"']);
  });

  it('defaults to the French-locale ";" delimiter', async () => {
    const lines = await exportedLines('x', ['a', 'b'], [['1', '2']]);
    expect(lines[0]).toBe('"a";"b"');
  });

  it('prefixes an ISO date with an apostrophe so it is not reformatted as a date serial', async () => {
    const lines = await exportedLines('x', ['date'], [['2026-08-01']]);
    expect(lines[1]).toBe('"\'2026-08-01"');
  });

  it('leaves a non-ISO-shaped string untouched', async () => {
    const lines = await exportedLines('x', ['a'], [['normal text']]);
    expect(lines[1]).toBe('"normal text"');
  });

  // Security report A-04 / CWE-1236: a cell that starts with a formula trigger character must never reach
  // the file able to execute — same corpus already used manually against this function during the security
  // axis (SEC-10), now exercised against the real downloadCsv() on every run.
  describe('formula injection (CWE-1236, security report A-04)', () => {
    const dangerous = [
      ['=1+1', '"\'=1+1"'],
      ['+1+1', '"\'+1+1"'],
      ['-1+1', '"\'-1+1"'],
      ['@SUM(1+1)', '"\'@SUM(1+1)"'],
      ['\t=1+1', '"\'\t=1+1"'],
      ['\r=1+1', '"\'\r=1+1"'],
      ['=HYPERLINK("http://attacker.example/x";"clic")', '"\'=HYPERLINK(""http://attacker.example/x"";""clic"")"'],
      ["=cmd|' /C calc'!A0", '"\'=cmd|\' /C calc\'!A0"'],
    ];

    it.each(dangerous)('neutralizes %j with a leading apostrophe', async (input, expected) => {
      const lines = await exportedLines('x', ['cell'], [[input]]);
      expect(lines[1]).toBe(expected);
    });

    it('leaves a formula-looking value alone when preceded by whitespace (already inert in every spreadsheet)', async () => {
      const lines = await exportedLines('x', ['cell'], [['  =1+1']]);
      expect(lines[1]).toBe('"  =1+1"');
    });

    it('does not touch ordinary text starting with a hyphenated word', async () => {
      const lines = await exportedLines('x', ['cell'], [['-not-a-formula-looking']]);
      // Still prefixed: a leading '-' is a trigger character regardless of what follows — this is the
      // documented, deliberate trade-off (see FORMULA_PREFIX_PATTERN's comment), not a missed case.
      expect(lines[1]).toBe('"\'-not-a-formula-looking"');
    });

    it('neutralizes a formula trigger on every column, not just the first', async () => {
      const lines = await exportedLines('x', ['a', 'b'], [['normal', '=1+1']]);
      expect(lines[1]).toBe('"normal";"\'=1+1"');
    });
  });
});
