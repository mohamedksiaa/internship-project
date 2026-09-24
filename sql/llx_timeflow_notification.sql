-- In-app notifications of TimeFlow (the bell of the React header). Today's only
-- type is 'late_arrivals': one digest per manager and per day, listing the
-- employees who had not started a timer by the cut-off.
--
-- The unique key is what makes the alert happen at most once per manager and
-- day: the row is inserted BEFORE any email is sent, so a second run (a cron
-- tick twice, a retry after a crash) fails on the key and sends nothing.
--
-- payload: JSON, e.g. {"threshold":"09:00","grace":10,"late":[{"id":4,"label":"..."}]}
-- email_status: NULL (not decided yet), 'sent', 'failed', 'skipped_pref' (the
-- manager opted out), 'skipped_no_address' (no email on the user card),
-- 'skipped_disabled' (mail sending is switched off on this instance).
CREATE TABLE llx_timeflow_notification(
    rowid           integer AUTO_INCREMENT PRIMARY KEY NOT NULL,
    entity          integer DEFAULT 1 NOT NULL,
    fk_user         integer NOT NULL,
    notif_type      varchar(32) NOT NULL,
    date_ref        date NOT NULL,
    payload         text,
    date_creation   datetime NOT NULL,
    date_read       datetime DEFAULT NULL,
    email_status    varchar(24) DEFAULT NULL,
    email_attempts  smallint DEFAULT 0 NOT NULL,
    email_error     varchar(255) DEFAULT NULL,
    email_date      datetime DEFAULT NULL,
    INDEX idx_timeflow_notification_user (entity, fk_user, date_read),
    UNIQUE INDEX uk_timeflow_notification_once (entity, fk_user, notif_type, date_ref)
) ENGINE=innodb;
