<?php
/* Copyright (C) 2026 SuperAdmin - AJAX Endpoint */

if (!defined('NOCSRFCHECK')) {
    define('NOCSRFCHECK', '1');
}
if (!defined('NOTOKENRENEWAL')) {
    define('NOTOKENRENEWAL', '1');
}

// Inclusion de l'environnement Dolibarr
$res = 0;
if (!$res && file_exists("../../main.inc.php")) {
    $res = @include "../../main.inc.php";
}
if (!$res && file_exists("../../../main.inc.php")) {
    $res = @include "../../../main.inc.php";
}
if (!$res) {
    die("Include of main.inc.php failed");
}

dol_include_once('/timeflow/class/timeentry.class.php');
require_once DOL_DOCUMENT_ROOT.'/projet/class/project.class.php';
require_once DOL_DOCUMENT_ROOT.'/projet/class/task.class.php';
require_once DOL_DOCUMENT_ROOT.'/compta/facture/class/facture.class.php';

top_httphead('application/json');

// Vérification authentification
if (empty($user->id)) {
    http_response_code(401);
    echo json_encode(array('error' => 'Non autorisé'));
    exit;
}

$token = GETPOST('token', 'alphanohtml');
if (empty($token) || $token !== currentToken()) {
    // Do not log the token itself: it is a credential.  This trace makes it
    // possible to distinguish a CSRF rejection (403) from a business 400.
    dol_syslog('timeflow.startTimer csrf_rejected '.json_encode(array(
        'action' => GETPOST('action', 'aZ09'),
        'user_id' => (int) $user->id,
        'token_present' => !empty($token),
        'token_length' => strlen((string) $token),
        'method' => $_SERVER['REQUEST_METHOD'] ?? '',
    )), LOG_WARNING);
    http_response_code(403);
    echo json_encode(array('error' => 'Jeton invalide'));
    exit;
}

$action = GETPOST('action', 'aZ09');
$timeentry = new TimeEntry($db);

// Gestion des requêtes POST JSON
$postData = json_decode(file_get_contents('php://input'), true);
if (!is_array($postData)) {
    $postData = array();
} else {
    if (!empty($postData['action'])) {
        $action = $postData['action'];
    }
}

function timeflowJsonResponse($payload, $status = 200)
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

/**
 * Temporary diagnostic trace for startTimer rejections.  It deliberately
 * records only the fields needed to reproduce the validation, never the CSRF
 * token or the whole request body.
 */
function timeflowStartTimerRejected($reason, array $context = array())
{
    dol_syslog('timeflow.startTimer rejected '.json_encode(array_merge(array(
        'reason' => $reason,
        'user_id' => (int) $GLOBALS['user']->id,
    ), $context)), LOG_WARNING);
    timeflowJsonResponse(array('status' => 'error', 'message' => $reason), 400);
}

/**
 * Temporary diagnostic trace for the controlled time-correction flow.
 * Remove once the investigation is complete.
 */
function timeflowCorrectionTrace($event, array $context = array())
{
    dol_syslog('timeflow.correctTimeEntry '.$event.' '.json_encode($context), LOG_INFO);
}

/**
 * Parse an incoming date value from the frontend into a Unix timestamp (seconds).
 * Accepts numeric timestamps, ISO8601 strings with timezone (recommended), or other
 * formats parseable by DateTime/strtotime. Returns false on failure.
 */
function timeflowParseIncomingDate($value)
{
    if ($value === null || $value === '') {
        return false;
    }
    // Numeric timestamps (seconds or milliseconds)
    if (is_numeric($value)) {
        $num = (int) $value;
        // Heuristic: if value looks like milliseconds (>= 1e12) convert to seconds
        if ($num > 1000000000000) {
            return (int) floor($num / 1000);
        }
        return $num;
    }

    // Try timezone-aware DateTime parsing first (handles ISO strings with Z or offsets)
    try {
        $dt = new DateTime((string) $value);
        return (int) $dt->getTimestamp();
    } catch (Exception $e) {
        // Fallback to strtotime for lenient formats
        $ts = @strtotime((string) $value);
        return $ts === false ? false : (int) $ts;
    }
}

/** Convert a database datetime (server timezone) to an unambiguous API ISO value. */
function timeflowExportAuditDate($value)
{
    global $db;
    if ($value === null || $value === '') {
        return $value;
    }
    if (is_numeric($value)) {
        return gmdate('Y-m-d\\TH:i:s\\Z', (int) $value);
    }
    $timestamp = $db->jdate((string) $value);
    return $timestamp > 0 ? gmdate('Y-m-d\\TH:i:s\\Z', $timestamp) : $value;
}

/** Format conflicting entries for the correction error message. */
function timeflowFormatOverlapMessage(array $overlaps)
{
    $lines = array('La modification ne peut pas être enregistrée car la plage horaire choisie chevauche une ou plusieurs entrées existantes.', '', 'Conflits détectés :');
    foreach ($overlaps as $overlap) {
        $start = strtotime((string) $overlap['date_start']);
        $end = !empty($overlap['date_end']) ? strtotime((string) $overlap['date_end']) : false;
        $task = trim((string) ($overlap['note'] ?? '')) ?: 'Sans description';
        $project = trim((string) ($overlap['project_label'] ?? '')) ?: 'Sans projet';
        // dayhourss is not a Dolibarr predefined date format and is expanded
        // as literal tokens, producing corrupted strings in the conflict UI.
        $startLabel = $start ? dol_print_date($start, 'dayhour') : (string) $overlap['date_start'];
        $endLabel = $end ? dol_print_date($end, 'dayhour') : 'En cours';
        $lines[] = '- '.$task.' ('.$project.') — '.((int) $overlap['rowid']).' : '.$startLabel.' → '.$endLabel;
    }
    return implode("\n", $lines);
}

/**
 * Returns whether the connected user may validate or reject time entries.
 *
 * This server-side check is deliberately shared by every validation endpoint:
 * hiding an action in the frontend must never grant the underlying operation.
 */
function timeflowCanValidate($user)
{
    return !empty($user->admin)
        || $user->hasRight('timeflow', 'valider')
        || $user->hasRight('timeflow', 'timeentry', 'validate');
}

/**
 * A manager may receive this dedicated permission without becoming a Dolibarr
 * administrator. Every non-validation list must use this server-side scope.
 */
function timeflowCanReadAllTimeEntries($user)
{
    return !empty($user->admin) || $user->hasRight('timeflow', 'timeentry', 'readall');
}

/**
 * The validation screen is a manager view. A user who can validate must see
 * the team entries in that view and in the manager's time-tracking view, even
 * when the separate "read all" permission was not assigned.
 *
 * Keep this deliberately separate from timeflowCanReadAllTimeEntries(): the
 * latter is also used by invoice operations, where validation rights alone
 * must not expose all billable entries.
 */
function timeflowCanViewTeamTimeEntries($user)
{
    return timeflowCanReadAllTimeEntries($user) || timeflowCanValidate($user);
}

/** Employee policy: draft entries from today; yesterday only to correct a missed stop. */
function timeflowEmployeeManualEditPolicy($entry)
{
    if ((int) $entry->status !== TimeEntry::STATUS_DRAFT) {
        return array('allowed' => false, 'message' => 'Cette entrée a été soumise ou traitée : contactez votre manager.', 'end_only' => false, 'reason_required' => true);
    }

    $start = is_numeric($entry->date_start) ? (int) $entry->date_start : strtotime((string) $entry->date_start);
    $today = strtotime(gmdate('Y-m-d 00:00:00', dol_now()).' UTC');
    if ($start >= $today) {
        return array('allowed' => true, 'message' => '', 'end_only' => false, 'reason_required' => false);
    }
    if ($start >= ($today - 86400)) {
        return array('allowed' => true, 'message' => 'Pour une entrée d’hier, seule l’heure de fin peut être corrigée et une raison est obligatoire.', 'end_only' => true, 'reason_required' => true);
    }

    return array('allowed' => false, 'message' => 'Cette entrée est hors délai de correction : contactez votre manager.', 'end_only' => false, 'reason_required' => true);
}

function timeflowManualEntryDateAllowed($dateStart, $dateEnd)
{
    $start = is_numeric($dateStart) ? (int) $dateStart : strtotime((string) $dateStart);
    $end = is_numeric($dateEnd) ? (int) $dateEnd : strtotime((string) $dateEnd);
    $today = strtotime(gmdate('Y-m-d 00:00:00', dol_now()).' UTC');

    return $start >= ($today - 86400) && $end > $start && $end <= dol_now();
}

function timeflowManualAuditInfo($entryId)
{
    global $db;
    static $cache = array();
    $entryId = (int) $entryId;
    if (isset($cache[$entryId])) {
        return $cache[$entryId];
    }

    $info = array('manual_modified' => false, 'manual_reason' => '', 'manual_modified_at' => '', 'manual_modified_by' => 0);
    // is_manually_edited is the display contract: it belongs to the entry,
    // not to SuperAdmin or to the user who performed the edit.
    $flagSql = 'SELECT is_manually_edited FROM '.$db->prefix().'timeflow_timeentry WHERE rowid = '.$entryId;
    $flagRes = $db->query($flagSql);
    if ($flagRes && ($flag = $db->fetch_object($flagRes))) {
        $info['manual_modified'] = !empty($flag->is_manually_edited);
    }
    $sql = 'SELECT reason, date_creation, fk_user FROM '.$db->prefix().'timeflow_timeentry_modification';
    // The audit is attached to the time-entry id, never to the editor id.
    // This makes the manager badge independent of who performed the correction.
    $sql .= ' WHERE fk_timeentry = '.$entryId;
    $sql .= " AND action IN ('".TimeEntry::MOD_ACTION_MANUAL_EMPLOYEE."','".TimeEntry::MOD_ACTION_MANUAL_MANAGER."','".TimeEntry::MOD_ACTION_MANUAL_CREATE."')";
    $sql .= ' ORDER BY rowid DESC'.$db->plimit(1);
    $resql = $db->query($sql);
    if ($resql && ($obj = $db->fetch_object($resql))) {
        $info = array('manual_modified' => true, 'manual_reason' => (string) $obj->reason, 'manual_modified_at' => $obj->date_creation, 'manual_modified_by' => (int) $obj->fk_user);
    }
    // Corrections saved before the field-level audit migration live in the
    // legacy log.  Keep them visible to managers as manual corrections too.
    if ($info['manual_reason'] === '') {
        $legacySql = 'SELECT reason, date_modification, fk_user_editor FROM '.$db->prefix().'timeflow_time_edit_log';
        $legacySql .= ' WHERE fk_time_entry = '.$entryId.' ORDER BY id DESC'.$db->plimit(1);
        $legacyRes = $db->query($legacySql);
        if ($legacyRes && ($legacy = $db->fetch_object($legacyRes))) {
            $info = array('manual_modified' => true, 'manual_reason' => (string) $legacy->reason, 'manual_modified_at' => $legacy->date_modification, 'manual_modified_by' => (int) $legacy->fk_user_editor);
        }
    }
    $cache[$entryId] = $info;
    return $info;
}

