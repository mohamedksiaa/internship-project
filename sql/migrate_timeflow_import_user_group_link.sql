-- Copyright (C) 2026 SuperAdmin
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

-- Records the (user, group) associations found in a Clockify CSV import.
-- A CSV row's "Groupe" column can list several group names for one user
-- (comma-separated), unlike user_email/project which carry a single value
-- per row — this table is what lets the later, real import step recreate
-- every llx_usergroup_user link once both the user and the group sides of
-- the mapping are resolved. No row is written to llx_usergroup_user from
-- this table automatically; that happens only at the confirmed-import step.
CREATE TABLE llx_timeflow_import_user_group_link(
    rowid             integer AUTO_INCREMENT PRIMARY KEY NOT NULL,
    entity            integer DEFAULT 1 NOT NULL,
    source_system     varchar(64) NOT NULL,
    user_source_value varchar(255) NOT NULL,
    group_source_value varchar(255) NOT NULL,
    date_creation     datetime NOT NULL,
    fk_user_creat     integer NOT NULL,
    INDEX idx_timeflow_import_ugl_entity (entity),
    INDEX idx_timeflow_import_ugl_system (source_system),
    INDEX idx_timeflow_import_ugl_user (user_source_value),
    INDEX idx_timeflow_import_ugl_group (group_source_value),
    UNIQUE INDEX uk_timeflow_import_ugl_unique (source_system, user_source_value, group_source_value)
) ENGINE=innodb;
