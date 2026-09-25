import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * A "Tous" (all) dropdown with multiple selection, for the Dashboard filters.
 * The trigger shows "Tous" for an empty selection, the name for one, "N sélectionnés" for several. The panel
 * lists the options as checkboxes, with a search box once the list is long, and a "Tous" row that clears the
 * selection. Closes on Escape or a click outside.
 *
 * @param {{
 *   id: string,
 *   label: string,
 *   options: Array<{ id: number|string, label: string, note?: string }>,
 *   selected: string[],
 *   onChange: (ids: string[]) => void,
 *   allLabel: string,
 *   countLabel: (count: number) => string,
 *   searchPlaceholder: string,
 *   noResultsLabel: string,
 *   searchThreshold?: number,
 * }} props
 */
export default function MultiSelectFilter({
  id, label, options, selected, onChange, allLabel, countLabel, searchPlaceholder, noResultsLabel, searchThreshold = 8,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handlePointer(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    function handleKey(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const selectedSet = useMemo(() => new Set(selected.map(String)), [selected]);
  const showSearch = options.length > searchThreshold;
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.label.toLowerCase().includes(needle));
  }, [options, query]);

  function toggle(optionId) {
    const key = String(optionId);
    const next = new Set(selectedSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange([...next]);
  }

  let triggerText = allLabel;
  if (selected.length === 1) {
    triggerText = options.find((option) => String(option.id) === String(selected[0]))?.label ?? countLabel(1);
  } else if (selected.length > 1) {
    triggerText = countLabel(selected.length);
  }

  return (
    <div ref={rootRef} className="tw-relative tw-flex tw-flex-col tw-gap-1 tw-text-sm tw-font-medium tw-text-slate-700 dark:tw-text-slate-300">
      <span id={`${id}-label`}>{label}</span>
      <button
        id={id}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}`}
        onClick={() => setOpen((current) => !current)}
        className="tw-flex tw-min-w-[10rem] tw-max-w-[16rem] tw-items-center tw-justify-between tw-gap-2 tw-rounded-xl tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-bg-white dark:tw-bg-slate-800 tw-px-3 tw-py-2 tw-text-start tw-font-normal tw-text-slate-900 dark:tw-text-slate-100"
      >
        <span className={`tw-truncate ${selected.length === 0 ? 'tw-text-slate-500 dark:tw-text-slate-400' : ''}`}>{triggerText}</span>
        <span aria-hidden="true" className="tw-text-xs">▾</span>
      </button>

      {open && (
        <div
          role="group"
          aria-labelledby={`${id}-label`}
          className="tw-absolute tw-start-0 tw-top-full tw-z-30 tw-mt-1 tw-w-72 tw-rounded-xl tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-bg-white dark:tw-bg-slate-900 tw-p-2 tw-shadow-lg"
        >
          {showSearch && (
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              autoFocus
              className="tw-mb-2 tw-w-full tw-rounded-lg tw-border tw-border-slate-300 dark:tw-border-slate-600 tw-px-2 tw-py-1 tw-text-sm tw-font-normal tw-text-slate-900 dark:tw-bg-slate-800 dark:tw-text-slate-100"
            />
          )}
          <ul className="tw-max-h-60 tw-space-y-0.5 tw-overflow-y-auto">
            <li>
              <label className="tw-flex tw-cursor-pointer tw-items-center tw-gap-2 tw-rounded-lg tw-px-2 tw-py-1 tw-font-normal hover:tw-bg-slate-100 dark:hover:tw-bg-slate-800">
                <input type="checkbox" checked={selected.length === 0} onChange={() => onChange([])} />
                <span>{allLabel}</span>
              </label>
            </li>
            {visible.map((option) => (
              <li key={option.id}>
                <label className="tw-flex tw-cursor-pointer tw-items-center tw-gap-2 tw-rounded-lg tw-px-2 tw-py-1 tw-font-normal hover:tw-bg-slate-100 dark:hover:tw-bg-slate-800">
                  <input type="checkbox" checked={selectedSet.has(String(option.id))} onChange={() => toggle(option.id)} />
                  <span className="tw-truncate">{option.label}</span>
                  {option.note && <span className="tw-ms-auto tw-shrink-0 tw-text-xs tw-text-slate-500 dark:tw-text-slate-400">{option.note}</span>}
                </label>
              </li>
            ))}
            {visible.length === 0 && <li className="tw-px-2 tw-py-1 tw-text-xs tw-font-normal tw-text-slate-500 dark:tw-text-slate-400">{noResultsLabel}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