/** Build the SQL visibility rule shared by list and polling endpoints. */
function timeflowTimeEntryScopeFilter($user, $scope = 'entries')
{
    $filter = 't.entity IN ('.getEntity('timeentry').')';
    if ($scope === 'validation') {
        $filter .= ' AND t.status = '.TimeEntry::STATUS_SUBMITTED;
    }
    // The timer page is always personal, including for administrators and
    // managers.  The validation scope is the only team scope here.
    if ($scope !== 'validation') {
        $filter .= ' AND t.fk_user = '.((int) $user->id);
    }

    return $filter;
}

/**
 * Return a fingerprint of every value rendered by a time-entry table row.
 *
 * COUNT/MAX(tms) is insufficient: an update to an existing row can leave
 * both maxima unchanged (timestamps have second precision). Hashing each
 * visible record makes changes to duration, end date, status, etc. reliable.
 */
function timeflowGetUpdateMarker($db, $user, $scope = 'entries')
{
    $sql = 'SELECT t.rowid, t.tms, t.fk_user, t.fk_project, t.fk_task,';
    $sql .= ' t.date_start, t.date_end, t.duration, t.note, t.tags,';
    $sql .= ' t.billable, t.status, t.date_submit, t.fk_user_submit, t.fk_user_valid';
    $sql .= ' FROM '.$db->prefix().'timeflow_timeentry AS t';
    $sql .= ' WHERE '.timeflowTimeEntryScopeFilter($user, $scope);
    $sql .= ' ORDER BY t.rowid ASC';

    $resql = $db->query($sql);
    if (!$resql) {
        return '';
    }

    $rows = array();
    while ($obj = $db->fetch_object($resql)) {
        $rows[] = implode(':', array(
            $obj->rowid, $obj->tms, $obj->fk_user, $obj->fk_project, $obj->fk_task,
            $obj->date_start, $obj->date_end, $obj->duration, $obj->note, $obj->tags,
            $obj->billable, $obj->status, $obj->date_submit, $obj->fk_user_submit, $obj->fk_user_valid,
        ));
    }
    $db->free($resql);

    return hash('sha256', implode('|', $rows));
}

/** Return the complete visible list so React can add, update, and remove rows. */
function timeflowFetchVisibleTimeEntries($timeentry, $user, $scope = 'entries', $limit = 100)
{
    $filter = $scope === 'validation' ? 't.status:=:'.TimeEntry::STATUS_SUBMITTED : '';
    if ($scope !== 'validation') {
        $filter .= ($filter !== '' ? ' AND ' : '').'(t.fk_user:=:'.((int) $user->id).')';
    }

    $result = $timeentry->fetchAll('DESC', 't.date_start', $limit, 0, $filter);
    $rows = array();
    if (is_array($result)) {
        foreach ($result as $obj) {
            $rows[] = timeflowExportTimeEntry($obj);
        }
    }

    return $rows;
}

function timeflowExportTimeEntry($object)
{
    global $user;
    if (!is_object($object)) {
        return $object;
    }

    $allowedFields = array(
        'id',
        'rowid',
        'entity',
        'fk_user',
        'fk_project',
        'fk_task',
        'date_start',
        'date_end',
        'duration',
		'occurrence_count',
		'date_reprise',
        'note',
        'tags',
        'billable',
        'status',
        'date_submit',
        'fk_user_submit',
        'fk_user_valid',
        'date_creation',
        'tms',
    );

    $cleaned = array();
    foreach ($allowedFields as $field) {
        if (property_exists($object, $field)) {
            $cleaned[$field] = $object->{$field};
        }
    }

    if (property_exists($object, 'fk_user')) {
        $cleaned['user_label'] = timeflowResolveUserLabel((int) $object->fk_user);
    }

    if (property_exists($object, 'fk_project')) {
        $cleaned['project_label'] = timeflowResolveProjectLabel((int) $object->fk_project);
    }

    if (property_exists($object, 'fk_task')) {
        $cleaned['task_label'] = timeflowResolveTaskLabel((int) $object->fk_task);
    }

    if (property_exists($object, 'id')) {
        $cleaned = array_merge($cleaned, timeflowManualAuditInfo((int) $object->id));
        $policy = timeflowEmployeeManualEditPolicy($object);
        if ((int) $object->fk_user !== (int) $user->id) {
            $policy = array('allowed' => false, 'end_only' => false, 'message' => 'Seul le propriétaire peut modifier cette entrée.');
        }
        $cleaned['manual_editable'] = $policy['allowed'];
        $cleaned['manual_edit_end_only'] = $policy['end_only'];
        $cleaned['manual_edit_message'] = $policy['message'];
        $cleaned['delete_allowed'] = $object->isDeletionAllowedFor($user);
        $cleaned['delete_requires_strong_confirmation'] = (int) $object->status !== TimeEntry::STATUS_DRAFT;
    }

    // Normalize date fields to ISO8601 Zulu (UTC) to avoid ambiguous parsing on clients.
    foreach (array('date_start', 'date_end', 'date_submit', 'date_creation') as $dtField) {
        if (isset($cleaned[$dtField]) && $cleaned[$dtField] !== null && $cleaned[$dtField] !== '') {
            // If value is numeric, assume it's a unix timestamp (seconds)
            if (is_numeric($cleaned[$dtField])) {
                $ts = (int) $cleaned[$dtField];
                $cleaned[$dtField] = gmdate('Y-m-d\TH:i:s\Z', $ts);
            } else {
                $ts = @strtotime((string) $cleaned[$dtField]);
                if ($ts !== false) {
                    $cleaned[$dtField] = gmdate('Y-m-d\TH:i:s\Z', $ts);
                }
            }
        }
    }

    return $cleaned;
}

function timeflowResolveProjectLabel($projectId)
{
    global $db;

    static $cache = array();

    $projectId = (int) $projectId;
    if ($projectId <= 0) {
        return 'Sans projet';
    }
    if (array_key_exists($projectId, $cache)) {
        return $cache[$projectId];
    }

    $label = 'Projet #'.$projectId;
    $sql = 'SELECT rowid, ref, title';
    $sql .= ' FROM '.$db->prefix().'timeflow_project';
    $sql .= ' WHERE rowid = '.$projectId;
    $resql = $db->query($sql);
    if ($resql) {
        $obj = $db->fetch_object($resql);
        if ($obj) {
            if (!empty($obj->title)) {
                $label = (string) $obj->title;
            } elseif (!empty($obj->ref)) {
                $label = (string) $obj->ref;
            }
        }
        $db->free($resql);
    }

    $cache[$projectId] = $label;
    return $label;
}

function timeflowResolveTaskLabel($taskId)
{
    global $db;

    static $cache = array();

    $taskId = (int) $taskId;
    if ($taskId <= 0) {
        return '';
    }
    if (array_key_exists($taskId, $cache)) {
        return $cache[$taskId];
    }

    $label = 'Tâche #'.$taskId;
    $sql = 'SELECT rowid, ref, label';
    $sql .= ' FROM '.$db->prefix().'projet_task';
    $sql .= ' WHERE rowid = '.$taskId;
    $resql = $db->query($sql);
    if ($resql) {
        $obj = $db->fetch_object($resql);
        if ($obj) {
            $label = timeflowTaskLabel($obj);
        }
        $db->free($resql);
    }

    $cache[$taskId] = $label;
    return $label;
}

function timeflowResolveUserLabel($userId)
{
    global $db;

    static $cache = array();

    $userId = (int) $userId;
    if ($userId <= 0) {
        return '';
    }
    if (array_key_exists($userId, $cache)) {
        return $cache[$userId];
    }

    $label = 'Utilisateur #'.$userId;
    $sql = 'SELECT rowid, login, firstname, lastname';
    $sql .= ' FROM '.$db->prefix().'user';
    $sql .= ' WHERE rowid = '.$userId;
    $resql = $db->query($sql);
    if ($resql) {
        $obj = $db->fetch_object($resql);
        if ($obj) {
            $fullName = trim(trim((string) $obj->firstname).' '.trim((string) $obj->lastname));
            if ($fullName !== '') {
                $label = $fullName;
            } elseif (!empty($obj->login)) {
                $label = (string) $obj->login;
            }
        }
        $db->free($resql);
    }

    $cache[$userId] = $label;
    return $label;
}

function timeflowNormalizeTags($tags)
{
    if (is_array($tags)) {
        $tags = implode(',', $tags);
    }
    $tags = trim((string) $tags);
    if ($tags === '') {
        return '';
    }
    $parts = preg_split('/\s*,\s*/', $tags, -1, PREG_SPLIT_NO_EMPTY);
    $parts = array_values(array_unique(array_map('trim', $parts)));
    return implode(', ', array_filter($parts));
}

function timeflowProjectLabel($object)
{
    if (!empty($object->title)) {
        return $object->title;
    }
    if (!empty($object->label)) {
        return $object->label;
    }
    if (!empty($object->ref)) {
        return $object->ref;
    }
    return 'Projet';
}

function timeflowTaskLabel($object)
{
    if (!empty($object->label)) {
        return $object->label;
    }
    if (!empty($object->ref)) {
        return $object->ref;
    }
    return 'Tâche';
}

