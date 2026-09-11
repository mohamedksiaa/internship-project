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

-- sql/migrate_add_daily_report_soft_delete.sql
-- Migration: add soft-delete and content-edit tracking to llx_timeflow_daily_report
-- Safe to run multiple times thanks to IF NOT EXISTS clauses.
-- This is an add-only migration: it adds nullable columns with NULL defaults,
-- and does not update or delete any existing report rows.

ALTER TABLE llx_timeflow_daily_report
  ADD COLUMN IF NOT EXISTS date_delete DATETIME DEFAULT NULL AFTER tms,
  ADD COLUMN IF NOT EXISTS fk_user_delete INTEGER DEFAULT NULL AFTER fk_user_modif,
  ADD COLUMN IF NOT EXISTS date_last_content_edit DATETIME DEFAULT NULL AFTER read_at,
  ADD COLUMN IF NOT EXISTS fk_user_last_content_edit INTEGER DEFAULT NULL AFTER fk_user_read;

-- Add index to speed up queries that filter by deleted rows.
ALTER TABLE llx_timeflow_daily_report
  ADD INDEX IF NOT EXISTS idx_timeflow_daily_report_date_delete (date_delete);

-- Rollback notes (manual)
-- ALTER TABLE llx_timeflow_daily_report DROP INDEX IF EXISTS idx_timeflow_daily_report_date_delete;
-- ALTER TABLE llx_timeflow_daily_report DROP COLUMN IF EXISTS fk_user_last_content_edit;
-- ALTER TABLE llx_timeflow_daily_report DROP COLUMN IF EXISTS date_last_content_edit;
-- ALTER TABLE llx_timeflow_daily_report DROP COLUMN IF EXISTS fk_user_delete;
-- ALTER TABLE llx_timeflow_daily_report DROP COLUMN IF EXISTS date_delete;
