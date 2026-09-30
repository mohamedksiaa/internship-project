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

	$head[$h][0] = dol_buildpath("/timeflow/admin/setup.php", 1);
	$head[$h][1] = $langs->trans("Settings");
	$head[$h][2] = 'settings';
	$h++;

	/*
	$head[$h][0] = dol_buildpath("/timeflow/admin/myobject_extrafields.php", 1);
	$head[$h][1] = $langs->trans("ExtraFields");
	$nbExtrafields = (isset($extrafields->attributes['myobject']['label']) && is_countable($extrafields->attributes['myobject']['label'])) ? count($extrafields->attributes['myobject']['label']) : 0;
	if ($nbExtrafields > 0) {
		$head[$h][1] .= '<span class="badge marginleftonlyshort">' . $nbExtrafields . '</span>';
	}
	$head[$h][2] = 'myobject_extrafields';
	$h++;

	$head[$h][0] = dol_buildpath("/timeflow/admin/myobjectline_extrafields.php", 1);
	$head[$h][1] = $langs->trans("ExtraFieldsLines");
	$nbExtrafields = (isset($extrafields->attributes['myobjectline']['label']) && is_countable($extrafields->attributes['myobjectline']['label'])) ? count($extrafields->attributes['myobject']['label']) : 0;
	if ($nbExtrafields > 0) {
		$head[$h][1] .= '<span class="badge marginleftonlyshort">' . $nbExtrafields . '</span>';
	}
	$head[$h][2] = 'myobject_extrafieldsline';
	$h++;
	*/

	$head[$h][0] = dol_buildpath("/timeflow/admin/about.php", 1);
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

/**
 * A manager may receive this dedicated permission without becoming a Dolibarr
 * administrator. Every non-validation list must use this server-side scope —
 * except the Calendar (timeflowFetchWeeklyTimesheet() in ajax/timeentry.php),
 * which is strictly personal on purpose and ignores it.
 *
 * Shared between ajax/timeentry.php and class/api_timeflow.class.php — moved
 * here so both entry points use one definition instead of two copies that
 * could drift apart.
 */
function timeflowCanReadAllTimeEntries($user)
{
    return !empty($user->admin) || $user->hasRight('timeflow', 'timeentry', 'readall');
}

/**
 * The rights matrix validated by the module owner on 2026-09-30 (security report annex A, decisions D1–D3):
 * every one of the 44 ajax/timeentry.php actions requires exactly one of these minimal rights, checked once
 * before the switch (see ajax/timeentry.php). Finer per-action rules — ownership, entry status, project
 * visibility, the "own data only" scoping inside a reader — still run inside their own case; this only fixes
 * the actions that previously had no right check at all (report anomaly A-13 / decision D2), and centralizes
 * the ones that did, so the matrix and the code cannot silently drift apart again.
 *
 * D1: the Clockify import (preview, execute, resolve mapping, and its three read-only pickers) is an
 * administration tool — 'admin' below, not a right an ordinary write user ever holds.
 * D2: an account with none of TimeFlow's rights gets 403 everywhere, including read-only actions like
 * getActiveTimer — there is no "public" action left unlisted here.
 * D3: an administrator has every TimeFlow right implicitly, without it being explicitly assigned (see
 * timeflowUserHasRequiredRight()) — except 'admin' itself (D1) and the ownership checks some actions still run
 * afterwards: submitEntry and correctTimeEntry stay the *owner's* action, deliberately, even for an
 * administrator (submitting or correcting someone else's entry is not "having every right", it is acting in
 * their place, which nothing in D3 asks for).
 *
 * @return array<string,string> action => 'read'|'write'|'readall'|'validate'|'readall+validate'|'admin'
 */
