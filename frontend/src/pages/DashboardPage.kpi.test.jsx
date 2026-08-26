import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as timeflowApi from '../api/timeflowApi';
import i18n from '../i18n';
import DashboardPage from './DashboardPage';

vi.mock('../api/timeflowApi', () => ({
  getSummaryReports: vi.fn().mockResolvedValue({
    total_seconds: 7200,
    billable_seconds: 3600,
    by_project: { 1: 3600 },
    project_labels: { 1: 'Alpha' },
    by_status: { 1: 2, 2: 1 },
  }),
  getWeeklyTimesheet: vi.fn().mockResolvedValue({
    weekStart: '2026-08-18',
    weekEnd: '2026-08-24',
    rows: [],
  }),
  getTimeEntries: vi.fn().mockResolvedValue([]),
  getDailyReports: vi.fn().mockResolvedValue({ reports: [], employees: [] }),
  getMyDailyReports: vi.fn().mockResolvedValue({ reports: [], employees: [] }),
}));

describe('DashboardPage KPI cards padding', () => {
  afterEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('renders seven KPI cards each using p-6 (via Card or direct)', async () => {
    await i18n.changeLanguage('fr');

    const { container } = render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    const labels = [
      'Total semaine',
      'Soumises',
      'Validées',
      'Total du mois',
      'Variation vs mois précédent',
      'Rapports en attente',
      'Période',
    ];

    for (const label of labels) {
      const el = await screen.findByText(label);
      // climb ancestors up to 5 levels to find an element with class p-6
      let node = el;
      let found = false;
      for (let i = 0; i < 6 && node; i++) {
        if (node.classList && node.classList.contains('p-6')) {
          found = true;
          break;
        }
        node = node.parentElement;
      }
      expect(found, `Expected card for "${label}" to include class p-6`).toBeTruthy();
    }
  });
});
