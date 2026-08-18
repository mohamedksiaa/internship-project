-- Fix residual Clockify -> TimeFlow entries
-- WARNING: Backup your database before running this script.
-- This script inspects and updates llx_const, llx_menu and llx_rights_def

-- 1) Inspect potential leftovers
SELECT * FROM llx_const WHERE name = 'MAIN_MODULE_CLOCKIFY' OR name LIKE 'CLOCKIFY_%' OR value LIKE '%clockify%';
SELECT * FROM llx_menu WHERE mainmenu = 'clockify' OR url LIKE '%/clockify/%' OR langs LIKE '%clockify%';
SELECT * FROM llx_rights_def WHERE module = 'clockify';

-- 2) Rename main module constant (if present)
UPDATE llx_const
SET name = 'MAIN_MODULE_TIMEFLOW'
WHERE name = 'MAIN_MODULE_CLOCKIFY';

-- 3) Rename other CLOCKIFY_ constants to TIMEFLOW_
UPDATE llx_const
SET name = CONCAT('TIMEFLOW_', SUBSTRING(name, CHAR_LENGTH('CLOCKIFY_') + 1))
WHERE name LIKE 'CLOCKIFY_%';

-- 4) Update rights/module references
UPDATE llx_rights_def
SET module = 'timeflow'
WHERE module = 'clockify';

-- 5) Update leftover menu entries to point to timeflow (keeps them)
UPDATE llx_menu
SET mainmenu = 'timeflow',
    url = REPLACE(url, '/clockify/', '/timeflow/'),
    langs = REPLACE(langs, 'clockify@clockify', 'timeflow@timeflow'),
    titre = REPLACE(titre, 'ModuleClockifyName', 'ModuleTimeFlowName'),
    module = 'timeflow'
WHERE mainmenu = 'clockify'
   OR url LIKE '%/clockify/%'
   OR langs LIKE '%clockify@clockify%'
   OR module = 'clockify'
   OR titre LIKE '%ModuleClockifyName%';

-- 6) OPTIONAL: If you prefer to remove obsolete menu rows created by the old module,
-- uncomment the following DELETE. Use with care (backup first).
-- DELETE FROM llx_menu WHERE module = 'clockify' OR mainmenu = 'clockify';

-- 7) Final inspection queries
SELECT * FROM llx_const WHERE name LIKE '%CLOCKIFY%' OR name LIKE '%TIMEFLOW_%';
SELECT * FROM llx_menu WHERE mainmenu = 'timeflow' OR langs LIKE '%timeflow@timeflow%';
SELECT * FROM llx_rights_def WHERE module = 'timeflow';
