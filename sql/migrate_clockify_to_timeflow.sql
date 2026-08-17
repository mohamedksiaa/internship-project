-- Migration Clockify -> TimeFlow.
-- Execute once, after deploying the TimeFlow module files and before enabling it.
-- Each RENAME TABLE is atomic in MySQL/MariaDB; take a database backup first.

RENAME TABLE llx_clockify_project TO llx_timeflow_project;
RENAME TABLE llx_clockify_project_text TO llx_timeflow_project_text;
RENAME TABLE llx_clockify_task TO llx_timeflow_task;
RENAME TABLE llx_clockify_timeentry TO llx_timeflow_timeentry;
RENAME TABLE llx_clockify_timeentry_extrafields TO llx_timeflow_timeentry_extrafields;
RENAME TABLE llx_clockify_timeentry_modification TO llx_timeflow_timeentry_modification;
RENAME TABLE llx_clockify_daily_report TO llx_timeflow_daily_report;
RENAME TABLE llx_clockify_time_edit_log TO llx_timeflow_time_edit_log;

-- Preserve the data while bringing existing index names in line with TimeFlow.
ALTER TABLE llx_timeflow_project RENAME INDEX idx_cfp_entity TO idx_timeflow_project_entity;
ALTER TABLE llx_timeflow_project RENAME INDEX idx_cfp_fk_soc TO idx_timeflow_project_fk_soc;
ALTER TABLE llx_timeflow_project RENAME INDEX idx_cfp_source TO idx_timeflow_project_source;
ALTER TABLE llx_timeflow_project RENAME INDEX idx_cfp_fk_dolibarr TO idx_timeflow_project_fk_dolibarr;
ALTER TABLE llx_timeflow_timeentry_modification RENAME INDEX idx_ctm_rowid TO idx_timeflow_timeentry_modification_rowid;
ALTER TABLE llx_timeflow_timeentry_modification RENAME INDEX idx_ctm_entity TO idx_timeflow_timeentry_modification_entity;
ALTER TABLE llx_timeflow_timeentry_modification RENAME INDEX idx_ctm_timeentry TO idx_timeflow_timeentry_modification_timeentry;
ALTER TABLE llx_timeflow_timeentry_modification RENAME INDEX idx_ctm_user TO idx_timeflow_timeentry_modification_user;
ALTER TABLE llx_timeflow_timeentry_modification RENAME INDEX idx_ctm_action TO idx_timeflow_timeentry_modification_action;
ALTER TABLE llx_timeflow_timeentry_modification RENAME INDEX idx_ctm_date TO idx_timeflow_timeentry_modification_date;

-- Keep the module active after its technical-name change.
UPDATE llx_const
SET name = 'MAIN_MODULE_TIMEFLOW'
WHERE name = 'MAIN_MODULE_CLOCKIFY';

UPDATE llx_const
SET name = CONCAT('TIMEFLOW_', SUBSTRING(name, CHAR_LENGTH('CLOCKIFY_') + 1))
WHERE name LIKE 'CLOCKIFY_%';

-- Module, permissions and menu records retain their identifiers but must use
-- the new technical name, class and routes.
UPDATE llx_rights_def
SET module = 'timeflow'
WHERE module = 'clockify';

UPDATE llx_menu
SET mainmenu = 'timeflow',
    url = REPLACE(url, '/clockify/', '/timeflow/'),
    langs = REPLACE(langs, 'clockify@clockify', 'timeflow@timeflow')
WHERE mainmenu = 'clockify'
   OR url LIKE '/clockify/%'
   OR langs LIKE '%clockify@clockify%';
