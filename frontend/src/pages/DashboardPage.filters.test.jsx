import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import DashboardPage from './DashboardPage';
import { getDashboardFilterOptions, getSummaryReports } from '../api/timeflowApi';
import { downloadCsv } from '../utils/csvExport.js';

vi.mock('../api/timeflowApi', () => ({
  getDashboardFilterOptions: vi.fn(),
  getSummaryReports: vi.fn(),
  getDailyReports: vi.fn().mockResolvedValue({ reports: [], employees: [] }),
  getMyDailyReports: vi.fn().mockResolvedValue([]),
}));
vi.mock('../utils/csvExport.js', () => ({ downloadCsv: vi.fn() }));
const generateDashboardPdf = vi.fn().mockResolvedValue(undefined);
vi.mock('../utils/dashboardPdfExport.js', () => ({ generateDashboardPdf: (...args) => generateDashboardPdf(...args) }));

const OPTIONS = {
  projects: [
    { id: 5, label: 'Projet Alpha', closed: false, client_id: 2 },
    { id: 6, label: 'Projet Beta', closed: false, client_id: 0 },
    { id: 7, label: 'Projet Ancien', closed: true, client_id: 2 },
  ],
  clients: [{ id: 2, label: 'ACME' }],
  employees: [
    { id: 3, label: 'Alice Martin', inactive: false },
    { id: 4, label: 'Bob Durand', inactive: true },
  ],
};
const SUMMARY = {
  total_seconds: 36000, billable_seconds: 18000, non_billable_seconds: 18000,
  by_project: { 5: 21600, 6: 14400 }, project_labels: { 5: 'Projet Alpha', 6: 'Projet Beta' },
  by_user: { 3: 10800 }, user_labels: { 3: 'Alice Martin' }, by_project_employee: { '5|3': 7200 }, by_status: {},
};

let currentSearch = '';
function Probe() {
  const location = useLocation();
  currentSearch = location.search;
  return null;
}
function renderDashboard(entry = '/') {
  return render(<DashboardPage />, { wrapper: ({ children }) => <MemoryRouter initialEntries={[entry]}><Probe />{children}</MemoryRouter> });
}
const T = (key, params) => i18n.t(key, params);
const lastFilters = () => getSummaryReports.mock.calls[getSummaryReports.mock.calls.length - 1][4];
const filterButton = (name) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

beforeEach(async () => {
  await i18n.changeLanguage('fr');
  window.TIMEFLOW_CAN_READALL = true;
  getDashboardFilterOptions.mockReset().mockResolvedValue(OPTIONS);
  getSummaryReports.mockReset().mockResolvedValue(SUMMARY);
  downloadCsv.mockClear();
  generateDashboardPdf.mockClear().mockResolvedValue(undefined);
  currentSearch = '';
});
afterEach(() => {
  cleanup();
  delete window.TIMEFLOW_CAN_READALL;
});

