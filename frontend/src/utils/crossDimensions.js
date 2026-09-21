// Primary "Dimension" choices of the Dashboard's custom chart.
const DIMENSIONS = ['project', 'employee', 'client', 'billable'];

// "group" is deliberately never part of this list: an employee can belong to
// several groups at once, so a duration can land in more than one group
// bucket — stacking it (as either axis) would make a bar's segments sum to
// more than its real total. It stays available only as a single dimension.
const CROSSABLE_DIMENSIONS = ['project', 'employee', 'client', 'billable'];

// A user without the readall right only ever receives their own entries (the
// backend scopes getSummaryReports to them), so "Employé" is a single value
// (themselves) and a per-client breakdown is not something they need. Applies
// to both selectors ("Dimension" and "Croiser avec"), for consistency.
// UI adaptation only — the data is already restricted server-side.
const TEAM_ONLY_DIMENSIONS = ['employee', 'client'];

function withoutTeamOnly(list, canReadAll) {
  return canReadAll ? list : list.filter((dim) => !TEAM_ONLY_DIMENSIONS.includes(dim));
}

export function selectableDimensionsFor(canReadAll) {
  return withoutTeamOnly(DIMENSIONS, canReadAll);
}

export function crossableDimensionsFor(canReadAll) {
  return withoutTeamOnly(CROSSABLE_DIMENSIONS, canReadAll);
}

// What the "Dimension" value really is, whatever ?dimension says: an unknown
// value (e.g. the long-removed "group"), or one this user is not offered,
// resolves to "project".
export function effectiveDimension(dimension, canReadAll) {
  return selectableDimensionsFor(canReadAll).includes(dimension) ? dimension : 'project';
}

// What the "Croiser avec" value really is, whatever ?crossWith says: a
// crossing this user is not offered, an unknown value, or the same dimension as
// the primary one (crossing something with itself), resolves to "none".
// Pass the EFFECTIVE primary dimension as the third argument.
//
// DashboardPage uses the same functions for its CSV/PDF export, so the export
// can never show something the selectors would not.
export function effectiveCrossWith(crossWith, canReadAll, dimension) {
  if (crossWith === 'none' || crossWith === dimension) {
    return 'none';
  }
  return crossableDimensionsFor(canReadAll).includes(crossWith) ? crossWith : 'none';
}
