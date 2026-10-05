// Shared CSV export for every read-only Rapports sub-page (tâches, projets,
// historique des comptes-rendus, utilisateurs) — one implementation instead
// of four near-identical copies of "quote/escape + BOM + Blob + <a download>".
//
// - Delimiter is ';' (not ','): matches the French Excel locale, where a
//   comma is the decimal separator, not a field separator — Excel would
//   otherwise silently misparse the file into a single column.
// - Leading BOM (﻿) so Excel detects UTF-8 instead of guessing the
//   system codepage, which is what actually breaks accented/Arabic text.
// - Filename is a plain ASCII slug (never the translated tab label) plus
//   today's date, so the download name stays stable and safe across
//   browsers/OS regardless of the active UI language.
function pad2(value) {
  return String(value).padStart(2, '0');
}

function todayStamp() {
  const now = new Date();
  return `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
}

// Excel/LibreOffice auto-detect an ISO date ("2026-08-01") and silently
// convert it to a date serial number even inside a quoted CSV field — the
// quotes only escape the delimiter, they are not a type hint. The result is
// a column too narrow for the reformatted date, rendered as "###". A leading
// apostrophe is the standard CSV convention both apps honor to force text.
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// A cell whose text starts with '=', '+', '-', '@', a tab or a carriage return is read as a formula by
// Excel/LibreOffice/Google Sheets even inside a quoted CSV field (CWE-1236, security report A-04) — a
// project title, description, correction reason or client name a user typed can otherwise run an external
// command or exfiltrate data as soon as whoever exports opens the file. Leading whitespace defeats this on
// every one of those apps (a formula must be the very first character), so "  =1+1" is already inert and is
// deliberately left alone — only an un-prefixed leading trigger character is neutralized. A leading
// apostrophe is the standard convention all three honor to force the cell back to plain text, same as the
// ISO-date case just below.
const FORMULA_PREFIX_PATTERN = /^[=+\-@\t\r]/;

function csvEscape(value) {
  let text = String(value ?? '');
  if (ISO_DATE_PATTERN.test(text)) {
    text = `'${text}`;
  } else if (FORMULA_PREFIX_PATTERN.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

// `delimiter` defaults to ';' for the per-tab exports above. The global
// consolidated export (Rapports, above the tab bar) passes ',' instead — it
// must match config/import_column_mapping_clockify.json's own delimiter so
// the file can be re-imported as-is via previewClockifyImport().
export function downloadCsv(fileSlug, header, rows, delimiter = ';') {
  const lines = [header, ...rows].map((line) => line.map(csvEscape).join(delimiter)).join('\n');
  const csvContent = `﻿${lines}`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `timeflow_${fileSlug}_${todayStamp()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