describe('DashboardPage — Projet / Client / Employé filters', () => {
  it('shows the three filters next to the dates, "Tous" by default, and fetches the summary unfiltered', async () => {
    renderDashboard();
    await screen.findByText(T('dashboard.total'));
    expect(filterButton(T('dashboard.filters.project'))).toHaveTextContent(T('dashboard.filters.all'));
    expect(filterButton(T('dashboard.filters.client'))).toHaveTextContent(T('dashboard.filters.all'));
    expect(filterButton(T('dashboard.filters.employee'))).toHaveTextContent(T('dashboard.filters.all'));
    expect(screen.getByLabelText(T('dashboard.date_from'))).toBeInTheDocument();
    expect(lastFilters()).toEqual({});
  });

  it('lists the projects (closed ones marked), the clients and the employees (inactive ones marked)', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText(T('dashboard.total'));
    await waitFor(() => expect(getDashboardFilterOptions).toHaveBeenCalledTimes(1));
    await user.click(filterButton(T('dashboard.filters.project')));
    const group = await screen.findByRole('group', { name: T('dashboard.filters.project') });
    expect(within(group).getByRole('checkbox', { name: /Projet Ancien/ })).toBeInTheDocument();
    expect(within(group).getByText(T('dashboard.filters.closed'))).toBeInTheDocument();
    await user.click(filterButton(T('dashboard.filters.employee')));
    const employees = await screen.findByRole('group', { name: T('dashboard.filters.employee') });
    expect(within(employees).getByText(T('dashboard.filters.inactive'))).toBeInTheDocument();
  });

  it('picking a project refetches with project_ids and writes it in the URL; back to "Tous" removes both', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText(T('dashboard.total'));
    await waitFor(() => expect(getDashboardFilterOptions).toHaveBeenCalled());
    await user.click(filterButton(T('dashboard.filters.project')));
    await user.click(await screen.findByRole('checkbox', { name: /Projet Alpha/ }));
    await waitFor(() => expect(lastFilters()).toEqual({ project_ids: [5] }));
    expect(currentSearch).toContain('projects=5');
    await user.click(screen.getByRole('checkbox', { name: /Projet Beta/ }));
    await waitFor(() => expect(lastFilters()).toEqual({ project_ids: [5, 6] }));
    await user.click(screen.getByRole('checkbox', { name: T('dashboard.filters.all') }));
    await waitFor(() => expect(lastFilters()).toEqual({}));
    expect(currentSearch).not.toContain('projects');
  });

  it('picking a client and an employee refetches too (each filter is part of the request)', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText(T('dashboard.total'));
    await waitFor(() => expect(getDashboardFilterOptions).toHaveBeenCalled());
    await user.click(filterButton(T('dashboard.filters.client')));
    await user.click(await screen.findByRole('checkbox', { name: /ACME/ }));
    await waitFor(() => expect(lastFilters()).toEqual({ client_ids: [2] }));
    expect(currentSearch).toContain('clients=2');
    await user.click(filterButton(T('dashboard.filters.employee')));
    await user.click(await screen.findByRole('checkbox', { name: /Alice Martin/ }));
    await waitFor(() => expect(lastFilters()).toEqual({ client_ids: [2], user_ids: [3] }));
    expect(currentSearch).toContain('employees=3');
  });

  it('the target use case: Projet = X and the Dimension menu on Employé, both sent / kept', async () => {
    const user = userEvent.setup();
    renderDashboard('/?dimension=employee');
    await screen.findByText(T('dashboard.total'));
    await waitFor(() => expect(getDashboardFilterOptions).toHaveBeenCalled());
    await user.click(filterButton(T('dashboard.filters.project')));
    await user.click(await screen.findByRole('checkbox', { name: /Projet Alpha/ }));
    await waitFor(() => expect(lastFilters()).toEqual({ project_ids: [5] }));
    expect(currentSearch).toContain('dimension=employee');
    expect(currentSearch).toContain('projects=5');
  });

  it('filters combine and are restored from the URL on load (employee + client + project)', async () => {
    renderDashboard('/?projects=5,6&clients=2&employees=3');
    await waitFor(() => expect(getSummaryReports).toHaveBeenCalled());
    expect(lastFilters()).toEqual({ project_ids: [5, 6], client_ids: [2], user_ids: [3] });
    await waitFor(() => expect(filterButton(T('dashboard.filters.project'))).toHaveTextContent(T('dashboard.filters.selected_count', { count: 2 })));
    expect(filterButton(T('dashboard.filters.client'))).toHaveTextContent('ACME');
    expect(filterButton(T('dashboard.filters.employee'))).toHaveTextContent('Alice Martin');
  });

  it('garbage in the URL is dropped before it can reach the server', async () => {
    renderDashboard('/?projects=5,abc,-3,1)%20OR%201=1&clients=x');
    await waitFor(() => expect(getSummaryReports).toHaveBeenCalled());
    expect(lastFilters()).toEqual({ project_ids: [5] });
  });

  it('changing the period keeps the filters', async () => {
    renderDashboard('/?projects=5');
    await waitFor(() => expect(getSummaryReports).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(T('dashboard.date_from')), { target: { value: '2026-01-01' } });
    await waitFor(() => expect(getSummaryReports.mock.calls.some((c) => c[1] === '2026-01-01')).toBe(true));
    expect(lastFilters()).toEqual({ project_ids: [5] });
  });

  it('a user WITHOUT the read-all right gets no Employé filter, and an employees param in the URL is not sent', async () => {
    window.TIMEFLOW_CAN_READALL = false;
    getDashboardFilterOptions.mockResolvedValue({ ...OPTIONS, employees: [] });
    renderDashboard('/?employees=3&projects=5');
    await waitFor(() => expect(getSummaryReports).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: new RegExp(`^${T('dashboard.filters.employee')}`) })).toBeNull();
    expect(screen.getByRole('button', { name: new RegExp(`^${T('dashboard.filters.project')}`) })).toBeInTheDocument();
    expect(lastFilters()).toEqual({ project_ids: [5] });
  });

  it('the filter lists failing to load does not break the dashboard (unfiltered, "Tous")', async () => {
    getDashboardFilterOptions.mockRejectedValue(new Error('boom'));
    renderDashboard();
    await screen.findByText(T('dashboard.total'));
    expect(filterButton(T('dashboard.filters.project'))).toHaveTextContent(T('dashboard.filters.all'));
    expect(lastFilters()).toEqual({});
  });

  it('leaves the Dimension / Type de graphique / Croiser avec menus alone', async () => {
    renderDashboard();
    await screen.findByText(T('dashboard.total'));
    expect(screen.getAllByText(T('dashboard.dimension_label')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(T('dashboard.chart_type_label')).length).toBeGreaterThan(0);
  });
});

