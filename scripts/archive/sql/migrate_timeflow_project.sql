-- ARCHIVÉ : déplacé de sql/ vers scripts/archive/sql/.
-- Raison : le déploiement final de ce module se fait sur une installation
-- Dolibarr NEUVE, jamais une mise à niveau depuis une ancienne
-- installation portant encore le schéma que ce script visait à faire
-- évoluer -- dans ce contexte, ce script ne sert jamais. Il n'était de
-- toute façon jamais dans le chemin d'auto-exécution de l'activation du
-- module : _load_tables('/timeflow/sql/') (core/modules/modTimeFlow.class.php)
-- ne charge que les fichiers sql/llx_*.sql, jamais sql/migrate_*.sql --
-- ce script a toujours été destiné à une exécution manuelle, jamais
-- automatique.
--
-- À RÉINTÉGRER (déplacer ce fichier depuis scripts/archive/sql/ vers
-- sql/) UNIQUEMENT si ce module est un jour installé sur une base
-- pré-existante portant encore l'ancien schéma que ce script vise à
-- faire évoluer -- l'exécuter alors manuellement, en suivant les
-- instructions ci-dessous ; ce script n'a jamais été, et ne redeviendrait
-- pas, auto-exécuté par l'activation du module.

-- Migration: decouple TimeFlow from Dolibarr native llx_projet
-- Strategy: mirror existing Dolibarr projects into llx_timeflow_project,
-- then repoint llx_timeflow_timeentry.fk_project to the new table.

-- 1. Mirror Dolibarr projects into llx_timeflow_project (skip duplicates)
INSERT INTO llx_timeflow_project (entity, ref, title, description, fk_dolibarr_project, fk_soc, fk_user_creat, date_creation, import_key)
SELECT
    p.entity,
    p.ref,
    p.title,
    p.description,
    p.rowid,
    p.fk_soc,
    p.fk_user_creat,
    p.datec,
    p.import_key
FROM llx_projet AS p
LEFT JOIN llx_timeflow_project AS cp ON cp.fk_dolibarr_project = p.rowid AND cp.entity = p.entity
WHERE cp.rowid IS NULL;

-- 2. Repoint timeentry fk_project from llx_projet.rowid -> llx_timeflow_project.rowid
UPDATE llx_timeflow_timeentry AS te
INNER JOIN llx_timeflow_project AS cp ON cp.fk_dolibarr_project = te.fk_project AND cp.entity = te.entity
SET te.fk_project = cp.rowid
WHERE te.fk_project > 0
  AND cp.fk_dolibarr_project IS NOT NULL
  AND cp.fk_dolibarr_project > 0;