function timeflowFetchProjects($db)
{
    $projects = array();
    $sql = 'SELECT p.rowid, p.ref, p.title, p.fk_soc, s.nom as soc_name';
    $sql .= ' FROM '.$db->prefix().'timeflow_project AS p';
    $sql .= ' LEFT JOIN '.$db->prefix().'societe AS s ON s.rowid = p.fk_soc';
    $sql .= ' WHERE p.entity IN ('.getEntity('timeflow_project').')';
    $sql .= ' ORDER BY p.title ASC, p.ref ASC, p.rowid DESC';

    $resql = $db->query($sql);
    if ($resql) {
        while ($obj = $db->fetch_object($resql)) {
            $projects[] = array(
                'id' => (int) $obj->rowid,
                'rowid' => (int) $obj->rowid,
                'title' => timeflowProjectLabel($obj),
                'ref' => !empty($obj->ref) ? $obj->ref : '',
                'fk_soc' => (int) $obj->fk_soc,
                'client' => !empty($obj->soc_name) ? $obj->soc_name : '',
            );
        }
    }

    return $projects;
}

function timeflowFetchTasks($db, $projectId = 0, $limit = 100)
{
    $tasks = array();
    $dolibarrProjectId = 0;

    if ((int) $projectId > 0) {
        $sql = 'SELECT fk_dolibarr_project FROM '.$db->prefix().'timeflow_project';
        $sql .= ' WHERE rowid = '.((int) $projectId);
        $sql .= ' AND entity IN ('.getEntity('timeflow_project').')';
        $resql = $db->query($sql);
        if ($resql) {
            $obj = $db->fetch_object($resql);
            if ($obj) {
                $dolibarrProjectId = (int) $obj->fk_dolibarr_project;
            }
        }
    }

    $sql = 'SELECT rowid, fk_projet, ref, label';
    $sql .= ' FROM '.$db->prefix().'projet_task';
    $sql .= ' WHERE entity IN ('.getEntity('project').')';
    if ($dolibarrProjectId > 0) {
        $sql .= ' AND fk_projet = '.$dolibarrProjectId;
    }
    $sql .= ' ORDER BY rowid DESC';
    $sql .= $db->plimit((int) $limit > 0 ? (int) $limit : 100);

    $resql = $db->query($sql);
    if ($resql) {
        while ($obj = $db->fetch_object($resql)) {
            $tasks[] = array(
                'id' => (int) $obj->rowid,
                'rowid' => (int) $obj->rowid,
                'fk_project' => (int) $obj->fk_projet,
                'title' => timeflowTaskLabel($obj),
            );
        }
    }

    return $tasks;
}

function timeflowFetchWeeklyTimesheet($timeentry, $user, $weekStart = null)
{
    $weekStart = !empty($weekStart) ? strtotime($weekStart) : strtotime('monday this week');
    $weekEnd = strtotime('+7 days', $weekStart);
    $filter = timeflowCanReadAllTimeEntries($user) ? '' : '(t.fk_user:=:'.((int) $user->id).')';
    $result = $timeentry->fetchAll('ASC', 't.date_start', 1000, 0, $filter);
    $rows = array();
    if (is_array($result)) {
        foreach ($result as $obj) {
            $start = is_numeric($obj->date_start) ? (int) $obj->date_start : strtotime((string) $obj->date_start);
            if (!$start || $start < $weekStart || $start >= $weekEnd) {
                continue;
            }
            $row = timeflowExportTimeEntry($obj);
            $row['day'] = date('Y-m-d', $start);
            $rows[] = $row;
        }
    }
    return array('weekStart' => date('Y-m-d', $weekStart), 'weekEnd' => date('Y-m-d', $weekEnd), 'rows' => $rows);
}

function timeflowBuildSummary($entries)
{
    $summary = array(
        'total_seconds' => 0,
        'billable_seconds' => 0,
        'non_billable_seconds' => 0,
        'by_project' => array(),
        'project_labels' => array(),
        'by_tag' => array(),
        'by_status' => array(),
    );

    foreach ($entries as $entry) {
        $duration = (int) ($entry['duration'] ?? 0);
        $summary['total_seconds'] += $duration;
        if (!empty($entry['billable'])) {
            $summary['billable_seconds'] += $duration;
        } else {
            $summary['non_billable_seconds'] += $duration;
        }

        $projectKey = (string) ($entry['fk_project'] ?? 0);
        if (!isset($summary['by_project'][$projectKey])) {
            $summary['by_project'][$projectKey] = 0;
        }
        $summary['by_project'][$projectKey] += $duration;
        if (!isset($summary['project_labels'][$projectKey])) {
            $summary['project_labels'][$projectKey] = $entry['project_label'] ?? ('Projet #'.$projectKey);
        }

        foreach (preg_split('/\s*,\s*/', (string) ($entry['tags'] ?? ''), -1, PREG_SPLIT_NO_EMPTY) as $tag) {
            if (!isset($summary['by_tag'][$tag])) {
                $summary['by_tag'][$tag] = 0;
            }
            $summary['by_tag'][$tag] += $duration;
        }

        $statusKey = (string) ($entry['status'] ?? 0);
        if (!isset($summary['by_status'][$statusKey])) {
            $summary['by_status'][$statusKey] = 0;
        }
        $summary['by_status'][$statusKey] += 1;
    }

    return $summary;
}

/** Build the shared, server-side WHERE clause for the manager read-only history. */
function timeflowProcessedHistoryWhere($input)
{
    global $db;
    $where = array('t.entity IN ('.getEntity('timeentry').')', 't.status IN ('.TimeEntry::STATUS_VALIDATED.','.TimeEntry::STATUS_CANCELED.')');
    $status = (string) ($input['status'] ?? 'all');
    if ($status === 'validated') $where[] = 't.status = '.TimeEntry::STATUS_VALIDATED;
    if ($status === 'refused') $where[] = 't.status = '.TimeEntry::STATUS_CANCELED;
    if (!empty($input['employee_id'])) $where[] = 't.fk_user = '.((int) $input['employee_id']);
    if (!empty($input['project_id'])) $where[] = 't.fk_project = '.((int) $input['project_id']);
    if (!empty($input['date_from']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $input['date_from'])) $where[] = "t.date_start >= '".$db->escape($input['date_from'])." 00:00:00'";
    if (!empty($input['date_to']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $input['date_to'])) $where[] = "t.date_start < DATE_ADD('".$db->escape($input['date_to'])." 00:00:00', INTERVAL 1 DAY)";
    if (!empty($input['manual_only'])) {
        $where[] = 'EXISTS (SELECT 1 FROM '.$db->prefix().'timeflow_timeentry_modification m WHERE m.fk_timeentry = t.rowid'
            ." AND m.action IN ('".TimeEntry::MOD_ACTION_MANUAL_EMPLOYEE."','".TimeEntry::MOD_ACTION_MANUAL_MANAGER."','".TimeEntry::MOD_ACTION_MANUAL_CREATE."'))";
    }
    return implode(' AND ', $where);
}

function timeflowGetProcessedHistory($input)
{
    global $db;
    $where = timeflowProcessedHistoryWhere($input);
    $page = max(1, (int) ($input['page'] ?? 1));
    $perPage = min(!empty($input['export']) ? 10000 : 100, max(1, (int) ($input['per_page'] ?? 50)));
    $offset = ($page - 1) * $perPage;
    $countSql = 'SELECT COUNT(*) AS total FROM '.$db->prefix().'timeflow_timeentry t WHERE '.$where;
    $countRes = $db->query($countSql); $countObj = $countRes ? $db->fetch_object($countRes) : null;
    $total = $countObj ? (int) $countObj->total : 0;
    $statsSql = 'SELECT COALESCE(SUM(CASE WHEN t.status = '.TimeEntry::STATUS_VALIDATED.' THEN t.duration ELSE 0 END),0) AS validated_seconds,'
        .' SUM(CASE WHEN t.status = '.TimeEntry::STATUS_CANCELED.' THEN 1 ELSE 0 END) AS refused_count,'
        .' SUM(CASE WHEN EXISTS (SELECT 1 FROM '.$db->prefix().'timeflow_timeentry_modification m WHERE m.fk_timeentry=t.rowid AND m.action IN (\''.TimeEntry::MOD_ACTION_MANUAL_EMPLOYEE.'\',\''.TimeEntry::MOD_ACTION_MANUAL_MANAGER.'\',\''.TimeEntry::MOD_ACTION_MANUAL_CREATE.'\')) THEN 1 ELSE 0 END) AS manual_count'
        .' FROM '.$db->prefix().'timeflow_timeentry t WHERE '.$where;
    $statsRes = $db->query($statsSql); $statsObj = $statsRes ? $db->fetch_object($statsRes) : null;
    $sql = 'SELECT t.rowid, t.fk_user, t.fk_project, t.fk_task, t.date_start, t.date_end, t.duration, t.note, t.status, t.fk_user_valid, t.tms,'
        .' u.login, u.firstname, u.lastname, validator.login AS validator_login, validator.firstname AS validator_firstname, validator.lastname AS validator_lastname'
        .' FROM '.$db->prefix().'timeflow_timeentry t'
        .' LEFT JOIN '.$db->prefix().'user u ON u.rowid=t.fk_user'
        .' LEFT JOIN '.$db->prefix().'user validator ON validator.rowid=t.fk_user_valid'
        .' WHERE '.$where.' ORDER BY t.date_start DESC, t.rowid DESC'.$db->plimit($perPage, $offset);
    $resql = $db->query($sql); $rows = array();
    while ($resql && ($obj = $db->fetch_object($resql))) {
        $entry = new TimeEntry($db); $entry->fetch((int) $obj->rowid);
        $row = timeflowExportTimeEntry($entry);
        $row['processed_by_label'] = trim($obj->validator_firstname.' '.$obj->validator_lastname) ?: ($obj->validator_login ?: '—');
        $row['processed_at'] = $obj->tms;
        $rows[] = $row;
    }
    $employees = array();
    $employeeSql = 'SELECT DISTINCT t.fk_user, u.login, u.firstname, u.lastname FROM '.$db->prefix().'timeflow_timeentry t LEFT JOIN '.$db->prefix().'user u ON u.rowid=t.fk_user WHERE t.entity IN ('.getEntity('timeentry').') AND t.status IN ('.TimeEntry::STATUS_VALIDATED.','.TimeEntry::STATUS_CANCELED.') ORDER BY u.lastname, u.firstname, u.login';
    $employeeRes = $db->query($employeeSql);
    while ($employeeRes && ($obj = $db->fetch_object($employeeRes))) $employees[] = array('id'=>(int) $obj->fk_user, 'label'=>trim($obj->firstname.' '.$obj->lastname) ?: ($obj->login ?: 'Utilisateur #'.((int) $obj->fk_user)));
    return array('rows'=>$rows, 'employees'=>$employees, 'pagination'=>array('page'=>$page, 'per_page'=>$perPage, 'total'=>$total, 'pages'=>max(1, (int) ceil($total / $perPage))), 'stats'=>array('validated_seconds'=>(int) ($statsObj->validated_seconds ?? 0), 'refused_count'=>(int) ($statsObj->refused_count ?? 0), 'manual_count'=>(int) ($statsObj->manual_count ?? 0)));
}

