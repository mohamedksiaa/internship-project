# CHANGELOG MODULE TIMEFLOW FOR [DOLIBARR ERP CRM](https://www.dolibarr.org)

## 1.0

Initial version

- Correction d'un bug empêchant la création d'entrées de temps manuelles : la date était formatée pour l'affichage (dol_print_date) au lieu du format SQL attendu (idate), causant un rejet MySQL. Corrigé dans class/timeentry.class.php (createManualEntry).
