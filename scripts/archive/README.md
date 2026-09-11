# Scripts archivés — migration TimeFlow → projets natifs Dolibarr

Les trois scripts de ce dossier forment une séquence one-shot de migration :

1. `migrate_projects_to_native.php` (step 2) — pour chaque ligne de
   `llx_timeflow_project`, crée (si besoin) la ligne `llx_projet` native
   correspondante et enregistre la correspondance dans
   `llx_timeflow_migration_map`.
2. `remap_project_fk.php` (step 3) — relit `llx_timeflow_migration_map`
   pour repointer `llx_timeflow_timeentry.fk_project` et
   `llx_timeflow_project_user.fk_project` vers les nouveaux
   `llx_projet.rowid`.
3. `migrate_project_user_to_contacts.php` (step 4) — pour chaque ligne
   de `llx_timeflow_project_user`, crée le contact interne Dolibarr
   équivalent sur le `llx_projet` natif via `Project::add_contact()`.

## Statut

**L'exécution de cette migration en production n'est pas confirmée.**
Ces scripts sont archivés ici, pas supprimés, précisément pour cette
raison — voir l'audit de code mort de ce module.

**Ne relancez aucun de ces scripts sans avoir vérifié au préalable :**
- si la migration a déjà été exécutée sur la base cible (vérifier le
  contenu de `llx_timeflow_migration_map` et si les projets/contacts
  natifs existent déjà) ;
- que la base a été sauvegardée avant toute exécution ;
- l'ordre des étapes (2 → 3 → 4), chaque script dépendant de l'état
  laissé par le précédent.

Ces scripts sont CLI-only (`php <script>.php`) et supposent d'être
exécutés depuis un module installé sous `htdocs/custom/timeflow/scripts/archive/`
d'une installation Dolibarr complète (ils remontent vers `master.inc.php`
par chemin relatif).
