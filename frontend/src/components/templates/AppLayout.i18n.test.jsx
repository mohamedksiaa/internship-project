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
            <Route path="processed-history" element={<div>Processed history</div>} />
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

  it('shows calendar and history as separate navigation entries with the correct permission gating', async () => {
    await act(async () => {
      await i18n.changeLanguage('de');
    });
    window.TIMEFLOW_CAN_VALIDATE = true;
    window.TIMEFLOW_CAN_READALL = false;
    renderAtRoute('/validation');
    expect(screen.getByRole('link', { name: /VALIDIERUNGEN$/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /KALENDER$/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /VERLAUF$/ })).not.toBeInTheDocument();

    window.TIMEFLOW_CAN_VALIDATE = false;
    window.TIMEFLOW_CAN_READALL = true;
    renderAtRoute('/history');
    expect(screen.queryByRole('link', { name: /VALIDIERUNGEN$/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /KALENDER$/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /VERLAUF$/ })).toBeInTheDocument();
  });

  it('keeps calendar and processed history as two distinct entries in the navigation', async () => {
    await act(async () => {
      await i18n.changeLanguage('fr');
    });

    window.TIMEFLOW_CAN_VALIDATE = false;
    window.TIMEFLOW_CAN_READALL = true;
    renderAtRoute('/processed-history');

    const calendarLinks = screen.getAllByRole('link', { name: /CALENDRIER/i });
    const historyLinks = screen.getAllByRole('link', { name: /HISTORIQUE/i });
    expect(calendarLinks.length).toBeGreaterThan(0);
    expect(historyLinks.length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /HISTORIQUE/i })).toHaveAttribute('aria-current', 'page');
  });
});