/** Return daily free-text reports, scoped either to one user or to the whole team. */
function timeflowFetchDailyReports($input, $allUsers = false, $userId = 0)
{
    global $db, $conf;
    $where = array('r.entity = '.((int) $conf->entity));
    if ($allUsers) {
        if (!empty($input['employee_id'])) {
            $where[] = 'r.fk_user = '.((int) $input['employee_id']);
        }
    } else {
        $where[] = 'r.fk_user = '.((int) $userId);
    }
    foreach (array('date_from' => '>=', 'date_to' => '<=') as $key => $operator) {
        $date = (string) ($input[$key] ?? '');
        if ($date !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            $where[] = "r.date_report ".$operator." '".$db->escape($date)."'";
        }
    }

    $sql = 'SELECT r.rowid, r.fk_user, r.date_report, r.content, r.date_creation, r.tms, r.read_at, r.fk_user_read,';
    $sql .= ' u.login, u.firstname, u.lastname, reader.login AS reader_login, reader.firstname AS reader_firstname, reader.lastname AS reader_lastname';
    $sql .= ' FROM '.$db->prefix().'timeflow_daily_report AS r';
    $sql .= ' LEFT JOIN '.$db->prefix().'user AS u ON u.rowid = r.fk_user';
    $sql .= ' LEFT JOIN '.$db->prefix().'user AS reader ON reader.rowid = r.fk_user_read';
    $sql .= ' WHERE '.implode(' AND ', $where).' ORDER BY r.date_report DESC, r.tms DESC, r.rowid DESC';
    $resql = $db->query($sql);
    $reports = array();
    while ($resql && ($obj = $db->fetch_object($resql))) {
        $label = trim($obj->firstname.' '.$obj->lastname) ?: ($obj->login ?: 'Utilisateur #'.((int) $obj->fk_user));
        $readerLabel = trim($obj->reader_firstname.' '.$obj->reader_lastname) ?: ($obj->reader_login ?: '');
        $reports[] = array(
            'id' => (int) $obj->rowid,
            'fk_user' => (int) $obj->fk_user,
            'user_label' => $label,
            'date_report' => $obj->date_report,
            'content' => $obj->content,
            'date_creation' => $obj->date_creation,
            'date_modification' => $obj->tms,
            'read_at' => $obj->read_at,
            'read_by_label' => $readerLabel,
            'is_read' => !empty($obj->read_at),
        );
    }
    return $reports;
}

function timeflowDailyReportEmployees()
{
    global $db, $conf;
    $sql = 'SELECT DISTINCT r.fk_user, u.login, u.firstname, u.lastname FROM '.$db->prefix().'timeflow_daily_report AS r';
    $sql .= ' LEFT JOIN '.$db->prefix().'user AS u ON u.rowid = r.fk_user';
    $sql .= ' WHERE r.entity = '.((int) $conf->entity).' ORDER BY u.lastname, u.firstname, u.login';
    $resql = $db->query($sql);
    $employees = array();
    while ($resql && ($obj = $db->fetch_object($resql))) {
        $employees[] = array('id' => (int) $obj->fk_user, 'label' => trim($obj->firstname.' '.$obj->lastname) ?: ($obj->login ?: 'Utilisateur #'.((int) $obj->fk_user)));
    }
    return $employees;
}