function timeflowActionRightsMatrix()
{
    return array(
        // Personal read (own data unless the reader itself widens it for a readall/validate caller).
        'getActiveTimer' => 'read', 'getProjects' => 'read', 'getTimeFlowProjects' => 'read', 'getTasks' => 'read',
        'getTimeEntries' => 'read', 'getWeeklyTimesheet' => 'read', 'getSummaryReports' => 'read',
        'getDashboardFilterOptions' => 'read', 'getProcessedHistory' => 'read', 'exportProcessedHistory' => 'read',
        'exportGlobalCsv' => 'read', 'getMyDailyReports' => 'read', 'getDailyReports' => 'read',
        'getTimeEntryUpdates' => 'read', 'getModificationHistory' => 'read',
        // Annex A adjustment (2026-09-30): these two are read-only lookups reused OUTSIDE the import flow —
        // listActiveThirdParties feeds the Projects tab's plain "Client" filter, listActiveUsers labels the
        // Projects tab's "assigned users" column — for every TimeFlow reader, not just an administrator. They
        // carry no import-specific data, so unlike the rest of D1 below they stay 'read', not 'admin'.
        'listActiveThirdParties' => 'read', 'listActiveUsers' => 'read',

        // Personal write (own data; each case additionally checks ownership where it applies).
        'startTimer' => 'write', 'createManualEntry' => 'write', 'submitEntry' => 'write', 'stopTimer' => 'write',
        'restartTimer' => 'write', 'deleteTimeEntry' => 'write', 'correctTimeEntry' => 'write',
        'saveDailyReport' => 'write', 'updateDailyReport' => 'write', 'deleteDailyReport' => 'write',

        // Team-wide (the Users report, the bell, and its own preferences — see the case for why the bell needs readall).
        'getTimeFlowUsers' => 'readall', 'getUsersPresence' => 'readall', 'getMyNotifications' => 'readall',
        'markNotificationsRead' => 'readall', 'getAlertPreferences' => 'readall', 'saveAlertPreferences' => 'readall',

        // Validation queue and decisions.
        'getValidationEntries' => 'validate', 'validateEntry' => 'validate', 'rejectEntry' => 'validate',
        'validateDailyReport' => 'validate', 'rejectDailyReport' => 'validate',

        // Expected absences: picked from the team-wide Users report, and a manager decision.
        'saveExpectedAbsence' => 'readall+validate', 'deleteExpectedAbsence' => 'readall+validate',

        // D1: import is administration only.
        'previewClockifyImport' => 'admin', 'executeClockifyImport' => 'admin', 'resolveClockifyMapping' => 'admin',
        'listUserGroups' => 'admin',
    );
}

/**
 * Whether $user holds the right an action requires, per timeflowActionRightsMatrix() (D1–D3 above).
 *
 * @param User   $user
 * @param string $need One of the matrix's values
 * @return bool
 */
function timeflowUserHasRequiredRight($user, $need)
{
    if ($need === 'admin') {
        // D1: never granted implicitly through another right — only real admin.
        return !empty($user->admin);
    }
    if (!empty($user->admin)) {
        // D3.
        return true;
    }
    switch ($need) {
        case 'read':
            return $user->hasRight('timeflow', 'timeentry', 'read');
        case 'write':
            return $user->hasRight('timeflow', 'timeentry', 'write');
        case 'readall':
            return $user->hasRight('timeflow', 'timeentry', 'readall');
        case 'validate':
            return $user->hasRight('timeflow', 'timeentry', 'validate');
        case 'readall+validate':
            return $user->hasRight('timeflow', 'timeentry', 'readall') && $user->hasRight('timeflow', 'timeentry', 'validate');
    }
    return false;
}

/**
 * Request parameters that legitimately carry a list (everything else is a scalar).
 *
 * @return string[]
 */
function timeflowListParamNames()
{
    return array('project_ids', 'client_ids', 'user_ids', 'ids', 'decisions');
}

/**
 * Request parameters that carry a record identifier: an integer, or a string made of digits only.
 *
 * @return string[]
 */
function timeflowIdParamNames()
{
    return array('id', 'entryId', 'fk_project', 'fk_task', 'projectId', 'employee_id', 'client_id', 'user_id');
}

/**
 * Strict type check of the request parameters (GET, POST and JSON body), done once before any action runs.
 *
 * PHP silently turns an array into 1 ((int) array('x') === 1), "12abc" into 12 and true into 1, and hands an
 * array to string functions (strtotime, preg_match, strip_tags), which is a fatal TypeError. So a parameter that
 * is not of the expected shape must be refused, not converted:
 *  - a scalar parameter may not be an array (only the names of timeflowListParamNames() may be, and their items
 *    must be integers or digit strings — except 'decisions', a list of objects checked by the import class);
 *  - an identifier parameter must be null, '' (= absent), a non-negative integer or a digit-only string.
 *
 * @param array<int,array<string,mixed>> $sources Request arrays, e.g. array($_GET, $_POST, $jsonBody)
 * @return string|null Name of the first offending parameter (safe to display), or null when all are valid
 */
