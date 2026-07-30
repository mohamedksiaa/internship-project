- Copyright (C) 2026		SuperAdmin
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
-- BEGIN MODULEBUILDER INDEXES
ALTER TABLE llx_clockify_timeentry ADD INDEX idx_clockify_timeentry_rowid (rowid);
<<<<<<< HEAD
=======
ALTER TABLE llx_clockify_timeentry ADD INDEX idx_clockify_timeentry_entity (entity);
>>>>>>> 645ef6a7af5eadb86bb759a83254c9156ce8a74e
ALTER TABLE llx_clockify_timeentry ADD INDEX idx_clockify_timeentry_fk_user (fk_user);
ALTER TABLE llx_clockify_timeentry ADD INDEX idx_clockify_timeentry_fk_project (fk_project);
-- END MODULEBUILDER INDEXES
--ALTER TABLE llx_clockify_timeentry ADD UNIQUE INDEX uk_clockify_timeentry_fieldxy(fieldx, fieldy);
--ALTER TABLE llx_clockify_timeentry ADD CONSTRAINT llx_clockify_timeentry_fk_field FOREIGN KEY (fk_field) REFERENCES llx_clockify_myotherobject(rowid);
