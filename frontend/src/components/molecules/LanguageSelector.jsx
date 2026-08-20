import React from 'react';
import { useTranslation } from 'react-i18next';

export default function LanguageSelector() {
  const { i18n, t } = useTranslation();
  const langs = [
    { code: 'fr', label: 'Français' },
    { code: 'en', label: 'English' },
    { code: 'de', label: 'Deutsch' },
    { code: 'ar', label: 'العربية' },
  ];

  return (
    <select
      value={i18n.language}
      onChange={(e) => {
        const val = e.target.value;
        try {
          window.localStorage.setItem('timeflow_lang', val);
        } catch (err) {
          // ignore localStorage errors
        }
        i18n.changeLanguage(val);
      }}
      className="rounded border px-2 py-1 text-sm"
      aria-label={t('app.language_selector')}
    >
      {langs.map((l) => (
        <option key={l.code} value={l.code}>{l.label}</option>
      ))}
    </select>
  );
}
