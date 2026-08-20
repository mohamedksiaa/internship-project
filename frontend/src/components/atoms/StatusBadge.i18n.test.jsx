import React, { act } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import i18n from '../../i18n';
import StatusBadge from './StatusBadge';

describe('StatusBadge i18n integration', () => {
  beforeAll(() => {
    i18n.on('languageChanged', (lang) => {
      document.documentElement.dir = ['ar'].includes(lang) ? 'rtl' : 'ltr';
    });
  });

  afterEach(() => {
    cleanup();
    document.documentElement.dir = 'ltr';
    i18n.changeLanguage('fr');
  });

  it('renders french by default, switches to arabic in rtl, and to german in ltr', async () => {
    await act(async () => {
      await i18n.changeLanguage('fr');
    });

    const { unmount } = render(<StatusBadge status={2} />);
    expect(screen.getByText('Validé')).toBeTruthy();
    expect(document.documentElement.dir).toBe('ltr');
    unmount();

    await act(async () => {
      await i18n.changeLanguage('ar');
    });

    const arRender = render(<StatusBadge status={2} />);
    expect(screen.getByText('مُتحقق')).toBeTruthy();
    expect(document.documentElement.dir).toBe('rtl');
    arRender.unmount();

    await act(async () => {
      await i18n.changeLanguage('de');
    });

    const deRender = render(<StatusBadge status={2} />);
    expect(screen.getByText('Validiert')).toBeTruthy();
    expect(document.documentElement.dir).toBe('ltr');
    deRender.unmount();
  });
});
