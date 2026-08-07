--
-- Script run when an upgrade of Dolibarr is done. Whatever is the Dolibarr version.
--

-- A resumed timer remains on its original row.  These fields persist its resume count
-- and the beginning of its current segment; existing entries start at one occurrence.
ALTER TABLE llx_clockify_timeentry ADD COLUMN IF NOT EXISTS occurrence_count integer DEFAULT 1 NOT NULL AFTER duration;
ALTER TABLE llx_clockify_timeentry ADD COLUMN IF NOT EXISTS date_reprise datetime DEFAULT NULL AFTER occurrence_count;
UPDATE llx_clockify_timeentry SET occurrence_count = 1 WHERE occurrence_count IS NULL OR occurrence_count < 1;

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
