-- One row per (entity, calendar day) for the morning late-arrival job
-- (class/timeflowlatecheck.class.php). It is the day's lock as well as its audit:
-- the row is inserted BEFORE the detection, so only the run whose insert
-- succeeds does the work, and later ticks of the job (every 5 minutes) see the
-- day is already handled.
--
-- status: 'running' (claimed, not finished; taken over when stale),
--         'done', 'skipped_no_activity' (nobody expected started a timer before
--         the cut-off: treated as a non-working day), 'missed' (the job first ran
--         too long after the cut-off, e.g. after an outage: no late alert).
CREATE TABLE llx_timeflow_late_check(
    rowid          integer AUTO_INCREMENT PRIMARY KEY NOT NULL,
    entity         integer DEFAULT 1 NOT NULL,
    date_check     date NOT NULL,
    cutoff         datetime NOT NULL,
    status         varchar(24) NOT NULL,
    date_run       datetime NOT NULL,
    date_end       datetime DEFAULT NULL,
    nb_expected    integer DEFAULT 0 NOT NULL,
    nb_late        integer DEFAULT 0 NOT NULL,
    nb_recipients  integer DEFAULT 0 NOT NULL,
    nb_emails      integer DEFAULT 0 NOT NULL,
    UNIQUE INDEX uk_timeflow_late_check_day (entity, date_check)
) ENGINE=innodb;
