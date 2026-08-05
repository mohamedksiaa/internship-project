-- Migration: decouple Clockify from Dolibarr native llx_projet
-- Strategy: mirror existing Dolibarr projects into llx_clockify_project,
-- then repoint llx_clockify_timeentry.fk_project to the new table.

-- 1. Mirror Dolibarr projects into llx_clockify_project (skip duplicates)
INSERT INTO llx_clockify_project (entity, ref, title, description, source, fk_dolibarr_project, fk_soc, fk_user_creat, date_creation, import_key)
SELECT
    p.entity,
    p.ref,
    p.title,
    p.description,
    'migrated',
    p.rowid,
    p.fk_soc,
    p.fk_user_creat,
    p.datec,
    p.import_key
FROM llx_projet AS p
LEFT JOIN llx_clockify_project AS cp ON cp.fk_dolibarr_project = p.rowid AND cp.entity = p.entity
WHERE cp.rowid IS NULL;

-- 2. Repoint timeentry fk_project from llx_projet.rowid -> llx_clockify_project.rowid
UPDATE llx_clockify_timeentry AS te
INNER JOIN llx_clockify_project AS cp ON cp.fk_dolibarr_project = te.fk_project AND cp.entity = te.entity
SET te.fk_project = cp.rowid
WHERE te.fk_project > 0
  AND cp.fk_dolibarr_project IS NOT NULL
  AND cp.fk_dolibarr_project > 0;
