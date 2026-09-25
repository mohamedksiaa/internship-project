/**
 * Identity stored by the server for a user whose creation was confirmed: either
 * already split into new_login / new_firstname / new_lastname (preview rows), or
 * as JSON in new_label (the row the resolve endpoint answers with).
 */
export function readConfirmedIdentity(row) {
  if (row?.new_login) {
    return { login: row.new_login, firstname: row.new_firstname || '', lastname: row.new_lastname || '' };
  }
  try {
    const parsed = JSON.parse(row?.new_label ?? '');
    if (parsed && typeof parsed === 'object' && parsed.login) {
      return { login: String(parsed.login), firstname: String(parsed.firstname ?? ''), lastname: String(parsed.lastname ?? '') };
    }
  } catch {
    // not an identity (or not JSON): nothing to show
  }
  return null;
}

/** What the form starts with for a pending row: the server's proposal, which the admin may edit. */
export function defaultUserChoice(row) {
  return {
    mode: 'existing',
    targetId: '',
    login: row?.suggested_login ?? '',
    firstname: row?.suggested_firstname ?? '',
    lastname: row?.suggested_lastname ?? '',
  };
}

/** May this pending row offer "create this user"? Everything is enforced again server-side. */
export function canOfferUserCreation(row, canCreateUsers) {
  return canCreateUsers === true && row.email_valid !== false && row.warning !== 'disabled_account';
}
