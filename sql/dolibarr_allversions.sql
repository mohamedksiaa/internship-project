--
-- Script run when an upgrade of Dolibarr is done. Whatever is the Dolibarr version.
--

-- Daily free-text reports, separate from the numerical time-entry reports.
CREATE TABLE IF NOT EXISTS llx_clockify_daily_report(
    rowid          integer AUTO_INCREMENT PRIMARY KEY NOT NULL,
    entity         integer DEFAULT 1 NOT NULL,
    fk_user        integer NOT NULL,
    date_report    date NOT NULL,
    content        text NOT NULL,
    date_creation  datetime NOT NULL,
    tms            timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    fk_user_creat  integer NOT NULL,
    fk_user_modif  integer DEFAULT NULL,
    read_at        datetime DEFAULT NULL,
    fk_user_read   integer DEFAULT NULL,
    UNIQUE KEY uk_cdr_user_date (entity, fk_user, date_report),
    INDEX idx_cdr_date (entity, date_report),
    INDEX idx_cdr_user (entity, fk_user)
) ENGINE=innodb;
ALTER TABLE llx_clockify_daily_report DROP INDEX IF EXISTS uk_cdr_user_date;

-- A resumed timer remains on its original row.  These fields persist its resume count
-- and the beginning of its current segment; existing entries start at one occurrence.
ALTER TABLE llx_clockify_timeentry ADD COLUMN IF NOT EXISTS occurrence_count integer DEFAULT 1 NOT NULL AFTER duration;
ALTER TABLE llx_clockify_timeentry ADD COLUMN IF NOT EXISTS date_reprise datetime DEFAULT NULL AFTER occurrence_count;
UPDATE llx_clockify_timeentry SET occurrence_count = 1 WHERE occurrence_count IS NULL OR occurrence_count < 1;

-- The manual-edit marker belongs to the time entry, never to the editor.
-- Backfill it from both audit formats so managers immediately see corrections
-- made before this release too.
ALTER TABLE llx_clockify_timeentry ADD COLUMN IF NOT EXISTS is_manually_edited tinyint DEFAULT 0 NOT NULL AFTER duration;
CREATE TABLE IF NOT EXISTS llx_clockify_time_edit_log(
    id integer AUTO_INCREMENT PRIMARY KEY NOT NULL,
    entity integer DEFAULT 1 NOT NULL,
    fk_time_entry integer NOT NULL,
    fk_user_editor integer NOT NULL,
    date_modification datetime NOT NULL,
    old_start datetime NOT NULL,
    new_start datetime NOT NULL,
    old_end datetime DEFAULT NULL,
    new_end datetime DEFAULT NULL,
    reason text NOT NULL,
    ip varchar(64),
    user_agent text,
    INDEX idx_ctel_timeentry (fk_time_entry),
    INDEX idx_ctel_user (fk_user_editor),
    INDEX idx_ctel_date (date_modification)
) ENGINE=innodb;
UPDATE llx_clockify_timeentry AS t
INNER JOIN llx_clockify_time_edit_log AS l ON l.fk_time_entry = t.rowid
SET t.is_manually_edited = 1
WHERE t.is_manually_edited = 0;
-- Add audit trail table for manual time adjustments
CREATE TABLE IF NOT EXISTS llx_clockify_timeentry_modification(
    rowid         integer AUTO_INCREMENT PRIMARY KEY NOT NULL,
    entity        integer DEFAULT 1 NOT NULL,
    fk_timeentry  integer NOT NULL,
    fk_user       integer NOT NULL,
    action        varchar(20) NOT NULL,
    field_name    varchar(64) NOT NULL,
    old_value     text,
    new_value     text,
    reason        text NOT NULL,
    date_creation datetime NOT NULL,
    fk_user_creat integer NOT NULL,
    INDEX idx_ctm_timeentry (fk_timeentry),
    INDEX idx_ctm_user (fk_user),
    INDEX idx_ctm_action (action),
    INDEX idx_ctm_date (date_creation)
) ENGINE=innodb;

UPDATE llx_clockify_timeentry AS t
INNER JOIN llx_clockify_timeentry_modification AS m ON m.fk_timeentry = t.rowid
SET t.is_manually_edited = 1
WHERE t.is_manually_edited = 0
  AND m.action IN ('manual_employee', 'manual_manager', 'manual_create');

-- Add internal project management table
CREATE TABLE IF NOT EXISTS llx_clockify_project(
    rowid         integer AUTO_INCREMENT PRIMARY KEY NOT NULL,
    entity        integer DEFAULT 1 NOT NULL,
    ref           varchar(128) NOT NULL,
    title         varchar(255) NOT NULL,
    description   text,
    source        varchar(20) NOT NULL DEFAULT 'manual',
    fk_dolibarr_project integer DEFAULT NULL,
    fk_soc        integer DEFAULT NULL,
    fk_user_creat integer NOT NULL,
    date_creation datetime NOT NULL,
    tms           timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    import_key    varchar(14),
    INDEX idx_cfp_entity (entity),
    INDEX idx_cfp_fk_soc (fk_soc),
    INDEX idx_cfp_source (source),
    INDEX idx_cfp_fk_dolibarr (fk_dolibarr_project)
) ENGINE=innodb;

-- Add free-text project table for custom project labels
CREATE TABLE IF NOT EXISTS llx_clockify_project_text(
    rowid         integer AUTO_INCREMENT PRIMARY KEY NOT NULL,
    entity        integer DEFAULT 1 NOT NULL,
    fk_timeentry  integer DEFAULT NULL,
    project_label varchar(255) NOT NULL,
    description   text,
    fk_user_creat integer NOT NULL,
    date_creation datetime NOT NULL,
    tms           timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    import_key    varchar(14),
    INDEX idx_ccpt_entity (entity),
    INDEX idx_ccpt_fk_timeentry (fk_timeentry),
    INDEX idx_ccpt_project_label (project_label),
    INDEX idx_ccpt_fk_user_creat (fk_user_creat)
) ENGINE=innodb;

-- Add task table for free-text task descriptions
CREATE TABLE IF NOT EXISTS llx_clockify_task(
    rowid         integer AUTO_INCREMENT PRIMARY KEY NOT NULL,
    entity        integer DEFAULT 1 NOT NULL,
    fk_user       integer NOT NULL,
    fk_timeentry  integer DEFAULT NULL,
    label         text NOT NULL,
    description   text,
    fk_user_creat integer NOT NULL,
    date_creation datetime NOT NULL,
    tms           timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    import_key    varchar(14),
    INDEX idx_cct_entity (entity),
    INDEX idx_cct_fk_user (fk_user),
    INDEX idx_cct_fk_timeentry (fk_timeentry),
    INDEX idx_cct_date_creation (date_creation)
) ENGINE=innodb;
