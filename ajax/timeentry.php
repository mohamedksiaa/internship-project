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
dol_include_once('/timeflow/class/timeimport.class.php');
dol_include_once('/timeflow/lib/timeflow.lib.php');
require_once DOL_DOCUMENT_ROOT.'/projet/class/project.class.php';
require_once DOL_DOCUMENT_ROOT.'/projet/class/task.class.php';

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
 * startTimer rejection: logs the full validation context server-side only
 * (never the CSRF token or the whole request body) — the client response
 * carries just the user-facing reason.
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
 * Remove once the investigation is complete. Never sent to the client —
 * server-side dol_syslog() only — and, like the other debug instrumentation
 * in this file, gated to admins with ?debug=1 so it stays opt-in in production.
 */
function timeflowCorrectionTrace($event, array $context = array())
{
    if (empty($GLOBALS['user']->admin) || !GETPOST('debug', 'int')) {
        return;
    }
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
        || $user->hasRight('timeflow', 'timeentry', 'validate');
}

/**
 * Whether a native project is in Dolibarr's "Closed" status — TimeFlow's
 * equivalent of "deleted" for a project (no UI-triggered action ever issues
 * a physical DELETE FROM on llx_projet; "Closed" is the non-destructive
 * substitute). A closed project must never accept a new time entry, exactly
 * like a genuinely deleted project no longer could.
 */
function timeflowProjectIsClosed($db, $fkProject)
{
    $sql = 'SELECT fk_statut FROM '.$db->prefix().'projet WHERE rowid = '.((int) $fkProject);
    $resql = $db->query($sql);
    $obj = $resql ? $db->fetch_object($resql) : null;
    return $obj ? ((int) $obj->fk_statut === Project::STATUS_CLOSED) : false;
}

