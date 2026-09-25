import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import ImportPreviewModal from './ImportPreviewModal';
import { resolveClockifyMapping, executeClockifyImport } from '../../api/timeflowApi';

vi.mock('../../api/timeflowApi', () => ({
  listActiveUsers: vi.fn(),
  getProjects: vi.fn(),
  listUserGroups: vi.fn(),
  listActiveThirdParties: vi.fn(),
  resolveClockifyMapping: vi.fn(),
  executeClockifyImport: vi.fn(),
}));
const api = await import('../../api/timeflowApi');

const T = (key, params) => i18n.t(`processed_history.import.${key}`, params);

const pendingUser = (email, extra = {}) => ({
  mapping_type: 'user', source_value: email, target_action: 'create_pending', target_id: null,
  email_valid: true, display_name: 'Nina Test', suggested_login: 'nina.test', suggested_firstname: 'Nina', suggested_lastname: 'Test', ...extra,
});
const pending = (type, value) => ({ mapping_type: type, source_value: value, target_action: 'create_pending', target_id: null });
const matched = (type, value, id = 1) => ({ mapping_type: type, source_value: value, target_action: 'matched', target_id: id });

function makeData(over = {}) {
  return {
    total_rows: 10, blocked_rows: 4, skipped_rows: 0,
    users: [pendingUser('nina@example.test'), matched('user', 'old@example.test', 3)],
    projects: [pending('project', 'Projet P')],
    groups: [pending('group', 'Groupe G')],
    clients: [pending('client', 'Client C')],
    can_create_users: true,
    ...over,
  };
}

function renderModal(data, props = {}) {
  return render(<ImportPreviewModal open loading={false} error="" data={data} file={new File(['x'], 'x.csv')} onClose={() => {}} {...props} />);
}
const rowFor = (text) => screen.getByText(text).closest('li');
const resolveBtn = () => screen.getByRole('button', { name: T('resolve_button') });

beforeEach(async () => {
  await i18n.changeLanguage('fr');
  api.listActiveUsers.mockReset().mockResolvedValue([{ id: 3, label: 'alex' }, { id: 4, label: 'knicole' }]);
  api.getProjects.mockReset().mockResolvedValue([{ id: 10, title: 'Projet existant' }]);
  api.listUserGroups.mockReset().mockResolvedValue([{ id: 20, title: 'Groupe existant' }]);
  api.listActiveThirdParties.mockReset().mockResolvedValue([{ id: 30, title: 'Client existant' }]);
  resolveClockifyMapping.mockReset().mockImplementation(async (decisions) => decisions.map((d) => ({
    mapping_type: d.mapping_type, source_value: d.source_value, source_system: 'clockify',
    target_id: d.resolution === 'matched' ? d.target_id : null,
    target_action: d.resolution === 'matched' ? 'matched' : 'create_confirmed',
    new_label: d.resolution === 'create_new'
      ? (d.mapping_type === 'user' ? JSON.stringify({ login: d.new_login, firstname: d.new_firstname, lastname: d.new_lastname }) : d.new_title)
      : null,
  })));
  executeClockifyImport.mockReset();
});
afterEach(cleanup);

