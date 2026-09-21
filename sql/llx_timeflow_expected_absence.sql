-- Expected absences recorded by a manager: one row per user and calendar day.
-- Read by the Reports > Users tab to tell "Absence prévue" apart from "Absent".
-- Hard-deleted on purpose (a planning marker, not accounting data), which also
-- keeps the unique key below usable.
CREATE TABLE llx_timeflow_expected_absence(
    rowid          integer AUTO_INCREMENT PRIMARY KEY NOT NULL,
    entity         integer DEFAULT 1 NOT NULL,
    fk_user        integer NOT NULL,
    date_absence   date NOT NULL,
    reason_type    varchar(16) DEFAULT 'other' NOT NULL,
    fk_user_creat  integer NOT NULL,
    date_creation  datetime NOT NULL,
    INDEX idx_timeflow_expected_absence_date (entity, date_absence),
    UNIQUE INDEX uk_timeflow_expected_absence_user_day (entity, fk_user, date_absence)
) ENGINE=innodb;
