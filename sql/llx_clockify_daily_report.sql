-- Daily free-text activity reports, one per user and calendar day.
CREATE TABLE llx_clockify_daily_report(
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