switch ($action) {
    case 'getActiveTimer':
        $id = $timeentry->hasActiveTimer($user->id);
        if ($id > 0) {
            $timeentry->fetch($id);
            timeflowJsonResponse(array('status' => 'success', 'data' => timeflowExportTimeEntry($timeentry)));
        } else {
            timeflowJsonResponse(array('status' => 'success', 'data' => null));
        }
        break;

    case 'startTimer':
        $fk_project = !empty($postData['fk_project']) ? (int)$postData['fk_project'] : (int)GETPOST('fk_project', 'int');
        $fk_task = !empty($postData['fk_task']) ? (int)$postData['fk_task'] : (int)GETPOST('fk_task', 'int');
        $note = !empty($postData['note']) ? $postData['note'] : GETPOST('note', 'restricthtml');
        $projectLabel = trim((string) ($postData['project_label'] ?? GETPOST('project_label', 'restricthtml')));
        $tags = '';
        $billable = 0;

        dol_syslog('timeflow.startTimer received '.json_encode(array(
            'user_id' => (int) $user->id,
            'method' => $_SERVER['REQUEST_METHOD'] ?? '',
            'content_type' => $_SERVER['CONTENT_TYPE'] ?? '',
            'json_keys' => array_keys($postData),
            'fk_project' => $fk_project,
            'fk_task' => $fk_task,
            'project_label' => $projectLabel,
            'note_length' => mb_strlen(trim((string) $note)),
        )), LOG_INFO);

        // Validation métier : un projet et une description (3 caractères minimum) sont obligatoires
        // pour démarrer un chrono. Cette vérification est faite côté serveur pour bloquer aussi
        // les requêtes directes qui contourneraient la désactivation du bouton côté client.
        $noteTrimmed = trim((string) $note);
        if ($fk_project <= 0 && $projectLabel === '') {
            timeflowStartTimerRejected('Veuillez sélectionner un projet et décrire votre tâche (3 caractères minimum) avant de démarrer.', array('stage' => 'missing_project'));
        }
        if (mb_strlen($noteTrimmed) < 3) {
            timeflowStartTimerRejected('Veuillez décrire votre tâche (3 caractères minimum) avant de démarrer.', array('stage' => 'short_note'));
        }

        if ($fk_task > 0 && $fk_project <= 0 && $projectLabel === '') {
            timeflowStartTimerRejected('Une tâche nécessite un projet', array('stage' => 'task_without_project', 'fk_task' => $fk_task));
        }

        if ($projectLabel !== '' && $fk_project <= 0) {
            $fk_project = timeflowResolveOrCreateProjectByLabel($db, $user, $projectLabel);
            if ($fk_project <= 0) {
                timeflowStartTimerRejected('Impossible de créer ou retrouver le projet', array('stage' => 'resolve_project', 'project_label' => $projectLabel, 'db_error' => $db->lasterror()));
            }
        }

        if ($fk_project > 0) {
            $sql = 'SELECT rowid FROM '.$db->prefix().'timeflow_project';
            $sql .= ' WHERE rowid = '.((int) $fk_project);
            $sql .= ' AND entity IN ('.getEntity('timeflow_project').')';
            $resql = $db->query($sql);
            if (!$resql || $db->num_rows($resql) <= 0) {
                timeflowStartTimerRejected('Projet introuvable', array('stage' => 'project_not_found', 'fk_project' => $fk_project, 'db_error' => !$resql ? $db->lasterror() : ''));
            }
        }

        if ($fk_task > 0) {
            $task = new Task($db);
            if ($task->fetch($fk_task) <= 0) {
                timeflowStartTimerRejected('Tâche introuvable', array('stage' => 'task_not_found', 'fk_task' => $fk_task));
            }
            if ($fk_project > 0) {
                $sql = 'SELECT fk_dolibarr_project FROM '.$db->prefix().'timeflow_project';
                $sql .= ' WHERE rowid = '.((int) $fk_project);
                $sql .= ' AND entity IN ('.getEntity('timeflow_project').')';
                $resql = $db->query($sql);
                if ($resql && $cp = $db->fetch_object($resql)) {
                    if ((int) $task->fk_project !== (int) $cp->fk_dolibarr_project) {
                        timeflowStartTimerRejected('Tâche introuvable ou rattachée à un autre projet', array('stage' => 'task_project_mismatch', 'fk_task' => $fk_task, 'fk_project' => $fk_project));
                    }
                }
            }
        }

        $id = $timeentry->startTimer($user->id, $fk_project, $fk_task, $note, $user, $tags, $billable);
        if ($id > 0) {
            timeflowStoreTaskText($db, $user, $id, $note, $note);
            if ($projectLabel !== '') {
                timeflowStoreProjectText($db, $user, $id, $projectLabel, $note);
            }
            $timeentry->fetch($id);
            timeflowJsonResponse(array('status' => 'success', 'data' => timeflowExportTimeEntry($timeentry)));
        } else {
            timeflowStartTimerRejected($timeentry->error ?: 'Erreur au démarrage', array('stage' => 'timeentry_create', 'fk_project' => $fk_project, 'fk_task' => $fk_task, 'db_error' => $db->lasterror()));
        }
        break;

    case 'createManualEntry':
        $fk_project = !empty($postData['fk_project']) ? (int) $postData['fk_project'] : (int) GETPOST('fk_project', 'int');
        $fk_task = !empty($postData['fk_task']) ? (int) $postData['fk_task'] : (int) GETPOST('fk_task', 'int');
        $date_start = $postData['date_start'] ?? GETPOST('date_start', 'alphanohtml');
        $date_end = $postData['date_end'] ?? GETPOST('date_end', 'alphanohtml');
        $note = $postData['note'] ?? GETPOST('note', 'restricthtml');
        $projectLabel = trim((string) ($postData['project_label'] ?? GETPOST('project_label', 'restricthtml')));
        $tags = timeflowNormalizeTags($postData['tags'] ?? GETPOST('tags', 'alphanohtml'));
        $billable = !empty($postData['billable']) ? 1 : (int) GETPOST('billable', 'int');
        $thm = !empty($postData['thm']) ? (float) $postData['thm'] : (float) GETPOST('thm', 'alphanohtml');
        $reason = trim((string) ($postData['reason'] ?? GETPOST('reason', 'restricthtml')));

        if ($reason === '') {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'La raison est obligatoire pour une saisie manuelle'), 400);
        }
        if (!timeflowCanValidate($user) && !timeflowManualEntryDateAllowed($date_start, $date_end)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Une saisie manuelle est autorisée uniquement pour aujourd’hui ou hier.'), 403);
        }

        if ($projectLabel !== '' && $fk_project <= 0) {
            $fk_project = timeflowResolveOrCreateProjectByLabel($db, $user, $projectLabel);
            if ($fk_project <= 0) {
                timeflowJsonResponse(array('status' => 'error', 'message' => 'Impossible de créer ou retrouver le projet'), 400);
            }
        }

        $startTimestamp = timeflowParseIncomingDate($date_start);
        $endTimestamp = timeflowParseIncomingDate($date_end);
        if ($startTimestamp === false || $endTimestamp === false) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Les heures de début et de fin sont invalides.'), 400);
        }
        if ($timeentry->hasTimeOverlap($user->id, $startTimestamp, $endTimestamp)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Cette période chevauche déjà une autre entrée de temps.'), 400);
        }
        $res = $timeentry->createManualEntry($user->id, $fk_project, $fk_task, $date_start, $date_end, $note, $tags, $billable, $user, $thm, TimeEntry::STATUS_DRAFT);
        if ($res > 0) {
            timeflowStoreTaskText($db, $user, $res, $note, $note);
            if ($projectLabel !== '') {
                timeflowStoreProjectText($db, $user, $res, $projectLabel, $note);
            }
            $timeentry->fetch($res);
            $timeentry->logManualCreation($user, $reason);
            timeflowJsonResponse(array('status' => 'success', 'data' => timeflowExportTimeEntry($timeentry)));
        }
        timeflowJsonResponse(array('status' => 'error', 'message' => $timeentry->error ?: 'Erreur à la création manuelle'), 400);
        break;

    case 'submitEntry':
        $id = !empty($postData['id']) ? (int) $postData['id'] : (int) GETPOST('id', 'int');
        $res = $timeentry->submitEntry($id, $user);
        if ($res > 0) {
            timeflowJsonResponse(array('status' => 'success', 'data' => timeflowExportTimeEntry($timeentry)));
        }
        timeflowJsonResponse(array('status' => 'error', 'message' => $timeentry->error ?: 'Erreur à la soumission'), 400);
        break;

    case 'stopTimer':
        $id = !empty($postData['id']) ? (int)$postData['id'] : (int)GETPOST('id', 'int');
        $res = $timeentry->stopTimer($id, $user);
        if ($res > 0) {
            timeflowJsonResponse(array('status' => 'success', 'data' => timeflowExportTimeEntry($timeentry)));
        } else {
            http_response_code(400);
            timeflowJsonResponse(array('status' => 'error', 'message' => $timeentry->error ?: 'Erreur à l\'arrêt'), 400);
        }
        break;

    case 'restartTimer':
        $id = !empty($postData['id']) ? (int) $postData['id'] : (int) GETPOST('id', 'int');
        $res = $timeentry->restartTimer($id, $user);
        if ($res > 0) {
            timeflowJsonResponse(array('status' => 'success', 'data' => timeflowExportTimeEntry($timeentry)));
        }
        timeflowJsonResponse(array('status' => 'error', 'message' => $timeentry->error ?: 'Erreur à la reprise'), 400);
        break;

    case 'deleteTimeEntry':
    case 'deleteEntry':
        $id = !empty($postData['id']) ? (int) $postData['id'] : (int) GETPOST('id', 'int');
        if ($id <= 0) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Identifiant d’entrée invalide'), 400);
        }
        if ($timeentry->fetch($id) <= 0) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Entrée introuvable'), 404);
        }
        // Non-drafts are immutable for employees. Keep this check here for a
        // clear HTTP response and repeat it in TimeEntry::delete() so a
        // caller cannot bypass the endpoint.
        if ((int) $timeentry->status !== TimeEntry::STATUS_DRAFT && !TimeEntry::canDeleteProcessedEntry($user)) {
			timeflowJsonResponse(array('status' => 'error', 'message' => 'Impossible de supprimer une entrée déjà soumise, validée ou refusée'), 403);
        }
        if (!$timeentry->isDeletionAllowedFor($user)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
        }
        $res = $timeentry->delete($user);
        if ($res > 0) {
            timeflowJsonResponse(array('status' => 'success', 'data' => array('id' => $id)));
        }
        timeflowJsonResponse(array('status' => 'error', 'message' => $timeentry->error ?: 'Erreur lors de la suppression'), 400);
        break;

    case 'getProjects':
        timeflowJsonResponse(array('status' => 'success', 'data' => timeflowFetchProjects($db)));
        break;

    case 'getTimeFlowProjects':
        timeflowJsonResponse(array('status' => 'success', 'data' => timeflowFetchTimeFlowProjects($db, $user)));
        break;

    case 'createTimeFlowProject':
        if (!$user->admin && !$user->hasRight('timeflow', 'timeentry', 'write')) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
        }
        $title = trim($postData['title'] ?? GETPOST('title', 'alphanohtml'));
        if ($title === '') {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Le titre du projet est requis'), 400);
        }
        $fkSoc = !empty($postData['fk_soc']) ? (int) $postData['fk_soc'] : (int) GETPOST('fk_soc', 'int');
        $res = timeflowCreateProject($db, $user, $title, $fkSoc);
        if ($res > 0) {
            timeflowJsonResponse(array('status' => 'success', 'data' => array('id' => $res, 'title' => $title)));
        }
        timeflowJsonResponse(array('status' => 'error', 'message' => 'Erreur à la création du projet'), 400);
        break;

    case 'getTasks':
        $projectId = !empty($postData['projectId']) ? (int) $postData['projectId'] : (int) GETPOST('projectId', 'int');
        $limit = !empty($postData['limit']) ? (int) $postData['limit'] : (int) GETPOST('limit', 'int');
        timeflowJsonResponse(array('status' => 'success', 'data' => timeflowFetchTasks($db, $projectId, $limit)));
        break;

    case 'getUpdateMarker':
        $scope = $postData['scope'] ?? GETPOST('scope', 'aZ09');
        $scope = $scope === 'validation' ? 'validation' : 'entries';
        if ($scope === 'validation' && !timeflowCanValidate($user)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
        }
        timeflowJsonResponse(array('status' => 'success', 'data' => array(
            'marker' => timeflowGetUpdateMarker($db, $user, $scope),
        )));
        break;

    // The polling endpoint returns the full current view only when its marker
    // changed. This includes changed existing rows as well as new/deleted rows.
    case 'getTimeEntryUpdates':
        $scope = $postData['scope'] ?? GETPOST('scope', 'aZ09');
        $scope = $scope === 'validation' ? 'validation' : 'entries';
        if ($scope === 'validation' && !timeflowCanValidate($user)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
        }
        $previousMarker = (string) ($postData['marker'] ?? GETPOST('marker', 'alphanohtml'));
        $marker = timeflowGetUpdateMarker($db, $user, $scope);
        $changed = $previousMarker !== '' && !hash_equals($previousMarker, $marker);
        timeflowJsonResponse(array('status' => 'success', 'data' => array(
            'marker' => $marker,
            'changed' => $changed,
            'entries' => $changed ? timeflowFetchVisibleTimeEntries($timeentry, $user, $scope) : array(),
        )));
        break;

    case 'getTimeEntries':
        $limit = !empty($postData['limit']) ? (int) $postData['limit'] : (int) GETPOST('limit', 'int');
        $limit = $limit > 0 ? $limit : 100;
        timeflowJsonResponse(array('status' => 'success', 'data' => timeflowFetchVisibleTimeEntries($timeentry, $user, 'entries', $limit)));
        break;

    // Data source for the dedicated validation view.  Unlike the normal timer
    // history, it is inaccessible without the TimeFlow "valider" permission.
    case 'getValidationEntries':
        if (!timeflowCanValidate($user)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
        }
        $limit = !empty($postData['limit']) ? (int) $postData['limit'] : (int) GETPOST('limit', 'int');
        $limit = $limit > 0 ? $limit : 100;
        timeflowJsonResponse(array('status' => 'success', 'data' => timeflowFetchVisibleTimeEntries($timeentry, $user, 'validation', $limit)));
        break;

    case 'getProcessedHistory':
        if (!timeflowCanValidate($user)) timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
        timeflowJsonResponse(array('status' => 'success', 'data' => timeflowGetProcessedHistory($postData ?: $_REQUEST)));
        break;

    case 'exportProcessedHistory':
        if (!timeflowCanValidate($user)) timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
        $input = $postData ?: $_REQUEST; $input['page'] = 1; $input['per_page'] = 10000; $input['export'] = true;
        timeflowJsonResponse(array('status' => 'success', 'data' => timeflowGetProcessedHistory($input)));
        break;

    case 'saveDailyReport':
        $dateReport = trim((string) ($postData['date_report'] ?? GETPOST('date_report', 'alphanohtml')));
        $content = trim((string) ($postData['content'] ?? GETPOST('content', 'restricthtml')));
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateReport)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'La date du rapport est invalide.'), 400);
        }
        if ($content === '') {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Le contenu du rapport est obligatoire.'), 400);
        }
        $entity = (int) $conf->entity;
        $now = dol_now();
        $sql = 'INSERT INTO '.$db->prefix().'timeflow_daily_report';
        $sql .= ' (entity, fk_user, date_report, content, date_creation, fk_user_creat) VALUES (';
        $sql .= $entity.','.((int) $user->id).", '".$db->escape($dateReport)."', '".$db->escape($content)."', '".$db->idate($now)."', ".((int) $user->id).')';
        if (!$db->query($sql)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Impossible d’enregistrer le rapport : '.$db->lasterror()), 500);
        }
        $insertedId = (int) $db->last_insert_id($db->prefix().'timeflow_daily_report');
        $saved = array(
            'id' => $insertedId,
            'fk_user' => (int) $user->id,
            'user_label' => timeflowResolveUserLabel((int) $user->id),
            'date_report' => $dateReport,
            'content' => $content,
            'date_creation' => $db->idate($now),
            'date_modification' => $db->idate($now),
            'read_at' => null,
            'read_by_label' => '',
            'is_read' => false,
        );
        timeflowJsonResponse(array('status' => 'success', 'data' => $saved));
        break;

    case 'updateDailyReport':
        $id = !empty($postData['id']) ? (int) $postData['id'] : 0;
        $content = trim((string) ($postData['content'] ?? GETPOST('content', 'restricthtml')));
        if ($id <= 0) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Identifiant du rapport invalide.'), 400);
        }
        if ($content === '') {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Le contenu du rapport est obligatoire.'), 400);
        }
        // Ensure the report exists and belongs to the user (or allow admins/validators)
        $sql = 'SELECT rowid, fk_user, date_report FROM '.$db->prefix().'timeflow_daily_report WHERE rowid = '.((int) $id).' LIMIT 1';
        $res = $db->query($sql);
        if (!$res || $db->num_rows($res) <= 0) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Rapport introuvable.'), 404);
        }
        $obj = $db->fetch_object($res);
        if ((int) $obj->fk_user !== (int) $user->id && !timeflowCanValidate($user) && !$user->admin) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé.'), 403);
        }
        $now = dol_now();
        $sql = 'UPDATE '.$db->prefix().'timeflow_daily_report SET content = "'.$db->escape($content).'", fk_user_modif = '.((int) $user->id).', tms = "'.$db->idate($now).'" WHERE rowid = '.((int) $id);
        if (!$db->query($sql)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Impossible de mettre à jour le rapport : '.$db->lasterror()), 500);
        }
        $saved = array(
            'id' => (int) $obj->rowid,
            'fk_user' => (int) $obj->fk_user,
            'user_label' => timeflowResolveUserLabel((int) $obj->fk_user),
            'date_report' => $obj->date_report,
            'content' => $content,
            'date_creation' => null,
            'date_modification' => $db->idate($now),
            'read_at' => null,
            'read_by_label' => '',
            'is_read' => false,
        );
        timeflowJsonResponse(array('status' => 'success', 'data' => $saved));
        break;

    case 'deleteDailyReport':
        $id = !empty($postData['id']) ? (int) $postData['id'] : 0;
        if ($id <= 0) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Identifiant du rapport invalide.'), 400);
        }
        $sql = 'SELECT rowid, fk_user FROM '.$db->prefix().'timeflow_daily_report WHERE rowid = '.((int) $id).' LIMIT 1';
        $res = $db->query($sql);
        if (!$res || $db->num_rows($res) <= 0) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Rapport introuvable.'), 404);
        }
        $obj = $db->fetch_object($res);
        if ((int) $obj->fk_user !== (int) $user->id && !timeflowCanValidate($user) && !$user->admin) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé.'), 403);
        }
        $sql = 'DELETE FROM '.$db->prefix().'timeflow_daily_report WHERE rowid = '.((int) $id);
        if (!$db->query($sql)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Impossible de supprimer le rapport : '.$db->lasterror()), 500);
        }
        timeflowJsonResponse(array('status' => 'success'));
        break;

    case 'getMyDailyReports':
        $input = is_array($postData) ? $postData : $_REQUEST;
        timeflowJsonResponse(array('status' => 'success', 'data' => timeflowFetchDailyReports($input, false, (int) $user->id)));
        break;

    case 'getDailyReports':
        if (!timeflowCanValidate($user)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
        }
        $input = is_array($postData) ? $postData : $_REQUEST;
        timeflowJsonResponse(array('status' => 'success', 'data' => array(
            'reports' => timeflowFetchDailyReports($input, true),
            'employees' => timeflowDailyReportEmployees(),
        )));
        break;

    case 'markDailyReportRead':
        if (!timeflowCanValidate($user)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
        }
        $id = !empty($postData['id']) ? (int) $postData['id'] : (int) GETPOST('id', 'int');
        $sql = 'UPDATE '.$db->prefix().'timeflow_daily_report SET read_at = \''.$db->idate(dol_now()).'\',';
        $sql .= ' fk_user_read = '.((int) $user->id).' WHERE rowid = '.$id.' AND entity = '.((int) $conf->entity);
        if (!$db->query($sql)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Impossible de marquer le rapport comme lu.'), 500);
        }
        timeflowJsonResponse(array('status' => 'success'));
        break;

    case 'getWeeklyTimesheet':
        $weekStart = $postData['weekStart'] ?? GETPOST('weekStart', 'alphanohtml');
        $timesheet = timeflowFetchWeeklyTimesheet($timeentry, $user, $weekStart);
            // Log whether the caller is allowed to read all entries (diagnostic)
            dol_syslog('timeflow.getWeeklyTimesheet user_id='.(int)$user->id.' can_readall='.(int)timeflowCanReadAllTimeEntries($user).' weekStart='.(string)$weekStart, LOG_DEBUG);
        timeflowJsonResponse(array('status' => 'success', 'data' => $timesheet));
        break;

    case 'getSummaryReports':
        $limit = !empty($postData['limit']) ? (int) $postData['limit'] : (int) GETPOST('limit', 'int');
        $limit = $limit > 0 ? $limit : 1000;
        $dateFrom = $postData['date_from'] ?? GETPOST('date_from', 'alphanohtml');
        $dateTo = $postData['date_to'] ?? GETPOST('date_to', 'alphanohtml');
        if (($dateFrom !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateFrom)) || ($dateTo !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateTo))) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Plage de dates invalide'), 400);
        }

        $filters = array();
        if (!timeflowCanReadAllTimeEntries($user)) {
            $filters[] = '(t.fk_user:=:'.((int) $user->id).')';
        }
        if ($dateFrom !== '') {
            $filters[] = "(t.date_start:>=:'".$dateFrom." 00:00:00')";
        }
        if ($dateTo !== '') {
            $filters[] = "(t.date_start:<=:'".$dateTo." 23:59:59')";
        }
        $filter = implode(' AND ', $filters);
        // Diagnostic log: record whether summary is being computed for team or single user
        dol_syslog('timeflow.getSummaryReports user_id='.(int)$user->id.' can_readall='.(int)timeflowCanReadAllTimeEntries($user).' dateFrom='.(string)$dateFrom.' dateTo='.(string)$dateTo, LOG_DEBUG);
        $result = $timeentry->fetchAll('DESC', 't.date_start', $limit, 0, $filter);
        $rows = array();
        if (is_array($result)) {
            foreach ($result as $obj) {
                $rows[] = timeflowExportTimeEntry($obj);
            }
        }
        timeflowJsonResponse(array('status' => 'success', 'data' => timeflowBuildSummary($rows)));
        break;

    case 'generateInvoiceLines':
        $clientId = !empty($postData['fk_soc']) ? (int) $postData['fk_soc'] : (int) GETPOST('fk_soc', 'int');
        $filter = timeflowCanReadAllTimeEntries($user) ? '' : '(t.fk_user:=:'.((int) $user->id).')';
        $result = $timeentry->fetchAll('DESC', 't.date_start', 1000, 0, $filter);
        $lines = array();
        if (is_array($result)) {
            foreach ($result as $obj) {
                if ((int) $obj->billable <= 0 || (int) $obj->duration <= 0 || !empty($obj->fk_facture)) {
                    continue;
                }
                if ($clientId > 0) {
                    $sql = 'SELECT fk_soc FROM '.$db->prefix().'timeflow_project';
                    $sql .= ' WHERE rowid = '.(int) $obj->fk_project;
                    $resql = $db->query($sql);
                    if ($resql && $proj = $db->fetch_object($resql)) {
                        if ((int) $proj->fk_soc !== (int) $clientId) {
                            continue;
                        }
                    }
                }
                $lines[] = array(
                    'id' => (int) $obj->id,
                    'description' => trim(($obj->note ?: 'Time entry').(!empty($obj->tags) ? ' ['.$obj->tags.']' : '')),
                    'qty_hours' => round(((int) $obj->duration) / 3600, 2),
                    'thm' => (float) $obj->thm,
                    'amount' => (float) $obj->amount,
                    'fk_project' => (int) $obj->fk_project,
                    'fk_task' => (int) $obj->fk_task,
                    'date_start' => $obj->date_start,
                    'date_end' => $obj->date_end,
                );
            }
        }
        timeflowJsonResponse(array('status' => 'success', 'data' => $lines));
        break;

    case 'createInvoiceFromTimeEntries':
        // Actually creates a draft Dolibarr customer invoice from selected billable,
        // not-yet-invoiced time entries, and marks those entries as invoiced so
        // they cannot be pulled into a second invoice.
        if (!$user->admin && !$user->hasRight('timeflow', 'timeentry', 'write')) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Droits insuffisants'), 403);
        }

        $clientId = !empty($postData['fk_soc']) ? (int) $postData['fk_soc'] : (int) GETPOST('fk_soc', 'int');
        $entryIds = !empty($postData['entry_ids']) && is_array($postData['entry_ids']) ? array_map('intval', $postData['entry_ids']) : array();

        if ($clientId <= 0) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Client requis'), 400);
        }
        if (empty($entryIds)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Aucune saisie sélectionnée'), 400);
        }

        require_once DOL_DOCUMENT_ROOT.'/societe/class/societe.class.php';
        $thirdparty = new Societe($db);
        if ($thirdparty->fetch($clientId) <= 0) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Client introuvable'), 404);
        }

        // Reload full entries and keep only ones that are actually billable and not already invoiced.
        $entriesToInvoice = array();
        foreach ($entryIds as $entryId) {
            $candidate = new TimeEntry($db);
            if ($candidate->fetch($entryId) <= 0) {
                continue;
            }
            if ((int) $candidate->billable <= 0 || (int) $candidate->duration <= 0 || !empty($candidate->fk_facture)) {
                continue;
            }
            if (!timeflowCanReadAllTimeEntries($user) && (int) $candidate->fk_user !== (int) $user->id) {
                continue;
            }
            $entriesToInvoice[] = $candidate;
        }

        if (empty($entriesToInvoice)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Aucune saisie facturable trouvée pour cette sélection'), 400);
        }

        $db->begin();

        $invoice = new Facture($db);
        $invoice->socid = $clientId;
        $invoice->type = Facture::TYPE_STANDARD;
        $invoice->date = dol_now();

        $invoiceId = $invoice->create($user);
        if ($invoiceId <= 0) {
            $db->rollback();
            timeflowJsonResponse(array('status' => 'error', 'message' => $invoice->error ?: 'Erreur à la création de la facture'), 500);
        }

        $hasError = false;
        foreach ($entriesToInvoice as $entry) {
            $qtyHours = round(((int) $entry->duration) / 3600, 2);
            $unitPrice = (float) $entry->thm;
            $description = trim(($entry->note ?: 'Time entry').(!empty($entry->tags) ? ' ['.$entry->tags.']' : ''));

            $lineId = $invoice->addline(
                $description,
                $unitPrice,
                $qtyHours,
                0,          // txtva: VAT rate left at 0 here — MUST be set to the correct rate for the client/product before validating the invoice, see note below
                0,          // txlocaltax1
                0,          // txlocaltax2
                0,          // fk_product
                0,          // remise_percent
                '',         // date_start
                '',         // date_end
                0,          // ventil (fk_code_ventilation)
                0,          // info_bits
                0,          // fk_remise_except
                'HT',       // price_base_type
                0,          // pu_ttc
                1,          // product_type: 0=product, 1=service (time entries are services)
                -1          // rang
            );

            if ($lineId <= 0) {
                $hasError = true;
                break;
            }
        }

        if ($hasError) {
            $db->rollback();
            timeflowJsonResponse(array('status' => 'error', 'message' => $invoice->error ?: 'Erreur à l\'ajout d\'une ligne de facture'), 500);
        }

        // Mark every invoiced entry so it cannot be picked up by a future invoice run.
        foreach ($entriesToInvoice as $entry) {
            $entry->fk_facture = $invoiceId;
            $entry->date_invoice = dol_now();
            if ($entry->update($user) <= 0) {
                $hasError = true;
                break;
            }
        }

        if ($hasError) {
            $db->rollback();
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Facture créée mais échec du marquage des saisies comme facturées'), 500);
        }

        $db->commit();

        timeflowJsonResponse(array('status' => 'success', 'data' => array(
            'fk_facture' => $invoiceId,
            'ref' => $invoice->ref,
            'nb_lines' => count($entriesToInvoice),
        )));
        break;

    case 'validateEntry':
    case 'approveTimeEntry':
        if (!timeflowCanValidate($user)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
        }
        $id = !empty($postData['id']) ? (int) $postData['id'] : (int) GETPOST('id', 'int');
        $res = $timeentry->validateEntry($id, $user, TimeEntry::STATUS_VALIDATED);
        if ($res > 0) {
            timeflowJsonResponse(array('status' => 'success', 'data' => timeflowExportTimeEntry($timeentry)));
        }
        timeflowJsonResponse(array('status' => 'error', 'message' => $timeentry->error ?: 'Erreur à la validation'), 400);
        break;

    case 'submitWeeklyApproval':
        if (!timeflowCanValidate($user)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
        }
        $ids = $postData['ids'] ?? GETPOST('ids', 'array:int');
        $ids = is_array($ids) ? $ids : array();
        $updated = array();
        foreach ($ids as $id) {
            if ($timeentry->fetch((int) $id) > 0) {
                $timeentry->status = TimeEntry::STATUS_VALIDATED;
                $timeentry->date_submit = dol_now();
                $timeentry->fk_user_submit = $user->id;
                if ($timeentry->update($user) > 0) {
                    $updated[] = timeflowExportTimeEntry($timeentry);
                }
            }
        }
        timeflowJsonResponse(array('status' => 'success', 'data' => $updated));
        break;

    case 'rejectEntry':
    case 'rejectTimeEntry':
        if (!timeflowCanValidate($user)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
        }
        $id = !empty($postData['id']) ? (int) $postData['id'] : (int) GETPOST('id', 'int');
        $res = $timeentry->validateEntry($id, $user, TimeEntry::STATUS_CANCELED);
        if ($res > 0) {
            timeflowJsonResponse(array('status' => 'success', 'data' => timeflowExportTimeEntry($timeentry)));
        }
        timeflowJsonResponse(array('status' => 'error', 'message' => $timeentry->error ?: 'Erreur au refus'), 400);
        break;

    case 'updateEntry':
    case 'correctTimeEntry':
        $id = !empty($postData['id']) ? (int) $postData['id'] : (int) GETPOST('id', 'int');
        $reason = trim((string) ($postData['reason'] ?? GETPOST('reason', 'restricthtml')));
        timeflowCorrectionTrace('request_received', array('action' => $action, 'rowid' => $id, 'user_id' => (int) $user->id));
        if ($timeentry->fetch($id) <= 0) {
            timeflowCorrectionTrace('response_not_found', array('rowid' => $id, 'http_status' => 404));
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Entrée introuvable'), 404);
        }
        $isManager = timeflowCanValidate($user);
        // A manager validates team entries but never manually changes them.
        // This ownership check is intentionally independent of UI visibility.
        if ((int) $timeentry->fk_user !== (int) $user->id || !$user->hasRight('timeflow', 'timeentry', 'write')) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
        }

        $policy = timeflowEmployeeManualEditPolicy($timeentry);
        if (!$policy['allowed']) {
            timeflowJsonResponse(array('status' => 'error', 'message' => $policy['message']), 403);
        }

        // Parse stored dates (DB values may be strings or numeric timestamps)
        $oldStart = (int) $timeentry->date_start;
        $oldEnd = empty($timeentry->date_end) ? 0 : (int) $timeentry->date_end;
        // A correction is a partial update. The frontend sends ISO8601 only for
        // fields changed by the employee; omitted values stay exactly as stored.
        $hasNewStart = array_key_exists('date_start', $postData);
        $hasNewEnd = array_key_exists('date_end', $postData);
        $newStart = $hasNewStart ? timeflowParseIncomingDate($postData['date_start']) : $oldStart;
        $newEnd = $hasNewEnd ? timeflowParseIncomingDate($postData['date_end']) : $oldEnd;
        timeflowCorrectionTrace('values_prepared', array(
            'rowid' => (int) $timeentry->id,
            'old_start' => $oldStart,
            'old_end' => $oldEnd,
            'old_duration' => (int) $timeentry->duration,
            'old_status' => (int) $timeentry->status,
            'new_start' => $newStart,
            'new_end' => $newEnd,
            'reason' => $reason,
            'transaction' => 'none',
        ));
        if ($newStart <= 0 || ($newEnd > 0 && $newEnd <= $newStart)) {
            timeflowCorrectionTrace('response_invalid_dates', array('rowid' => (int) $timeentry->id, 'http_status' => 400));
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Les heures de début et de fin sont invalides.'), 400);
        }
        if ($policy['end_only'] && $newStart !== $oldStart) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Seule l’heure de fin d’une entrée d’hier peut être corrigée.'), 403);
        }
        $difference = max(abs($newStart - $oldStart), abs($newEnd - $oldEnd));
        if (mb_strlen($reason) < 5) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'La raison de la modification est obligatoire (5 caractères minimum).'), 400);
        }
        $auditReason = $reason !== '' ? $reason : 'Correction mineure (15 minutes ou moins).';
        $effectiveEnd = $newEnd > 0 ? $newEnd : dol_now();
        timeflowCorrectionTrace('overlap_check_started', array('rowid' => (int) $timeentry->id, 'start' => $newStart, 'end' => $effectiveEnd));
        $overlaps = $timeentry->getTimeOverlaps($timeentry->fk_user, $newStart, $effectiveEnd, $timeentry->id);
        if ($overlaps === false) {
            timeflowCorrectionTrace('response_overlap_check_error', array('rowid' => (int) $timeentry->id, 'http_status' => 400, 'update_executed' => false, 'audit_insert_executed' => false, 'transaction' => 'none'));
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Impossible de vérifier les conflits de temps. Aucune modification n’a été enregistrée.'), 400);
        }
        $hasOverlap = is_array($overlaps) && !empty($overlaps);
        timeflowCorrectionTrace('overlap_check_result', array('rowid' => (int) $timeentry->id, 'has_overlap' => $hasOverlap, 'conflicts' => is_array($overlaps) ? $overlaps : array()));
        if ($hasOverlap) {
            timeflowCorrectionTrace('response_overlap_refused', array('rowid' => (int) $timeentry->id, 'http_status' => 400, 'update_executed' => false, 'audit_insert_executed' => false, 'transaction' => 'none'));
            timeflowJsonResponse(array('status' => 'error', 'message' => timeflowFormatOverlapMessage($overlaps), 'conflicts' => $overlaps), 400);
        }

        timeflowCorrectionTrace('update_started', array('rowid' => (int) $timeentry->id, 'transaction' => 'will_be_opened_by_updateCommon'));
        $timeentry->date_start = $newStart;
        $timeentry->date_end = $newEnd > 0 ? $newEnd : null;
        $timeentry->duration = $newEnd > 0 ? $newEnd - $newStart : 0;
        $res = $timeentry->update($user, 0, $auditReason, $isManager ? TimeEntry::MOD_ACTION_MANUAL_MANAGER : TimeEntry::MOD_ACTION_MANUAL_EMPLOYEE);
        timeflowCorrectionTrace('update_finished', array('rowid' => (int) $timeentry->id, 'result' => $res, 'audit_insert_attempted' => $res > 0));
        if ($res > 0) {
            timeflowCorrectionTrace('response_success', array('rowid' => (int) $timeentry->id, 'http_status' => 200));
            timeflowJsonResponse(array('status' => 'success', 'data' => timeflowExportTimeEntry($timeentry)));
        }
        timeflowCorrectionTrace('response_update_error', array('rowid' => (int) $timeentry->id, 'http_status' => 400));
        timeflowJsonResponse(array('status' => 'error', 'message' => $timeentry->error ?: 'Erreur lors de la modification'), 400);
        break;

    case 'getModificationHistory':
        $id = !empty($postData['entryId']) ? (int) $postData['entryId'] : (!empty($postData['id']) ? (int) $postData['id'] : (int) GETPOST('id', 'int'));
        $history = array();
        $sql = 'SELECT m.rowid, m.fk_timeentry, m.fk_user, m.action, m.field_name, m.old_value, m.new_value, m.reason, m.date_creation, u.login as user_login, u.firstname, u.lastname';
        $sql .= ' FROM ' . $db->prefix() . 'timeflow_timeentry_modification as m';
        $sql .= ' INNER JOIN ' . $db->prefix() . 'timeflow_timeentry as t ON t.rowid = m.fk_timeentry';
        $sql .= ' LEFT JOIN ' . $db->prefix() . 'user as u ON u.rowid = m.fk_user';
        $sql .= ' WHERE m.fk_timeentry = ' . ((int) $id);
        // Duration is recomputed from the two times; it is not a separately
        // edited field and should not clutter the manual-correction popup.
        $sql .= " AND (m.action NOT IN ('".TimeEntry::MOD_ACTION_MANUAL_EMPLOYEE."','".TimeEntry::MOD_ACTION_MANUAL_MANAGER."') OR m.field_name <> 'duration')";
        $sql .= ' AND t.entity IN ('.getEntity('timeentry').')';
        if (!timeflowCanReadAllTimeEntries($user) && !timeflowCanValidate($user)) {
            $sql .= ' AND t.fk_user = ' . ((int) $user->id);
        }
        $sql .= ' ORDER BY m.date_creation DESC';
        $resql = $db->query($sql);
        if ($resql) {
            while ($obj = $db->fetch_object($resql)) {
                $history[] = array(
                    'rowid' => (int) $obj->rowid,
                    'fk_timeentry' => (int) $obj->fk_timeentry,
                    'fk_user' => (int) $obj->fk_user,
                    'action' => $obj->action,
                    'field_name' => $obj->field_name,
                    'old_value' => in_array($obj->field_name, array('date_start', 'date_end'), true) ? timeflowExportAuditDate($obj->old_value) : $obj->old_value,
                    'new_value' => in_array($obj->field_name, array('date_start', 'date_end'), true) ? timeflowExportAuditDate($obj->new_value) : $obj->new_value,
                    'reason' => $obj->reason,
                    'date_creation' => $obj->date_creation,
                    'user_label' => timeflowResolveUserLabel((int) $obj->fk_user),
                );
            }
        }
        // Backward compatibility for corrections recorded before
        // timeflow_timeentry_modification existed.
        if (empty($history)) {
            $legacySql = 'SELECT l.id, l.fk_time_entry, l.fk_user_editor, l.old_start, l.new_start, l.old_end, l.new_end, l.reason, l.date_modification,';
            $legacySql .= ' u.login, u.firstname, u.lastname FROM '.$db->prefix().'timeflow_time_edit_log AS l';
            $legacySql .= ' INNER JOIN '.$db->prefix().'timeflow_timeentry AS t ON t.rowid = l.fk_time_entry';
            $legacySql .= ' LEFT JOIN '.$db->prefix().'user AS u ON u.rowid = l.fk_user_editor';
            $legacySql .= ' WHERE l.fk_time_entry = '.((int) $id).' AND t.entity IN ('.getEntity('timeentry').')';
            if (!timeflowCanReadAllTimeEntries($user) && !timeflowCanValidate($user)) {
                $legacySql .= ' AND t.fk_user = '.((int) $user->id);
            }
            $legacySql .= ' ORDER BY l.date_modification DESC';
            $legacyRes = $db->query($legacySql);
            while ($legacyRes && ($obj = $db->fetch_object($legacyRes))) {
                foreach (array('date_start' => array($obj->old_start, $obj->new_start), 'date_end' => array($obj->old_end, $obj->new_end)) as $field => $values) {
                    if ((string) $values[0] !== (string) $values[1]) {
                        $history[] = array('rowid' => (int) $obj->id, 'fk_timeentry' => (int) $obj->fk_time_entry, 'fk_user' => (int) $obj->fk_user_editor, 'action' => 'manual_legacy', 'field_name' => $field, 'old_value' => timeflowExportAuditDate($values[0]), 'new_value' => timeflowExportAuditDate($values[1]), 'reason' => $obj->reason, 'date_creation' => $obj->date_modification, 'user_label' => timeflowResolveUserLabel((int) $obj->fk_user_editor));
                    }
                }
            }
        }
        timeflowJsonResponse(array('status' => 'success', 'data' => $history));
        break;

    default:
        http_response_code(404);
        echo json_encode(array('error' => 'Action non reconnue'));
        break;
}