function timeflowFindInvalidRequestParam(array $sources)
{
    $listNames = timeflowListParamNames();
    $idNames = timeflowIdParamNames();
    $isDigits = function ($v) {
        return is_int($v) ? $v >= 0 : (is_string($v) && preg_match('/^\d{1,18}$/', $v) === 1);
    };
    foreach ($sources as $source) {
        if (!is_array($source)) {
            continue;
        }
        foreach ($source as $key => $value) {
            $name = (string) $key;
            $shown = preg_match('/^\w{1,40}$/', $name) ? $name : 'inconnu';
            if (is_array($value)) {
                if (!in_array($name, $listNames, true)) {
                    return $shown;
                }
                if ($name !== 'decisions') {
                    foreach ($value as $item) {
                        if (!$isDigits($item)) {
                            return $shown;
                        }
                    }
                }
                continue;
            }
            if (in_array($name, $idNames, true) && $value !== null && $value !== '' && !$isDigits($value)) {
                return $shown;
            }
        }
    }
    return null;
}

/**
 * Parses an id-list filter sent by the Dashboard: a JSON array, or a "1,2,3" string.
 *
 * @param mixed $value
 * @return int[]|null Unique positive ids (empty array = no filter), or null when the value is malformed
 *                    (anything that is not a positive integer, more than 500 ids): the caller answers 400.
 */
function timeflowParseIdFilter($value)
{
    if ($value === null || $value === '' || $value === array()) {
        return array();
    }
    if (is_string($value)) {
        $value = explode(',', $value);
    }
    if (!is_array($value)) {
        return null;
    }
    $ids = array();
    foreach ($value as $item) {
        if (is_int($item)) {
            $id = $item;
        } elseif (is_string($item) && ctype_digit(trim($item))) {
            $id = (int) trim($item);
        } else {
            return null;
        }
        if ($id <= 0) {
            return null;
        }
        $ids[$id] = $id;
    }

    return count($ids) > 500 ? null : array_values($ids);
}

/**
 * The Dashboard's Project / Client / Employee filters as raw SQL conditions on the alias t (timeflow_timeentry),
 * every id already cast to int. Filters combine with AND, the ids of one filter with OR. A client is matched
 * through the entry's project (projet.fk_soc): an entry with no project has no client.
 *
 * Appended to the same fragment as the period, so the fetch, the total, the "truncated" count and the exports
 * all see exactly the same rows.
 *
 * @param DoliDB $db
 * @param int[]  $projectIds
 * @param int[]  $clientIds
 * @param int[]  $userIds
 * @return string " AND ..." (empty when no filter)
 */
function timeflowSummaryFilterSql($db, array $projectIds, array $clientIds, array $userIds)
{
    $sql = '';
    if (!empty($projectIds)) {
        $sql .= ' AND t.fk_project IN ('.implode(',', array_map('intval', $projectIds)).')';
    }
    if (!empty($clientIds)) {
        $sql .= ' AND t.fk_project IN (SELECT pf.rowid FROM '.$db->prefix().'projet AS pf WHERE pf.fk_soc IN ('.implode(',', array_map('intval', $clientIds)).'))';
    }
    if (!empty($userIds)) {
        $sql .= ' AND t.fk_user IN ('.implode(',', array_map('intval', $userIds)).')';
    }

    return $sql;
}

/**
 * One raw, escaped SQL date/time comparison (" AND <column> <op> '<value>'"),
 * for the callers that filter on a full "YYYY-MM-DD HH:MM:SS" value.
 *
 * Why not the Universal Search string ("(t.date_start:>=:'2026-09-14 00:00:00')")
 * like the other criteria: Dolibarr 19.x's dolForgeCriteriaCallback() does
 * explode(':', $criterion) with no limit, so the colons inside the time part
 * split the value apart; the truncated value fails its quoted-string test and
 * is cast to (float) 0, giving "t.date_start >= 0 AND t.date_start < 0" — always
 * false — so every date-ranged view (Calendar, Dashboard) came back empty.
 * Newer cores pass a limit of 3 and are fine, which is why this only showed up
 * on 19.x. A plain SQL comparison behaves identically on every version.
 *
 * Fails closed: an unrecognised column, operator or value yields
 * " AND 1 = 0" (matches nothing) rather than silently dropping the bound and
 * widening the result.
 *
 * @param DoliDB $db
 * @param string $column   Column, optionally table-qualified, e.g. 't.date_start'.
 * @param string $operator One of >=, >, <=, <, =.
 * @param string $value    "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS".
 * @return string          A fragment starting with " AND ", ready to append.
 */
