-- Expected absences recorded by a manager: one row per user and calendar day.
-- Read by the Reports > Users tab to tell "Absence prévue" apart from "Absent".
-- Hard-deleted on purpose (a planning marker, not accounting data), which also
-- keeps the unique key below usable.
--
-- reason_type: 'leave', 'sick' or 'other'. reason_note is the free-text
-- precision of an 'other' reason: nullable here, made mandatory for 'other' by
-- the application (timeflowValidateExpectedAbsenceInput) and left NULL for the
-- other reasons. ('rtt' was a fourth reason and was retired; a row that still
-- carries it is read as it is.)
CREATE TABLE llx_timeflow_expected_absence(
    rowid          integer AUTO_INCREMENT PRIMARY KEY NOT NULL,
    entity         integer DEFAULT 1 NOT NULL,
    fk_user        integer NOT NULL,
    date_absence   date NOT NULL,
    reason_type    varchar(16) DEFAULT 'other' NOT NULL,
    reason_note    varchar(255) DEFAULT NULL,
    fk_user_creat  integer NOT NULL,
    date_creation  datetime NOT NULL,
    INDEX idx_timeflow_expected_absence_date (entity, date_absence),
    UNIQUE INDEX uk_timeflow_expected_absence_user_day (entity, fk_user, date_absence)
) ENGINE=innodb;
