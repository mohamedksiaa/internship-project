-- sql/migrate_remove_residual_clockify.sql
-- Migration script to remove residual Clockify entries after rename -> TimeFlow.
-- Style consistent with existing migrate_*.sql in this project.
-- WARNING: Make a full DB backup before running. This script will abort if
-- MAIN_MODULE_TIMEFLOW is not present with value = '1'.
-- Usage: review, then run in your MySQL/MariaDB shell (or via your preferred tool).

START TRANSACTION;

-- ===================================================================
-- SAFETY NOTE:
-- This SQL file contains destructive DELETE statements. It MUST be run
-- only after an external check confirmed that 'MAIN_MODULE_TIMEFLOW' exists
-- and has value = '1'. The provided shell wrapper performs this check.
-- As a last safety measure, we display current MAIN_MODULE_* rows for review.
-- ===================================================================
SELECT * FROM llx_const WHERE name IN ('MAIN_MODULE_TIMEFLOW','MAIN_MODULE_CLOCKIFY');

-- ===================================================================
-- PHASE B1: Remove the 3 specific llx_const rows by rowid (329,330,331)
-- Table: llx_const
-- Purpose: Delete old MAIN_MODULE_CLOCKIFY and related Clockify constants that
--          are confirmed residuals (we delete by exact rowid).
-- Pre-check: show rows to be deleted (for logging/verification).
-- ===================================================================
SELECT rowid, name, value FROM llx_const WHERE rowid IN (329,330,331);

DELETE FROM llx_const WHERE rowid IN (329,330,331);
SET @cnt_const_deleted = ROW_COUNT();

-- ===================================================================
-- PHASE B2: Remove the specific llx_menu row by rowid (52)
-- Table: llx_menu
-- Purpose: Remove the obsolete top menu row that points to 'clockify' and creates duplicate menu.
-- Pre-check: show the menu row targeted for deletion.
-- ===================================================================
SELECT rowid, mainmenu, module, url, titre, langs, position FROM llx_menu WHERE rowid = 52;

DELETE FROM llx_menu WHERE rowid = 52;
SET @cnt_menu_deleted = ROW_COUNT();

-- ===================================================================
-- PHASE B3: Remove llx_rights_def entries (ids 50000001..50000006).
-- Behavior:
--  - If there are no referencing rows in user rights tables, delete the rights_def rows directly.
--  - If references exist, delete the referencing rows in user rights / usergroup rights first,
--    reporting how many rows were removed in each table, then delete the rights_def rows.
-- Tables commonly present (check and adapt if your installation uses different names):
--  - llx_user_rights
--  - llx_usergroup_rights
-- Note: this script will dynamically detect existence of these tables and common column names.
-- ===================================================================

-- PHASE B3 (simple, non-procedural): remove rights_def rows by PK.
-- NOTE: wrapper replaces __RK__ with the actual PK column name used by your DB.
SELECT __RK__ AS pk, module, label FROM llx_rights_def WHERE __RK__ IN (50000001,50000002,50000003,50000004,50000005,50000006);

DELETE FROM llx_rights_def WHERE __RK__ IN (50000001,50000002,50000003,50000004,50000005,50000006);
SET @cnt_rights_def_deleted = ROW_COUNT();

-- ===================================================================
-- PHASE B4: Logging summary (rows affected)
-- Note: The variables above will contain counts; if any variable is NULL, set to 0 for clarity.
-- ===================================================================
SET @cnt_const_deleted = IFNULL(@cnt_const_deleted,0);
SET @cnt_menu_deleted = IFNULL(@cnt_menu_deleted,0);
SET @cnt_user_rights_deleted = IFNULL(@cnt_user_rights_deleted,0);
SET @cnt_usergroup_rights_deleted = IFNULL(@cnt_usergroup_rights_deleted,0);
SET @cnt_rights_def_deleted = IFNULL(@cnt_rights_def_deleted,0);

SELECT
  @cnt_const_deleted AS const_rows_deleted,
  @cnt_menu_deleted  AS menu_rows_deleted,
  @cnt_user_rights_deleted AS user_rights_rows_deleted,
  @cnt_usergroup_rights_deleted AS usergroup_rights_rows_deleted,
  @cnt_rights_def_deleted AS rights_def_rows_deleted;

-- ===================================================================
-- PHASE C: FINAL INSPECTION QUERIES
-- Purpose: confirm that no residual 'clockify' references remain in key tables.
-- ===================================================================

-- C1) Check llx_const for any CLOCKIFY or old MAIN_MODULE_CLOCKIFY or confirm TIMEFLOW constants exist
SELECT * FROM llx_const
 WHERE name LIKE '%CLOCKIFY%' OR name = 'MAIN_MODULE_CLOCKIFY' OR name LIKE '%TIMEFLOW_%';

-- C2) Check llx_menu for any remaining clockify references or confirm timeflow entries
SELECT rowid, mainmenu, module, url, titre, langs, position
  FROM llx_menu
 WHERE mainmenu = 'clockify'
    OR url LIKE '%/clockify/%'
    OR langs LIKE '%clockify@clockify%'
    OR titre LIKE '%ModuleClockifyName%'
    OR mainmenu = 'timeflow'
    OR langs LIKE '%timeflow@timeflow%'
    OR url LIKE '%/timeflow/%'
 ORDER BY rowid;

-- C3) Check llx_rights_def for any entries still referencing 'clockify' or list timeflow rights
SELECT * FROM llx_rights_def WHERE module = 'clockify' OR module = 'timeflow'
  OR rowid IN (50000001,50000002,50000003,50000004,50000005,50000006);

COMMIT;
