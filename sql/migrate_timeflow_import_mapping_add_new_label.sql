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

-- Stores the (possibly user-edited) title chosen for a project mapping
-- resolved as "create_new". No llx_timeflow_project row is created at
-- resolution time; the real import step reads this column to create it.
ALTER TABLE llx_timeflow_import_mapping
    ADD COLUMN new_label varchar(255) DEFAULT NULL AFTER target_action;
