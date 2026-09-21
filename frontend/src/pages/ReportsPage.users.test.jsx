import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import ReportsPage from './ReportsPage';
import { downloadCsv } from '../utils/csvExport.js';

// Reports > Utilisateurs: the "Présence" column, the day picker, and the
// expected-absence actions. The rest of the Reports page is covered by
// ReportsPage.test.jsx.
const {
  getProjects,
  getProcessedHistory,
  getDailyReports,
  getMyDailyReports,
  exportProcessedHistory,
  getTimeFlowProjects,
  getUsersPresence,
  saveExpectedAbsence,
  deleteExpectedAbsence,
  listActiveThirdParties,
  listActiveUsers,
} = vi.hoisted(() => ({
  getProjects: vi.fn(),
  getProcessedHistory: vi.fn(),
  getDailyReports: vi.fn(),
  getMyDailyReports: vi.fn(),
  exportProcessedHistory: vi.fn(),
  getTimeFlowProjects: vi.fn(),
  getUsersPresence: vi.fn(),
  saveExpectedAbsence: vi.fn(),
  deleteExpectedAbsence: vi.fn(),
  listActiveThirdParties: vi.fn(),
  listActiveUsers: vi.fn(),
}));

vi.mock('../api/timeflowApi', () => ({
  getProjects,
  getProcessedHistory,
  getDailyReports,
  getMyDailyReports,
  exportProcessedHistory,
  getTimeFlowProjects,
  getUsersPresence,
  saveExpectedAbsence,
  deleteExpectedAbsence,
  listActiveThirdParties,
  listActiveUsers,
}));
vi.mock('../utils/csvExport.js', () => ({ downloadCsv: vi.fn() }));

const DAY = '2026-09-19';
const userRow = (id, label, presence) => ({
  id, label, email: `${label.toLowerCase().replace(/\s/g, '.')}@example.com`, office_phone: '', user_mobile: '', groups: [], presence,
});
const presence = (status, reason_type = null) => ({ status, reason_type, source: reason_type ? 'manual' : null });
const response = (rows, overrides = {}) => ({
  rows,
  pagination: { page: 1, per_page: 20, total: rows.length, pages: 1 },
  date: DAY,
  today: '2026-09-21',
  absencesAvailable: true,
  ...overrides,
});
const team = () => [
  userRow(1, 'Alice Martin', presence('present')),
  userRow(2, 'Bob Durand', presence('absent')),
  userRow(3, 'Chloé Petit', presence('expected_absence', 'rtt')),
  userRow(4, 'Dan Vidal', presence('none')),
];

