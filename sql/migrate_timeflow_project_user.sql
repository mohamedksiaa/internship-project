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

-- Restricts a llx_timeflow_project to a subset of users. Absence of any row
-- for a given fk_project means "open to everyone" (the default, preserving
-- current behavior for every existing project) — restriction only kicks in
-- once at least one row exists for that project.
CREATE TABLE llx_timeflow_project_user(
    rowid          integer AUTO_INCREMENT PRIMARY KEY NOT NULL,
    entity         integer DEFAULT 1 NOT NULL,
    fk_project     integer NOT NULL,
    fk_user        integer NOT NULL,
    date_creation  datetime NOT NULL,
    fk_user_creat  integer NOT NULL,
    INDEX idx_timeflow_project_user_entity (entity),
    INDEX idx_timeflow_project_user_project (fk_project),
    INDEX idx_timeflow_project_user_user (fk_user),
    UNIQUE INDEX uk_timeflow_project_user (fk_project, fk_user)
) ENGINE=innodb;
