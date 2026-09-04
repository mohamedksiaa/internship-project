import React, { act } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18n from '../../i18n';
import AppLayout from './AppLayout';

describe('AppLayout i18n integration', () => {
  beforeAll(() => {
    window.TIMEFLOW_CAN_VALIDATE = true;
    window.TIMEFLOW_CAN_READALL = true;
    i18n.on('languageChanged', (lang) => {
      document.documentElement.dir = ['ar'].includes(lang) ? 'rtl' : 'ltr';
    });
  });

  afterEach(() => {
    cleanup();
    document.documentElement.dir = 'ltr';
    i18n.changeLanguage('fr');
  });

  const renderAtRoute = (route) => {
    cleanup();
    render(
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route path="timer" element={<div>Timer page</div>} />
            <Route path="history" element={<div>History page</div>} />
            <Route path="daily-report" element={<div>Daily report</div>} />
            <Route path="dashboard" element={<div>Dashboard page</div>} />
            <Route path="reports" element={<div>Reports page</div>} />
            <Route path="validation" element={<div>Validation page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
  };

  it('renders french by default, switches to arabic in rtl, and to german in ltr', async () => {
    await act(async () => {
      await i18n.changeLanguage('fr');
    });

    renderAtRoute('/timer');
    expect(screen.getByText('TimeFlow')).toBeTruthy();
    expect(screen.getByText('Mon espace de travail')).toBeTruthy();
    expect(document.documentElement.dir).toBe('ltr');

    await act(async () => {
      await i18n.changeLanguage('ar');
    });

    renderAtRoute('/timer');
    expect(screen.getByText('TimeFlow')).toBeTruthy();
    expect(screen.getByText('مساحتي العملية')).toBeTruthy();
    expect(document.documentElement.dir).toBe('rtl');

    await act(async () => {
      await i18n.changeLanguage('de');
    });

    renderAtRoute('/timer');
    expect(screen.getByText('TimeFlow')).toBeTruthy();
    expect(screen.getByText('Mein Arbeitsbereich')).toBeTruthy();
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('matches the active menu item to the route in each language', async () => {
    await act(async () => {
      await i18n.changeLanguage('de');
    });

    const routes = [
      ['/timer', 'ZEITERFASSUNG'],
      ['/history', 'KALENDER'],
      ['/daily-report', 'MEIN BERICHT'],
      ['/dashboard', 'DASHBOARD'],
      ['/reports', 'BERICHTE'],
      ['/validation', 'VALIDIERUNGEN'],
    ];

    routes.forEach(([route, expectedLabel]) => {
      cleanup();
      renderAtRoute(route);
      const activeLink = Array.from(document.querySelectorAll('a[aria-current="page"]'))[0];
      expect(activeLink).toBeTruthy();
      expect(activeLink.textContent).toContain(expectedLabel);
      expect(activeLink.className).toContain('bg-[#e8f4f9]');
      expect(activeLink.className).toContain('border-[#5B8FA8]');
    });
  });

  it('shows Reports to everyone and gates Validations behind canValidate', async () => {
    await act(async () => {
      await i18n.changeLanguage('de');
    });
    // Reports now hosts task/report history and the read-only project list
    // (previously open to everyone at /processed-history and /projects), so
    // unlike Validations it must never be hidden behind canValidate.
    window.TIMEFLOW_CAN_VALIDATE = true;
    renderAtRoute('/validation');
    expect(screen.getByRole('link', { name: /VALIDIERUNGEN$/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /KALENDER$/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /BERICHTE$/ })).toBeInTheDocument();

    window.TIMEFLOW_CAN_VALIDATE = false;
    renderAtRoute('/history');
    expect(screen.queryByRole('link', { name: /VALIDIERUNGEN$/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /KALENDER$/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /BERICHTE$/ })).toBeInTheDocument();
  });
});
