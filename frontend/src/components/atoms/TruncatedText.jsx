// Shared truncation for free-text user input (note, description, comment...)
// shown inside a table cell. Table cells default to auto-layout, which sizes
// a column to fit its widest content — a `max-w-[…]` alone on the <td> does
// NOT cap that when the text has no spaces to wrap on (e.g. a long pasted
// string of repeated characters), because there is no break opportunity for
// the browser to use. `tw-truncate` (overflow:hidden + text-overflow:ellipsis
// + white-space:nowrap) needs a bounded box to clip against, so the caller's
// <td> must also carry a `tw-max-w-[…]` — this component only owns the
// span-level truncation + hover tooltip, consistent with the existing
// "Utilisateurs assignés" column pattern (see ReportsPage.jsx).
export default function TruncatedText({ text = '', className = '' }) {
  const value = text || '';
  return (
    <span title={value || undefined} className={`tw-block tw-truncate ${className}`}>
      {value}
    </span>
  );
}
