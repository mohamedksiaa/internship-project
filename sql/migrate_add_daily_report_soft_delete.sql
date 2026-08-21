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