// ---------------------------------------------------------------------------
// Behaviour that existed BEFORE user creation and must not change.
// ---------------------------------------------------------------------------
describe('ImportPreviewModal — projects, groups, clients and existing-user mapping (unchanged behaviour)', () => {
  it('a pending project can be resolved by picking an existing one', async () => {
    const user = userEvent.setup();
    renderModal(makeData({ users: [], groups: [], clients: [] }));
    const li = rowFor('Projet P');
    await waitFor(() => expect(within(li).getByRole('option', { name: 'Projet existant' })).toBeInTheDocument());
    await user.selectOptions(within(li).getByRole('combobox'), '10');
    await user.click(resolveBtn());
    await waitFor(() => expect(resolveClockifyMapping).toHaveBeenCalledTimes(1));
    expect(resolveClockifyMapping).toHaveBeenCalledWith([{ mapping_type: 'project', source_value: 'Projet P', resolution: 'matched', target_id: 10 }]);
  });

  it('"create automatically" on a project / group / client sends a create_new decision with the editable title', async () => {
    const user = userEvent.setup();
    renderModal(makeData({ users: [] }));
    for (const [value, label] of [['Projet P', 'create_new_project_checkbox'], ['Groupe G', 'create_new_group_checkbox'], ['Client C', 'create_new_client_checkbox']]) {
      await user.click(within(rowFor(value)).getByRole('checkbox', { name: T(label) }));
    }
    const titleInput = within(rowFor('Projet P')).getByRole('textbox');
    expect(titleInput).toHaveValue('Projet P');
    await user.clear(titleInput);
    await user.type(titleInput, 'Projet renommé');
    await user.click(resolveBtn());
    await waitFor(() => expect(resolveClockifyMapping).toHaveBeenCalledTimes(1));
    expect(resolveClockifyMapping.mock.calls[0][0]).toEqual([
      { mapping_type: 'project', source_value: 'Projet P', resolution: 'create_new', new_title: 'Projet renommé' },
      { mapping_type: 'group', source_value: 'Groupe G', resolution: 'create_new', new_title: 'Groupe G' },
      { mapping_type: 'client', source_value: 'Client C', resolution: 'create_new', new_title: 'Client C' },
    ]);
  });

  it('a pending user is still resolved by picking an existing active account', async () => {
    const user = userEvent.setup();
    renderModal(makeData({ projects: [], groups: [], clients: [], can_create_users: false }));
    const li = rowFor('nina@example.test');
    await waitFor(() => expect(within(li).getByRole('option', { name: 'alex' })).toBeInTheDocument());
    await user.selectOptions(within(li).getByRole('combobox'), '3');
    await user.click(resolveBtn());
    await waitFor(() => expect(resolveClockifyMapping).toHaveBeenCalledTimes(1));
    expect(resolveClockifyMapping).toHaveBeenCalledWith([{ mapping_type: 'user', source_value: 'nina@example.test', resolution: 'matched', target_id: 3 }]);
  });

  it('submitting with nothing chosen shows the "select something" error and calls no API', async () => {
    const user = userEvent.setup();
    renderModal(makeData());
    await user.click(resolveBtn());
    expect(await screen.findByText(T('selection_required'))).toBeInTheDocument();
    expect(resolveClockifyMapping).not.toHaveBeenCalled();
  });

  it('already-matched rows show their badge and no controls', () => {
    renderModal(makeData());
    const li = rowFor('old@example.test');
    expect(within(li).queryByRole('combobox')).toBeNull();
    expect(within(li).getByText(T('status.matched'))).toBeInTheDocument();
  });

  it('once everything is resolved: recap (no user line when no account is created) -> confirm -> report', async () => {
    const user = userEvent.setup();
    executeClockifyImport.mockResolvedValue({
      clients_created: [], projects_created: [{ id: 1 }], groups_created: [], group_memberships_created: 2, project_contacts_created: 1,
      user_emails_filled: 0, user_names_filled: 0, time_entries_created: 7, time_entries_skipped_unresolved: 1, time_entries_skipped_invalid: 0,
      time_entries_skipped_already_imported: 0, unresolved_rows: [], errors: [],
    });
    renderModal(makeData({ users: [], groups: [], clients: [], projects: [pending('project', 'Projet P')] }));
    await user.click(within(rowFor('Projet P')).getByRole('checkbox', { name: T('create_new_project_checkbox') }));
    await user.click(resolveBtn());
    await user.click(await screen.findByRole('button', { name: T('execute_button') }));
    expect(await screen.findByText(T('confirm_recap_title'))).toBeInTheDocument();
    expect(screen.getByText(T('confirm_recap_projects', { count: 1 }))).toBeInTheDocument();
    expect(screen.queryByText(T('confirm_recap_users_note'))).toBeNull();
    await user.click(screen.getByRole('button', { name: T('confirm_execute_button') }));
    expect(await screen.findByText(T('execute_done_title'))).toBeInTheDocument();
    expect(screen.getByText(T('execute_result_entries', { count: 7 }))).toBeInTheDocument();
    expect(screen.getByText(T('execute_result_skipped_unresolved', { count: 1 }))).toBeInTheDocument();
    expect(screen.queryByText(T('execute_result_users', { count: 1 }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// New: creating a Dolibarr account from an unknown Clockify email.
// ---------------------------------------------------------------------------
describe('ImportPreviewModal — automatic user creation', () => {
  const box = (li) => within(li).queryByRole('checkbox', { name: T('create_new_user_checkbox') });

  it('offers the checkbox; checking it hides the account picker and shows the proposed login / first / last name', async () => {
    const user = userEvent.setup();
    renderModal(makeData({ projects: [], groups: [], clients: [] }));
    const li = rowFor('nina@example.test');
    expect(within(li).getByRole('combobox')).toBeInTheDocument();
    await user.click(box(li));
    expect(within(li).queryByRole('combobox')).toBeNull();
    expect(within(li).getByRole('textbox', { name: T('new_user_login_label') })).toHaveValue('nina.test');
    expect(within(li).getByRole('textbox', { name: T('new_user_firstname_label') })).toHaveValue('Nina');
    expect(within(li).getByRole('textbox', { name: T('new_user_lastname_label') })).toHaveValue('Test');
    expect(within(li).getByText(T('create_user_info', { email: 'nina@example.test' }))).toBeInTheDocument();
    await user.click(box(li));
    expect(within(li).getByRole('combobox')).toBeInTheDocument();
  });

  it('sends a create_new decision with the edited, trimmed identity', async () => {
    const user = userEvent.setup();
    renderModal(makeData({ projects: [], groups: [], clients: [] }));
    const li = rowFor('nina@example.test');
    await user.click(box(li));
    const login = within(li).getByRole('textbox', { name: T('new_user_login_label') });
    await user.clear(login);
    await user.type(login, '  nina.t  ');
    const last = within(li).getByRole('textbox', { name: T('new_user_lastname_label') });
    await user.clear(last);
    await user.type(last, 'Testeur');
    await user.click(resolveBtn());
    await waitFor(() => expect(resolveClockifyMapping).toHaveBeenCalledTimes(1));
    expect(resolveClockifyMapping).toHaveBeenCalledWith([
      { mapping_type: 'user', source_value: 'nina@example.test', resolution: 'create_new', new_login: 'nina.t', new_firstname: 'Nina', new_lastname: 'Testeur' },
    ]);
  });

  it('a mixed batch (user creation + project creation + existing group) is sent in one call', async () => {
    const user = userEvent.setup();
    renderModal(makeData({ clients: [] }));
    await user.click(box(rowFor('nina@example.test')));
    await user.click(within(rowFor('Projet P')).getByRole('checkbox', { name: T('create_new_project_checkbox') }));
    await waitFor(() => expect(within(rowFor('Groupe G')).getByRole('option', { name: 'Groupe existant' })).toBeInTheDocument());
    await user.selectOptions(within(rowFor('Groupe G')).getByRole('combobox'), '20');
    await user.click(resolveBtn());
    await waitFor(() => expect(resolveClockifyMapping).toHaveBeenCalledTimes(1));
    const decisions = resolveClockifyMapping.mock.calls[0][0];
    expect(decisions.map((d) => `${d.mapping_type}:${d.resolution}`)).toEqual(['user:create_new', 'project:create_new', 'group:matched']);
  });

  it('a user who may NOT create accounts sees no checkbox, and is told why', () => {
    renderModal(makeData({ can_create_users: false, projects: [], groups: [], clients: [] }));
    const li = rowFor('nina@example.test');
    expect(box(li)).toBeNull();
    expect(within(li).getByText(T('create_user_not_allowed'))).toBeInTheDocument();
    expect(within(li).getByRole('combobox')).toBeInTheDocument();
  });

  it('an older server that does not say who may create accounts: no checkbox, no false claim', () => {
    const data = makeData({ projects: [], groups: [], clients: [] });
    delete data.can_create_users;
    renderModal(data);
    const li = rowFor('nina@example.test');
    expect(box(li)).toBeNull();
    expect(within(li).queryByText(T('create_user_not_allowed'))).toBeNull();
  });

  it('an invalid email cannot be turned into an account', () => {
    renderModal(makeData({ users: [pendingUser('not-an-email', { email_valid: false })], projects: [], groups: [], clients: [] }));
    const li = rowFor('not-an-email');
    expect(box(li)).toBeNull();
    expect(within(li).getByText(T('create_user_invalid_email'))).toBeInTheDocument();
  });

  it('an email that belongs to a DISABLED account: explicit warning naming it, no creation offered, existing mapping still possible', async () => {
    const user = userEvent.setup();
    renderModal(makeData({ users: [pendingUser('gone@example.test', { warning: 'disabled_account', disabled_login: 'ex_employee' })], projects: [], groups: [], clients: [] }));
    const li = rowFor('gone@example.test');
    expect(within(li).getByRole('alert')).toHaveTextContent(T('disabled_account_warning', { login: 'ex_employee' }));
    expect(box(li)).toBeNull();
    await waitFor(() => expect(within(li).getByRole('option', { name: 'alex' })).toBeInTheDocument());
    await user.selectOptions(within(li).getByRole('combobox'), '4');
    await user.click(resolveBtn());
    await waitFor(() => expect(resolveClockifyMapping).toHaveBeenCalledWith([{ mapping_type: 'user', source_value: 'gone@example.test', resolution: 'matched', target_id: 4 }]));
  });

  it('a refusal from the server (e.g. 403 or a taken login) is shown and the form keeps what was typed', async () => {
    const user = userEvent.setup();
    resolveClockifyMapping.mockRejectedValue(new Error('L’identifiant « nina.test » est déjà pris (décision à l’index 0).'));
    renderModal(makeData({ projects: [], groups: [], clients: [] }));
    const li = rowFor('nina@example.test');
    await user.click(box(li));
    await user.click(resolveBtn());
    expect(await screen.findByText(/déjà pris/)).toBeInTheDocument();
    expect(within(li).getByRole('textbox', { name: T('new_user_login_label') })).toHaveValue('nina.test');
  });

  it('after confirmation the row shows the account to be created; the recap lists it with the basic-rights note; the report shows each email outcome', async () => {
    const user = userEvent.setup();
    executeClockifyImport.mockResolvedValue({
      users_created: [
        { source_value: 'nina@example.test', id: 11, login: 'nina.test', email_sent: true, email_error: null },
        { source_value: 'b@example.test', id: 12, login: 'bob', email_sent: false, email_error: 'mail_disabled' },
        { source_value: 'c@example.test', id: 13, login: 'carl', email_sent: false, email_error: 'SMTP down' },
      ],
      group_memberships_withheld: [{ user: 'nina@example.test', group: 'Administration', reason: 'group_has_extra_rights' }],
      clients_created: [], projects_created: [], groups_created: [], group_memberships_created: 0, project_contacts_created: 0, user_emails_filled: 0, user_names_filled: 0,
      time_entries_created: 3, time_entries_skipped_unresolved: 0, time_entries_skipped_invalid: 0, time_entries_skipped_already_imported: 0, unresolved_rows: [],
      errors: [{ type: 'user', source_value: 'd@example.test', message: 'Un compte existe déjà pour cet email (« dan »).' }],
    });
    renderModal(makeData({ projects: [], groups: [], clients: [] }));
    const li = rowFor('nina@example.test');
    await user.click(box(li));
    await user.click(resolveBtn());
    await waitFor(() => expect(within(rowFor('nina@example.test')).getByText(T('user_to_create_summary', { login: 'nina.test', name: 'Nina Test' }))).toBeInTheDocument());
    expect(within(rowFor('nina@example.test')).getByText(T('status.create_confirmed'))).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: T('execute_button') }));
    expect(await screen.findByText(T('confirm_recap_users', { count: 1 }))).toBeInTheDocument();
    expect(screen.getByText(/nina\.test — nina@example\.test/)).toBeInTheDocument();
    expect(screen.getByText(T('confirm_recap_users_note'))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: T('confirm_execute_button') }));
    expect(await screen.findByText(T('execute_result_users', { count: 3 }))).toBeInTheDocument();
    expect(screen.getByText(T('execute_result_user_email_sent', { login: 'nina.test', email: 'nina@example.test' }))).toBeInTheDocument();
    expect(screen.getByText(T('execute_result_user_email_mail_disabled', { login: 'bob' }))).toBeInTheDocument();
    expect(screen.getByText(T('execute_result_user_email_failed', { login: 'carl', reason: 'SMTP down' }))).toBeInTheDocument();
    expect(screen.getByText(T('execute_result_groups_withheld', { count: 1 }))).toBeInTheDocument();
    expect(screen.getByText('nina@example.test → Administration')).toBeInTheDocument();
    expect(screen.getByText(T('execute_result_user_error', { email: 'd@example.test', message: 'Un compte existe déjà pour cet email (« dan »).' }))).toBeInTheDocument();
  });

  it('a "created" account counts as resolved (badge shown, nothing pending)', () => {
    renderModal(makeData({ users: [{ mapping_type: 'user', source_value: 'made@example.test', target_action: 'created', target_id: 12 }], projects: [], groups: [], clients: [] }));
    expect(within(rowFor('made@example.test')).getByText(T('status.created'))).toBeInTheDocument();
    expect(screen.getByText(T('ready_message'))).toBeInTheDocument();
  });

  it('works in Arabic (rtl): labels and the checkbox render, the login field stays left-to-right', async () => {
    await i18n.changeLanguage('ar');
    const user = userEvent.setup();
    renderModal(makeData({ projects: [], groups: [], clients: [] }));
    const li = rowFor('nina@example.test');
    await user.click(within(li).getByRole('checkbox', { name: T('create_new_user_checkbox') }));
    expect(T('create_new_user_checkbox')).toMatch(/[؀-ۿ]/);
    expect(within(li).getByRole('textbox', { name: T('new_user_login_label') })).toHaveAttribute('dir', 'ltr');
  });
});

describe('the new user-creation texts', () => {
  const NEW_KEYS = [
    'status.created', 'create_new_user_checkbox', 'new_user_login_label', 'new_user_firstname_label', 'new_user_lastname_label', 'create_user_info',
    'create_user_not_allowed', 'create_user_invalid_email', 'disabled_account_warning', 'user_to_create_summary', 'confirm_recap_users_note',
    'execute_result_user_email_sent', 'execute_result_user_email_mail_disabled', 'execute_result_user_email_failed', 'execute_result_user_error',
  ];
  const PLURALS = ['confirm_recap_users', 'execute_result_users', 'execute_result_groups_withheld'];

  it.each(['fr', 'en', 'de', 'ar'])('%s has every key, with the same placeholders as French', async (lang) => {
    const fr = await import('../../locales/fr/translation.json');
    const other = await import(`../../locales/${lang}/translation.json`);
    const get = (dict, key) => key.split('.').reduce((o, k) => o?.[k], dict.default.processed_history.import);
    const placeholders = (s) => [...String(s).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join(',');
    for (const key of NEW_KEYS) {
      const value = get(other, key);
      expect(value, `${lang}:${key}`).toBeTruthy();
      expect(placeholders(value), `${lang}:${key} placeholders`).toBe(placeholders(get(fr, key)));
    }
    const forms = lang === 'ar' ? ['zero', 'one', 'two', 'few', 'many', 'other'] : ['one', 'other'];
    for (const base of PLURALS) {
      for (const form of forms) expect(get(other, `${base}_${form}`), `${lang}:${base}_${form}`).toBeTruthy();
    }
  });
});
