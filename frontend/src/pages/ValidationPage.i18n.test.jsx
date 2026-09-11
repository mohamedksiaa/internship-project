import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import { getValidationEntries } from '../api/timeflowApi';
import ValidationPage from './ValidationPage';

vi.mock('../api/timeflowApi', () => ({
  getValidationEntries: vi.fn().mockResolvedValue({ entries: [], pagination: { page: 1, per_page: 20, total: 0, pages: 1 } }),
  getTimeEntryUpdates: vi.fn().mockResolvedValue({ marker: '', changed: false, entries: [] }),
}));

describe('ValidationPage i18n integration', () => {
  beforeAll(() => {
    // Ensure document.dir is updated when language changes (mimics main.jsx behavior)
    i18n.on('languageChanged', (lang) => {
      const rtl = ['ar'];
      document.documentElement.dir = rtl.includes(lang) ? 'rtl' : 'ltr';
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders french by default and switches to arabic (rtl) and german (ltr)', async () => {
    // Start in French
    await act(async () => {
      await i18n.changeLanguage('fr');
      render(<ValidationPage />, { wrapper: MemoryRouter });
    });

    // French heading
    expect(screen.getByText('Valider les entrées')).toBeTruthy();
    expect(document.documentElement.dir).toBe('ltr');

    // Switch to Arabic
    await act(async () => {
      await i18n.changeLanguage('ar');
    });

    // Arabic heading and RTL
    expect(screen.getByText('التحقق من السجلات')).toBeTruthy();
    expect(document.documentElement.dir).toBe('rtl');

    // Switch to German (should be LTR)
    await act(async () => {
      await i18n.changeLanguage('de');
    });

    expect(screen.getByText('Einträge validieren')).toBeTruthy();
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('renders task filters and sends date and employee values to the API', async () => {
    await i18n.changeLanguage('fr');
    getValidationEntries.mockResolvedValue({
      entries: [],
      employees: [{ id: 42, label: 'Alice' }],
      pagination: { page: 1, per_page: 20, total: 0, pages: 1 },
    });

    render(<ValidationPage />, { wrapper: MemoryRouter });

    expect(screen.getByText('Examinez et validez les entrées de temps soumises par les employés.')).toBeInTheDocument();
    const dateFrom = screen.getByLabelText('Du');
    fireEvent.change(dateFrom, { target: { value: '2026-09-01' } });
    await waitFor(() => expect(getValidationEntries).toHaveBeenLastCalledWith(
      1,
      20,
      expect.objectContaining({ dateFrom: '2026-09-01' }),
    ));

    fireEvent.change(screen.getByRole('combobox', { name: i18n.t('reports.filter_employee') }), { target: { value: '42' } });

    await waitFor(() => expect(getValidationEntries).toHaveBeenLastCalledWith(
      1,
      20,
      expect.objectContaining({ dateFrom: '2026-09-01', employeeId: '42' }),
    ));
  });

  it('renders a submitted entry inside the default validation period', async () => {
    await i18n.changeLanguage('fr');
    getValidationEntries.mockResolvedValue({
      entries: [{
        id: 99,
        status: 1,
        note: 'Entrée soumise du jour',
        date_start: '2026-09-10T09:00:00Z',
        date_end: '2026-09-10T10:00:00Z',
        duration: 3600,
        fk_project: 0,
        fk_task: 0,
        fk_user: 42,
        user_label: 'Alice',
      }],
      employees: [{ id: 42, label: 'Alice' }],
      pagination: { page: 1, per_page: 20, total: 1, pages: 1 },
    });

    render(<ValidationPage />, { wrapper: MemoryRouter });

    expect(await screen.findByText('Entrée soumise du jour')).toBeInTheDocument();
    expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(2);
    expect(getValidationEntries).toHaveBeenCalledWith(
      1,
      20,
      expect.objectContaining({ dateFrom: '2026-09-01', dateTo: '2026-09-30', employeeId: '' }),
    );
  });
});
