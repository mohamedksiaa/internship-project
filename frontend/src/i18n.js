import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en/translation.json';
import fr from './locales/fr/translation.json';
import de from './locales/de/translation.json';
import ar from './locales/ar/translation.json';

const resources = {
  en: { translation: en },
  fr: { translation: fr },
  de: { translation: de },
  ar: { translation: ar },
};

function normalizeDolibarrLang(dolLang) {
  if (!dolLang) return null;
  // dolLang may be like 'fr_FR' or 'en_US' or 'ar_SA'
  const parts = String(dolLang).split(/[_\-@]/);
  const code = parts[0].toLowerCase();
  if (['fr', 'en', 'de', 'ar'].includes(code)) return code;
  return null;
}

function resolveInitialLanguage() {
  if (typeof window === 'undefined') return 'en';

  // 1) user's explicit choice stored by LanguageSelector (we use 'timeflow_lang')
  try {
    const stored = window.localStorage.getItem('timeflow_lang');
    if (stored) return stored;
  } catch (e) {
    // ignore
  }

  // 2) Dolibarr injected language
  const dol = window.__DOLIBARR_LANG__ || (document.getElementById('root') && document.getElementById('root').dataset && document.getElementById('root').dataset.dolibarrLang);
  const norm = normalizeDolibarrLang(dol);
  if (norm) return norm;

  // 3) fallback to english for unsupported Dolibarr languages
  return 'en';
}

const initialLng = resolveInitialLanguage();

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLng,
    fallbackLng: 'en',
    debug: false,
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