function timeflowFetchTimeFlowProjects($db, $user)
{
    $projects = array();
    $sql = 'SELECT p.rowid, p.ref, p.title, p.description, p.source, p.fk_dolibarr_project, p.fk_soc, s.nom as soc_name';
    $sql .= ' FROM '.$db->prefix().'timeflow_project AS p';
    $sql .= ' LEFT JOIN '.$db->prefix().'societe AS s ON s.rowid = p.fk_soc';
    $sql .= ' WHERE p.entity IN ('.getEntity('timeflow_project').')';
    $sql .= ' ORDER BY p.title ASC, p.rowid DESC';

    $resql = $db->query($sql);
    if ($resql) {
        while ($obj = $db->fetch_object($resql)) {
            $projects[] = array(
                'id' => (int) $obj->rowid,
                'rowid' => (int) $obj->rowid,
                'title' => $obj->title,
                'ref' => !empty($obj->ref) ? $obj->ref : '',
                'description' => !empty($obj->description) ? $obj->description : '',
                'source' => $obj->source,
                'fk_dolibarr_project' => (int) $obj->fk_dolibarr_project,
                'fk_soc' => (int) $obj->fk_soc,
                'client' => !empty($obj->soc_name) ? $obj->soc_name : '',
            );
        }
    }

    return $projects;
}

