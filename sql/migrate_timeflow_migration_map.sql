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

-- Step 2 support table for the TimeFlow -> native llx_projet migration.
-- Records, for every llx_timeflow_project row that was migrated, which
-- llx_projet row it now corresponds to and how the correspondence was
-- established. Read by scripts/migrate_projects_to_native.php (writer) and
-- scripts/remap_project_fk.php (reader, for step 3's FK remap).
--
-- This is a TEMPORARY working table for the migration, not a permanent
-- part of the schema — it is meant to be dropped once the whole migration
-- (including the application-code cutover, done in a later step) is
-- validated. Kept around deliberately for now so the remap step and any
-- manual audit can rely on it.
CREATE TABLE IF NOT EXISTS llx_timeflow_migration_map (
    rowid          integer AUTO_INCREMENT PRIMARY KEY NOT NULL,
    old_rowid      integer NOT NULL,      -- llx_timeflow_project.rowid
    new_rowid      integer NOT NULL,      -- llx_projet.rowid
    method         varchar(32) NOT NULL,  -- 'created' | 'linked_fk_dolibarr_project' | 'reused_by_ref'
    date_creation  datetime NOT NULL,
    UNIQUE INDEX uk_timeflow_migration_map_old (old_rowid),
    INDEX idx_timeflow_migration_map_new (new_rowid)
) ENGINE=innodb;