function timeflowSqlDateTimeCondition($db, $column, $operator, $value)
{
    $valid = preg_match('/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/', (string) $column)
        && in_array($operator, array('>=', '>', '<=', '<', '='), true)
        && preg_match('/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/', (string) $value);
    if (!$valid) {
        return ' AND 1 = 0';
    }

    return ' AND '.$column.' '.$operator." '".$db->escape((string) $value)."'";
}

if (!class_exists('TimeflowSqlException')) {
    /**
     * A SQL failure on a read that feeds the frontend. Caught once by the
     * dispatcher in ajax/timeentry.php and turned into an HTTP 500 error
     * response (see timeflowSqlErrorPayload()), instead of being flattened
     * into an empty list that the UI shows as "no data".
     */
    class TimeflowSqlException extends RuntimeException
    {
        /** @var string Raw driver error: server log and admins only, never other users. */
        public $dbError = '';
    }
}

/**
 * Runs a query whose failure must not be mistaken for "no rows".
 *
 * $db->query() returns false on failure, and the module's readers used to test
 * it as "if ($resql) { ...fill the list... }" with no else — so a schema
 * drift (a column present on one install and not another) came out as an
 * empty list with status "success". This throws instead.
 *
 * Only for reads whose result is returned as data. Schema probes and
 * fallback chains that treat failure as "absent" (timeflowHasDateDeleteColumn,
 * the optional legacy audit table, label fallbacks) stay on plain
 * $db->query() on purpose.
 *
 * @param DoliDB $db
 * @param string $sql
 * @param string $context Short developer label, shown in the error message
 *                        (e.g. 'getTimeFlowProjects:page') — never user input.
 * @return resource|object The successful query result.
 * @throws TimeflowSqlException
 */
function timeflowQuery($db, $sql, $context = 'query')
{
    $res = $db->query($sql);
    if ($res) {
        return $res;
    }

    $e = new TimeflowSqlException((string) $context);
    $e->dbError = (string) $db->lasterror();
    dol_syslog('TimeFlow SQL failure ['.$context.']: '.$e->dbError, LOG_ERR);
    throw $e;
}

/**
 * Same guarantee for the Dolibarr CRUD convention used by TimeEntry::fetchAll():
 * it returns an array on success and -1 (with ->errors filled) on failure.
 *
 * @param array|int $result   What fetchAll() returned.
 * @param object    $object   The object it was called on (for ->errors).
 * @param string    $context  See timeflowQuery().
 * @return array
 * @throws TimeflowSqlException
 */
function timeflowRequireRows($result, $object, $context = 'fetchAll')
{
    if (is_array($result)) {
        return $result;
    }

    $e = new TimeflowSqlException((string) $context);
    $e->dbError = is_array($object->errors ?? null) ? implode(' ', $object->errors) : (string) ($object->error ?? '');
    dol_syslog('TimeFlow SQL failure ['.$context.']: '.$e->dbError, LOG_ERR);
    throw $e;
}

/**
 * The JSON error payload for a TimeflowSqlException. The raw driver text is
 * included only for an admin; everyone else gets the context label, not the
 * table/column names.
 *
 * @param TimeflowSqlException $e
 * @param User|null            $user
 * @return array
 */
function timeflowSqlErrorPayload(TimeflowSqlException $e, $user = null)
{
    $payload = array(
        'status' => 'error',
        'code' => 'sql_error',
        'message' => 'Erreur de base de données ('.$e->getMessage().'). Contactez un administrateur.',
    );
    if ($user && !empty($user->admin) && $e->dbError !== '') {
        $payload['detail'] = $e->dbError;
    }

    return $payload;
}

