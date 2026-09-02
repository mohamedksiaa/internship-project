import React, { act } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import ProcessedHistoryPage from './ProcessedHistoryPage';

vi.mock('../api/timeflowApi', () => ({
  getProjects: vi.fn().mockResolvedValue([]),
  getProcessedHistory: vi.fn().mockResolvedValue({ rows: [], pagination: { page: 1, pages: 1 }, stats: {} }),
  exportProcessedHistory: vi.fn().mockResolvedValue([]),
}));

describe('ProcessedHistoryPage i18n integration', () => {
  afterEach(async () => {
    cleanup();
    document.documentElement.dir = 'ltr';
    await i18n.changeLanguage('fr');
  });

  it.each([
    ['fr', 'Historique traité', 'Exporter en CSV', 'ltr'],
    ['de', 'Verarbeiteter Verlauf', 'Als CSV exportieren', 'ltr'],
    ['ar', 'السجل المعالَج', 'تصدير CSV', 'rtl'],
  ])('renders %s labels and document direction', async (language, title, exportLabel, direction) => {
    await act(async () => {
      await i18n.changeLanguage(language);
      document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    });

    render(<ProcessedHistoryPage />);

    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: exportLabel })).toBeInTheDocument();
    expect(document.documentElement.dir).toBe(direction);
  });
});