/** Employee policy: draft entries from today; yesterday only to correct a missed stop. */
function timeflowEmployeeManualEditPolicy($entry)
{
    if ((int) $entry->status !== TimeEntry::STATUS_DRAFT) {
        return array('allowed' => false, 'message' => 'Cette entrée a été soumise ou traitée : contactez votre manager.', 'end_only' => false, 'reason_required' => true);
    }

    if (empty($entry->date_end)) {
        return array('allowed' => false, 'message' => 'Arrêtez d’abord le chronomètre avant de modifier cette entrée.', 'end_only' => false, 'reason_required' => true);
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

    $info = timeflowGetManualEditStatus($db, $entryId);
    $info = array(
        'manual_modified' => !empty($info['modified']),
        'manual_reason' => (string) $info['reason'],
        'manual_modified_at' => (string) $info['modified_at'],
        'manual_modified_by' => (int) $info['modified_by'],
        'manual_modified_source' => (string) $info['source'],
    );
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
    if (timeflowHasDateDeleteColumn($db)) {
        $sql .= ' AND t.date_delete IS NULL';
    }
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
/**
 * Real backend pagination (page/per_page, default 20 — same contract as
 * timeflowFetchDailyReports()/timeflowGetProcessedHistory()) replacing the
 * old implicit LIMIT 100 cap: beyond 100 rows in scope, entries used to be
 * silently invisible rather than paginated. $filter (Universal Search
 * string) is shared between the page query (via TimeEntry::fetchAll()) and
 * the total count (timeflowCountEntriesMatchingFilter(), which replicates
 * fetchAll()'s own WHERE construction for this table) so total/pages always
 * reflect the same filtered set actually returned, never the whole table.
 *
 * @param TimeEntry $timeentry
 * @param User $user
 * @param string $scope 'entries' (the caller's own timer history) or
 *        'validation' (every submitted entry, any owner — requires
 *        timeflowCanValidate(), checked by the caller)
 * @param int $page
 * @param int $perPage
 * @param bool $billableOnly Only used by the 'entries' scope (Suivi du temps)
 *        — see case 'getTimeEntries' for why 'getValidationEntries' never
 *        forwards this.
 * @return array{entries: array, pagination: array}
 */
function timeflowFetchVisibleTimeEntries($timeentry, $user, $scope = 'entries', $page = 1, $perPage = 20, $billableOnly = false, $filters = array())
{
    global $db;

    // Every criterion appended below is individually wrapped in its own
    // "(field:op:value)" parentheses — forgeSQLFromUniversalSearchCriteria()
    // requires that per-criterion shape (its regexstring only recognizes a
    // parenthesized triplet); an unparenthesized leading criterion silently
    // breaks the whole filter into a "Bad syntax of the search string" error
    // the moment a second criterion gets appended after it (harmless while
    // this was the only criterion for 'validation', because forgeSQL...'s own
    // top-level fallback auto-wraps a lone unparenthesized string — but not
    // once anything is concatenated onto it), which fetchAll()/
    // timeflowCountEntriesMatchingFilter() then both silently treat as "0
    // rows" instead of surfacing the error. This was the actual cause of the
    // "Validation des tâches" tab showing no entries once date filters were added.
    $filter = $scope === 'validation' ? '(t.status:=:'.TimeEntry::STATUS_SUBMITTED.')' : '';
    if ($scope !== 'validation') {
        $filter .= ($filter !== '' ? ' AND ' : '').'(t.fk_user:=:'.((int) $user->id).')';
    }
    if ($billableOnly) {
        $filter .= ($filter !== '' ? ' AND ' : '').'(t.billable:=:1)';
    }
    if ($scope === 'validation') {
        if (!empty($filters['employee_id'])) {
            $filter .= ($filter !== '' ? ' AND ' : '').'(t.fk_user:=:'.((int) $filters['employee_id']).')';
        }
        if (!empty($filters['date_from']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $filters['date_from'])) {
            // Universal Search date criteria use the compact Dolibarr date
            // format. Keep the API contract ISO (YYYY-MM-DD), but convert
            // before handing the value to forgeSQLFromUniversalSearchCriteria.
            $dateFrom = str_replace('-', '', $filters['date_from']);
            $filter .= ($filter !== '' ? ' AND ' : '')."(t.date_start:>=:'".$db->escape($dateFrom)."')";
        }
        if (!empty($filters['date_to']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $filters['date_to'])) {
            $dateTo = DateTime::createFromFormat('!Y-m-d', $filters['date_to']);
            if ($dateTo instanceof DateTime) {
                $dateTo->modify('+1 day');
                $filter .= ($filter !== '' ? ' AND ' : '')."(t.date_start:<:'".$db->escape($dateTo->format('Ymd'))."')";
            }
        }
    }

    $page = max(1, (int) $page);
    $perPage = min(100, max(1, (int) $perPage));
    $offset = ($page - 1) * $perPage;

    $total = timeflowCountEntriesMatchingFilter($db, $filter);
    $total = $total >= 0 ? $total : 0;

    $result = $timeentry->fetchAll('DESC', 't.date_start', $perPage, $offset, $filter);
    $rows = array();
    if (is_array($result)) {
        foreach ($result as $obj) {
            $rows[] = timeflowExportTimeEntry($obj);
        }
    }

    return array(
        'entries' => $rows,
        'pagination' => array('page' => $page, 'per_page' => $perPage, 'total' => $total, 'pages' => max(1, (int) ceil($total / $perPage))),
        'employees' => $scope === 'validation' ? timeflowValidationEmployees() : array(),
    );
}

function timeflowValidationEmployees()
{
    global $db;
    $sql = 'SELECT DISTINCT t.fk_user, u.login, u.firstname, u.lastname FROM '.$db->prefix().'timeflow_timeentry AS t';
    $sql .= ' LEFT JOIN '.$db->prefix().'user AS u ON u.rowid = t.fk_user';
    $sql .= ' WHERE t.entity IN ('.getEntity('timeentry').') AND t.status = '.TimeEntry::STATUS_SUBMITTED;
    $sql .= ' ORDER BY u.lastname, u.firstname, u.login';
    $resql = $db->query($sql);
    $employees = array();
    while ($resql && ($obj = $db->fetch_object($resql))) {
        $employees[] = array('id' => (int) $obj->fk_user, 'label' => trim($obj->firstname.' '.$obj->lastname) ?: ($obj->login ?: 'Utilisateur #'.((int) $obj->fk_user)));
    }
    return $employees;
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
        'fk_split_previous',
        'date_submit',
        'fk_user_submit',
        'fk_user_valid',
        'date_creation',
        'tms',
        'date_delete',
        'fk_user_delete',
    );

    $cleaned = array();
    foreach ($allowedFields as $field) {
        if (property_exists($object, $field)) {
            $cleaned[$field] = $object->{$field};
        }
    }

    if (isset($object->fk_user) || property_exists($object, 'fk_user')) {
        $cleaned['user_label'] = timeflowResolveUserLabel((int) $object->fk_user);
    }

    if (isset($object->fk_project) || property_exists($object, 'fk_project')) {
        $cleaned['project_label'] = timeflowResolveProjectLabel((int) $object->fk_project);
    }

    if (isset($object->fk_task) || property_exists($object, 'fk_task')) {
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

    // Mark whether this entry was soft-deleted. Prefer an explicit DB column
    // if present; fall back to the presence of a date_delete property.
    $isDeleted = false;
    if (isset($object->date_delete) && $object->date_delete !== null && $object->date_delete !== '') {
        $isDeleted = true;
    }
    $cleaned['is_deleted'] = $isDeleted ? true : false;

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
    // Projects live in the native llx_projet table (TimeFlow -> native
    // project migration) — llx_timeflow_project is kept read-only as a
    // pre-migration backup, no longer written to.
    $sql = 'SELECT rowid, ref, title';
    $sql .= ' FROM '.$db->prefix().'projet';
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

function timeflowFetchUserGroups($db)
{
    $groups = array();
    $sql = 'SELECT rowid, nom';
    $sql .= ' FROM '.$db->prefix().'usergroup';
    $sql .= ' WHERE entity IN ('.getEntity('usergroup').')';
    $sql .= ' ORDER BY nom ASC';

    $resql = $db->query($sql);
    if ($resql) {
        while ($obj = $db->fetch_object($resql)) {
            $groups[] = array(
                'id' => (int) $obj->rowid,
                'rowid' => (int) $obj->rowid,
                'title' => (string) $obj->nom,
                'label' => (string) $obj->nom,
            );
        }
        $db->free($resql);
    }

    return $groups;
}

function timeflowFetchActiveUsers($db)
{
    $users = array();
    $sql = 'SELECT rowid, login, firstname, lastname';
    $sql .= ' FROM '.$db->prefix().'user';
    $sql .= ' WHERE statut = 1';
    $sql .= ' AND entity IN ('.getEntity('user').')';
    $sql .= ' ORDER BY lastname ASC, firstname ASC, login ASC';

    $resql = $db->query($sql);
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

/**
 * Read-only "who has TimeFlow activity" listing for Rapports > Utilisateurs:
 * every user matching AT LEAST ONE of:
 *   1. Created at least one time entry (any status — draft/submitted/
 *      validated/refused all count as activity).
 *   2. Assigned as a contributor on at least one TimeFlow project (native
 *      llx_element_contact/PROJECTCONTRIBUTOR mechanism — same join used to
 *      resolve a project's assigned_user_ids in timeflowFetchTimeFlowProjects()).
 *   3. Member of at least one Dolibarr group (llx_usergroup_user) — same
 *      table already used for the dashboard's "by_group" breakdown.
 * A person can be assigned to a project or added to a group without ever
 * having logged time themselves (e.g. "azer", "med ahemd" — assigned
 * contributors who never created an entry), so criterion 1 alone under-counts.
 * Deliberately NOT the same set as timeflowFetchActiveUsers() above
 * (active-only, used to populate assignment pickers) — a user deactivated
 * after logging time, or removed from all groups/projects since, should
 * still show up here.
 *
 * @param DoliDB $db
 * @return array
 */
function timeflowFetchTimeFlowUsers($db, $page = 1, $perPage = 20)
{
    $users = array();

    $entryDateDeleteClause = timeflowHasDateDeleteColumn($db) ? ' AND t.date_delete IS NULL' : '';

    $membershipSubquery = '(';
    $membershipSubquery .= '   SELECT t.fk_user FROM '.$db->prefix().'timeflow_timeentry AS t';
    $membershipSubquery .= '   WHERE t.entity IN ('.getEntity('timeentry').')'.$entryDateDeleteClause;
    $membershipSubquery .= '   UNION';
    $membershipSubquery .= '   SELECT ec.fk_socpeople FROM '.$db->prefix().'element_contact AS ec';
    $membershipSubquery .= '   INNER JOIN '.$db->prefix().'c_type_contact AS tc ON tc.rowid = ec.fk_c_type_contact';
    $membershipSubquery .= "   WHERE tc.element = 'project' AND tc.source = 'internal' AND tc.code = 'PROJECTCONTRIBUTOR' AND ec.statut = 4";
    $membershipSubquery .= '   UNION';
    $membershipSubquery .= '   SELECT ug.fk_user FROM '.$db->prefix().'usergroup_user AS ug';
    $membershipSubquery .= ' )';

    // Same page/per_page -> {rows, pagination:{page,per_page,total,pages}}
    // contract as the rest of the module, even though this listing has no
    // filters of its own — count uses the exact same membership subquery as
    // the page query, so total/pages always match what paging through would
    // actually return.
    $page = max(1, (int) $page);
    $perPage = min(100, max(1, (int) $perPage));
    $offset = ($page - 1) * $perPage;
    $countSql = 'SELECT COUNT(*) AS nb FROM '.$db->prefix().'user AS u WHERE u.rowid IN '.$membershipSubquery;
    $total = 0;
    $countRes = $db->query($countSql);
    if ($countRes) {
        $countObj = $db->fetch_object($countRes);
        $total = $countObj ? (int) $countObj->nb : 0;
        $db->free($countRes);
    }

    $sql = 'SELECT u.rowid, u.firstname, u.lastname, u.email, u.office_phone, u.user_mobile';
    $sql .= ' FROM '.$db->prefix().'user AS u';
    $sql .= ' WHERE u.rowid IN '.$membershipSubquery;
    $sql .= ' ORDER BY u.lastname ASC, u.firstname ASC';
    $sql .= $db->plimit($perPage, $offset);

    $userIds = array();
    $resql = $db->query($sql);
    if ($resql) {
        while ($obj = $db->fetch_object($resql)) {
            $fullName = trim(trim((string) $obj->firstname).' '.trim((string) $obj->lastname));
            $userId = (int) $obj->rowid;
            $users[$userId] = array(
                'id' => $userId,
                'firstname' => (string) $obj->firstname,
                'lastname' => (string) $obj->lastname,
                'label' => $fullName !== '' ? $fullName : ('#'.$userId),
                'email' => (string) $obj->email,
                'office_phone' => (string) $obj->office_phone,
                'user_mobile' => (string) $obj->user_mobile,
                'groups' => array(),
            );
            $userIds[] = $userId;
        }
        $db->free($resql);
    }

    // Groups: same llx_usergroup_user/llx_usergroup join already used to
    // build the "by_group" dashboard breakdown (timeflowBuildSummary) — a
    // user can belong to more than one TimeFlow group at once.
    if (!empty($userIds)) {
        $sql = 'SELECT ug.fk_user, g.nom FROM '.$db->prefix().'usergroup_user AS ug';
        $sql .= ' INNER JOIN '.$db->prefix().'usergroup AS g ON g.rowid = ug.fk_usergroup';
        $sql .= ' WHERE ug.fk_user IN ('.implode(',', $userIds).')';
        $resql = $db->query($sql);
        if ($resql) {
            while ($obj = $db->fetch_object($resql)) {
                $userId = (int) $obj->fk_user;
                if (isset($users[$userId])) {
                    $users[$userId]['groups'][] = (string) $obj->nom;
                }
            }
            $db->free($resql);
        }
    }

    return array(
        'rows' => array_values($users),
        'pagination' => array('page' => $page, 'per_page' => $perPage, 'total' => $total, 'pages' => max(1, (int) ceil($total / $perPage))),
    );
}

/**
 * Builds one row per real time entry (any status — this is meant as a full
 * consolidated dump, and the Clockify CSV format has no status column to
 * preserve it through a round-trip anyway) for Rapports' global "Export"
 * button, in EXACTLY the column shape TimeImportClockify expects
 * (config/import_column_mapping_clockify.json) so the file can be
 * re-imported as-is via previewClockifyImport(). Joins project -> client and
 * user -> group(s) so each row carries everything the import format wants,
 * even though those live on separate Rapports sub-pages on screen.
 *
 * Excluded: entries with no date_end or a non-positive duration (an
 * unfinished/active timer has no "end" to round-trip) and, for a caller
 * without team-wide read rights, every entry that isn't their own — same
 * scoping rule as getTimeEntries/getSummaryReports elsewhere in this file.
 *
 * @param DoliDB $db
 * @param User $user
 * @return array<int, array<int, string>> Rows only — the fixed French header
 *         (must match the import's expected column labels verbatim,
 *         independent of UI language) is added by the frontend.
 */
function timeflowBuildGlobalCsvRows($db, $user)
{
    $rows = array();

    $sql = 'SELECT t.fk_project, t.fk_user, t.date_start, t.date_end, t.duration, t.note, t.billable,';
    $sql .= ' u.email, u.firstname, u.lastname, u.login,';
    $sql .= ' p.title AS project_title, p.ref AS project_ref, p.fk_soc';
    $sql .= ' FROM '.$db->prefix().'timeflow_timeentry AS t';
    $sql .= ' INNER JOIN '.$db->prefix().'user AS u ON u.rowid = t.fk_user';
    $sql .= ' LEFT JOIN '.$db->prefix().'projet AS p ON p.rowid = t.fk_project';
    $sql .= ' WHERE t.entity IN ('.getEntity('timeentry').')';
    if (timeflowHasDateDeleteColumn($db)) {
        $sql .= ' AND t.date_delete IS NULL';
    }
    if (!timeflowCanReadAllTimeEntries($user)) {
        $sql .= ' AND t.fk_user = '.((int) $user->id);
    }
    $sql .= ' AND t.date_end IS NOT NULL AND t.duration > 0';
    $sql .= ' ORDER BY t.date_start ASC';
    // Safety net, not a real-world pagination cap — bounds against a
    // pathological unbounded query rather than an expected data size.
    $sql .= ' LIMIT 50000';

    $resql = $db->query($sql);
    if (!$resql) {
        return $rows;
    }

    $entries = array();
    $clientIds = array();
    $userIds = array();
    while ($obj = $db->fetch_object($resql)) {
        $entries[] = $obj;
        if (!empty($obj->fk_soc)) {
            $clientIds[(int) $obj->fk_soc] = true;
        }
        $userIds[(int) $obj->fk_user] = true;
    }
    $db->free($resql);

    // Client labels — one query for every fk_soc actually referenced.
    $clientLabelMap = array();
    if (!empty($clientIds)) {
        $sql = 'SELECT rowid, nom FROM '.$db->prefix().'societe';
        $sql .= ' WHERE rowid IN ('.implode(',', array_map('intval', array_keys($clientIds))).')';
        $resql = $db->query($sql);
        if ($resql) {
            while ($obj = $db->fetch_object($resql)) {
                $clientLabelMap[(int) $obj->rowid] = (string) $obj->nom;
            }
            $db->free($resql);
        }
    }

    // Groups per user — same llx_usergroup_user/llx_usergroup join used
    // elsewhere (timeflowBuildSummary, timeflowFetchTimeFlowUsers).
    $userGroupsMap = array();
    if (!empty($userIds)) {
        $sql = 'SELECT ug.fk_user, g.nom FROM '.$db->prefix().'usergroup_user AS ug';
        $sql .= ' INNER JOIN '.$db->prefix().'usergroup AS g ON g.rowid = ug.fk_usergroup';
        $sql .= ' WHERE ug.fk_user IN ('.implode(',', array_map('intval', array_keys($userIds))).')';
        $resql = $db->query($sql);
        if ($resql) {
            while ($obj = $db->fetch_object($resql)) {
                $userGroupsMap[(int) $obj->fk_user][] = (string) $obj->nom;
            }
            $db->free($resql);
        }
    }

    foreach ($entries as $obj) {
        $startTs = is_numeric($obj->date_start) ? (int) $obj->date_start : strtotime((string) $obj->date_start);
        $endTs = is_numeric($obj->date_end) ? (int) $obj->date_end : strtotime((string) $obj->date_end);
        if (!$startTs || !$endTs) {
            continue;
        }

        $projectTitle = !empty($obj->project_title) ? (string) $obj->project_title : (string) ($obj->project_ref ?? '');
        $clientName = !empty($obj->fk_soc) ? ($clientLabelMap[(int) $obj->fk_soc] ?? '') : '';
        $groups = $userGroupsMap[(int) $obj->fk_user] ?? array();
        $displayName = trim(trim((string) $obj->firstname).' '.trim((string) $obj->lastname));

        $rows[] = array(
            $projectTitle,
            $clientName,
            implode(',', $groups),
            (string) $obj->note,
            (string) $obj->email,
            $displayName !== '' ? $displayName : (string) $obj->login,
            !empty($obj->billable) ? 'Oui' : 'Non',
            date('m/d/Y', $startTs),
            date('H:i:s', $startTs),
            date('m/d/Y', $endTs),
            date('H:i:s', $endTs),
            number_format(((int) $obj->duration) / 3600, 2, '.', ''),
        );
    }

    return $rows;
}

/**
 * SQL clause restricting a `projet` query to the projects a given user is
 * allowed to see, via the native project contact mechanism
 * (llx_element_contact/llx_c_type_contact) — same rule as
 * timeflowCanAccessProject(): a project with no PROJECTCONTRIBUTOR contact
 * at all is open to everyone; otherwise only assigned users (or
 * admins/readall, via timeflowCanReadAllTimeEntries()) may see it.
 *
 * Returns an empty string (no restriction) for an admin, a readall user, or
 * a null $user. Otherwise returns a ' AND (...)' fragment ready to append
 * to the caller's own WHERE clause.
 *
 * @param DoliDB $db
 * @param User|null $user
 * @param string $projectAlias SQL alias of the `projet` table in the
 *        caller's FROM clause (its rowid is referenced as "<alias>.rowid").
 * @return string
 */
function timeflowProjectMembershipRestrictionSql($db, $user, $projectAlias = 'p')
{
    $mustRestrict = $user && empty($user->admin) && !timeflowCanReadAllTimeEntries($user);
    if (!$mustRestrict) {
        return '';
    }
    $clause = ' AND (';
    $clause .= '  NOT EXISTS (';
    $clause .= '    SELECT 1 FROM '.$db->prefix().'element_contact AS ec';
    $clause .= '    INNER JOIN '.$db->prefix().'c_type_contact AS tc ON tc.rowid = ec.fk_c_type_contact';
    $clause .= "    WHERE tc.element = 'project' AND tc.source = 'internal' AND tc.code = 'PROJECTCONTRIBUTOR'";
    $clause .= '    AND ec.statut = 4 AND ec.element_id = '.$projectAlias.'.rowid';
    $clause .= '  )';
    $clause .= '  OR EXISTS (';
    $clause .= '    SELECT 1 FROM '.$db->prefix().'element_contact AS ec2';
    $clause .= '    INNER JOIN '.$db->prefix().'c_type_contact AS tc2 ON tc2.rowid = ec2.fk_c_type_contact';
    $clause .= "    WHERE tc2.element = 'project' AND tc2.source = 'internal' AND tc2.code = 'PROJECTCONTRIBUTOR'";
    $clause .= '    AND ec2.statut = 4 AND ec2.element_id = '.$projectAlias.'.rowid AND ec2.fk_socpeople = '.(int) $user->id;
    $clause .= '  )';
    $clause .= ' )';
    return $clause;
}

function timeflowFetchProjects($db, $user = null)
{
    $projects = array();

    $sql = 'SELECT p.rowid, p.ref, p.title, p.fk_soc, s.nom as soc_name';
    $sql .= ' FROM '.$db->prefix().'projet AS p';
    $sql .= ' LEFT JOIN '.$db->prefix().'societe AS s ON s.rowid = p.fk_soc';
    $sql .= ' WHERE p.entity IN ('.getEntity('project').')';
    // A closed project is TimeFlow's "deleted" project (no UI-triggered
    // action issues a physical delete; native setClose() is used instead):
    // it must disappear from every picker, exactly like a real delete would.
    $sql .= ' AND p.fk_statut <> '.Project::STATUS_CLOSED;
    $sql .= timeflowProjectMembershipRestrictionSql($db, $user, 'p');
    $sql .= ' ORDER BY p.title ASC, p.ref ASC, p.rowid DESC';

    $resql = $db->query($sql);
    if ($resql) {
        while ($obj = $db->fetch_object($resql)) {
            // Normal flow: build lightweight project metadata for listing

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
    // $projectId now IS the native llx_projet id directly (TimeFlow ->
    // native project migration), so tasks scope to it with no indirection.
    // Previously this went through llx_timeflow_project.fk_dolibarr_project,
    // which was never populated — every call with a project actually set
    // silently returned tasks from ALL projects instead of just this one;
    // that latent bug is naturally resolved now.
    $dolibarrProjectId = (int) $projectId;

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
    // Optional debug instrumentation: set GET/POST debug=1 to include timings
    // IMPORTANT: only admins can enable debug output.
    $debugMode = !empty($user->admin) && GETPOST('debug', 'int');
    $timeflow_diag = array();

    $weekStartTs = !empty($weekStart) ? strtotime($weekStart) : strtotime('monday this week');
    $weekEndTs = strtotime('+7 days', $weekStartTs);

    $filterParts = array();

    if (!timeflowCanReadAllTimeEntries($user)) {
        $filterParts[] = '(t.fk_user:=:' . (int) $user->id . ')';
    }

    // Dolibarr universal filter syntax expects quoted date literals.
    $filterParts[] = "(t.date_start:>=:'" . date('Y-m-d 00:00:00', $weekStartTs) . "')";
    $filterParts[] = "(t.date_start:<:'" . date('Y-m-d 00:00:00', $weekEndTs) . "')";
    $filter = implode(' AND ', $filterParts);

    if ($debugMode) {
        $t0 = microtime(true);
    }

    $result = $timeentry->fetchAll('ASC', 't.date_start', 1000, 0, $filter);

    if ($debugMode) {
        $t1 = microtime(true);
        $timeflow_diag['fetchAll_ms'] = round(($t1 - $t0) * 1000);
        $timeflow_diag['fetchAll_rows'] = is_array($result) ? count($result) : 0;
    }

    $rows = array();

    if (is_array($result)) {
        $kept = 0;
        $exportTotalMs = 0.0;

        foreach ($result as $obj) {
            $start = is_numeric($obj->date_start) ? (int) $obj->date_start : strtotime((string) $obj->date_start);

            if ($debugMode) {
                $te0 = microtime(true);
            }

            $row = timeflowExportTimeEntry($obj);

            if ($debugMode) {
                $te1 = microtime(true);
                $exportTotalMs += ($te1 - $te0) * 1000.0;
            }

            $row['day'] = date('Y-m-d', $start);
            $rows[] = $row;
            $kept++;
        }

        if ($debugMode) {
            $timeflow_diag['export_total_ms'] = round($exportTotalMs);
            $timeflow_diag['rows_kept'] = (int) $kept;
        }
    }

    $resultPayload = array(
        'weekStart' => date('Y-m-d', $weekStartTs),
        'weekEnd' => date('Y-m-d', $weekEndTs),
        'rows' => $rows,
    );

    if ($debugMode) {
        $resultPayload['diagnostics'] = $timeflow_diag;
    }

    return $resultPayload;
}

/**
 * Builds the dashboard/reports aggregate summary for a set of already-fetched
 * time entries: one pass computes every "by_X" breakdown at once (project,
 * client, employee, group, tag, status) so a single getSummaryReports call
 * can feed the period cards AND the customizable chart widget together.
 *
 * Label sentinel keys (project '0', client '0', group '0') are left for the
 * frontend to translate ("Sans projet"/"Client inconnu"/"Sans groupe"), the
 * same way it already handles the project '0' bucket — no i18n in this file.
 *
 * @param array $entries Exported time entries (see timeflowExportTimeEntry)
 * @param DoliDB $db
 * @return array
 */
function timeflowBuildSummary($entries, $db)
{
    $summary = array(
        'total_seconds' => 0,
        'billable_seconds' => 0,
        'non_billable_seconds' => 0,
        'by_project' => array(),
        'project_labels' => array(),
        'by_client' => array(),
        'client_labels' => array(),
        'by_user' => array(),
        'user_labels' => array(),
        'by_group' => array(),
        'group_labels' => array(),
        'by_tag' => array(),
        'by_status' => array(),
        // Composite (2-dimension) breakdowns for the customizable chart's
        // "cross with" stacking. Keyed "<dim1Value>|<dim2Value>" using a fixed
        // canonical pair order (project, employee, client, billable) so each
        // pair is stored once and the frontend pivots either dimension to the
        // X axis. "group" is deliberately excluded: a duration can land in
        // several groups at once (see by_group below), so stacking it would
        // make a bar's segments sum to more than its real total.
        'by_project_employee' => array(),
        'by_project_client' => array(),
        'by_project_billable' => array(),
        'by_employee_client' => array(),
        'by_employee_billable' => array(),
        'by_client_billable' => array(),
    );

    // fk_project -> fk_soc, one query for every project actually referenced.
    $projectClientMap = array();
    $projectIds = array();
    foreach ($entries as $entry) {
        $pid = (int) ($entry['fk_project'] ?? 0);
        if ($pid > 0) {
            $projectIds[$pid] = true;
        }
    }
    if (!empty($projectIds)) {
        $sql = 'SELECT rowid, fk_soc FROM '.$db->prefix().'projet';
        $sql .= ' WHERE rowid IN ('.implode(',', array_map('intval', array_keys($projectIds))).')';
        $resql = $db->query($sql);
        if ($resql) {
            while ($obj = $db->fetch_object($resql)) {
                $projectClientMap[(int) $obj->rowid] = (int) $obj->fk_soc;
            }
        }
    }

    // fk_soc -> nom, one query for every client actually referenced.
    $clientLabelMap = array();
    $clientIds = array_values(array_unique(array_filter($projectClientMap)));
    if (!empty($clientIds)) {
        $sql = 'SELECT rowid, nom FROM '.$db->prefix().'societe';
        $sql .= ' WHERE rowid IN ('.implode(',', array_map('intval', $clientIds)).')';
        $resql = $db->query($sql);
        if ($resql) {
            while ($obj = $db->fetch_object($resql)) {
                $clientLabelMap[(int) $obj->rowid] = (string) $obj->nom;
            }
        }
    }

    // fk_user -> [fk_usergroup...] + group labels. Table is tiny today (no
    // group-management UI exists yet beyond the CSV import mapping), so a
    // single unfiltered join is simplest and still cheap at any realistic size.
    $userGroupsMap = array();
    $groupLabelMap = array();
    $sql = 'SELECT ug.fk_user, ug.fk_usergroup, g.nom FROM '.$db->prefix().'usergroup_user AS ug';
    $sql .= ' INNER JOIN '.$db->prefix().'usergroup AS g ON g.rowid = ug.fk_usergroup';
    $resql = $db->query($sql);
    if ($resql) {
        while ($obj = $db->fetch_object($resql)) {
            $userGroupsMap[(int) $obj->fk_user][] = (int) $obj->fk_usergroup;
            $groupLabelMap[(int) $obj->fk_usergroup] = (string) $obj->nom;
        }
    }

    foreach ($entries as $entry) {
        $duration = (int) ($entry['duration'] ?? 0);
        $summary['total_seconds'] += $duration;
        if (!empty($entry['billable'])) {
            $summary['billable_seconds'] += $duration;
        } else {
            $summary['non_billable_seconds'] += $duration;
        }

        $fkProject = (int) ($entry['fk_project'] ?? 0);
        $projectKey = (string) $fkProject;
        if (!isset($summary['by_project'][$projectKey])) {
            $summary['by_project'][$projectKey] = 0;
        }
        $summary['by_project'][$projectKey] += $duration;
        if (!isset($summary['project_labels'][$projectKey])) {
            $summary['project_labels'][$projectKey] = $entry['project_label'] ?? ('Projet #'.$projectKey);
        }

        // Client, via the entry's project's fk_soc. No project or no client on
        // the project both land in the same "0" bucket (frontend: "Client inconnu").
        $fkSoc = $fkProject > 0 ? ($projectClientMap[$fkProject] ?? 0) : 0;
        $clientKey = (string) $fkSoc;
        if (!isset($summary['by_client'][$clientKey])) {
            $summary['by_client'][$clientKey] = 0;
        }
        $summary['by_client'][$clientKey] += $duration;
        if ($fkSoc > 0 && !isset($summary['client_labels'][$clientKey])) {
            $summary['client_labels'][$clientKey] = $clientLabelMap[$fkSoc] ?? ('Client #'.$clientKey);
        }

        $fkUser = (int) ($entry['fk_user'] ?? 0);
        $userKey = (string) $fkUser;
        if (!isset($summary['by_user'][$userKey])) {
            $summary['by_user'][$userKey] = 0;
        }
        $summary['by_user'][$userKey] += $duration;
        if (!isset($summary['user_labels'][$userKey])) {
            $summary['user_labels'][$userKey] = $entry['user_label'] ?? ('Utilisateur #'.$userKey);
        }

        $billableKey = !empty($entry['billable']) ? '1' : '0';

        $pairKey = $projectKey.'|'.$userKey;
        $summary['by_project_employee'][$pairKey] = ($summary['by_project_employee'][$pairKey] ?? 0) + $duration;
        $pairKey = $projectKey.'|'.$clientKey;
        $summary['by_project_client'][$pairKey] = ($summary['by_project_client'][$pairKey] ?? 0) + $duration;
        $pairKey = $projectKey.'|'.$billableKey;
        $summary['by_project_billable'][$pairKey] = ($summary['by_project_billable'][$pairKey] ?? 0) + $duration;
        $pairKey = $userKey.'|'.$clientKey;
        $summary['by_employee_client'][$pairKey] = ($summary['by_employee_client'][$pairKey] ?? 0) + $duration;
        $pairKey = $userKey.'|'.$billableKey;
        $summary['by_employee_billable'][$pairKey] = ($summary['by_employee_billable'][$pairKey] ?? 0) + $duration;
        $pairKey = $clientKey.'|'.$billableKey;
        $summary['by_client_billable'][$pairKey] = ($summary['by_client_billable'][$pairKey] ?? 0) + $duration;

        // Group(s): an employee can belong to several groups at once, so a
        // single entry's duration can be counted into more than one bucket
        // — this is a deliberate departure from the other dimensions, which
        // partition duration exactly once. Employees with no group land in
        // an explicit "0" bucket (frontend: "Sans groupe").
        $groupsForUser = $userGroupsMap[$fkUser] ?? array();
        if (empty($groupsForUser)) {
            if (!isset($summary['by_group']['0'])) {
                $summary['by_group']['0'] = 0;
            }
            $summary['by_group']['0'] += $duration;
        } else {
            foreach ($groupsForUser as $fkGroup) {
                $groupKey = (string) $fkGroup;
                if (!isset($summary['by_group'][$groupKey])) {
                    $summary['by_group'][$groupKey] = 0;
                }
                $summary['by_group'][$groupKey] += $duration;
                if (!isset($summary['group_labels'][$groupKey])) {
                    $summary['group_labels'][$groupKey] = $groupLabelMap[$fkGroup] ?? ('Groupe #'.$groupKey);
                }
            }
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

/**
 * Counts how many timeflow_timeentry rows match the same Universal Search
 * filter string passed to TimeEntry::fetchAll(), ignoring its limit — used
 * only to detect whether getSummaryReports' capped fetch silently truncated
 * the period so the frontend can warn instead of showing an incomplete chart.
 *
 * @param DoliDB $db
 * @param string $filter Universal Search string, same format as fetchAll()'s $filter
 * @return int<-1,max> Row count, or -1 on query error
 */
function timeflowCountEntriesMatchingFilter($db, $filter)
{
    $sql = 'SELECT COUNT(*) as nb FROM '.$db->prefix().'timeflow_timeentry as t';
    $sql .= ' WHERE 1 = 1 AND t.date_delete IS NULL';
    $errormessage = '';
    $sql .= forgeSQLFromUniversalSearchCriteria($filter, $errormessage);
    if ($errormessage) {
        dol_syslog('timeflowCountEntriesMatchingFilter: '.$errormessage, LOG_ERR);
        return -1;
    }
    $resql = $db->query($sql);
    if (!$resql) {
        return -1;
    }
    $obj = $db->fetch_object($resql);
    return $obj ? (int) $obj->nb : -1;
}

/** Build the shared, server-side WHERE clause for the manager read-only history. */
function timeflowProcessedHistoryWhere($input, $user = null)
{
    global $db;
    // t.date_delete IS NULL: a soft-deleted entry must not appear in this
    // history nor count toward its stats, even if it was validated/refused
    // before being deleted — unlike getTimeOverlaps(), which deliberately
    // keeps soft-deleted rows (a deleted entry still represents a slot that
    // was historically occupied, for overlap detection). The two are
    // legitimately opposite on the same date_delete column; do not unify them.
    $where = array('t.entity IN ('.getEntity('timeentry').')', 't.date_delete IS NULL', 't.status IN ('.TimeEntry::STATUS_VALIDATED.','.TimeEntry::STATUS_CANCELED.')');
    if ($user && !timeflowCanReadAllTimeEntries($user)) {
        $where[] = 't.fk_user = '.((int) $user->id);
    } elseif (!empty($input['employee_id'])) {
        $where[] = 't.fk_user = '.((int) $input['employee_id']);
    }
    $status = (string) ($input['status'] ?? 'all');
    if ($status === 'validated') $where[] = 't.status = '.TimeEntry::STATUS_VALIDATED;
    if ($status === 'refused') $where[] = 't.status = '.TimeEntry::STATUS_CANCELED;
    if (!empty($input['project_id'])) $where[] = 't.fk_project = '.((int) $input['project_id']);
    if (!empty($input['date_from']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $input['date_from'])) $where[] = "t.date_start >= '".$db->escape($input['date_from'])." 00:00:00'";
    if (!empty($input['date_to']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $input['date_to'])) $where[] = "t.date_start < DATE_ADD('".$db->escape($input['date_to'])." 00:00:00', INTERVAL 1 DAY)";
    if (!empty($input['manual_only'])) {
        $where[] = timeflowManualEditedSqlPredicate($db, 't');
    }
    if (!empty($input['billable_only'])) {
        $where[] = 't.billable = 1';
    }
    return implode(' AND ', $where);
}

function timeflowGetProcessedHistory($input, $user = null)
{
    global $db;
    $isManagerView = $user ? timeflowCanReadAllTimeEntries($user) : true;
    $where = timeflowProcessedHistoryWhere($input, $user);
    $page = max(1, (int) ($input['page'] ?? 1));
    $perPage = min(!empty($input['export']) ? 10000 : 100, max(1, (int) ($input['per_page'] ?? 50)));
    $offset = ($page - 1) * $perPage;
    $countSql = 'SELECT COUNT(*) AS total FROM '.$db->prefix().'timeflow_timeentry t WHERE '.$where;
    $countRes = $db->query($countSql); $countObj = $countRes ? $db->fetch_object($countRes) : null;
    $total = $countObj ? (int) $countObj->total : 0;
    $statsSql = 'SELECT COALESCE(SUM(CASE WHEN t.status = '.TimeEntry::STATUS_VALIDATED.' THEN 1 ELSE 0 END),0) AS validated_count,'
        .' SUM(CASE WHEN t.status = '.TimeEntry::STATUS_CANCELED.' THEN 1 ELSE 0 END) AS refused_count,'
        .' SUM(CASE WHEN '.timeflowManualEditedSqlPredicate($db, 't').' THEN 1 ELSE 0 END) AS manual_count'
        .' FROM '.$db->prefix().'timeflow_timeentry t WHERE '.$where;
    $statsRes = $db->query($statsSql); $statsObj = $statsRes ? $db->fetch_object($statsRes) : null;
    $sql = 'SELECT t.rowid, t.fk_user, t.fk_project, t.fk_task, t.date_start, t.date_end, t.duration, t.note, t.status, t.fk_user_valid, t.tms, t.date_delete, t.fk_user_delete,'
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
    if ($isManagerView) {
        $employeeSql = 'SELECT DISTINCT t.fk_user, u.login, u.firstname, u.lastname FROM '.$db->prefix().'timeflow_timeentry t LEFT JOIN '.$db->prefix().'user u ON u.rowid=t.fk_user WHERE t.entity IN ('.getEntity('timeentry').') AND t.date_delete IS NULL AND t.status IN ('.TimeEntry::STATUS_VALIDATED.','.TimeEntry::STATUS_CANCELED.')';
        $employeeSql .= ' ORDER BY u.lastname, u.firstname, u.login';
        $employeeRes = $db->query($employeeSql);
        while ($employeeRes && ($obj = $db->fetch_object($employeeRes))) $employees[] = array('id'=>(int) $obj->fk_user, 'label'=>trim($obj->firstname.' '.$obj->lastname) ?: ($obj->login ?: 'Utilisateur #'.((int) $obj->fk_user)));
    } elseif ($user && !empty($user->id)) {
        $employees[] = array('id' => (int) $user->id, 'label' => timeflowResolveUserLabel((int) $user->id));
    }
    return array('rows'=>$rows, 'employees'=>$employees, 'pagination'=>array('page'=>$page, 'per_page'=>$perPage, 'total'=>$total, 'pages'=>max(1, (int) ceil($total / $perPage))), 'stats'=>array('validated_count'=>(int) ($statsObj->validated_count ?? 0), 'refused_count'=>(int) ($statsObj->refused_count ?? 0), 'manual_count'=>(int) ($statsObj->manual_count ?? 0)));
}

/**
 * Deletion policy for daily reports, mirroring TimeEntry::isDeletionAllowedFor()
 * exactly for validated/submitted records. Drafts and refused reports belong
 * to their employee (and still require the base 'timeentry'/'write' right).
 * A refusal is not an approval, so its owner may soft-delete it. Submitted
 * and validated reports require the processed-entry deletion authority.
 * Deliberately reuses
 * TimeEntry::canDeleteProcessedEntry() / timeflow.timeentry.deletevalidated
 * rather than introducing a parallel dailyreport-scoped right — consistent
 * with timeflowCanValidate() above already reusing timeflow.timeentry.validate
 * for daily report validation/rejection instead of a report-specific right.
 *
 * @param User $user
 * @param int $ownerId fk_user of the report
 * @param int $status Report status (0=draft, 1=submitted, 2=validated, 9=refused)
 * @return bool
 */
function timeflowCanDeleteDailyReport($user, $ownerId, $status)
{
    if ((int) $status !== 0 && (int) $status !== 9) {
        return TimeEntry::canDeleteProcessedEntry($user);
    }
    return !empty($user->admin) || ($user->hasRight('timeflow', 'timeentry', 'write') && (int) $ownerId === (int) $user->id);
}

/** Return daily free-text reports, scoped either to one user or to the whole team.
 *
 * Employee views always expose only active (non soft-deleted) reports. The
 * manager report-history view may explicitly include deleted reports for
 * audit purposes; all other manager views expose active reports only.
 *
 * Report history is read-only by design: employee history only shows their own
 * reports that have been read/validated, while managers see all read reports from
 * the team. The server-side filter is authoritative; the UI can only display it.
 */
function timeflowFetchDailyReports($input, $allUsers = false, $userId = 0)
{
    global $db, $conf, $user;
    $where = array('r.entity = '.((int) $conf->entity));
    $historyMode = !empty($input['history']) || (!empty($input['mode']) && $input['mode'] === 'history');
    $includeDeleted = $allUsers && $historyMode && !empty($input['include_deleted']);

    if ($allUsers) {
        if (!empty($input['employee_id'])) {
            $where[] = 'r.fk_user = '.((int) $input['employee_id']);
        }
        if (!$includeDeleted) {
            $where[] = 'r.date_delete IS NULL';
        }
        $status = isset($input['status']) ? (string) $input['status'] : '';
        if ($status === 'validated') {
            $where[] = 'r.status = 2';
        } elseif ($status === 'refused') {
            $where[] = 'r.status = 9';
        } elseif ($status === 'all' || $status === '') {
            if ($historyMode) {
                $where[] = 'r.status IN (2, 9)';
            } else {
                $where[] = 'r.status = 1';
            }
        } elseif ($status === 'submitted') {
            $where[] = 'r.status = 1';
        }
    } else {
        $where[] = 'r.fk_user = '.((int) $userId);
        $where[] = 'r.date_delete IS NULL';
        $status = isset($input['status']) ? (string) $input['status'] : '';
        if ($status === 'validated') {
            $where[] = 'r.status = 2';
            $where[] = 'r.date_validated_at IS NOT NULL AND r.date_validated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)';
        } elseif ($status === 'refused') {
            $where[] = 'r.status = 9';
        } elseif ($status === 'all' || $status === '') {
            if ($historyMode) {
                $where[] = 'r.status IN (2, 9)';
            } else {
                $where[] = '(r.status IN (0, 1, 9) OR (r.status = 2 AND r.date_validated_at IS NOT NULL AND r.date_validated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) OR (r.status = 2 AND r.date_validated_at IS NULL))';
            }
        } elseif ($status === 'submitted') {
            $where[] = 'r.status = 1';
        }
    }

    foreach (array('date_from' => '>=', 'date_to' => '<=') as $key => $operator) {
        $date = (string) ($input[$key] ?? '');
        if ($date !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            $where[] = "r.date_report ".$operator." '".$db->escape($date)."'";
        }
    }

    if (!empty($input['manual_only'])) {
        $where[] = "r.date_last_content_edit IS NOT NULL AND r.date_last_content_edit <> r.date_creation";
    }

    $whereSql = implode(' AND ', $where);

    // Same page/per_page -> {rows/reports, pagination:{page,per_page,total,pages}}
    // contract as timeflowGetProcessedHistory() (Rapports > Rapports des tâches),
    // reused here rather than inventing a second shape. Count uses the exact
    // same $whereSql as the page query, so total/pages always reflect the
    // filtered result set (status/date/employee/manual_only), never the
    // unfiltered table.
    $page = max(1, (int) ($input['page'] ?? 1));
    $perPage = min(100, max(1, (int) ($input['per_page'] ?? 20)));
    $offset = ($page - 1) * $perPage;
    $countSql = 'SELECT COUNT(*) AS total FROM '.$db->prefix().'timeflow_daily_report AS r WHERE '.$whereSql;
    $countRes = $db->query($countSql);
    $countObj = $countRes ? $db->fetch_object($countRes) : null;
    $total = $countObj ? (int) $countObj->total : 0;

    // Same idea as timeflowGetProcessedHistory()'s own $statsSql: aggregate
    // counts over the FULL filtered set (same $whereSql, no LIMIT), not just
    // the current page — a "Validé: 3" stat card must count every validated
    // report matching the filters, not just however many landed on this
    // page. Callers that render summary cards (ReportsPage's "reports" tab)
    // use this instead of counting the page's own rows.
    $statsSql = 'SELECT'
        .' SUM(CASE WHEN r.status = 2 THEN 1 ELSE 0 END) AS validated_count,'
        .' SUM(CASE WHEN r.status = 9 THEN 1 ELSE 0 END) AS refused_count,'
        .' SUM(CASE WHEN r.date_last_content_edit IS NOT NULL AND r.date_last_content_edit <> r.date_creation THEN 1 ELSE 0 END) AS manual_count'
        .' FROM '.$db->prefix().'timeflow_daily_report AS r WHERE '.$whereSql;
    $statsRes = $db->query($statsSql);
    $statsObj = $statsRes ? $db->fetch_object($statsRes) : null;

    $sql = 'SELECT r.rowid, r.fk_user, r.date_report, r.content, r.date_creation, r.tms, r.status, r.read_at, r.date_validated_at, r.fk_user_read, r.date_delete, r.date_last_content_edit, r.fk_user_last_content_edit,';
    $sql .= ' u.login, u.firstname, u.lastname, reader.login AS reader_login, reader.firstname AS reader_firstname, reader.lastname AS reader_lastname, editor.login AS editor_login, editor.firstname AS editor_firstname, editor.lastname AS editor_lastname';
    $sql .= ' FROM '.$db->prefix().'timeflow_daily_report AS r';
    $sql .= ' LEFT JOIN '.$db->prefix().'user AS u ON u.rowid = r.fk_user';
    $sql .= ' LEFT JOIN '.$db->prefix().'user AS reader ON reader.rowid = r.fk_user_read';
    $sql .= ' LEFT JOIN '.$db->prefix().'user AS editor ON editor.rowid = r.fk_user_last_content_edit';
    $sql .= ' WHERE '.$whereSql.' ORDER BY r.date_report DESC, r.tms DESC, r.rowid DESC'.$db->plimit($perPage, $offset);
    $resql = $db->query($sql);
    $reports = array();
    while ($resql && ($obj = $db->fetch_object($resql))) {
        $label = trim($obj->firstname.' '.$obj->lastname) ?: ($obj->login ?: 'Utilisateur #'.((int) $obj->fk_user));
        $readerLabel = trim($obj->reader_firstname.' '.$obj->reader_lastname) ?: ($obj->reader_login ?: '');
        $editorLabel = trim($obj->editor_firstname.' '.$obj->editor_lastname) ?: ($obj->editor_login ?: '');
        $reports[] = array(
            'id' => (int) $obj->rowid,
            'fk_user' => (int) $obj->fk_user,
            'user_label' => $label,
            'date_report' => $obj->date_report,
            'content' => $obj->content,
            'date_creation' => $obj->date_creation,
            'date_modification' => $obj->tms,
            'date_delete' => $obj->date_delete,
            'deleted_at' => $obj->date_delete,
            'is_deleted' => !empty($obj->date_delete),
            'date_last_content_edit' => $obj->date_last_content_edit,
            'last_content_edit_by_label' => $editorLabel,
            'status' => (int) $obj->status,
            'read_at' => $obj->read_at,
            'date_validated_at' => $obj->date_validated_at,
            'read_by_label' => $readerLabel,
            'is_read' => !empty($obj->read_at),
            'delete_allowed' => timeflowCanDeleteDailyReport($user, (int) $obj->fk_user, (int) $obj->status),
            'delete_requires_strong_confirmation' => (int) $obj->status !== 0,
        );
    }
    return array(
        'reports' => $reports,
        'pagination' => array('page' => $page, 'per_page' => $perPage, 'total' => $total, 'pages' => max(1, (int) ceil($total / $perPage))),
        'stats' => array(
            'validated_count' => (int) ($statsObj->validated_count ?? 0),
            'refused_count' => (int) ($statsObj->refused_count ?? 0),
            'manual_count' => (int) ($statsObj->manual_count ?? 0),
        ),
    );
}

function timeflowDailyReportEmployees($includeDeleted = false)
{
    global $db, $conf;
    $sql = 'SELECT DISTINCT r.fk_user, u.login, u.firstname, u.lastname FROM '.$db->prefix().'timeflow_daily_report AS r';
    $sql .= ' LEFT JOIN '.$db->prefix().'user AS u ON u.rowid = r.fk_user';
    $sql .= ' WHERE r.entity = '.((int) $conf->entity);
    if (!$includeDeleted) {
        $sql .= ' AND r.date_delete IS NULL';
    }
    $sql .= ' ORDER BY u.lastname, u.firstname, u.login';
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
        $billable = !empty($postData['billable']) ? 1 : (int) GETPOST('billable', 'int');

        // Same admin-only debug gate as timeflowFetchWeeklyTimesheet(): this
        // request-shape trace is not needed on every call in production.
        if (!empty($user->admin) && GETPOST('debug', 'int')) {
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
        }

        // Validation métier : une description (3 caractères minimum) est obligatoire.
        // Le démarrage sans projet est autorisé (cas où aucun projet n'est disponible),
        // mais une tâche référencée nécessite toujours un projet associé.
        $noteTrimmed = trim((string) $note);
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
            $sql = 'SELECT rowid FROM '.$db->prefix().'projet';
            $sql .= ' WHERE rowid = '.((int) $fk_project);
            $sql .= ' AND entity IN ('.getEntity('project').')';
            $resql = $db->query($sql);
            if (!$resql || $db->num_rows($resql) <= 0) {
                timeflowStartTimerRejected('Projet introuvable', array('stage' => 'project_not_found', 'fk_project' => $fk_project, 'db_error' => !$resql ? $db->lasterror() : ''));
            }
            if (timeflowProjectIsClosed($db, $fk_project)) {
                timeflowStartTimerRejected('Ce projet est fermé et n’accepte plus de nouvelles entrées de temps.', array('stage' => 'project_closed', 'fk_project' => $fk_project));
            }
            if (!timeflowCanAccessProject($db, $user, $fk_project)) {
                timeflowStartTimerRejected('Ce projet est restreint à certains utilisateurs', array('stage' => 'project_access_denied', 'fk_project' => $fk_project));
            }
        }

        if ($fk_task > 0) {
            $task = new Task($db);
            if ($task->fetch($fk_task) <= 0) {
                timeflowStartTimerRejected('Tâche introuvable', array('stage' => 'task_not_found', 'fk_task' => $fk_task));
            }
            // fk_project IS the native llx_projet id directly now — no more
            // indirection through the never-populated fk_dolibarr_project.
            if ($fk_project > 0 && (int) $task->fk_project !== (int) $fk_project) {
                timeflowStartTimerRejected('Tâche introuvable ou rattachée à un autre projet', array('stage' => 'task_project_mismatch', 'fk_task' => $fk_task, 'fk_project' => $fk_project));
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
        if ($fk_project > 0 && !timeflowCanAccessProject($db, $user, $fk_project)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Ce projet est restreint à certains utilisateurs'), 403);
        }
        if ($fk_project > 0 && timeflowProjectIsClosed($db, $fk_project)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Ce projet est fermé et n’accepte plus de nouvelles entrées de temps.'), 400);
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
            $data = timeflowExportTimeEntry($timeentry);
            // A timer left running past the max-duration cap is split into one
            // entry per calendar day crossed (see TimeEntry::stopTimer()); the
            // frontend needs every extra segment to show them immediately
            // instead of waiting for the next full reload.
            if (!empty($timeentry->splitSegments)) {
                $data['split_segments'] = array_map('timeflowExportTimeEntry', $timeentry->splitSegments);
            }
            timeflowJsonResponse(array('status' => 'success', 'data' => $data));
        } else {
            http_response_code(400);
            timeflowJsonResponse(array('status' => 'error', 'message' => $timeentry->error ?: 'Erreur à l\'arrêt'), 400);
        }
        break;

    case 'restartTimer':
        // "Resume" never reopens/rewrites the previous entry — it creates a
        // brand new one (same project/task/note/tags/billable), exactly like
        // startTimer(), so date_start/date_end/duration stay coherent on
        // every row, always. The old entry is only read here, never written.
        $id = !empty($postData['id']) ? (int) $postData['id'] : (int) GETPOST('id', 'int');
        if ($id <= 0) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Identifiant d’entrée invalide'), 400);
        }
        if ($timeentry->fetch($id) <= 0) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Entrée introuvable'), 404);
        }
        if ((int) $timeentry->fk_user !== (int) $user->id) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
        }

        $fk_project = (int) $timeentry->fk_project;
        $fk_task = (int) $timeentry->fk_task;
        $note = (string) $timeentry->note;
        $tags = (string) $timeentry->tags;
        $billable = (int) $timeentry->billable;

        // Same checks as startTimer(): the project may since have been
        // deleted or had its access restricted since the previous entry
        // was created.
        if ($fk_project > 0) {
            $sql = 'SELECT rowid FROM '.$db->prefix().'projet';
            $sql .= ' WHERE rowid = '.$fk_project;
            $sql .= ' AND entity IN ('.getEntity('project').')';
            $resql = $db->query($sql);
            if (!$resql || $db->num_rows($resql) <= 0) {
                timeflowJsonResponse(array('status' => 'error', 'message' => 'Projet introuvable'), 400);
            }
            if (!timeflowCanAccessProject($db, $user, $fk_project)) {
                timeflowJsonResponse(array('status' => 'error', 'message' => 'Ce projet est restreint à certains utilisateurs'), 403);
            }
        }

        $freshEntry = new TimeEntry($db);
        $newId = $freshEntry->startTimer($user->id, $fk_project, $fk_task, $note, $user, $tags, $billable);
        if ($newId > 0) {
            timeflowStoreTaskText($db, $user, $newId, $note, $note);
            $freshEntry->fetch($newId);
            timeflowJsonResponse(array('status' => 'success', 'data' => timeflowExportTimeEntry($freshEntry)));
        }
        timeflowJsonResponse(array('status' => 'error', 'message' => $freshEntry->error ?: 'Erreur à la reprise'), 400);
        break;

    case 'deleteTimeEntry':
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
        timeflowJsonResponse(array('status' => 'success', 'data' => timeflowFetchProjects($db, $user)));
        break;

    case 'getTimeFlowProjects':
        $projectFilters = array(
            'client_id' => !empty($postData['client_id']) ? (int) $postData['client_id'] : (int) GETPOST('client_id', 'int'),
            'date_from' => $postData['date_from'] ?? GETPOST('date_from', 'alphanohtml'),
            'date_to' => $postData['date_to'] ?? GETPOST('date_to', 'alphanohtml'),
            'search' => trim((string) ($postData['search'] ?? GETPOST('search', 'alphanohtml'))),
        );
        $projectsPage = !empty($postData['page']) ? (int) $postData['page'] : (int) GETPOST('page', 'int');
        $projectsPage = $projectsPage > 0 ? $projectsPage : 1;
        $projectsPerPage = !empty($postData['per_page']) ? (int) $postData['per_page'] : (int) GETPOST('per_page', 'int');
        $projectsPerPage = $projectsPerPage > 0 ? $projectsPerPage : 20;
        $timeflowDebugProjects = timeflowFetchTimeFlowProjects($db, $user, $projectFilters, $projectsPage, $projectsPerPage);
        timeflowJsonResponse(array('status' => 'success', 'data' => $timeflowDebugProjects));
        break;

    // Rapports > Utilisateurs: manager-only (same timeflowCanReadAllTimeEntries()
    // gate as the "read all" scope everywhere else) — a normal employee has
    // no business use for a company-wide contact directory here, and the
    // tab button is hidden client-side for them too (ReportsPage.jsx).
    case 'getTimeFlowUsers':
        if (!timeflowCanReadAllTimeEntries($user)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
        }
        $usersPage = !empty($postData['page']) ? (int) $postData['page'] : (int) GETPOST('page', 'int');
        $usersPage = $usersPage > 0 ? $usersPage : 1;
        $usersPerPage = !empty($postData['per_page']) ? (int) $postData['per_page'] : (int) GETPOST('per_page', 'int');
        $usersPerPage = $usersPerPage > 0 ? $usersPerPage : 20;
        timeflowJsonResponse(array('status' => 'success', 'data' => timeflowFetchTimeFlowUsers($db, $usersPage, $usersPerPage)));
        break;

    // Rapports' global "Export" button (above the tab bar, not per sub-page):
    // one row per time entry, in the same column shape TimeImportClockify
    // expects, so the file round-trips through previewClockifyImport() as-is.
    case 'exportGlobalCsv':
        timeflowJsonResponse(array('status' => 'success', 'data' => timeflowBuildGlobalCsvRows($db, $user)));
        break;

    case 'listActiveThirdParties':
        if (!$user->admin && !$user->hasRight('timeflow', 'timeentry', 'write')) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
        }
        timeflowJsonResponse(array('status' => 'success', 'data' => timeflowFetchActiveThirdParties($db)));
        break;

    case 'getTasks':
        $projectId = !empty($postData['projectId']) ? (int) $postData['projectId'] : (int) GETPOST('projectId', 'int');
        $limit = !empty($postData['limit']) ? (int) $postData['limit'] : (int) GETPOST('limit', 'int');
        timeflowJsonResponse(array('status' => 'success', 'data' => timeflowFetchTasks($db, $projectId, $limit)));
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
        // A change anywhere in scope re-fetches the page the caller is
        // currently looking at (not necessarily page 1), so a background
        // poll never silently swaps what's on screen for a different page.
        $updatePage = !empty($postData['page']) ? (int) $postData['page'] : (int) GETPOST('page', 'int');
        $updatePage = $updatePage > 0 ? $updatePage : 1;
        $updatePerPage = !empty($postData['per_page']) ? (int) $postData['per_page'] : (int) GETPOST('per_page', 'int');
        $updatePerPage = $updatePerPage > 0 ? $updatePerPage : 20;
        // Only meaningful for scope='entries' (see 'billable_only' below) —
        // the caller (Suivi du temps) simply never sends it for scope=
        // 'validation', so this stays false there regardless.
        $updateBillableOnly = !empty($postData['billable_only']) || (bool) GETPOST('billable_only', 'int');
        $updateFilters = array(
            'date_from' => (string) ($postData['date_from'] ?? GETPOST('date_from', 'alphanohtml')),
            'date_to' => (string) ($postData['date_to'] ?? GETPOST('date_to', 'alphanohtml')),
            'employee_id' => (int) ($postData['employee_id'] ?? GETPOST('employee_id', 'int')),
        );
        $updateResult = $changed ? timeflowFetchVisibleTimeEntries($timeentry, $user, $scope, $updatePage, $updatePerPage, $updateBillableOnly, $updateFilters) : null;
        timeflowJsonResponse(array('status' => 'success', 'data' => array(
            'marker' => $marker,
            'changed' => $changed,
            'entries' => $changed ? $updateResult['entries'] : array(),
        )));
        break;

    case 'getTimeEntries':
        $page = !empty($postData['page']) ? (int) $postData['page'] : (int) GETPOST('page', 'int');
        $page = $page > 0 ? $page : 1;
        $perPage = !empty($postData['per_page']) ? (int) $postData['per_page'] : (int) GETPOST('per_page', 'int');
        $perPage = $perPage > 0 ? $perPage : 20;
        // "Facturable uniquement" on Suivi du temps — deliberately NOT
        // offered on getValidationEntries below: the validation queue is a
        // review-everything-pending worklist, not a browsable report, and
        // narrowing it by billable risks a manager missing an entry that
        // still needs a decision. Same reasoning already applies to why
        // ReportsPage's "reports" tab (daily reports) never got this filter.
        $billableOnly = !empty($postData['billable_only']) || (bool) GETPOST('billable_only', 'int');
        timeflowJsonResponse(array('status' => 'success', 'data' => timeflowFetchVisibleTimeEntries($timeentry, $user, 'entries', $page, $perPage, $billableOnly)));
        break;

    // Data source for the dedicated validation view.  Unlike the normal timer
    // history, it is inaccessible without the TimeFlow "valider" permission.
    case 'getValidationEntries':
        if (!timeflowCanValidate($user)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
        }
        $page = !empty($postData['page']) ? (int) $postData['page'] : (int) GETPOST('page', 'int');
        $page = $page > 0 ? $page : 1;
        $perPage = !empty($postData['per_page']) ? (int) $postData['per_page'] : (int) GETPOST('per_page', 'int');
        $perPage = $perPage > 0 ? $perPage : 20;
        $filters = array(
            'date_from' => (string) ($postData['date_from'] ?? GETPOST('date_from', 'alphanohtml')),
            'date_to' => (string) ($postData['date_to'] ?? GETPOST('date_to', 'alphanohtml')),
            'employee_id' => (int) ($postData['employee_id'] ?? GETPOST('employee_id', 'int')),
        );
        timeflowJsonResponse(array('status' => 'success', 'data' => timeflowFetchVisibleTimeEntries($timeentry, $user, 'validation', $page, $perPage, false, $filters)));
        break;

    case 'getProcessedHistory':
        // $postData is always an array (parsed JSON body, defaulting to
        // empty — see top of file), so it is used directly: no fallback to
        // the raw $_REQUEST superglobal, which would bypass GETPOST-level
        // validation entirely.
        $input = $postData;
        timeflowJsonResponse(array('status' => 'success', 'data' => timeflowGetProcessedHistory($input, $user)));
        break;

    case 'exportProcessedHistory':
        $input = $postData; $input['page'] = 1; $input['per_page'] = 10000; $input['export'] = true;
        timeflowJsonResponse(array('status' => 'success', 'data' => timeflowGetProcessedHistory($input, $user)));
        break;

    case 'previewClockifyImport':
        if (!$user->admin && !$user->hasRight('timeflow', 'timeentry', 'write')) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
        }

        if (empty($_FILES['csv_file']['tmp_name'])) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Fichier CSV manquant.'), 400);
        }

        try {
            $clockifyImport = new TimeImportClockify($db);
            $summary = $clockifyImport->previewFromUploadedFile($_FILES['csv_file']);
            timeflowJsonResponse(array('status' => 'success', 'data' => $summary));
        } catch (InvalidArgumentException $e) {
            timeflowJsonResponse(array('status' => 'error', 'message' => $e->getMessage()), 400);
        } catch (RuntimeException $e) {
            timeflowJsonResponse(array('status' => 'error', 'message' => $e->getMessage()), 400);
        } catch (Exception $e) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Erreur lors du prévisualisation du CSV.'), 500);
        }
        break;

    case 'executeClockifyImport':
        // Same right as the rest of the import flow — this is the step
        // that actually writes data, so no looser check than preview/resolve.
        if (!$user->admin && !$user->hasRight('timeflow', 'timeentry', 'write')) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
        }

        if (empty($_FILES['csv_file']['tmp_name'])) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Fichier CSV manquant.'), 400);
        }

        try {
            $clockifyImport = new TimeImportClockify($db);
            $report = $clockifyImport->executeImportFromUploadedFile($_FILES['csv_file'], $user);
            timeflowJsonResponse(array('status' => 'success', 'data' => $report));
        } catch (InvalidArgumentException $e) {
            timeflowJsonResponse(array('status' => 'error', 'message' => $e->getMessage()), 400);
        } catch (RuntimeException $e) {
            timeflowJsonResponse(array('status' => 'error', 'message' => $e->getMessage()), 400);
        } catch (Exception $e) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Erreur lors de l’exécution de l’import.'), 500);
        }
        break;

    case 'listActiveUsers':
        if (!$user->admin && !$user->hasRight('timeflow', 'timeentry', 'write')) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
        }
        timeflowJsonResponse(array('status' => 'success', 'data' => timeflowFetchActiveUsers($db)));
        break;

    case 'listUserGroups':
        if (!$user->admin && !$user->hasRight('timeflow', 'timeentry', 'write')) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
        }
        timeflowJsonResponse(array('status' => 'success', 'data' => timeflowFetchUserGroups($db)));
        break;

    case 'resolveClockifyMapping':
        if (!$user->admin && !$user->hasRight('timeflow', 'timeentry', 'write')) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
        }

        $decisions = $postData['decisions'] ?? null;
        if (!is_array($decisions)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Liste de décisions manquante ou invalide.'), 400);
        }

        try {
            $clockifyImport = new TimeImportClockify($db);
            $updatedMapping = $clockifyImport->resolveMappingDecisions($decisions);
            timeflowJsonResponse(array('status' => 'success', 'data' => $updatedMapping));
        } catch (InvalidArgumentException $e) {
            timeflowJsonResponse(array('status' => 'error', 'message' => $e->getMessage()), 400);
        } catch (RuntimeException $e) {
            timeflowJsonResponse(array('status' => 'error', 'message' => $e->getMessage()), 400);
        } catch (Exception $e) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Erreur lors de la résolution du mapping.'), 500);
        }
        break;

    case 'saveDailyReport':
        $dateReport = trim((string) ($postData['date_report'] ?? GETPOST('date_report', 'alphanohtml')));
        $content = trim((string) ($postData['content'] ?? GETPOST('content', 'restricthtml')));
        $requestedStatus = isset($postData['status']) ? (int) $postData['status'] : (int) GETPOST('status', 'int');
        $status = in_array($requestedStatus, array(0, 1), true) ? $requestedStatus : 1;
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateReport)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'La date du rapport est invalide.'), 400);
        }
        if ($content === '') {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Le contenu du rapport est obligatoire.'), 400);
        }
        $entity = (int) $conf->entity;
        $now = dol_now();
        $sql = 'INSERT INTO '.$db->prefix().'timeflow_daily_report';
        $sql .= ' (entity, fk_user, date_report, content, status, date_creation, fk_user_creat, date_last_content_edit, fk_user_last_content_edit) VALUES (';
        $sql .= $entity.','.((int) $user->id).", '".$db->escape($dateReport)."', '".$db->escape($content)."', ".((int) $status).", '".$db->idate($now)."', ".((int) $user->id).", '".$db->idate($now)."', ".((int) $user->id).')';
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
            'status' => $status,
            'date_creation' => $db->idate($now),
            'date_modification' => $db->idate($now),
            'date_last_content_edit' => $db->idate($now),
            'last_content_edit_by_label' => timeflowResolveUserLabel((int) $user->id),
            'read_at' => null,
            'read_by_label' => '',
            'is_read' => false,
            'is_deleted' => false,
        );
        timeflowJsonResponse(array('status' => 'success', 'data' => $saved));
        break;

    case 'updateDailyReport':
        $id = !empty($postData['id']) ? (int) $postData['id'] : 0;
        $content = trim((string) ($postData['content'] ?? GETPOST('content', 'restricthtml')));
        $requestedStatus = array_key_exists('status', $postData) ? (int) $postData['status'] : (int) GETPOST('status', 'int');
        $status = $requestedStatus !== 0 && $requestedStatus !== 1 && $requestedStatus !== 2 && $requestedStatus !== 9 ? null : $requestedStatus;
        if ($id <= 0) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Identifiant du rapport invalide.'), 400);
        }
        if ($content === '') {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Le contenu du rapport est obligatoire.'), 400);
        }
        // Ensure the report exists and belongs to the user (or allow admins/validators)
        $sql = 'SELECT rowid, fk_user, date_report, date_delete, status FROM '.$db->prefix().'timeflow_daily_report WHERE rowid = '.((int) $id).' AND entity = '.((int) $conf->entity).' LIMIT 1';
        $res = $db->query($sql);
        if (!$res || $db->num_rows($res) <= 0) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Rapport introuvable.'), 404);
        }
        $obj = $db->fetch_object($res);
        if (!empty($obj->date_delete)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Ce rapport a été supprimé et ne peut plus être modifié.'), 410);
        }
        if ((int) $obj->status === 2) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Un rapport validé ne peut plus être modifié par l’employé.'), 403);
        }
        if ((int) $obj->fk_user !== (int) $user->id && !timeflowCanValidate($user) && !$user->admin) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé.'), 403);
        }
        $now = dol_now();
        $sql = 'UPDATE '.$db->prefix().'timeflow_daily_report';
        $sql .= ' SET content = "'.$db->escape($content).'", fk_user_modif = '.((int) $user->id).', tms = "'.$db->idate($now).'", date_last_content_edit = "'.$db->idate($now).'", fk_user_last_content_edit = '.((int) $user->id);
        if ($status !== null) {
            $sql .= ', status = '.((int) $status);
        }
        $sql .= ' WHERE rowid = '.((int) $id).' AND entity = '.((int) $conf->entity).' AND date_delete IS NULL';
        if (!$db->query($sql)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Impossible de mettre à jour le rapport : '.$db->lasterror()), 500);
        }
        $saved = array(
            'id' => (int) $obj->rowid,
            'fk_user' => (int) $obj->fk_user,
            'user_label' => timeflowResolveUserLabel((int) $obj->fk_user),
            'date_report' => $obj->date_report,
            'content' => $content,
            'status' => $status !== null ? $status : (int) $obj->status,
            'date_creation' => null,
            'date_modification' => $db->idate($now),
            'date_last_content_edit' => $db->idate($now),
            'last_content_edit_by_label' => timeflowResolveUserLabel((int) $user->id),
            'read_at' => null,
            'read_by_label' => '',
            'is_read' => false,
            'is_deleted' => false,
        );
        timeflowJsonResponse(array('status' => 'success', 'data' => $saved));
        break;

    case 'deleteDailyReport':
        $id = !empty($postData['id']) ? (int) $postData['id'] : 0;
        if ($id <= 0) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Identifiant du rapport invalide.'), 400);
        }
        $sql = 'SELECT rowid, fk_user, status, date_delete, date_validated_at, date_report FROM '.$db->prefix().'timeflow_daily_report WHERE rowid = '.$id.' AND entity = '.((int) $conf->entity).' LIMIT 1';
        $res = $db->query($sql);
        if (!$res || $db->num_rows($res) <= 0) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Rapport introuvable.'), 404);
        }
        $obj = $db->fetch_object($res);
        $reportStatus = (int) $obj->status;

        if (!timeflowCanDeleteDailyReport($user, (int) $obj->fk_user, $reportStatus)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé.'), 403);
        }

        if (!empty($obj->date_delete)) {
            timeflowJsonResponse(array('status' => 'success', 'data' => array('id' => $id, 'is_deleted' => true)), 200);
        }

        // Daily reports are never physically deleted. date_delete preserves
        // the audit trail while hiding the report from active lists.
        $now = dol_now();
        $sql = 'UPDATE '.$db->prefix().'timeflow_daily_report';
        $sql .= ' SET date_delete = "'.$db->idate($now).'", fk_user_delete = '.((int) $user->id);
        $sql .= ' WHERE rowid = '.$id.' AND entity = '.((int) $conf->entity).' AND date_delete IS NULL';
        if (!$db->query($sql)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Impossible de supprimer le rapport : '.$db->lasterror()), 500);
        }
        timeflowJsonResponse(array('status' => 'success', 'data' => array('id' => $id, 'is_deleted' => true)));
        break;

    case 'getMyDailyReports':
        // $postData is always an array — see the getProcessedHistory case above.
        $input = $postData;
        timeflowJsonResponse(array('status' => 'success', 'data' => timeflowFetchDailyReports($input, false, (int) $user->id)));
        break;

    case 'getDailyReports':
        $input = $postData;
        $canReadAll = timeflowCanValidate($user) || timeflowCanReadAllTimeEntries($user);
        $result = timeflowFetchDailyReports($input, $canReadAll, $canReadAll ? 0 : (int) $user->id);
        $includeDeleted = $canReadAll && !empty($input['history']) && !empty($input['include_deleted']);
        $employees = $canReadAll ? timeflowDailyReportEmployees($includeDeleted) : array(array(
            'id' => (int) $user->id,
            'label' => timeflowResolveUserLabel((int) $user->id),
        ));
        timeflowJsonResponse(array('status' => 'success', 'data' => array(
            'reports' => $result['reports'],
            'employees' => $employees,
            'pagination' => $result['pagination'],
            'stats' => $result['stats'],
        )));
        break;

    case 'validateDailyReport':
        if (!timeflowCanValidate($user)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
        }
        $id = !empty($postData['id']) ? (int) $postData['id'] : (int) GETPOST('id', 'int');
        $now = $db->idate(dol_now());
        $sql = 'UPDATE '.$db->prefix().'timeflow_daily_report SET status = 2, read_at = \''.$now.'\', date_validated_at = \''.$now.'\', fk_user_read = '.((int) $user->id).' WHERE rowid = '.$id.' AND entity = '.((int) $conf->entity).' AND date_delete IS NULL';
        if (!$db->query($sql)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Impossible de valider le rapport.'), 500);
        }
        timeflowJsonResponse(array('status' => 'success', 'data' => array('id' => $id, 'status' => 2, 'date_validated_at' => $now)));
        break;

    case 'rejectDailyReport':
        if (!timeflowCanValidate($user)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
        }
        $id = !empty($postData['id']) ? (int) $postData['id'] : (int) GETPOST('id', 'int');
        $now = $db->idate(dol_now());
        $sql = 'UPDATE '.$db->prefix().'timeflow_daily_report SET status = 9, read_at = \''.$now.'\', date_validated_at = \''.$now.'\', fk_user_read = '.((int) $user->id).' WHERE rowid = '.$id.' AND entity = '.((int) $conf->entity).' AND date_delete IS NULL';
        if (!$db->query($sql)) {
            timeflowJsonResponse(array('status' => 'error', 'message' => 'Impossible de rejeter le rapport.'), 500);
        }
        timeflowJsonResponse(array('status' => 'success', 'data' => array('id' => $id, 'status' => 9, 'date_validated_at' => $now)));
        break;

    case 'getWeeklyTimesheet':
        $weekStart = $postData['weekStart'] ?? GETPOST('weekStart', 'alphanohtml');
        $timesheet = timeflowFetchWeeklyTimesheet($timeentry, $user, $weekStart);
        // Same admin-only debug gate as timeflowFetchWeeklyTimesheet()'s own
        // instrumentation: not needed on every call in production.
        if (!empty($user->admin) && GETPOST('debug', 'int')) {
            dol_syslog('timeflow.getWeeklyTimesheet user_id='.(int)$user->id.' can_readall='.(int)timeflowCanReadAllTimeEntries($user).' weekStart='.(string)$weekStart, LOG_DEBUG);
        }
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

        // Opt-in, not the default: a draft can still change or be deleted, and
        // a refused entry means a manager explicitly did not recognize that
        // time as legitimate — neither is reliable enough for stats. Kept
        // opt-in (rather than baked into every getSummaryReports caller) so
        // this stays specific to the Dashboard's "confirmed work only" need;
        // see case 'getProcessedHistory'/timeflowProcessedHistoryWhere for
        // the separate "validated OR refused" (fk_user_valid IS NOT NULL)
        // notion used there, which is intentionally broader than this one.
        $onlyValidated = !empty($postData['only_validated']) || GETPOST('only_validated', 'int');

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
        if ($onlyValidated) {
            $filters[] = '(t.status:=:'.TimeEntry::STATUS_VALIDATED.')';
        }
        $filter = implode(' AND ', $filters);
        // Same admin-only debug gate as timeflowFetchWeeklyTimesheet()'s own
        // instrumentation: not needed on every call in production.
        if (!empty($user->admin) && GETPOST('debug', 'int')) {
            dol_syslog('timeflow.getSummaryReports user_id='.(int)$user->id.' can_readall='.(int)timeflowCanReadAllTimeEntries($user).' dateFrom='.(string)$dateFrom.' dateTo='.(string)$dateTo, LOG_DEBUG);
        }
        $result = $timeentry->fetchAll('DESC', 't.date_start', $limit, 0, $filter);
        $rows = array();
        if (is_array($result)) {
            foreach ($result as $obj) {
                $rows[] = timeflowExportTimeEntry($obj);
            }
        }
        $summaryData = timeflowBuildSummary($rows, $db);
        // Lets the frontend warn when the period holds more rows than $limit
        // fetched above, instead of silently charting an incomplete sample.
        $summaryData['entries_returned'] = count($rows);
        $summaryData['entries_total_in_period'] = timeflowCountEntriesMatchingFilter($db, $filter);
        timeflowJsonResponse(array('status' => 'success', 'data' => $summaryData));
        break;

    case 'validateEntry':
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

    case 'rejectEntry':
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
        // Same partial-update rule as dates: omitted stays exactly as stored.
        // Reuses this action rather than a separate endpoint deliberately —
        // the same ownership check, the same timeflowEmployeeManualEditPolicy()
        // status/day gate, and the same mandatory audit reason already apply
        // to every correction made here, and billable is already one of
        // TimeEntry::update()'s audited fields (see $fieldsToAudit), so no
        // further backend plumbing is needed to get it into the modification
        // history for free.
        $hasNewBillable = array_key_exists('billable', $postData);
        $newBillable = $hasNewBillable ? (!empty($postData['billable']) ? 1 : 0) : (int) $timeentry->billable;
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
        // See TimeEntry::checkBackwardOnlyCorrection() for the full rationale:
        // a correction may only move date_start/date_end earlier, never later.
        $backwardOnlyError = TimeEntry::checkBackwardOnlyCorrection($oldStart, $oldEnd, $newStart, $newEnd);
        if ($backwardOnlyError !== '') {
            timeflowCorrectionTrace('response_date_moved_forward', array('rowid' => (int) $timeentry->id, 'http_status' => 400));
            timeflowJsonResponse(array('status' => 'error', 'message' => $backwardOnlyError), 400);
        }
        // A correction crossing into a different calendar day is allowed (e.g.
        // start yesterday evening, end corrected to that same evening) as long
        // as it stays under the same cap enforced everywhere else dates are
        // set (createManualEntry(), stopTimer()) — see TimeEntry::exceedsMaxDuration().
        if ($newEnd > 0 && TimeEntry::exceedsMaxDuration($newStart, $newEnd)) {
            timeflowCorrectionTrace('response_max_duration_exceeded', array('rowid' => (int) $timeentry->id, 'http_status' => 400));
            timeflowJsonResponse(array('status' => 'error', 'message' => TimeEntry::getMaxDurationErrorMessage()), 400);
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
        $timeentry->billable = $newBillable;
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

/**
 * @param array $filters Optional: client_id (fk_soc), date_from/date_to
 *   (on p.date_creation, 'YYYY-MM-DD'), search (LIKE on title/ref). All
 *   applied server-side in the single project query below — the per-project
 *   assigned-users lookup further down stays a single batched query
 *   regardless of these filters, so filtering never turns this into N+1.
 */
/**
 * Lists native Dolibarr projects for TimeFlow's "Gérer > Projets" page.
 *
 * This intentionally lists EVERY project in llx_projet, not just ones
 * created through TimeFlow — that is the whole point of the TimeFlow ->
 * native project migration (see the audit "Unification des projets
 * TimeFlow / Dolibarr natif"): one project list, visible and consistent
 * on both sides, regardless of which UI created it.
 */
function timeflowFetchTimeFlowProjects($db, $user, $filters = array(), $page = 1, $perPage = 20)
{
    $projects = array();

    // Unlike timeflowFetchProjects() (the ACTIVE picker used to start a timer
    // or assign a project — closed projects must disappear from there, see
    // that function's comment), this is a read-only consultation view
    // ("Rapports > Projets"). A closed project must stay visible here with
    // its real status badge, exactly like it stays visible everywhere else
    // in native Dolibarr after Project::setClose() — no status filter here.
    $whereSql = 'p.entity IN ('.getEntity('project').')';

    $clientId = (int) ($filters['client_id'] ?? 0);
    if ($clientId > 0) {
        $whereSql .= ' AND p.fk_soc = '.$clientId;
    }
    $dateFrom = timeflowParseIncomingDate($filters['date_from'] ?? '');
    if ($dateFrom !== false) {
        $whereSql .= " AND p.datec >= '".$db->idate($dateFrom)."'";
    }
    $dateTo = timeflowParseIncomingDate($filters['date_to'] ?? '');
    if ($dateTo !== false) {
        $whereSql .= " AND p.datec <= '".$db->idate($dateTo + 86399)."'";
    }
    $search = trim((string) ($filters['search'] ?? ''));
    if ($search !== '') {
        $searchLike = "'%".$db->escape($search)."%'";
        $whereSql .= ' AND (p.title LIKE '.$searchLike.' OR p.ref LIKE '.$searchLike.')';
    }
    // Same membership restriction as timeflowFetchProjects() (the Timer's
    // active-project picker): a non-manager (no timeflowCanReadAllTimeEntries)
    // only sees projects with no PROJECTCONTRIBUTOR assignment at all (open
    // to everyone) or where they are themselves assigned. A manager/admin
    // still sees every project, filters unchanged.
    $whereSql .= timeflowProjectMembershipRestrictionSql($db, $user, 'p');

    // Same page/per_page -> {rows, pagination:{page,per_page,total,pages}}
    // contract as timeflowGetProcessedHistory()/timeflowFetchDailyReports().
    // Count uses the exact same FROM+WHERE (the source filter needs the ef
    // join too) as the page query, so total/pages always reflect the
    // filtered result set, never the unfiltered table.
    $page = max(1, (int) $page);
    $perPage = min(100, max(1, (int) $perPage));
    $offset = ($page - 1) * $perPage;
    $countSql = 'SELECT COUNT(*) AS nb FROM '.$db->prefix().'projet AS p';
    $countSql .= ' LEFT JOIN '.$db->prefix().'projet_extrafields AS ef ON ef.fk_object = p.rowid';
    $countSql .= ' WHERE '.$whereSql;
    $total = 0;
    $countRes = $db->query($countSql);
    if ($countRes) {
        $countObj = $db->fetch_object($countRes);
        $total = $countObj ? (int) $countObj->nb : 0;
        $db->free($countRes);
    }

    $sql = 'SELECT p.rowid, p.ref, p.title, p.description, p.fk_soc, s.nom as soc_name, p.fk_statut, p.fk_opp_status, cls.code as opp_status_code, p.datec,';
    $sql .= ' ef.timeflow_import_key,';
    $sql .= ' (SELECT COUNT(*) FROM '.$db->prefix().'timeflow_timeentry AS t';
    $sql .= '  WHERE t.fk_project = p.rowid AND t.date_delete IS NULL) AS entry_count';
    $sql .= ' FROM '.$db->prefix().'projet AS p';
    $sql .= ' LEFT JOIN '.$db->prefix().'societe AS s ON s.rowid = p.fk_soc';
    $sql .= ' LEFT JOIN '.$db->prefix().'projet_extrafields AS ef ON ef.fk_object = p.rowid';
    $sql .= ' LEFT JOIN '.$db->prefix().'c_lead_status AS cls ON cls.rowid = p.fk_opp_status';
    $sql .= ' WHERE '.$whereSql;

    // Explicit CASE, not a bare "ORDER BY fk_statut": the numeric codes
    // (0=Brouillon, 1=Ouvert, 2=Clôturé — see ProjectStatusBadge.jsx's
    // PROJECT_STATUS map, the source of truth for what the ÉTAT column
    // actually displays) do NOT sort into the wanted Ouvert/Brouillon/Clôturé
    // order on their own. datec DESC breaks ties within a status group (most
    // recent first); rowid DESC is the last-resort tiebreaker for a dead-heat
    // same-status-same-datec pair.
    $sql .= ' ORDER BY CASE p.fk_statut WHEN 1 THEN 0 WHEN 0 THEN 1 WHEN 2 THEN 2 ELSE 3 END ASC, p.datec DESC, p.rowid DESC';
    $sql .= $db->plimit($perPage, $offset);

    // Assigned users per project, keyed by project id — a separate query
    // (rather than GROUP_CONCAT) to avoid MySQL's group_concat length limit
    // and keep string parsing out of it. No PROJECTCONTRIBUTOR contact at
    // all => every project just gets an empty assignment list
    // (unrestricted), consistent with timeflowCanAccessProject().
    $assignmentsByProject = array();
    $assignSql = 'SELECT ec.element_id AS fk_project, ec.fk_socpeople AS fk_user';
    $assignSql .= ' FROM '.$db->prefix().'element_contact AS ec';
    $assignSql .= ' INNER JOIN '.$db->prefix().'c_type_contact AS tc ON tc.rowid = ec.fk_c_type_contact';
    $assignSql .= " WHERE tc.element = 'project' AND tc.source = 'internal' AND tc.code = 'PROJECTCONTRIBUTOR'";
    $assignSql .= ' AND ec.statut = 4';
    $assignResql = $db->query($assignSql);
    if ($assignResql) {
        while ($assignObj = $db->fetch_object($assignResql)) {
            $assignmentsByProject[(int) $assignObj->fk_project][] = (int) $assignObj->fk_user;
        }
    }

    $resql = $db->query($sql);
    if ($resql) {
        while ($obj = $db->fetch_object($resql)) {
            $projectId = (int) $obj->rowid;
            $assignedUserIds = $assignmentsByProject[$projectId] ?? array();

            // Native project status (fk_statut) and opportunity status
            // (fk_opp_status). Deliberately NOT rendered as native Dolibarr
            // badge HTML here (LibStatut()/dolGetStatus() colors come from the
            // active theme's configurable status colors, which cannot express
            // "Closed = red" — that is not a native Dolibarr color choice and
            // was explicitly requested regardless). Instead we send the plain
            // status code + a translated label, and the frontend
            // (ProjectStatusBadge / OpportunityStatusBadge) owns the exact
            // color palette, consistent with every other status badge already
            // rendered client-side in this app (and with dark mode, which
            // native theme HTML would not respect).
            $fk_statut = isset($obj->fk_statut) ? (int) $obj->fk_statut : 0;
            $etatLabels = array(
                Project::STATUS_DRAFT => 'Brouillon',
                Project::STATUS_VALIDATED => 'Ouvert',
                Project::STATUS_CLOSED => 'Clôturé',
            );
            $etat_label = $etatLabels[$fk_statut] ?? (string) $fk_statut;

            $fk_opp_status = isset($obj->fk_opp_status) ? (int) $obj->fk_opp_status : 0;
            $opp_status_code = !empty($obj->opp_status_code) ? (string) $obj->opp_status_code : '';
            $oppLabels = array(
                'PROSP' => 'Prospection',
                'QUAL'  => 'Qualification',
                'PROPO' => 'Proposition',
                'NEGO'  => 'Négociation',
                'LOST'  => 'Perdu',
                'WON'   => 'Gagné',
                'PENDING' => 'En attente',
            );
            $opp_label = $opp_status_code !== '' ? ($oppLabels[$opp_status_code] ?? $opp_status_code) : '';

            $projects[] = array(
                'id' => $projectId,
                'rowid' => $projectId,
                'title' => $obj->title,
                'ref' => !empty($obj->ref) ? $obj->ref : '',
                'description' => !empty($obj->description) ? $obj->description : '',
                'fk_soc' => (int) $obj->fk_soc,
                'client' => !empty($obj->soc_name) ? $obj->soc_name : '',
                'entry_count' => (int) $obj->entry_count,
                'assigned_user_ids' => $assignedUserIds,
                'assigned_count' => count($assignedUserIds),
                'fk_statut' => $fk_statut,
                'etat_label' => $etat_label,
                'fk_opp_status' => $fk_opp_status,
                'opp_status_code' => $opp_status_code,
                'opp_status_label' => $opp_label,
            );
        }
    }

    return array(
        'rows' => $projects,
        'pagination' => array('page' => $page, 'per_page' => $perPage, 'total' => $total, 'pages' => max(1, (int) ceil($total / $perPage))),
    );
}

function timeflowFetchActiveThirdParties($db)
{
    $thirdParties = array();
    $sql = 'SELECT rowid, nom FROM '.$db->prefix().'societe';
    $sql .= ' WHERE entity IN ('.getEntity('societe').')';
    $sql .= ' AND status = 1';
    $sql .= ' AND client <> 0';
    $sql .= ' ORDER BY nom ASC';

    $resql = $db->query($sql);
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

function timeflowResolveOrCreateProjectByLabel($db, $user, $projectLabel, $fkSoc = 0)
{
    $label = trim((string) $projectLabel);
    if ($label === '') {
        return 0;
    }

    $sql = 'SELECT rowid';
    $sql .= ' FROM '.$db->prefix().'projet';
    $sql .= ' WHERE entity IN ('.getEntity('project').')';
    $sql .= " AND title = '".$db->escape($label)."'";
    $sql .= ' ORDER BY rowid DESC';
    $sql .= $db->plimit(1);
    $resql = $db->query($sql);
    if ($resql && $db->num_rows($resql) > 0) {
        $obj = $db->fetch_object($resql);
        $db->free($resql);
        $existingId = (int) $obj->rowid;
        // Defense in depth: this label-matching fallback only fires when the
        // caller didn't already send an fk_project (the normal path once the
        // UI picks from a restricted project list), but a client could still
        // submit project_label directly — don't let that bypass the same
        // restriction fk_project submissions are checked against.
        if (!timeflowCanAccessProject($db, $user, $existingId)) {
            return 0;
        }
        return $existingId;
    }

    return timeflowCreateProject($db, $user, $label, $fkSoc);
}

// NOTE (audit finding, not yet acted on): the rows this function inserts
// into llx_timeflow_task are, as of this writing, never read back anywhere
// in this codebase — no SELECT against that table exists outside this
// INSERT and its own CREATE TABLE. This is a write-only audit trail today:
// every free-text task label a user types (instead of picking a native
// project/task) is recorded here but there is no screen, export, or report
// that surfaces it. Before relying on this table for anything, or before
// assuming it is safe to drop, confirm whether that is still true and
// whether a consultation screen is planned — don't build on the
// assumption that this data is currently consumed by anything.
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

// NOTE (audit finding, not yet acted on): same situation as
// timeflowStoreTaskText() just above — the rows this function inserts into
// llx_timeflow_project_text are, as of this writing, never read back
// anywhere in this codebase (no SELECT against that table exists outside
// this INSERT and its own CREATE TABLE). Every free-text project label a
// user types (instead of picking a native project) is recorded here but
// nothing currently surfaces it. Confirm whether that is still true before
// relying on this data or assuming it is safe to drop.
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

/**
 * Creates a project directly in the native llx_projet table via Dolibarr's
 * own Project class (TimeFlow -> native project migration) — status
 * "Validated" (Ouvert), usage_task enabled since TimeFlow relies on native
 * tasks (llx_projet_task, see timeflowFetchTasks()), and the TimeFlow-
 * specific "source" marker stored as an extrafield rather than a column
 * that only existed in the now-retired llx_timeflow_project.
 *
 * @return int New project id, or -1 on failure.
 */
function timeflowCreateProject($db, $user, $title, $fkSoc = 0, $description = '')
{
    $project = new Project($db);
    $project->ref = 'CPJ-'.date('YmdHis');
    $project->title = $title;
    $project->description = trim((string) $description);
    $project->socid = (int) $fkSoc;
    $project->status = Project::STATUS_VALIDATED;
    $project->usage_task = 1;
    $result = $project->create($user);
    if ($result > 0) {
        return (int) $result;
    }

    return -1;
}

