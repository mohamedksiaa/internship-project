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

-- sql/migrate_add_daily_report_status.sql
-- Migration: add validation status to llx_timeflow_daily_report
-- Status values: 1 = submitted, 2 = validated, 9 = rejected
-- Safe to run multiple times thanks to IF NOT EXISTS / IF NULL updates.

ALTER TABLE llx_timeflow_daily_report
  ADD COLUMN IF NOT EXISTS status INT NOT NULL DEFAULT 1 AFTER fk_user_modif;

-- Backfill existing reports:
-- - reports already marked as read are treated as validated
-- - unread reports stay in submitted state
UPDATE llx_timeflow_daily_report
SET status = 2
WHERE status IS NULL OR status = 0
  AND read_at IS NOT NULL;

UPDATE llx_timeflow_daily_report
SET status = 1
WHERE status IS NULL OR status = 0
  AND read_at IS NULL;

ALTER TABLE llx_timeflow_daily_report
  ADD INDEX IF NOT EXISTS idx_timeflow_daily_report_status (status);

-- Rollback notes (manual):
-- ALTER TABLE llx_timeflow_daily_report DROP INDEX IF EXISTS idx_timeflow_daily_report_status;
-- ALTER TABLE llx_timeflow_daily_report DROP COLUMN IF EXISTS status;