describe('DashboardPage — the filters reach the exports', () => {
  it('CSV: a "Filtres" line lists the active filters; without a filter there is none', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText(T('dashboard.total'));
    await user.click(screen.getByRole('button', { name: T('dashboard.export.csv_button') }));
    expect(downloadCsv.mock.calls[0][2].some((row) => row[0] === T('dashboard.export.csv_filters'))).toBe(false);
    cleanup();

    downloadCsv.mockClear();
    renderDashboard('/?projects=5&employees=3');
    await waitFor(() => expect(filterButton(T('dashboard.filters.employee'))).toHaveTextContent('Alice Martin'));
    await user.click(screen.getByRole('button', { name: T('dashboard.export.csv_button') }));
    const rows = downloadCsv.mock.calls[0][2];
    const filterRow = rows.find((row) => row[0] === T('dashboard.export.csv_filters'));
    expect(filterRow).toEqual([T('dashboard.export.csv_filters'), 'Projet : Projet Alpha ; Employé : Alice Martin']);
    // it sits in the header block, before the total
    expect(rows.indexOf(filterRow)).toBeLessThan(rows.findIndex((row) => row[0] === T('dashboard.total')));
  });

  it('PDF: the summary carries the "Filtres" line right after the period', async () => {
    const user = userEvent.setup();
    renderDashboard('/?clients=2');
    await waitFor(() => expect(filterButton(T('dashboard.filters.client'))).toHaveTextContent('ACME'));
    await user.click(screen.getByRole('button', { name: T('dashboard.export.pdf_button') }));
    await waitFor(() => expect(generateDashboardPdf).toHaveBeenCalledTimes(1));
    const lines = generateDashboardPdf.mock.calls[0][0].summaryLines;
    expect(lines[1]).toBe(T('dashboard.export.summary_filters', { filters: 'Client : ACME' }));
    expect(lines).toHaveLength(4);
  });

  it('PDF without a filter keeps its three lines', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText(T('dashboard.total'));
    await user.click(screen.getByRole('button', { name: T('dashboard.export.pdf_button') }));
    await waitFor(() => expect(generateDashboardPdf).toHaveBeenCalledTimes(1));
    expect(generateDashboardPdf.mock.calls[0][0].summaryLines).toHaveLength(3);
  });
});

describe('the filter texts', () => {
  const KEYS = ['project', 'client', 'employee', 'all', 'search', 'no_results', 'closed', 'inactive'];
  it.each(['fr', 'en', 'de', 'ar'])('%s has every filter text, the export lines, and the plural forms of the count', async (lang) => {
    const dict = (await import(`../locales/${lang}/translation.json`)).default.dashboard;
    KEYS.forEach((k) => expect(dict.filters[k], `${lang}:filters.${k}`).toBeTruthy());
    expect(dict.export.summary_filters).toContain('{{filters}}');
    expect(dict.export.csv_filters).toBeTruthy();
    const forms = lang === 'ar' ? ['zero', 'one', 'two', 'few', 'many', 'other'] : ['one', 'other'];
    forms.forEach((f) => expect(dict.filters[`selected_count_${f}`], `${lang}:selected_count_${f}`).toBeTruthy());
    if (lang !== 'ar') expect(dict.filters.selected_count_other).toContain('{{count}}');
  });

  it('Arabic renders the filter labels and the count', async () => {
    await i18n.changeLanguage('ar');
    renderDashboard('/?projects=5,6');
    await waitFor(() => expect(getSummaryReports).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: new RegExp(`^${T('dashboard.filters.project')}`) })).toBeInTheDocument();
    expect(T('dashboard.filters.project')).toMatch(/[؀-ۿ]/);
    expect(T('dashboard.filters.selected_count', { count: 2 })).toMatch(/[؀-ۿ]/);
  });
});
