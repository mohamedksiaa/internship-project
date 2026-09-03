import React from 'react';
import { render, screen } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../i18n';
import ValidationPage from '../ValidationPage';

vi.mock('../../api/timeflowApi', () => ({
  getValidationEntries: vi.fn().mockResolvedValue([]),
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
});
