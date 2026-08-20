import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import i18n from './i18n'

function applyDirection(lang) {
  const rtl = ['ar'];
  if (typeof document !== 'undefined') document.documentElement.dir = rtl.includes(lang) ? 'rtl' : 'ltr';
}

applyDirection(i18n.language || 'fr');
i18n.on('languageChanged', applyDirection);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
