# CHANGELOG MODULE TIMEFLOW FOR [DOLIBARR ERP CRM](https://www.dolibarr.org)

## 1.0

Initial version

- Correction d'un bug empêchant la création d'entrées de temps manuelles : la date était formatée pour l'affichage (dol_print_date) au lieu du format SQL attendu (idate), causant un rejet MySQL. Corrigé dans class/timeentry.class.php (createManualEntry).

## 1.1

Ajout du support multilingue (français, anglais, allemand, arabe) :

- Frontend React entièrement migré vers react-i18next, avec détection automatique de la langue du profil Dolibarr (fallback anglais si langue non supportée, sélection manuelle possible via un sélecteur de langue).
- Support RTL complet pour l'arabe (mise en page, direction du texte).
- Fichiers de langue backend Dolibarr (langs/) complétés pour l'allemand et l'arabe.
- Gestion correcte de la pluralisation selon les règles CLDR pour chaque langue (l'arabe utilise 6 formes grammaticales, les autres langues 2).

Note : certaines traductions allemandes et arabes restent à faire relire par un locuteur natif avant mise en production — voir frontend/src/locales/TRANSLATIONS_TO_REVIEW.md (114 entrées).
