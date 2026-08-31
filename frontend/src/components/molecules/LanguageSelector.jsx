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
      className="tw-rounded tw-border tw-border-slate-300 dark:tw-border-slate-700 tw-bg-white dark:tw-bg-slate-800 tw-px-2 tw-py-1 tw-text-sm tw-text-slate-700 dark:tw-text-slate-100"
      aria-label={t('app.language_selector')}
    >
      {langs.map((l) => (
        <option key={l.code} value={l.code}>{l.label}</option>
      ))}
    </select>
  );
}
