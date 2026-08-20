<?php
/* Copyright (C) 2026		SuperAdmin
 * Copyright (C) 2025       Frédéric France         <frederic.france@free.fr>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * \file    timeflow/lib/timeflow.lib.php
 * \ingroup timeflow
 * \brief   Library files with common functions for TimeFlow
 */

if (!class_exists('TimeEntry')) {
    dol_include_once('/timeflow/class/timeentry.class.php');
}

/**
 * Prepare admin pages header
 *
 * @return array<array{string,string,string}>
 */
function timeflowAdminPrepareHead()
{
	global $langs, $conf;

	// global $db;
	// $extrafields = new ExtraFields($db);
	// $extrafields->fetch_name_optionals_label('myobject');

	$langs->load("timeflow@timeflow");

	$h = 0;
	$head = array();

	$head[$h][0] = dolBuildUrl(dol_buildpath("/timeflow/admin/setup.php", 1));
	$head[$h][1] = $langs->trans("Settings");
	$head[$h][2] = 'settings';
	$h++;

	/*
	$head[$h][0] = dolBuildUrl(dol_buildpath("/timeflow/admin/myobject_extrafields.php", 1));
	$head[$h][1] = $langs->trans("ExtraFields");
	$nbExtrafields = (isset($extrafields->attributes['myobject']['label']) && is_countable($extrafields->attributes['myobject']['label'])) ? count($extrafields->attributes['myobject']['label']) : 0;
	if ($nbExtrafields > 0) {
		$head[$h][1] .= '<span class="badge marginleftonlyshort">' . $nbExtrafields . '</span>';
	}
	$head[$h][2] = 'myobject_extrafields';
	$h++;

	$head[$h][0] = dolBuildUrl(dol_buildpath("/timeflow/admin/myobjectline_extrafields.php", 1));
	$head[$h][1] = $langs->trans("ExtraFieldsLines");
	$nbExtrafields = (isset($extrafields->attributes['myobjectline']['label']) && is_countable($extrafields->attributes['myobjectline']['label'])) ? count($extrafields->attributes['myobject']['label']) : 0;
	if ($nbExtrafields > 0) {
		$head[$h][1] .= '<span class="badge marginleftonlyshort">' . $nbExtrafields . '</span>';
	}
	$head[$h][2] = 'myobject_extrafieldsline';
	$h++;
	*/

	$head[$h][0] = dolBuildUrl(dol_buildpath("/timeflow/admin/about.php", 1));
	$head[$h][1] = $langs->trans("About");
	$head[$h][2] = 'about';
	$h++;

	// Show more tabs from modules
	// Entries must be declared in modules descriptor with line
	//$this->tabs = array(
	//	'entity:+tabname:Title:@timeflow:/timeflow/mypage.php?id=__ID__'
	//); // to add new tab
	//$this->tabs = array(
	//	'entity:-tabname:Title:@timeflow:/timeflow/mypage.php?id=__ID__'
	//); // to remove a tab
	complete_head_from_modules($conf, $langs, null, $head, $h, 'timeflow@timeflow');

	complete_head_from_modules($conf, $langs, null, $head, $h, 'timeflow@timeflow', 'remove');

	return $head;
}

/**
 * Return the canonical manual-edit status for one entry.
 *
 * The module historically stored this information in three places:
 * - the main `is_manually_edited` field on the entry itself,
 * - the structured `timeflow_timeentry_modification` audit table,
 * - the legacy `timeflow_time_edit_log` audit table.
 *
 * We centralize the priority order in one helper and reuse it everywhere to
 * avoid divergent badge/filter/count logic across the app.
 *
 * @param DoliDB $db
 * @param int $entryId
 * @return array{modified:bool,reason:string,modified_at:string,modified_by:int,source:string}
 */
