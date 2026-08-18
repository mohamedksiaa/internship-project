-- Copyright (C) 2026		SuperAdmin
--
-- This program is free software: you can redistribute it and/or modify
-- it under the terms of the GNU General Public License as published by
-- the Free Software Foundation, either version 3 of the License, or
-- (at your option) any later version.
--
-- This program is distributed in the hope that it will be useful,
-- but WITHOUT ANY WARRANTY; without even the implied warranty of
-- MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
-- GNU General Public License for more details.
--
-- You should have received a copy of the GNU General Public License
-- along with this program.  If not, see https://www.gnu.org/licenses/.

CREATE TABLE llx_timeflow_timeentry_modification(
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
    INDEX idx_timeflow_timeentry_modification_timeentry (fk_timeentry),
    INDEX idx_timeflow_timeentry_modification_user (fk_user),
    INDEX idx_timeflow_timeentry_modification_action (action),
    INDEX idx_timeflow_timeentry_modification_date (date_creation)
) ENGINE=innodb;