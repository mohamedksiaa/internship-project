# Schéma en base confirmé mort — non supprimé délibérément

Ce document liste les colonnes et tables du module TimeFlow confirmées
mortes (jamais lues ni écrites par aucun code applicatif) lors de l'audit
exhaustif de ce module, avec la preuve de chaque constat et les conditions
à vérifier avant d'envisager une suppression.

**Aucune migration SQL de suppression n'a été écrite.** Ce document est
volontairement une note de constat, pas une décision : le risque sur une
base de production existante (données présentes malgré tout, intégration
externe qui lirait directement la table sans passer par ce code) est trop
élevé pour être tranché depuis un audit de code seul, sans accès à une
installation réelle.

Dernière mise à jour : lors de la passe de fermeture d'audit qui a produit
ce fichier. Si ce document devient obsolète (le code évolue, un de ces
éléments redevient utilisé), corrigez-le ou supprimez l'entrée concernée —
ne le laissez pas mentir.

---

## 1. Colonnes mortes sur `llx_timeflow_timeentry`

### `fk_facture` et `date_invoice`

- **Déclaration** : `class/timeentry.class.php`, `$fields['fk_facture']`
  (ligne ~124) et `$fields['date_invoice']` (ligne ~125), plus les
  propriétés publiques correspondantes.
- **Preuve qu'elles sont mortes** : recherche exhaustive de chaque nom sur
  tout le dépôt (PHP + JS/JSX) — la seule occurrence de chacune, en dehors
  de `sql/llx_timeflow_timeentry.sql`, est sa propre déclaration dans
  `$fields`. Aucun code métier ne lit ni n'écrit jamais
  `$object->fk_facture` ou `$object->date_invoice` pour lier une facture à
  une entrée de temps ; l'API REST (`class/api_timeflow.class.php.disabled`,
  `_cleanObjectDatas()`) les exclut explicitement de sa liste blanche de
  champs exposés.
- **Nuance importante** : ces deux colonnes ne sont *pas* orphelines au
  sens SQL strict. Parce qu'elles sont déclarées dans `$fields`, le CRUD
  générique de `CommonObject` (`fetchCommon()`/`createCommon()`/
  `updateCommon()`) les lit et les écrit automatiquement à chaque
  opération sur un `TimeEntry` — mais toujours avec la valeur `NULL` par
  défaut, puisque rien ne les initialise jamais à autre chose. Ce sont des
  colonnes préparées pour une fonctionnalité de facturation qui n'a jamais
  été construite.
- **Avant suppression, vérifier** :
  1. Sur une base de production réelle, `SELECT COUNT(*) FROM llx_timeflow_timeentry WHERE fk_facture IS NOT NULL OR date_invoice IS NOT NULL;` — si non nul, une intégration externe (script, autre module, accès SQL direct) a peut-être rempli ces colonnes en dehors de ce code applicatif ; ne pas supprimer sans comprendre qui/quoi a écrit ces valeurs.
  2. Confirmer qu'aucune fonctionnalité de facturation n'est prévue à court terme pour ce module (auquel cas ces colonnes seraient à réutiliser, pas à supprimer).
  3. Vérifier qu'aucun export/rapport/intégration externe ne s'attend à trouver ces colonnes dans le schéma (même si elle sont vides côté applicatif).

---

## 2. Tables entièrement mortes

### `llx_timeflow_project`

- **Définition** : `sql/llx_timeflow_project.sql` (colonnes : `rowid`,
  `entity`, `ref`, `title`, `description`, `fk_dolibarr_project`,
  `fk_soc`, `fk_user_creat`, `date_creation`, `tms`, `import_key`).
- **Preuve qu'elle est morte** : le code applicatif le dit lui-même,
  explicitement (`ajax/timeentry.php`, autour de la ligne 527) :
  > *"Projects live in the native llx_projet table (TimeFlow -> native
  > project migration) — llx_timeflow_project is kept read-only as a
  > pre-migration backup, no longer written to."*

  Confirmé par grep exhaustif : aucun `INSERT`/`UPDATE` vers cette table
  dans tout le dépôt (hors `scripts/archive/`, des scripts de migration
  historiques déjà archivés). Le seul `SELECT` restant est dans
  `test/phpunit/timeentryTest.php`, dont le commentaire précise lui-même
  qu'il s'agit d'une "pre-migration backup that is empty". La colonne
  `fk_dolibarr_project` n'apparaît ailleurs que dans des commentaires la
  qualifiant explicitement de *"never-populated"*.