function timeflowGetManualEditStatus($db, $entryId)
{
    $entryId = (int) $entryId;
    $empty = array(
        'modified' => false,
        'reason' => '',
        'modified_at' => '',
        'modified_by' => 0,
        'source' => '',
    );

    if ($entryId <= 0) {
        return $empty;
    }

    $entryTable = $db->prefix().'timeflow_timeentry';
    $modernTable = $db->prefix().'timeflow_timeentry_modification';
    $legacyTable = $db->prefix().'timeflow_time_edit_log';

    $modernSql = 'SELECT fk_user, reason, date_creation FROM '.$modernTable.' WHERE fk_timeentry = '.((int) $entryId).' AND action IN (\'' . TimeEntry::MOD_ACTION_MANUAL_EMPLOYEE . '\',\'' . TimeEntry::MOD_ACTION_MANUAL_MANAGER . '\') ORDER BY date_creation DESC, rowid DESC LIMIT 1';
    $modernRes = $db->query($modernSql);
    if ($modernRes && ($modernObj = $db->fetch_object($modernRes))) {
        return array(
            'modified' => true,
            'reason' => (string) ($modernObj->reason ?? ''),
            'modified_at' => (string) ($modernObj->date_creation ?? ''),
            'modified_by' => (int) ($modernObj->fk_user ?? 0),
            'source' => 'timeflow_timeentry_modification',
        );
    }

    $flagSql = 'SELECT is_manually_edited FROM '.$entryTable.' WHERE rowid = '.((int) $entryId).' LIMIT 1';
    $flagRes = $db->query($flagSql);
    if ($flagRes && ($flagObj = $db->fetch_object($flagRes))) {
        $flagValue = isset($flagObj->is_manually_edited) ? (int) $flagObj->is_manually_edited : 0;
        if ($flagValue > 0) {
            return array(
                'modified' => true,
                'reason' => '',
                'modified_at' => '',
                'modified_by' => 0,
                'source' => 'is_manually_edited',
            );
        }
    }

    $legacySql = 'SELECT fk_user_editor, reason, date_modification FROM '.$legacyTable.' WHERE fk_time_entry = '.((int) $entryId).' ORDER BY date_modification DESC, id DESC LIMIT 1';
    $legacyRes = $db->query($legacySql);
    if ($legacyRes && ($legacyObj = $db->fetch_object($legacyRes))) {
        return array(
            'modified' => true,
            'reason' => (string) ($legacyObj->reason ?? ''),
            'modified_at' => (string) ($legacyObj->date_modification ?? ''),
            'modified_by' => (int) ($legacyObj->fk_user_editor ?? 0),
            'source' => 'timeflow_time_edit_log',
        );
    }

    return $empty;
}

/**
 * Shared SQL predicate expressing whether a row has ever been manually edited.
 *
 * Priority is intentionally centralized in one place: the row flag, then the
 * structured audit log, then the legacy log.
 *
 * @param DoliDB $db
 * @param string $tableAlias
 * @return string
 */
function timeflowManualEditedSqlPredicate($db, $tableAlias = 't')
{
    $alias = preg_replace('/[^A-Za-z0-9_]/', '', (string) $tableAlias);
    if ($alias === '') {
        $alias = 't';
    }

    $tableName = $db->escape($db->prefix().'timeflow_timeentry');
    $columnCheckSql = "SELECT 1 FROM information_schema.columns WHERE table_name = '".$tableName."' AND column_name = 'is_manually_edited' LIMIT 1";
    $columnCheckRes = $db->query($columnCheckSql);
    $hasFlagColumn = ($columnCheckRes && $db->num_rows($columnCheckRes) > 0);

    $modernTable = $db->prefix().'timeflow_timeentry_modification';
    $legacyTable = $db->prefix().'timeflow_time_edit_log';

    $modernExistsSql = "SELECT 1 FROM information_schema.tables WHERE table_name = '".$db->escape($db->prefix().'timeflow_timeentry_modification')."' LIMIT 1";
    $legacyExistsSql = "SELECT 1 FROM information_schema.tables WHERE table_name = '".$db->escape($db->prefix().'timeflow_time_edit_log')."' LIMIT 1";
    $modernExistsRes = $db->query($modernExistsSql);
    $legacyExistsRes = $db->query($legacyExistsSql);
    $hasModernTable = ($modernExistsRes && $db->num_rows($modernExistsRes) > 0);
    $hasLegacyTable = ($legacyExistsRes && $db->num_rows($legacyExistsRes) > 0);

    $parts = array();
    if ($hasFlagColumn) {
        $parts[] = $alias.'.is_manually_edited = 1';
    }
    if ($hasModernTable) {
        $parts[] = "EXISTS (SELECT 1 FROM ".$modernTable." m WHERE m.fk_timeentry = ".$alias.".rowid AND m.action IN ('".TimeEntry::MOD_ACTION_MANUAL_EMPLOYEE."','".TimeEntry::MOD_ACTION_MANUAL_MANAGER."') LIMIT 1)";
    }
    if ($hasLegacyTable) {
        $parts[] = "EXISTS (SELECT 1 FROM ".$legacyTable." l WHERE l.fk_time_entry = ".$alias.".rowid LIMIT 1)";
    }

    if (empty($parts)) {
        return '0';
    }

    return '('.implode(' OR ', $parts).')';
}