function timeflowResolveOrCreateProjectByLabel($db, $user, $projectLabel, $fkSoc = 0)
{
    $label = trim((string) $projectLabel);
    if ($label === '') {
        return 0;
    }

    $sql = 'SELECT rowid';
    $sql .= ' FROM '.$db->prefix().'timeflow_project';
    $sql .= ' WHERE entity IN ('.getEntity('timeflow_project').')';
    $sql .= " AND title = '".$db->escape($label)."'";
    $sql .= ' ORDER BY rowid DESC';
    $sql .= $db->plimit(1);
    $resql = $db->query($sql);
    if ($resql && $db->num_rows($resql) > 0) {
        $obj = $db->fetch_object($resql);
        $db->free($resql);
        return (int) $obj->rowid;
    }

    return timeflowCreateProject($db, $user, $label, $fkSoc);
}

function timeflowStoreTaskText($db, $user, $fkTimeentry, $label, $description = '')
{
    $label = trim((string) $label);
    if ($label === '') {
        return false;
    }

    $sql = 'INSERT INTO '.$db->prefix().'timeflow_task';
    $sql .= ' (entity, fk_user, fk_timeentry, label, description, fk_user_creat, date_creation)';
    $sql .= ' VALUES (';
    $sql .= getEntity('timeflow_task').',';
    $sql .= (int) $user->id.',';
    $sql .= (int) $fkTimeentry.',';
    $sql .= "'".$db->escape($label)."',";
    $sql .= "'".$db->escape(trim((string) $description))."',";
    $sql .= (int) $user->id.',';
    $sql .= "'".$db->idate(dol_now())."'";
    $sql .= ')';

    $resql = $db->query($sql);
    return $resql ? true : false;
}