/**
 * The projects $user may see/use, per Dolibarr's own native visibility rule —
 * delegated to Project::getProjectsAuthorizedForUser() (mode 0, the same call
 * the native Projects list makes) rather than re-implemented here: a project
 * is authorized if it is public ("Visibilité : Tout le monde"), or the user is
 * an assigned internal contact on it under ANY role (PROJECTLEADER,
 * PROJECTCONTRIBUTOR, ...).
 *
 * No restriction (null) for: an admin, a user holding the native
 * projet->all->lire right (native Dolibarr skips the filter for them too), a
 * TimeFlow readall user (existing manager bypass, unchanged), or a null $user
 * (internal callers with no acting user).
 *
 * Deliberately not cached across calls: a project created earlier in the same
 * request (timeflowCreateProject()) must be visible to the check that follows.
 *
 * @param DoliDB    $db
 * @param User|null $user
 * @return string|null null = unrestricted; otherwise a comma-separated list
 *                     of project ids, '0' when the user may see none — always
 *                     safe to embed in "IN (...)".
 */
function timeflowAuthorizedProjectIdList($db, $user)
{
    if (!$user || !empty($user->admin) || timeflowCanReadAllTimeEntries($user) || $user->hasRight('projet', 'all', 'lire')) {
        return null;
    }

    require_once DOL_DOCUMENT_ROOT.'/projet/class/project.class.php';
    $project = new Project($db);
    // Same external-user scoping the native list applies.
    $socid = !empty($user->socid) ? (int) $user->socid : 0;
    $ids = $project->getProjectsAuthorizedForUser($user, 0, 1, $socid);

    return is_string($ids) && preg_match('/^\d+(,\d+)*$/', $ids) ? $ids : '0';
}

/**
 * Whether $user may use $fkProject on a time entry or task lookup — the same
 * native Dolibarr visibility rule as the project picker
 * (timeflowAuthorizedProjectIdList()), so what a user can see and what they
 * are allowed to write to can never drift apart.
 *
 * A non-positive $fkProject means "no project": nothing to restrict.
 *
 * Shared between ajax/timeentry.php and class/api_timeflow.class.php — moved
 * here so both entry points enforce the same project-access restriction
 * instead of the REST API silently skipping it.
 */
function timeflowCanAccessProject($db, $user, $fkProject)
{
    if ((int) $fkProject <= 0) {
        return true;
    }

    $authorized = timeflowAuthorizedProjectIdList($db, $user);
    if ($authorized === null) {
        return true;
    }

    return in_array((string) (int) $fkProject, explode(',', $authorized), true);
}

/**
 * Active-user directory: `listActiveUsers`, read by every TimeFlow reader (annex A adjustment, security
 * report A-13) — reused by the Clockify import's user picker (admin only, D1) AND by the Projects tab's
 * "assigned users" labels (any reader, ReportsPage.jsx). The two callers need different things: an admin
 * resolving import identities needs the full directory (login/firstname/lastname, for suggesting an
 * identity — see ImportUserMappingList.jsx); a plain reader only needs enough to label a name they can
 * already see (assigned_user_ids on a project they can already see) — never a company-wide directory with
 * logins, which is the actual data this function used to hand out to anyone with the base 'read' right
 * once D2 stopped requiring 'write' for it. So a caller who may not read every entry gets a *different*
 * shape, not a filtered copy of the same one: id and a display label only, for users who contribute to a
 * project this caller can already access (the same native Dolibarr project-assignment rule every other
 * project-scoped read in this file already uses — timeflowAuthorizedProjectIdList()).
 *
 * @param DoliDB    $db
 * @param User|null $user Acting user. Full directory when null (defensive default) or when they may read
 *                        every entry (admin or readall); otherwise scoped + minimal fields (see above).
 * @return array
 */
