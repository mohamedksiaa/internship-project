--
-- Script run when an upgrade of Dolibarr is done. Whatever is the Dolibarr version.
--

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