function Loc() {
  return <div data-testid="loc">{useLocation().search}</div>;
}
function renderUsersTab(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/?tab=users${search}`]}>
      <ReportsPage />
      <Loc />
    </MemoryRouter>,
  );
}
const url = () => screen.getByTestId('loc').textContent;
const rowOf = (name) => screen.getByText(name).closest('tr');
const setFlags = ({ readall = true, validate = false }) => {
  window.TIMEFLOW_CAN_READALL = readall;
  window.TIMEFLOW_CAN_VALIDATE = validate;
};

describe('ReportsPage — Utilisateurs tab: presence', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
    setFlags({ readall: true, validate: false });
    getProjects.mockReset().mockResolvedValue([]);
    getProcessedHistory.mockReset().mockResolvedValue({ rows: [], pagination: { page: 1, pages: 1 }, stats: { validated_count: 0, refused_count: 0, manual_count: 0 } });
    getDailyReports.mockReset().mockResolvedValue({ reports: [], employees: [] });
    getMyDailyReports.mockReset().mockResolvedValue({ reports: [], employees: [] });
    exportProcessedHistory.mockReset().mockResolvedValue([]);
    getTimeFlowProjects.mockReset().mockResolvedValue({ rows: [], pagination: { page: 1, per_page: 20, total: 0, pages: 1 } });
    listActiveThirdParties.mockReset().mockResolvedValue([]);
    listActiveUsers.mockReset().mockResolvedValue([]);
    getUsersPresence.mockReset().mockResolvedValue(response(team()));
    saveExpectedAbsence.mockReset().mockResolvedValue({});
    deleteExpectedAbsence.mockReset().mockResolvedValue({});
    downloadCsv.mockClear();
  });
  afterEach(() => {
    cleanup();
    delete window.TIMEFLOW_CAN_READALL;
    delete window.TIMEFLOW_CAN_VALIDATE;
  });

  it('adds a "Présence" column right after the name, with one badge per status (green / red / blue / neutral dash)', async () => {
    renderUsersTab();
    await screen.findByText('Alice Martin');

    // readall only: no Actions column
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Nom / Prénom', 'Présence', 'Email', 'Téléphone', 'Groupe(s)']);

    const statusIn = (name) => rowOf(name).querySelector('[data-presence-status]');
    expect(statusIn('Alice Martin')).toHaveTextContent('Présent');
    expect(statusIn('Alice Martin').className).toContain('tw-bg-emerald-50');
    expect(statusIn('Bob Durand')).toHaveTextContent('Absent');
    expect(statusIn('Bob Durand').className).toContain('tw-bg-rose-50');
    expect(statusIn('Chloé Petit')).toHaveTextContent('Absence prévue · RTT');
    expect(statusIn('Chloé Petit').className).toContain('tw-bg-sky-50');
    expect(statusIn('Dan Vidal')).toHaveAttribute('aria-label', 'Non applicable');
    expect(statusIn('Dan Vidal').textContent).toBe('—');
  });

  it('asks for "today" (server side) first and shows the day the server actually computed', async () => {
    renderUsersTab();
    await screen.findByText('Alice Martin');
    expect(getUsersPresence).toHaveBeenCalledWith('', 1, 20);
    expect(screen.getByLabelText('Date')).toHaveValue(DAY);
    expect(screen.queryByRole('button', { name: i18n.t('users_report.presence.today_button') })).toBeNull();
  });

  it('changing the date re-fetches that day, keeps it in the URL, and offers a way back to today', async () => {
    const user = userEvent.setup();
    renderUsersTab();
    await screen.findByText('Alice Martin');

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-15' } });
    await waitFor(() => expect(getUsersPresence).toHaveBeenLastCalledWith('2026-09-15', 1, 20));
    expect(url()).toBe('?tab=users&presenceDate=2026-09-15');

    getUsersPresence.mockClear();
    await user.click(await screen.findByRole('button', { name: i18n.t('users_report.presence.today_button') }));
    await waitFor(() => expect(getUsersPresence).toHaveBeenLastCalledWith('', 1, 20));
    expect(url()).toBe('?tab=users');
  });

  it('restores the day from a shared link, and ignores a forged or malformed ?presenceDate=', async () => {
    renderUsersTab('&presenceDate=2026-09-10');
    await screen.findByText('Alice Martin');
    expect(getUsersPresence).toHaveBeenCalledWith('2026-09-10', 1, 20);
    cleanup();

    getUsersPresence.mockClear();
    renderUsersTab('&presenceDate=2026-02-30%27%20OR%201=1');
    await screen.findByText('Alice Martin');
    expect(getUsersPresence).toHaveBeenCalledTimes(1);
    expect(getUsersPresence).toHaveBeenCalledWith('', 1, 20);
    cleanup();

    getUsersPresence.mockClear();
    renderUsersTab('&presenceDate=garbage');
    await screen.findByText('Alice Martin');
    expect(getUsersPresence).toHaveBeenCalledWith('', 1, 20);
  });

  it('shows an error when the request fails (no silent empty table)', async () => {
    getUsersPresence.mockRejectedValueOnce(new Error('Erreur SQL: boom'));
    renderUsersTab();
    expect(await screen.findByText('Erreur SQL: boom')).toBeInTheDocument();
  });

  it('a present user who still has a recorded absence keeps the green badge and shows a discreet note', async () => {
    getUsersPresence.mockResolvedValue(response([userRow(1, 'Alice Martin', presence('present', 'leave'))]));
    renderUsersTab();
    await screen.findByText('Alice Martin');
    expect(rowOf('Alice Martin').querySelector('[data-presence-status]')).toHaveAttribute('data-presence-status', 'present');
    expect(within(rowOf('Alice Martin')).getByText('Absence prévue enregistrée (Congé)')).toBeInTheDocument();
  });

  it('follows the language (English)', async () => {
    await i18n.changeLanguage('en');
    renderUsersTab();
    await screen.findByText('Alice Martin');
    expect(screen.getByRole('columnheader', { name: 'Presence' })).toBeInTheDocument();
    expect(rowOf('Chloé Petit')).toHaveTextContent('Expected absence · RTT');
  });
});

describe('ReportsPage — Utilisateurs tab: who can record an expected absence', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
    getProjects.mockReset().mockResolvedValue([]);
    getProcessedHistory.mockReset().mockResolvedValue({ rows: [], pagination: { page: 1, pages: 1 }, stats: { validated_count: 0, refused_count: 0, manual_count: 0 } });
    getDailyReports.mockReset().mockResolvedValue({ reports: [], employees: [] });
    getMyDailyReports.mockReset().mockResolvedValue({ reports: [], employees: [] });
    exportProcessedHistory.mockReset().mockResolvedValue([]);
    getTimeFlowProjects.mockReset().mockResolvedValue({ rows: [], pagination: { page: 1, per_page: 20, total: 0, pages: 1 } });
    listActiveThirdParties.mockReset().mockResolvedValue([]);
    listActiveUsers.mockReset().mockResolvedValue([]);
    getUsersPresence.mockReset().mockResolvedValue(response(team()));
    saveExpectedAbsence.mockReset().mockResolvedValue({});
    deleteExpectedAbsence.mockReset().mockResolvedValue({});
  });
  afterEach(() => {
    cleanup();
    delete window.TIMEFLOW_CAN_READALL;
    delete window.TIMEFLOW_CAN_VALIDATE;
  });

  it.each([
    ['readall without validate', { readall: true, validate: false }],
    ['validate without readall (cannot even reach the tab)', { readall: false, validate: true }],
  ])('%s: no Actions column, no button', async (_label, flags) => {
    setFlags(flags);
    renderUsersTab();
    if (flags.readall) await screen.findByText('Alice Martin');
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
    expect(screen.queryByRole('button', { name: /absence prévue pour/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retirer' })).toBeNull();
  });

  it('readall + validate: an Actions column with "Absence prévue" on free rows and Modifier / Retirer on recorded ones', async () => {
    setFlags({ readall: true, validate: true });
    renderUsersTab();
    await screen.findByText('Alice Martin');
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
    expect(within(rowOf('Bob Durand')).getByRole('button', { name: 'Marquer une absence prévue pour Bob Durand' })).toBeInTheDocument();
    expect(within(rowOf('Chloé Petit')).getByRole('button', { name: 'Modifier l’absence prévue de Chloé Petit' })).toBeInTheDocument();
    expect(within(rowOf('Chloé Petit')).getByRole('button', { name: 'Retirer l’absence prévue de Chloé Petit' })).toBeInTheDocument();
    expect(within(rowOf('Chloé Petit')).queryByRole('button', { name: /Marquer/ })).toBeNull();
  });

  it('records an expected absence: dialog prefilled with the shown day, request sent, table reloaded', async () => {
    setFlags({ readall: true, validate: true });
    const user = userEvent.setup();
    renderUsersTab();
    await screen.findByText('Alice Martin');

    await user.click(within(rowOf('Bob Durand')).getByRole('button', { name: /Marquer une absence prévue/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Bob Durand')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Date')).toHaveValue(DAY);

    await user.selectOptions(within(dialog).getByLabelText('Motif'), 'sick');
    getUsersPresence.mockClear();
    getUsersPresence.mockResolvedValue(response([userRow(2, 'Bob Durand', presence('expected_absence', 'sick'))]));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(saveExpectedAbsence).toHaveBeenCalledWith({ userId: 2, date: DAY, reasonType: 'sick' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(getUsersPresence).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Absence prévue · Maladie')).toBeInTheDocument();
  });

  it('the dialog date can be changed to plan another day, and that day is what is sent', async () => {
    setFlags({ readall: true, validate: true });
    const user = userEvent.setup();
    renderUsersTab();
    await screen.findByText('Alice Martin');
    await user.click(within(rowOf('Bob Durand')).getByRole('button', { name: /Marquer une absence prévue/ }));
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('Date'), { target: { value: '2026-10-02' } });
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(saveExpectedAbsence).toHaveBeenCalledWith({ userId: 2, date: '2026-10-02', reasonType: 'leave' }));
  });

  it('editing a recorded absence opens the dialog on its current reason', async () => {
    setFlags({ readall: true, validate: true });
    const user = userEvent.setup();
    renderUsersTab();
    await screen.findByText('Alice Martin');
    await user.click(within(rowOf('Chloé Petit')).getByRole('button', { name: /Modifier/ }));
    expect(within(screen.getByRole('dialog')).getByLabelText('Motif')).toHaveValue('rtt');
  });

  it('removes a recorded absence for the shown day and reloads', async () => {
    setFlags({ readall: true, validate: true });
    const user = userEvent.setup();
    renderUsersTab();
    await screen.findByText('Alice Martin');
    getUsersPresence.mockClear();
    await user.click(within(rowOf('Chloé Petit')).getByRole('button', { name: /Retirer/ }));
    await waitFor(() => expect(deleteExpectedAbsence).toHaveBeenCalledWith({ userId: 3, date: DAY }));
    await waitFor(() => expect(getUsersPresence).toHaveBeenCalledTimes(1));
  });

  it('a present user with a recorded absence can still have it removed', async () => {
    setFlags({ readall: true, validate: true });
    getUsersPresence.mockResolvedValue(response([userRow(1, 'Alice Martin', presence('present', 'leave'))]));
    renderUsersTab();
    await screen.findByText('Alice Martin');
    expect(within(rowOf('Alice Martin')).getByRole('button', { name: /Retirer/ })).toBeInTheDocument();
  });

  it('a refused save keeps the dialog open with the server message, and does not reload', async () => {
    setFlags({ readall: true, validate: true });
    saveExpectedAbsence.mockRejectedValueOnce(new Error('Utilisateur désactivé'));
    const user = userEvent.setup();
    renderUsersTab();
    await screen.findByText('Alice Martin');
    await user.click(within(rowOf('Bob Durand')).getByRole('button', { name: /Marquer une absence prévue/ }));
    getUsersPresence.mockClear();
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Utilisateur désactivé');
    expect(getUsersPresence).not.toHaveBeenCalled();
    // and it can be retried
    expect(screen.getByRole('button', { name: 'Enregistrer' })).not.toBeDisabled();
  });

  it('a refused removal shows the server message on the page', async () => {
    setFlags({ readall: true, validate: true });
    deleteExpectedAbsence.mockRejectedValueOnce(new Error('Accès refusé'));
    const user = userEvent.setup();
    renderUsersTab();
    await screen.findByText('Alice Martin');
    await user.click(within(rowOf('Chloé Petit')).getByRole('button', { name: /Retirer/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Accès refusé');
  });

  it('when the absences table does not exist yet: a warning, the badges still show, and no action is offered', async () => {
    setFlags({ readall: true, validate: true });
    getUsersPresence.mockResolvedValue(response(team().slice(0, 2), { absencesAvailable: false }));
    renderUsersTab();
    await screen.findByText('Alice Martin');
    expect(screen.getByText(i18n.t('users_report.presence.table_missing'))).toBeInTheDocument();
    expect(rowOf('Bob Durand').querySelector('[data-presence-status]')).toHaveTextContent('Absent');
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
    expect(screen.queryByRole('button', { name: /absence prévue pour/i })).toBeNull();
  });
});

describe('ReportsPage — Utilisateurs tab: CSV export', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
    setFlags({ readall: true, validate: true });
    getProjects.mockReset().mockResolvedValue([]);
    getProcessedHistory.mockReset().mockResolvedValue({ rows: [], pagination: { page: 1, pages: 1 }, stats: { validated_count: 0, refused_count: 0, manual_count: 0 } });
    getDailyReports.mockReset().mockResolvedValue({ reports: [], employees: [] });
    getMyDailyReports.mockReset().mockResolvedValue({ reports: [], employees: [] });
    exportProcessedHistory.mockReset().mockResolvedValue([]);
    getTimeFlowProjects.mockReset().mockResolvedValue({ rows: [], pagination: { page: 1, per_page: 20, total: 0, pages: 1 } });
    listActiveThirdParties.mockReset().mockResolvedValue([]);
    listActiveUsers.mockReset().mockResolvedValue([]);
    saveExpectedAbsence.mockReset();
    deleteExpectedAbsence.mockReset();
    downloadCsv.mockClear();
  });
  afterEach(() => {
    cleanup();
    delete window.TIMEFLOW_CAN_READALL;
    delete window.TIMEFLOW_CAN_VALIDATE;
  });

  it('exports every page for the day on screen, with the Présence column (and its date) and no action column', async () => {
    const all = team();
    getUsersPresence.mockReset().mockImplementation((date, pageNumber, perPage) => {
      if (perPage === 100) {
        // the export walks the pages of 100: two of them here
        return Promise.resolve(pageNumber === 1
          ? response(all.slice(0, 2), { pagination: { page: 1, per_page: 100, total: 4, pages: 2 } })
          : response(all.slice(2), { pagination: { page: 2, per_page: 100, total: 4, pages: 2 } }));
      }
      return Promise.resolve(response(all));
    });
    const user = userEvent.setup();
    renderUsersTab();
    await screen.findByText('Alice Martin');

    await user.click(screen.getByRole('button', { name: i18n.t('processed_history.export_csv') }));
    await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1));

    // pinned to the day on screen (not "today" again), 100 per page, both pages read
    expect(getUsersPresence).toHaveBeenCalledWith(DAY, 1, 100);
    expect(getUsersPresence).toHaveBeenCalledWith(DAY, 2, 100);

    const [slug, header, rows] = downloadCsv.mock.calls[0];
    expect(slug).toBe('utilisateurs');
    expect(header).toEqual(['Nom / Prénom', `Présence (${DAY})`, 'Email', 'Téléphone', 'Groupe(s)']);
    expect(rows.map((r) => [r[0], r[1]])).toEqual([
      ['Alice Martin', 'Présent'],
      ['Bob Durand', 'Absent'],
      ['Chloé Petit', 'Absence prévue · RTT'],
      ['Dan Vidal', 'Non applicable'],
    ]);
    expect(rows.every((r) => r.length === header.length)).toBe(true);
  });
});
