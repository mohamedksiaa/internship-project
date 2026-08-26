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
