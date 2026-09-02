import { useCallback, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// useBulkSelection — the checkbox-per-row + "select all" + "N selected"
// bookkeeping used by any list that supports bulk actions (bulk delete
// today, potentially bulk-validate/bulk-export later).
//
// Extracted from the pattern already used in ProcessedHistoryPage.jsx
// (selectedIds state, toggleSelected, selectAllForPage) so a new list
// (Projects, and later Reports/Calendar) can get the same behavior with a
// couple of hook calls instead of re-implementing the id bookkeeping.
//
// Usage:
//   const selection = useBulkSelection(projects);
//   <input type="checkbox" ref={selection.headerCheckboxRef}
//          checked={selection.isAllSelected} onChange={(e) => selection.selectAll(e.target.checked)} />
//   <input type="checkbox" checked={selection.isSelected(project.id)}
//          onChange={() => selection.toggle(project.id)} />
//   selection.selectedIds, selection.count
// ---------------------------------------------------------------------------

/**
 * @param {Array<object>} rows - the currently visible rows (one page/list)
 * @param {(row: object) => number|string} getId - id extractor, defaults to row.id
 * @param {{ resetOnRowsChange?: boolean }} [options] - resetOnRowsChange
 *   (default true) clears the selection whenever `rows` changes reference,
 *   matching ProcessedHistoryPage's behavior of dropping stale selections
 *   after a filter change, page change or refresh. Pass false for a list
 *   where the selection should survive a soft reload.
 */
export function useBulkSelection(rows, getId = (row) => row.id, options = {}) {
  const { resetOnRowsChange = true } = options;
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    if (resetOnRowsChange) {
      setSelectedIds([]);
    }
    // Only rows identity matters here — resetOnRowsChange is a static option.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const isSelected = useCallback((id) => selectedIds.includes(Number(id)), [selectedIds]);

  const toggle = useCallback((id) => {
    const numericId = Number(id);
    setSelectedIds((current) => (
      current.includes(numericId) ? current.filter((currentId) => currentId !== numericId) : [...current, numericId]
    ));
  }, []);

  const selectAll = useCallback((checked) => {
    const rowIds = rows.map((row) => Number(getId(row)));
    setSelectedIds((current) => (
      checked ? Array.from(new Set([...current, ...rowIds])) : current.filter((id) => !rowIds.includes(id))
    ));
  }, [rows, getId]);

  const selectMany = useCallback((ids, checked) => {
    const numericIds = ids.map(Number);
    setSelectedIds((current) => (
      checked ? Array.from(new Set([...current, ...numericIds])) : current.filter((id) => !numericIds.includes(id))
    ));
  }, []);

  const clear = useCallback(() => setSelectedIds([]), []);

  const isAllSelected = rows.length > 0 && rows.every((row) => selectedIds.includes(Number(getId(row))));
  const isSomeSelected = !isAllSelected && rows.some((row) => selectedIds.includes(Number(getId(row))));

  // Ref helper for the header "select all" checkbox's indeterminate state
  // (a DOM-only property, can't be set via a plain prop) — same pattern
  // ProcessedHistoryPage uses inline; centralized here so callers don't
  // have to reimplement the ref callback themselves.
  const headerCheckboxRef = useCallback((element) => {
    if (element) {
      element.indeterminate = isSomeSelected;
    }
  }, [isSomeSelected]);

  return {
    selectedIds,
    count: selectedIds.length,
    isSelected,
    toggle,
    selectAll,
    selectMany,
    clear,
    isAllSelected,
    isSomeSelected,
    headerCheckboxRef,
  };
}