function timeflowFetchActiveUsers($db, $user = null)
{
    $unrestricted = $user === null || timeflowCanReadAllTimeEntries($user);
    $users = array();

    if ($unrestricted) {
        $sql = 'SELECT rowid, login, firstname, lastname';
        $sql .= ' FROM '.$db->prefix().'user';
        $sql .= ' WHERE statut = 1';
        $sql .= ' AND entity IN ('.getEntity('user').')';
        $sql .= ' ORDER BY lastname ASC, firstname ASC, login ASC';

        $resql = timeflowQuery($db, $sql, 'timeflowFetchActiveUsers');
        if ($resql) {
            while ($obj = $db->fetch_object($resql)) {
                $fullName = trim(trim((string) $obj->firstname).' '.trim((string) $obj->lastname));
                $users[] = array(
                    'id' => (int) $obj->rowid,
                    'rowid' => (int) $obj->rowid,
                    'login' => (string) $obj->login,
                    'firstname' => (string) $obj->firstname,
                    'lastname' => (string) $obj->lastname,
                    'label' => $fullName !== '' ? $fullName : (string) $obj->login,
                );
            }
            $db->free($resql);
        }
        return $users;
    }

    $authorizedProjects = timeflowAuthorizedProjectIdList($db, $user);
    if ($authorizedProjects === '0') {
        return array();
    }
    $sql = 'SELECT DISTINCT u.rowid, u.firstname, u.lastname';
    $sql .= ' FROM '.$db->prefix().'user AS u';
    $sql .= ' INNER JOIN '.$db->prefix().'element_contact AS ec ON ec.fk_socpeople = u.rowid';
    $sql .= ' INNER JOIN '.$db->prefix().'c_type_contact AS tc ON tc.rowid = ec.fk_c_type_contact';
    $sql .= " WHERE tc.element = 'project' AND tc.source = 'internal' AND tc.code = 'PROJECTCONTRIBUTOR' AND ec.statut = 4";
    // $authorizedProjects is null here only if timeflowCanReadAllTimeEntries() already sent this caller
    // through the unrestricted branch above — never reached with an unsafe/empty value.
    $sql .= ' AND ec.element_id IN ('.$authorizedProjects.')';
    $sql .= ' AND u.statut = 1 AND u.entity IN ('.getEntity('user').')';
    $sql .= ' ORDER BY u.lastname ASC, u.firstname ASC';

    $resql = timeflowQuery($db, $sql, 'timeflowFetchActiveUsers:scoped');
    if ($resql) {
        while ($obj = $db->fetch_object($resql)) {
            $fullName = trim(trim((string) $obj->firstname).' '.trim((string) $obj->lastname));
            // Deliberately no 'login', 'firstname', 'lastname' fields: this branch is read by a caller who
            // may not read every entry, so it hands out only what a display label needs — never the
            // directory shape above, which a plain employee must not receive company-wide (security report
            // A-13 follow-up: listActiveUsers must not be a full user directory for a non-readall caller).
            $users[] = array('id' => (int) $obj->rowid, 'rowid' => (int) $obj->rowid, 'label' => $fullName !== '' ? $fullName : '#'.(int) $obj->rowid);
        }
        $db->free($resql);
    }

    return $users;
}

/**
 * Active-client directory: `listActiveThirdParties`, read by every TimeFlow reader (annex A adjustment,
 * security report A-13) — reused by the Clockify import's client picker (admin only, D1) AND by the
 * Projects tab's plain "Client" filter (any reader, ReportsPage.jsx). Same reasoning as
 * timeflowFetchActiveUsers() just above: a caller who may not read every entry gets only the clients of
 * projects they can already see — never every company-wide client (the follow-up to A-13 that prompted
 * this: the annex A adjustment must not itself become a company-wide directory leak for a plain employee).
 *
 * @param DoliDB    $db
 * @param User|null $user Acting user. Full list when null (defensive default) or when they may read every
 *                        entry (admin or readall); otherwise scoped to their visible projects' clients.
 * @return array
 */
function timeflowFetchActiveThirdParties($db, $user = null)
{
    $unrestricted = $user === null || timeflowCanReadAllTimeEntries($user);
    $thirdParties = array();

    if ($unrestricted) {
        $sql = 'SELECT rowid, nom FROM '.$db->prefix().'societe';
        $sql .= ' WHERE entity IN ('.getEntity('societe').')';
        $sql .= ' AND status = 1';
        $sql .= ' AND client <> 0';
        $sql .= ' ORDER BY nom ASC';

        $resql = timeflowQuery($db, $sql, 'timeflowFetchActiveThirdParties');
        if ($resql) {
            while ($obj = $db->fetch_object($resql)) {
                $thirdParties[] = array(
                    'id' => (int) $obj->rowid,
                    'rowid' => (int) $obj->rowid,
                    'title' => (string) $obj->nom,
                    'label' => (string) $obj->nom,
                );
            }
        }
        return $thirdParties;
    }

    $authorizedProjects = timeflowAuthorizedProjectIdList($db, $user);
    if ($authorizedProjects === '0') {
        return array();
    }
    $sql = 'SELECT DISTINCT s.rowid, s.nom FROM '.$db->prefix().'societe AS s';
    $sql .= ' INNER JOIN '.$db->prefix().'projet AS p ON p.fk_soc = s.rowid';
    $sql .= ' WHERE s.entity IN ('.getEntity('societe').')';
    $sql .= ' AND s.status = 1 AND s.client <> 0';
    // $authorizedProjects is null here only if timeflowCanReadAllTimeEntries() already sent this caller
    // through the unrestricted branch above — never reached with an unsafe/empty value.
    $sql .= ' AND p.rowid IN ('.$authorizedProjects.')';
    $sql .= ' ORDER BY s.nom ASC';

    $resql = timeflowQuery($db, $sql, 'timeflowFetchActiveThirdParties:scoped');
    if ($resql) {
        while ($obj = $db->fetch_object($resql)) {
            $thirdParties[] = array('id' => (int) $obj->rowid, 'rowid' => (int) $obj->rowid, 'title' => (string) $obj->nom, 'label' => (string) $obj->nom);
        }
    }

    return $thirdParties;
}