function timeflowStoreProjectText($db, $user, $fkTimeentry, $projectLabel, $description = '')
{
    $projectLabel = trim((string) $projectLabel);
    if ($projectLabel === '') {
        return false;
    }

    $sql = 'INSERT INTO '.$db->prefix().'timeflow_project_text';
    $sql .= ' (entity, fk_timeentry, project_label, description, fk_user_creat, date_creation)';
    $sql .= ' VALUES (';
    $sql .= getEntity('timeflow_project_text').',';
    $sql .= (int) $fkTimeentry.',';
    $sql .= "'".$db->escape($projectLabel)."',";
    $sql .= "'".$db->escape(trim((string) $description))."',";
    $sql .= (int) $user->id.',';
    $sql .= "'".$db->idate(dol_now())."'";
    $sql .= ')';

    $resql = $db->query($sql);
    return $resql ? true : false;
}

function timeflowCreateProject($db, $user, $title, $fkSoc = 0)
{
    global $conf;

    $now = dol_now();
    $ref = 'CPJ-'.date('YmdHis');

    $sql = 'INSERT INTO '.$db->prefix().'timeflow_project';
    $sql .= ' (entity, ref, title, description, source, fk_dolibarr_project, fk_soc, fk_user_creat, date_creation)';
    $sql .= ' VALUES ('.getEntity('timeflow_project').',';
    $sql .= " '".$db->escape($ref)."',";
    $sql .= " '".$db->escape($title)."',";
    $sql .= " '',";
    $sql .= " 'manual',";
    $sql .= ' NULL,';
    $sql .= ' '.((int) $fkSoc).',';
    $sql .= ' '.((int) $user->id).',';
    $sql .= " '".$db->idate($now)."'";
    $sql .= ')';

    $resql = $db->query($sql);
    if ($resql) {
        return (int) $db->last_insert_id($db->prefix().'timeflow_project');
    }

    return -1;
}
