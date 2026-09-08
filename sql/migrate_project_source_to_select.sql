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

-- Step 2 of the "Source TimeFlow" project extrafield evolution (step 1:
-- sql/migrate_project_extrafields.sql, which created it as a free-text
-- varchar). It was found to accept arbitrary typed text (e.g. "aaa" on
-- PJ2609-0009) because nothing ever restricted it — this locks it down to
-- exactly 3 known values and cleans up whatever doesn't already match.
--
-- Idempotent: safe to run more than once. The UPDATE ... WHERE ... NOT IN
-- clause below only ever touches rows that are not already a clean value, so
-- re-running it after the type/param UPDATE is a no-op.

-- 1a) A project with NO extrafield value ever set at all has NO row in
--     llx_projet_extrafields (Dolibarr only inserts a companion row once at
--     least one extrafield is written) — an UPDATE below cannot reach these,
--     it has nothing to match. Create the missing rows first.
INSERT INTO llx_projet_extrafields (fk_object, timeflow_source)
SELECT p.rowid, 'native'
FROM llx_projet AS p
WHERE NOT EXISTS (
    SELECT 1 FROM llx_projet_extrafields AS ef WHERE ef.fk_object = p.rowid
);

-- 1b) Clean existing values BEFORE locking the field down, so no row is ever
--    left holding a value outside the new closed list. Anything that is not
--    already 'manual' or 'clockify' (NULL, or free text like "aaa") is
--    reset to 'native' — the same fallback timeflowFetchTimeFlowProjects()
--    already applies when displaying an empty value, so this just makes the
--    stored value match what was already being shown.
UPDATE llx_projet_extrafields
SET timeflow_source = 'native'
WHERE timeflow_source IS NULL OR timeflow_source NOT IN ('manual', 'clockify');

-- 2) Turn the extrafield definition from free-text 'varchar' into a closed
--    'select' with exactly these 3 codes. The underlying storage column
--    (llx_projet_extrafields.timeflow_source, varchar(20)) is unchanged —
--    a Dolibarr select extrafield still just stores the chosen code string.
--    `param` is PHP serialize(['options' => [code => label, ...]]), the
--    exact structure core/class/extrafields.class.php reads to build the
--    dropdown (see ExtraFields::showInputField()/showOutputField()).
UPDATE llx_extrafields
SET type = 'select',
    param = 'a:1:{s:7:"options";a:3:{s:6:"manual";s:19:"Créé manuellement";s:8:"clockify";s:15:"Import Clockify";s:6:"native";s:28:"Créé nativement (Dolibarr)";}}'
WHERE name = 'timeflow_source' AND elementtype = 'projet' AND entity = 0;

-- Verification queries (read-only, run manually after the above):
-- SELECT timeflow_source, COUNT(*) FROM llx_projet_extrafields GROUP BY timeflow_source;
-- SELECT name, type, param FROM llx_extrafields WHERE name = 'timeflow_source';