/**
 * Whether $user may view/act on a specific already-fetched TimeEntry
 * $object on the native Dolibarr card and its satellite tab pages
 * (timeentry_card.php, _agenda.php, _contact.php, _document.php,
 * _note.php). The entry's owner, or a user with the global read-all
 * right (or admin), may; every other authenticated user may not,
 * regardless of what TIMEFLOW_ENABLE_PERMISSION_CHECK-style module
 * right they hold — this is an object-level ownership gate, not a
 * module-level one, and must be checked in addition to (not instead
 * of) $user->hasRight('timeflow', 'timeentry', ...).
 *
 * Shared by all five pages above so they apply the exact same rule
 * instead of five copies that could drift apart.
 *
 * @param User      $user
 * @param TimeEntry $object Already fetched (fetchCommon()); $object->id
 *                          may legitimately be 0/empty (e.g. action=create
 *                          on the card before any object exists) — callers
 *                          must skip this check in that case themselves.
 * @return bool
 */
function timeflowCanAccessTimeEntry($user, $object)
{
    if (!empty($user->admin) || timeflowCanReadAllTimeEntries($user)) {
        return true;
    }
    return !empty($object->fk_user) && (int) $object->fk_user === (int) $user->id;
}

// ---------------------------------------------------------------------------
// Presence helpers shared by the Users report (ajax/timeentry.php) and the
// morning late-arrival job (class/timeflowlatecheck.class.php). They live here,
// not in ajax/timeentry.php, because that file bootstraps a whole web request
// (main.inc.php, CSRF token) and cannot be included from a cron.
// ---------------------------------------------------------------------------

/**
 * Helper: return true when the `date_delete` column exists on the timeentry table.
 * Uses a simple information_schema probe and caches result per-request.
 *
 * @param DoliDB $db
 * @return bool
 */
function timeflowHasDateDeleteColumn($db)
{
    static $cached = null;
    if ($cached !== null) return $cached;
    $tableName = $db->escape($db->prefix().'timeflow_timeentry');
    $sql = "SELECT 1 FROM information_schema.columns WHERE table_name = '".$tableName."' AND column_name = 'date_delete' LIMIT 1";
    $res = $db->query($sql);
    $cached = ($res && $db->num_rows($res) > 0);
    return $cached;
}

/**
 * Whether the optional llx_timeflow_timeentry.fk_split_previous column exists
 * (same defensive check as timeflowHasDateDeleteColumn(), for installs whose
 * table predates the column).
 */
function timeflowHasSplitPreviousColumn($db)
{
    static $cached = null;
    if ($cached !== null) return $cached;
    $tableName = $db->escape($db->prefix().'timeflow_timeentry');
    $sql = "SELECT 1 FROM information_schema.columns WHERE table_name = '".$tableName."' AND column_name = 'fk_split_previous' LIMIT 1";
    $res = $db->query($sql);
    $cached = ($res && $db->num_rows($res) > 0);
    return $cached;
}

/**
 * Whether llx_timeflow_expected_absence exists. Tables are created when the
 * module is activated, so an install that was already active when this table
 * was introduced does not have it until the module is disabled and enabled
 * again. Reads degrade (presence still works, no expected absences) and report
 * it; writes refuse with an actionable message.
 *
 * Not cached across calls: the answer must flip as soon as the module is
 * re-activated.
 */
function timeflowExpectedAbsenceTableExists($db)
{
    $tableName = $db->escape($db->prefix().'timeflow_expected_absence');
    $res = $db->query("SELECT 1 FROM information_schema.tables WHERE table_name = '".$tableName."' LIMIT 1");

    return (bool) ($res && $db->num_rows($res) > 0);
}

