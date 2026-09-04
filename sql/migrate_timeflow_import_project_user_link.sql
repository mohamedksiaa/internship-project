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

-- Records the (project, user) associations found in a Clockify CSV import —
-- mirrors llx_timeflow_import_user_group_link, one row per distinct pair
-- seen while scanning the file. Lets the real import step grant project
-- access via the native contact mechanism (Project::add_contact(),
-- PROJECTCONTRIBUTOR/internal — same rule consumed by
-- timeflowCanAccessProject()) once both the project and the user sides of
-- the mapping are resolved. No row is written to llx_element_contact from
-- this table automatically; that happens only at the confirmed-import step
-- (executeClockifyImport). Deliberately project<->user only, never
-- project<->group: Dolibarr's native project contact system has no concept
-- of a group-level contact, and access is checked per-user
-- (llx_element_contact.fk_socpeople), never expanded through group
-- membership — see timeflowCanAccessProject()/timeflowFetchProjects().
CREATE TABLE llx_timeflow_import_project_user_link(
    rowid                integer AUTO_INCREMENT PRIMARY KEY NOT NULL,
    entity               integer DEFAULT 1 NOT NULL,
    source_system        varchar(64) NOT NULL,
    project_source_value varchar(255) NOT NULL,
    user_source_value    varchar(255) NOT NULL,
    date_creation        datetime NOT NULL,
    fk_user_creat        integer NOT NULL,
    INDEX idx_timeflow_import_pul_entity (entity),
    INDEX idx_timeflow_import_pul_system (source_system),
    INDEX idx_timeflow_import_pul_project (project_source_value),
    INDEX idx_timeflow_import_pul_user (user_source_value),
    UNIQUE INDEX uk_timeflow_import_pul_unique (source_system, project_source_value, user_source_value)
) ENGINE=innodb;
