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

-- Records the (project, client) association found in a Clockify CSV
-- import — mirrors llx_timeflow_import_user_group_link, one row per
-- distinct pair seen while scanning the file. Lets the real import step
-- set fk_soc on a project it creates (or already resolved) once both the
-- project and the client sides of the mapping are resolved. No row is
-- written to llx_projet.fk_soc from this table automatically; that
-- happens only at the confirmed-import step (executeClockifyImport).
CREATE TABLE llx_timeflow_import_project_client_link(
    rowid                integer AUTO_INCREMENT PRIMARY KEY NOT NULL,
    entity               integer DEFAULT 1 NOT NULL,
    source_system        varchar(64) NOT NULL,
    project_source_value varchar(255) NOT NULL,
    client_source_value  varchar(255) NOT NULL,
    date_creation        datetime NOT NULL,
    fk_user_creat        integer NOT NULL,
    INDEX idx_timeflow_import_pcl_entity (entity),
    INDEX idx_timeflow_import_pcl_system (source_system),
    INDEX idx_timeflow_import_pcl_project (project_source_value),
    INDEX idx_timeflow_import_pcl_client (client_source_value),
    UNIQUE INDEX uk_timeflow_import_pcl_unique (source_system, project_source_value, client_source_value)
) ENGINE=innodb;
