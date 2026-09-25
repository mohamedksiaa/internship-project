import { describe, expect, it } from 'vitest';
import { canOfferUserCreation, defaultUserChoice, readConfirmedIdentity } from './importUsers';

describe('readConfirmedIdentity', () => {
  it('reads the already-split fields of a preview row', () => {
    expect(readConfirmedIdentity({ new_login: 'jd', new_firstname: 'Jane', new_lastname: 'Doe' })).toEqual({ login: 'jd', firstname: 'Jane', lastname: 'Doe' });
  });
  it('reads the JSON the resolve endpoint answers with (new_label)', () => {
    expect(readConfirmedIdentity({ new_label: '{"login":"jd","firstname":"Jane","lastname":"Doe"}' })).toEqual({ login: 'jd', firstname: 'Jane', lastname: 'Doe' });
  });
  it('tolerates a missing first name', () => {
    expect(readConfirmedIdentity({ new_label: '{"login":"jd","lastname":"Doe"}' })).toEqual({ login: 'jd', firstname: '', lastname: 'Doe' });
  });
  it.each([[undefined], [null], [{}], [{ new_label: null }], [{ new_label: 'not json' }], [{ new_label: '{"firstname":"x"}' }], [{ new_label: '"just a string"' }], [{ new_label: 'Projet renommé' }]])('returns null when there is no identity (%j)', (row) => {
    expect(readConfirmedIdentity(row)).toBeNull();
  });
});

describe('defaultUserChoice', () => {
  it('starts on "existing account" with the server proposal', () => {
    expect(defaultUserChoice({ suggested_login: 'a.b', suggested_firstname: 'A', suggested_lastname: 'B' })).toEqual({ mode: 'existing', targetId: '', login: 'a.b', firstname: 'A', lastname: 'B' });
  });
  it('is safe without a row or without proposal', () => {
    expect(defaultUserChoice(undefined)).toEqual({ mode: 'existing', targetId: '', login: '', firstname: '', lastname: '' });
  });
});

describe('canOfferUserCreation', () => {
  const ok = { email_valid: true };
  it('needs the right, a valid email and no disabled account', () => {
    expect(canOfferUserCreation(ok, true)).toBe(true);
    expect(canOfferUserCreation({}, true)).toBe(true); // email_valid absent: the server decides
    expect(canOfferUserCreation(ok, false)).toBe(false);
    expect(canOfferUserCreation(ok, undefined)).toBe(false);
    expect(canOfferUserCreation(ok, 'true')).toBe(false);
    expect(canOfferUserCreation({ email_valid: false }, true)).toBe(false);
    expect(canOfferUserCreation({ email_valid: true, warning: 'disabled_account' }, true)).toBe(false);
  });
});
