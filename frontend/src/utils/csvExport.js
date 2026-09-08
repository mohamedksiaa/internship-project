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

function csvEscape(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
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
