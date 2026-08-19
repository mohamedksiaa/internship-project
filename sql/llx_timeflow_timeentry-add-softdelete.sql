-- sql/llx_timeflow_timeentry-add-softdelete.sql
-- Migration: add soft-delete columns to llx_timeflow_timeentry
-- Adds `date_delete` (datetime) and `fk_user_delete` (int) and an index.
-- Safe to run multiple times thanks to IF NOT EXISTS clauses.

ALTER TABLE llx_timeflow_timeentry
  ADD COLUMN IF NOT EXISTS fk_user_delete INTEGER DEFAULT NULL AFTER fk_user_modif,
  ADD COLUMN IF NOT EXISTS date_delete DATETIME DEFAULT NULL AFTER tms;

-- Add index to speed up queries that filter by date_delete IS NULL
ALTER TABLE llx_timeflow_timeentry
  ADD INDEX IF NOT EXISTS idx_timeflow_timeentry_date_delete (date_delete);

-- Rollback notes (manual)
-- ALTER TABLE llx_timeflow_timeentry DROP INDEX IF EXISTS idx_timeflow_timeentry_date_delete;
-- ALTER TABLE llx_timeflow_timeentry DROP COLUMN IF EXISTS fk_user_delete;
-- ALTER TABLE llx_timeflow_timeentry DROP COLUMN IF EXISTS date_delete;
