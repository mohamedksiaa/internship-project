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

-- Step 1 of the TimeFlow -> native llx_projet migration (see the audit
-- "Unification des projets TimeFlow / Dolibarr natif").
--
-- Adds the two TimeFlow-specific fields that have no native equivalent
-- (timeflow_source, timeflow_import_key) as standard Dolibarr extrafields
-- on elementtype='projet', using the exact mechanism the extrafields admin
-- screen itself uses: a real column on the companion *_extrafields table,
-- plus a metadata row in llx_extrafields describing it. No core table is
-- restructured — llx_projet_extrafields/llx_extrafields are Dolibarr's own
-- built-in extension points for exactly this purpose.
--
-- Idempotent: safe to run more than once. MariaDB 10.6 supports
-- "ADD COLUMN IF NOT EXISTS"; the llx_extrafields inserts are guarded with
-- a NOT EXISTS check since there is no natural unique key to rely on.

ALTER TABLE llx_projet_extrafields
    ADD COLUMN IF NOT EXISTS timeflow_source varchar(20) DEFAULT NULL;

ALTER TABLE llx_projet_extrafields
    ADD COLUMN IF NOT EXISTS timeflow_import_key varchar(14) DEFAULT NULL;

-- entity = 0: extrafield DEFINITIONS are global across entities in
-- Dolibarr's convention (only the per-record VALUES are entity-scoped, via
-- llx_projet's own entity column) — same as how the extrafields admin
-- screen creates them.

INSERT INTO llx_extrafields
    (name, entity, elementtype, label, type, size, fieldunique, fieldrequired,
     alwayseditable, `list`, printable, totalizable, module, pos, datec)
SELECT
    'timeflow_source', 0, 'projet', 'Source TimeFlow', 'varchar', '20', 0, 0,
    1, '1', 1, 0, 'timeflow', 1, NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM llx_extrafields WHERE name = 'timeflow_source' AND elementtype = 'projet' AND entity = 0
);

INSERT INTO llx_extrafields
    (name, entity, elementtype, label, type, size, fieldunique, fieldrequired,
     alwayseditable, `list`, printable, totalizable, module, pos, datec)
SELECT
    'timeflow_import_key', 0, 'projet', 'Clé d''import TimeFlow', 'varchar', '14', 0, 0,
    1, '0', 0, 0, 'timeflow', 2, NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM llx_extrafields WHERE name = 'timeflow_import_key' AND elementtype = 'projet' AND entity = 0
);

-- Verification queries (read-only, run manually after the above):
-- SHOW COLUMNS FROM llx_projet_extrafields LIKE 'timeflow_%';
-- SELECT name, elementtype, label, type, size FROM llx_extrafields WHERE elementtype = 'projet';
