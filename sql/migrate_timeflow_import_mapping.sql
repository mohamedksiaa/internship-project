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

CREATE TABLE llx_timeflow_import_mapping(
    rowid          integer AUTO_INCREMENT PRIMARY KEY NOT NULL,
    entity         integer DEFAULT 1 NOT NULL,
    source_system  varchar(64) NOT NULL,
    mapping_type   varchar(32) NOT NULL,
    source_value   varchar(255) NOT NULL,
    target_id      integer DEFAULT NULL,
    target_action  varchar(32) NOT NULL DEFAULT 'create_pending',
    new_label      varchar(255) DEFAULT NULL,
    date_creation  datetime NOT NULL,
    tms            timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    fk_user_creat  integer NOT NULL,
    INDEX idx_timeflow_import_mapping_entity (entity),
    INDEX idx_timeflow_import_mapping_system (source_system),
    INDEX idx_timeflow_import_mapping_type (mapping_type),
    UNIQUE INDEX uk_timeflow_import_mapping_unique (source_system, mapping_type, source_value)
) ENGINE=innodb;
