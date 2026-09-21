// "group" is deliberately never part of this list: an employee can belong to
// several groups at once, so a duration can land in more than one group
// bucket — stacking it (as either axis) would make a bar's segments sum to
// more than its real total. It stays available only as a single dimension.
const CROSSABLE_DIMENSIONS = ['project', 'employee', 'client', 'billable'];

// A user without the readall right only ever receives their own entries (the
// backend scopes getSummaryReports to them), so crossing by "Employé" is a
// single bar segment and a per-client breakdown is not something they need.
// UI adaptation only — the data is already restricted server-side.
const TEAM_ONLY_CROSS_DIMENSIONS = ['employee', 'client'];

export function crossableDimensionsFor(canReadAll) {
  return canReadAll
    ? CROSSABLE_DIMENSIONS
    : CROSSABLE_DIMENSIONS.filter((dim) => !TEAM_ONLY_CROSS_DIMENSIONS.includes(dim));
}

// What the "Croiser avec" value really is, whatever ?crossWith says: a stale
// or hand-edited URL asking for a crossing this user is not offered resolves
// to "none". DashboardPage uses the same function for its CSV/PDF export, so
// the export can never cross by something the selector would not show.
export function effectiveCrossWith(crossWith, canReadAll) {
  return crossWith !== 'none' && crossableDimensionsFor(canReadAll).includes(crossWith) ? crossWith : 'none';
}
