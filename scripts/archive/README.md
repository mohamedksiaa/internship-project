# Scripts archivés — migration TimeFlow → projets natifs Dolibarr

Les trois scripts PHP de ce dossier forment une séquence one-shot de migration :

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

## `sql/` — schéma des tables de support temporaires

Le sous-dossier `sql/` contient les deux `CREATE TABLE` que ces scripts
utilisent :

- `migrate_timeflow_migration_map.sql` — crée `llx_timeflow_migration_map`,
  lue par le step 2 (écriture) et le step 3 (lecture).
- `migrate_timeflow_project_user.sql` — crée `llx_timeflow_project_user`,
  lue par le step 3 (repoint des FK) et le step 4 (création des contacts).

**Ces deux tables ne sont plus dans `sql/` à la racine du module** et ne
sont donc plus créées automatiquement par `_load_tables()` à l'activation
du module sur une installation neuve — c'est voulu : ce sont des tables
de support *temporaires* pour cette migration one-shot déjà archivée,
sans utilité sur une install neuve normale (voir l'audit de code mort de
ce module). `llx_timeflow_project_user` en particulier n'est déjà plus lue
par aucun code applicatif vivant : la restriction d'accès à un projet
("projet ouvert à certains utilisateurs seulement") passe entièrement par
les contacts internes natifs Dolibarr (`llx_element_contact`/
`PROJECTCONTRIBUTOR`, voir `timeflowCanAccessProject()` et
`timeflowProjectMembershipRestrictionSql()` dans `ajax/timeentry.php`) —
un mécanisme différent, indépendant de cette table. Les retirer de `sql/`
ne change donc rien au comportement d'une install neuve.

**Si vous relancez un jour cette migration**, exécutez d'abord les deux
fichiers de ce dossier manuellement, dans cet ordre, avant les scripts
PHP :
```
mysql ... < scripts/archive/sql/migrate_timeflow_migration_map.sql
mysql ... < scripts/archive/sql/migrate_timeflow_project_user.sql
```

## Statut

**L'exécution de cette migration en production n'est pas confirmée.**
Ces scripts et leur schéma sont archivés ici, pas supprimés, précisément
pour cette raison — voir l'audit de code mort de ce module.

**Ne relancez aucun de ces scripts (ni les fichiers SQL ci-dessus) sans
avoir vérifié au préalable :**
- si la migration a déjà été exécutée sur la base cible (vérifier le
  contenu de `llx_timeflow_migration_map` et si les projets/contacts
  natifs existent déjà) ;
- que la base a été sauvegardée avant toute exécution ;
- l'ordre des étapes (SQL migration_map → SQL project_user → step 2 →
  step 3 → step 4), chaque script dépendant de l'état laissé par le
  précédent.

Les scripts PHP sont CLI-only (`php <script>.php`) et supposent d'être
exécutés depuis un module installé sous `htdocs/custom/timeflow/scripts/archive/`
d'une installation Dolibarr complète (ils remontent vers `master.inc.php`
par chemin relatif).
