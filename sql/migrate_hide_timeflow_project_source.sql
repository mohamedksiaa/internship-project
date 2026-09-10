-- Manual migration: remove the legacy "Source TimeFlow" project extrafield
-- from Dolibarr forms and lists without deleting its stored values.
--
-- Run this manually after reviewing it. It deletes only the extrafield
-- DEFINITION; llx_projet_extrafields.timeflow_source and all values already
-- recorded in that column are deliberately preserved.

DELETE FROM llx_extrafields
WHERE name = 'timeflow_source'
  AND elementtype = 'projet';

-- Verification (read-only):
-- SELECT name, elementtype FROM llx_extrafields
-- WHERE name = 'timeflow_source' AND elementtype = 'projet';
-- SHOW COLUMNS FROM llx_projet_extrafields LIKE 'timeflow_source';

-- Do NOT drop llx_projet_extrafields.timeflow_source here. Keeping the
-- column makes this cleanup non-destructive and preserves legacy data.