/**
 * 'ok', 'table_missing', or 'schema_outdated' (the table exists but predates
 * the reason_note column). Re-activating the module cannot fix the last one —
 * its CREATE TABLE finds the table already there — so it is reported apart,
 * with its own instruction, instead of letting every query fail with an SQL error.
 */
function timeflowExpectedAbsenceSchemaState($db)
{
    if (!timeflowExpectedAbsenceTableExists($db)) {
        return 'table_missing';
    }
    $tableName = $db->escape($db->prefix().'timeflow_expected_absence');
    $res = $db->query("SELECT 1 FROM information_schema.columns WHERE table_name = '".$tableName."' AND column_name = 'reason_note' LIMIT 1");

    return ($res && $db->num_rows($res) > 0) ? 'ok' : 'schema_outdated';
}

/**
 * Ids of the users who STARTED at least one time entry between two instants,
 * as a set ([userId => true]).
 *
 * "Started" is the Users report's own definition of presence: the entry's
 * date_start falls in the window; a soft-deleted entry does not count, nor does
 * the continuation of a timer split at midnight (fk_split_previous IS NOT NULL:
 * the user did not start that one). Any status counts (draft, submitted,
 * validated), a running timer included.
 *
 * @param DoliDB   $db
 * @param string   $from        'YYYY-MM-DD HH:MM:SS', inclusive.
 * @param string   $to          'YYYY-MM-DD HH:MM:SS'.
 * @param bool     $toInclusive true: date_start <= $to (a cut-off time), false: date_start < $to (a day boundary).
 * @param int[]|null $userIds   Restrict to these users; null = everybody.
 * @param int|null $entity      Exact entity (a cron job runs for one); null = getEntity('timeentry').
 * @return array<int,bool>
 */
function timeflowUserIdsWithEntryStartedBetween($db, $from, $to, $toInclusive = false, $userIds = null, $entity = null)
{
    $set = array();
    if (is_array($userIds) && empty($userIds)) {
        return $set;
    }

    $sql = 'SELECT DISTINCT t.fk_user FROM '.$db->prefix().'timeflow_timeentry AS t WHERE 1 = 1';
    if (is_array($userIds)) {
        $sql .= ' AND t.fk_user IN ('.implode(',', array_map('intval', $userIds)).')';
    }
    $sql .= $entity !== null ? ' AND t.entity = '.((int) $entity) : ' AND t.entity IN ('.getEntity('timeentry').')';
    if (timeflowHasDateDeleteColumn($db)) {
        $sql .= ' AND t.date_delete IS NULL';
    }
    if (timeflowHasSplitPreviousColumn($db)) {
        $sql .= ' AND t.fk_split_previous IS NULL';
    }
    $sql .= timeflowSqlDateTimeCondition($db, 't.date_start', '>=', $from);
    $sql .= timeflowSqlDateTimeCondition($db, 't.date_start', $toInclusive ? '<=' : '<', $to);
    $resql = timeflowQuery($db, $sql, 'timeflowUserIdsWithEntryStartedBetween');
    while ($obj = $db->fetch_object($resql)) {
        $set[(int) $obj->fk_user] = true;
    }
    $db->free($resql);

    return $set;
}

/**
 * Ids of the users with a recorded expected absence on a day, as a set. Empty
 * when the absences table is missing or outdated (nothing to exclude then).
 *
 * @param string   $date   'YYYY-MM-DD'.
 * @param int|null $entity Exact entity; null = getEntity('timeentry').
 * @return array<int,bool>
 */
function timeflowExpectedAbsenceUserIdsForDate($db, $date, $entity = null)
{
    $set = array();
    if (timeflowExpectedAbsenceSchemaState($db) !== 'ok') {
        return $set;
    }
    $sql = 'SELECT a.fk_user FROM '.$db->prefix().'timeflow_expected_absence AS a';
    $sql .= ' WHERE '.($entity !== null ? 'a.entity = '.((int) $entity) : 'a.entity IN ('.getEntity('timeentry').')');
    $sql .= " AND a.date_absence = '".$db->escape($date)."'";
    $resql = timeflowQuery($db, $sql, 'timeflowExpectedAbsenceUserIdsForDate');
    while ($obj = $db->fetch_object($resql)) {
        $set[(int) $obj->fk_user] = true;
    }
    $db->free($resql);

    return $set;
}
