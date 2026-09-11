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

-- Manual migration: remove the legacy "Source TimeFlow" project extrafield
-- from Dolibarr forms and lists without deleting its stored values.
--
-- Run this manually after reviewing it. It deletes only the extrafield
-- DEFINITION; llx_projet_extrafields.timeflow_source and all values already
-- recorded in that column are deliberately preserved.

DELETE FROM llx_extrafields
WHERE name = 'timeflow_source'
  AND elementtype = 'projet';

-- Verification (read-only):
-- SELECT name, elementtype FROM llx_extrafields
-- WHERE name = 'timeflow_source' AND elementtype = 'projet';
-- SHOW COLUMNS FROM llx_projet_extrafields LIKE 'timeflow_source';

-- Do NOT drop llx_projet_extrafields.timeflow_source here. Keeping the
-- column makes this cleanup non-destructive and preserves legacy data.
