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

-- sql/migrate_backfill_daily_report_validated_at.sql
-- One-shot backfill for legacy daily reports that were already processed before the
-- date_validated_at column existed.
--
-- We use the same processed timestamp semantics as the ProcessedHistory view:
-- tms is the closest available server-side record of the processing event for
-- historical rows. We keep read_at as a last fallback only because it may have
-- been updated later by a read event, and that is precisely the source of the bug.
-- This script intentionally avoids using read_at before tms/date_last_content_edit.

ALTER TABLE llx_timeflow_daily_report
  ADD COLUMN IF NOT EXISTS date_validated_at DATETIME DEFAULT NULL AFTER read_at;

UPDATE llx_timeflow_daily_report AS r
SET r.date_validated_at = COALESCE(
    CASE WHEN r.tms IS NOT NULL AND r.tms <> '0000-00-00 00:00:00' THEN r.tms END,
    CASE WHEN r.date_last_content_edit IS NOT NULL AND r.date_last_content_edit <> '0000-00-00 00:00:00' THEN r.date_last_content_edit END,
    CASE WHEN r.date_creation IS NOT NULL AND r.date_creation <> '0000-00-00 00:00:00' THEN r.date_creation END,
    CASE WHEN r.read_at IS NOT NULL AND r.read_at <> '0000-00-00 00:00:00' THEN r.read_at END
)
WHERE r.date_validated_at IS NULL
  AND r.status IN (2, 9)
  AND (
    r.tms IS NOT NULL
    OR r.date_last_content_edit IS NOT NULL
    OR r.date_creation IS NOT NULL
    OR r.read_at IS NOT NULL
  );

-- Rollback notes (manual):
-- ALTER TABLE llx_timeflow_daily_report DROP COLUMN IF EXISTS date_validated_at;