- **Ce que ça signifie** : cette table est une sauvegarde figée de l'état
  du module *avant* sa migration vers le système de projets natif
  Dolibarr (`llx_projet`). Elle a été volontairement conservée en lecture
  seule au moment de la migration, précisément pour permettre un rollback
  si la migration s'était mal passée.
- **Avant suppression, vérifier** :
  1. Sur une base de production réelle, confirmer que la migration
     TimeFlow → projets natifs a bien été appliquée et validée depuis
     suffisamment longtemps pour exclure un besoin de rollback.
     `scripts/archive/migrate_projects_to_native.php` est le script de
     cette migration ; comprendre son historique d'exécution sur la base
     concernée avant toute décision.
  2. `SELECT COUNT(*) FROM llx_timeflow_project;` sur la base réelle — si
     non vide, comprendre pourquoi avant de supprimer quoi que ce soit
     (donnée historique à archiver ailleurs avant suppression, ou signe
     qu'une install n'a jamais été migrée).
  3. Vérifier qu'aucun outil de reporting/BI externe ne référence
     directement cette table par son nom SQL.

### `llx_timeflow_timeentry_extrafields`

- **Définition** : `sql/llx_timeflow_timeentry_extrafields.sql` (colonnes :
  `rowid`, `tms`, `fk_object`, `import_key`).
- **Preuve qu'elle est morte, à deux niveaux indépendants** :
  1. `TimeEntry::$isextrafieldmanaged = 0` (`class/timeentry.class.php`,
     ligne ~46) désactive explicitement le mécanisme générique
     `CommonObject` qui gérerait automatiquement cette table companion —
     le framework Dolibarr lui-même ne la touche donc jamais pour un
     `TimeEntry`.
  2. Grep exhaustif : la seule mention du nom de cette table en dehors de
     son propre `CREATE TABLE` est `core/modules/modTimeFlow.class.php`,
     à l'intérieur du bloc `/* BEGIN MODULEBUILDER IMPORT MYOBJECT */`
     déjà commenté et documenté comme mort (voir le nettoyage de ce
     fichier dans cette même passe d'audit). Aucune ligne n'a jamais été
     insérée dans cette table par aucun chemin, framework ou métier.
- **Conséquence à connaître** (au-delà du strict périmètre schéma) :
  `admin/timeentry_extrafields.php` (page qui permettrait de *définir* des
  champs personnalisés sur `TimeEntry`) a été désactivée dans cette même
  passe d'audit précisément parce que tout champ qui y serait défini
  ajouterait une vraie colonne à cette table sans que sa valeur ne soit
  jamais lue ni sauvegardée nulle part. Voir le commit correspondant pour
  le détail.
- **Avant suppression, vérifier** :
  1. Sur une base de production réelle, `SELECT COUNT(*) FROM llx_timeflow_timeentry_extrafields;` puis inspecter les colonnes présentes (`SHOW COLUMNS FROM llx_timeflow_timeentry_extrafields;`) — si des colonnes autres que `rowid`/`tms`/`fk_object`/`import_key` existent, quelqu'un a défini un extrafield via l'admin Dolibarr générique avant que cette page ne soit désactivée ; comprendre si des valeurs y ont été saisies avant de supprimer.
  2. Si la fonctionnalité "champs personnalisés sur les entrées de temps" est un jour souhaitée, la bonne remise en route est d'activer `$isextrafieldmanaged = 1` sur `TimeEntry` (et de vérifier le câblage des templates de la fiche), pas de commencer par cette table.

---

## Rappel : ce document n'est pas une autorisation de suppression

Chaque suppression de colonne ou de table doit rester une décision
séparée, explicite, prise avec accès à une base de production réelle pour
vérifier les points ci-dessus — jamais depuis ce seul audit de code.
