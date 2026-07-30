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

require_once DOL_DOCUMENT_ROOT.'/custom/clockify/class/timeentry.class.php';
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
    http_response_code(403);
    echo json_encode(array('error' => 'Jeton invalide'));
    exit;
}

$action = GETPOST('action', 'aZ09');
$timeentry = new TimeEntry($db);

// Gestion des requêtes POST JSON
$postData = json_decode(file_get_contents('php://input'), true);
if (is_array($postData)) {
    if (!empty($postData['action'])) {
        $action = $postData['action'];
    }
}

function clockifyJsonResponse($payload, $status = 200)
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

function clockifyExportTimeEntry($object)
{
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
        $cleaned['user_label'] = clockifyResolveUserLabel((int) $object->fk_user);
    }

    return $cleaned;
}

function clockifyResolveUserLabel($userId)
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
    $sql = 'SELECT rowid, login, firstname, lastname, name';
    $sql .= ' FROM '.$db->prefix().'user';
    $sql .= ' WHERE rowid = '.$userId;
    $resql = $db->query($sql);
    if ($resql) {
        $obj = $db->fetch_object($resql);
        if ($obj) {
            $fullName = trim(trim((string) $obj->firstname).' '.trim((string) $obj->lastname));
            if ($fullName !== '') {
                $label = $fullName;
            } elseif (!empty($obj->name)) {
                $label = (string) $obj->name;
            } elseif (!empty($obj->login)) {
                $label = (string) $obj->login;
            }
        }
        $db->free($resql);
    }

    $cache[$userId] = $label;
    return $label;
}

function clockifyNormalizeTags($tags)
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

function clockifyProjectLabel($object)
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

function clockifyTaskLabel($object)
{
    if (!empty($object->label)) {
        return $object->label;
    }
    if (!empty($object->ref)) {
        return $object->ref;
    }
    return 'Tâche';
}

function clockifyFetchProjects($db)
{
    $projects = array();
    $sql = 'SELECT p.rowid, p.ref, p.title, p.fk_soc, s.nom as soc_name';
    $sql .= ' FROM '.$db->prefix().'projet AS p';
    $sql .= ' LEFT JOIN '.$db->prefix().'societe AS s ON s.rowid = p.fk_soc';
    $sql .= ' WHERE p.entity IN ('.getEntity('project').')';
    $sql .= ' ORDER BY p.title ASC, p.ref ASC, p.rowid DESC';

    $resql = $db->query($sql);
    if ($resql) {
        while ($obj = $db->fetch_object($resql)) {
            $projects[] = array(
                'id' => (int) $obj->rowid,
                'rowid' => (int) $obj->rowid,
                'title' => clockifyProjectLabel($obj),
                'ref' => !empty($obj->ref) ? $obj->ref : '',
                'fk_soc' => (int) $obj->fk_soc,
                'client' => !empty($obj->soc_name) ? $obj->soc_name : '',
            );
        }
    }

    return $projects;
}

function clockifyFetchTasks($db, $projectId = 0, $limit = 100)
{
    $tasks = array();
    $sql = 'SELECT rowid, fk_projet, ref, label';
    $sql .= ' FROM '.$db->prefix().'projet_task';
    $sql .= ' WHERE entity IN ('.getEntity('project').')';
    if ((int) $projectId > 0) {
        $sql .= ' AND fk_projet = '.((int) $projectId);
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
                'title' => clockifyTaskLabel($obj),
            );
        }
    }

    return $tasks;
}

function clockifyFetchWeeklyTimesheet($timeentry, $user, $weekStart = null)
{
    $weekStart = !empty($weekStart) ? strtotime($weekStart) : strtotime('monday this week');
    $weekEnd = strtotime('+7 days', $weekStart);
    $result = $timeentry->fetchAll('ASC', 't.date_start', 1000, 0, '');
    $rows = array();
    if (is_array($result)) {
        foreach ($result as $obj) {
            $start = strtotime((string) $obj->date_start);
            if ($start < $weekStart || $start >= $weekEnd) {
                continue;
            }
            if (!$user->admin && !$user->hasRight('clockify', 'timeentry', 'write') && (int) $obj->fk_user !== (int) $user->id) {
                continue;
            }
            $row = clockifyExportTimeEntry($obj);
            $row['day'] = date('Y-m-d', strtotime($obj->date_start));
            $rows[] = $row;
        }
    }
    return array('weekStart' => date('Y-m-d', $weekStart), 'weekEnd' => date('Y-m-d', $weekEnd), 'rows' => $rows);
}

function clockifyBuildSummary($entries)
{
    $summary = array(
        'total_seconds' => 0,
        'billable_seconds' => 0,
        'non_billable_seconds' => 0,
        'by_project' => array(),
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

switch ($action) {
    case 'getActiveTimer':
        $id = $timeentry->hasActiveTimer($user->id);
        if ($id > 0) {
            $timeentry->fetch($id);
            clockifyJsonResponse(array('status' => 'success', 'data' => clockifyExportTimeEntry($timeentry)));
        } else {
            clockifyJsonResponse(array('status' => 'success', 'data' => null));
        }
        break;

    case 'startTimer':
        $fk_project = !empty($postData['fk_project']) ? (int)$postData['fk_project'] : (int)GETPOST('fk_project', 'int');
        $fk_task = !empty($postData['fk_task']) ? (int)$postData['fk_task'] : (int)GETPOST('fk_task', 'int');
        $note = !empty($postData['note']) ? $postData['note'] : GETPOST('note', 'restricthtml');

        if ($fk_task > 0 && $fk_project <= 0) {
            clockifyJsonResponse(array('status' => 'error', 'message' => 'Une tâche nécessite un projet'), 400);
        }

        if ($fk_project > 0) {
            $project = new Project($db);
            if ($project->fetch($fk_project) <= 0) {
                clockifyJsonResponse(array('status' => 'error', 'message' => 'Projet introuvable'), 400);
            }
        }

        if ($fk_task > 0) {
            $task = new Task($db);
            if ($task->fetch($fk_task) <= 0 || (int) $task->fk_project !== $fk_project) {
                clockifyJsonResponse(array('status' => 'error', 'message' => 'Tâche introuvable ou rattachée à un autre projet'), 400);
            }
        }

        $id = $timeentry->startTimer($user->id, $fk_project, $fk_task, $note, $user);
        if ($id > 0) {
            // Return only stable scalar data. Serializing a Dolibarr object may
            // include non-serializable internals and result in an empty body.
            clockifyJsonResponse(array('status' => 'success', 'id' => (int) $id));
        } else {
            http_response_code(400);
            clockifyJsonResponse(array('status' => 'error', 'message' => $timeentry->error ?: 'Erreur au démarrage'), 400);
        }
        break;

    case 'createManualEntry':
        $fk_project = !empty($postData['fk_project']) ? (int) $postData['fk_project'] : (int) GETPOST('fk_project', 'int');
        $fk_task = !empty($postData['fk_task']) ? (int) $postData['fk_task'] : (int) GETPOST('fk_task', 'int');
        $date_start = $postData['date_start'] ?? GETPOST('date_start', 'alphanohtml');
        $date_end = $postData['date_end'] ?? GETPOST('date_end', 'alphanohtml');
        $note = $postData['note'] ?? GETPOST('note', 'restricthtml');
        $tags = clockifyNormalizeTags($postData['tags'] ?? GETPOST('tags', 'alphanohtml'));
        $billable = !empty($postData['billable']) ? 1 : (int) GETPOST('billable', 'int');
        $thm = !empty($postData['thm']) ? (float) $postData['thm'] : (float) GETPOST('thm', 'alphanohtml');

        $res = $timeentry->createManualEntry($user->id, $fk_project, $fk_task, $date_start, $date_end, $note, $tags, $billable, $user, $thm);
        if ($res > 0) {
            $timeentry->fetch($res);
            clockifyJsonResponse(array('status' => 'success', 'data' => clockifyExportTimeEntry($timeentry)));
        }
        clockifyJsonResponse(array('status' => 'error', 'message' => $timeentry->error ?: 'Erreur à la création manuelle'), 400);
        break;

    case 'submitEntry':
        $id = !empty($postData['id']) ? (int) $postData['id'] : (int) GETPOST('id', 'int');
        $res = $timeentry->submitEntry($id, $user);
        if ($res > 0) {
            clockifyJsonResponse(array('status' => 'success', 'data' => clockifyExportTimeEntry($timeentry)));
        }
        clockifyJsonResponse(array('status' => 'error', 'message' => $timeentry->error ?: 'Erreur à la soumission'), 400);
        break;

    case 'stopTimer':
        $id = !empty($postData['id']) ? (int)$postData['id'] : (int)GETPOST('id', 'int');
        $res = $timeentry->stopTimer($id, $user);
        if ($res > 0) {
            clockifyJsonResponse(array('status' => 'success', 'data' => clockifyExportTimeEntry($timeentry)));
        } else {
            http_response_code(400);
            clockifyJsonResponse(array('status' => 'error', 'message' => $timeentry->error ?: 'Erreur à l\'arrêt'), 400);
        }
        break;

    case 'getProjects':
        clockifyJsonResponse(array('status' => 'success', 'data' => clockifyFetchProjects($db)));
        break;

    case 'getTasks':
        $projectId = !empty($postData['projectId']) ? (int) $postData['projectId'] : (int) GETPOST('projectId', 'int');
        $limit = !empty($postData['limit']) ? (int) $postData['limit'] : (int) GETPOST('limit', 'int');
        clockifyJsonResponse(array('status' => 'success', 'data' => clockifyFetchTasks($db, $projectId, $limit)));
        break;

    case 'getTimeEntries':
        $limit = !empty($postData['limit']) ? (int) $postData['limit'] : (int) GETPOST('limit', 'int');
        $limit = $limit > 0 ? $limit : 100;
        if ($user->admin || $user->hasRight('clockify', 'timeentry', 'write')) {
            $filter = '';
        } else {
            $filter = '(t.fk_user:=:'.((int) $user->id).')';
        }
        $result = $timeentry->fetchAll('DESC', 't.date_start', $limit, 0, $filter);
        if (is_array($result)) {
            $rows = array();
            foreach ($result as $obj) {
                $rows[] = clockifyExportTimeEntry($obj);
            }
            clockifyJsonResponse(array('status' => 'success', 'data' => $rows));
        }
        clockifyJsonResponse(array('status' => 'success', 'data' => array()));
        break;

    case 'getWeeklyTimesheet':
        $weekStart = $postData['weekStart'] ?? GETPOST('weekStart', 'alphanohtml');
        $timesheet = clockifyFetchWeeklyTimesheet($timeentry, $user, $weekStart);
        clockifyJsonResponse(array('status' => 'success', 'data' => $timesheet));
        break;

    case 'getSummaryReports':
        $limit = !empty($postData['limit']) ? (int) $postData['limit'] : (int) GETPOST('limit', 'int');
        $limit = $limit > 0 ? $limit : 1000;
        if ($user->admin || $user->hasRight('clockify', 'timeentry', 'write')) {
            $filter = '';
        } else {
            $filter = '(t.fk_user:=:'.((int) $user->id).')';
        }
        $result = $timeentry->fetchAll('DESC', 't.date_start', $limit, 0, $filter);
        $rows = array();
        if (is_array($result)) {
            foreach ($result as $obj) {
                $rows[] = clockifyExportTimeEntry($obj);
            }
        }
        clockifyJsonResponse(array('status' => 'success', 'data' => clockifyBuildSummary($rows)));
        break;

    case 'generateInvoiceLines':
        $clientId = !empty($postData['fk_soc']) ? (int) $postData['fk_soc'] : (int) GETPOST('fk_soc', 'int');
        if ($user->admin || $user->hasRight('clockify', 'timeentry', 'write')) {
            $filter = '';
        } else {
            $filter = '(t.fk_user:=:'.((int) $user->id).')';
        }
        $result = $timeentry->fetchAll('DESC', 't.date_start', 1000, 0, $filter);
        $lines = array();
        if (is_array($result)) {
            foreach ($result as $obj) {
                if ((int) $obj->billable <= 0 || (int) $obj->duration <= 0 || !empty($obj->fk_facture)) {
                    continue;
                }
                if ($clientId > 0) {
                    $project = new Project($db);
                    if ($project->fetch((int) $obj->fk_project) > 0 && (int) $project->socid !== $clientId) {
                        continue;
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
        clockifyJsonResponse(array('status' => 'success', 'data' => $lines));
        break;

    case 'createInvoiceFromTimeEntries':
        // Actually creates a draft Dolibarr customer invoice from selected billable,
        // not-yet-invoiced time entries, and marks those entries as invoiced so
        // they cannot be pulled into a second invoice.
        if (!$user->admin && !$user->hasRight('clockify', 'timeentry', 'write')) {
            clockifyJsonResponse(array('status' => 'error', 'message' => 'Droits insuffisants'), 403);
        }

        $clientId = !empty($postData['fk_soc']) ? (int) $postData['fk_soc'] : (int) GETPOST('fk_soc', 'int');
        $entryIds = !empty($postData['entry_ids']) && is_array($postData['entry_ids']) ? array_map('intval', $postData['entry_ids']) : array();

        if ($clientId <= 0) {
            clockifyJsonResponse(array('status' => 'error', 'message' => 'Client requis'), 400);
        }
        if (empty($entryIds)) {
            clockifyJsonResponse(array('status' => 'error', 'message' => 'Aucune saisie sélectionnée'), 400);
        }

        require_once DOL_DOCUMENT_ROOT.'/societe/class/societe.class.php';
        $thirdparty = new Societe($db);
        if ($thirdparty->fetch($clientId) <= 0) {
            clockifyJsonResponse(array('status' => 'error', 'message' => 'Client introuvable'), 404);
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
            if (!$user->admin && !$user->hasRight('clockify', 'timeentry', 'readall') && (int) $candidate->fk_user !== (int) $user->id) {
                continue;
            }
            $entriesToInvoice[] = $candidate;
        }

        if (empty($entriesToInvoice)) {
            clockifyJsonResponse(array('status' => 'error', 'message' => 'Aucune saisie facturable trouvée pour cette sélection'), 400);
        }

        $db->begin();

        $invoice = new Facture($db);
        $invoice->socid = $clientId;
        $invoice->type = Facture::TYPE_STANDARD;
        $invoice->date = dol_now();

        $invoiceId = $invoice->create($user);
        if ($invoiceId <= 0) {
            $db->rollback();
            clockifyJsonResponse(array('status' => 'error', 'message' => $invoice->error ?: 'Erreur à la création de la facture'), 500);
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
            clockifyJsonResponse(array('status' => 'error', 'message' => $invoice->error ?: 'Erreur à l\'ajout d\'une ligne de facture'), 500);
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
            clockifyJsonResponse(array('status' => 'error', 'message' => 'Facture créée mais échec du marquage des saisies comme facturées'), 500);
        }

        $db->commit();

        clockifyJsonResponse(array('status' => 'success', 'data' => array(
            'fk_facture' => $invoiceId,
            'ref' => $invoice->ref,
            'nb_lines' => count($entriesToInvoice),
        )));
        break;

    case 'roundTimeEntry':
        $id = !empty($postData['id']) ? (int) $postData['id'] : (int) GETPOST('id', 'int');
        $stepMinutes = !empty($postData['stepMinutes']) ? (int) $postData['stepMinutes'] : (int) GETPOST('stepMinutes', 'int');
        $stepMinutes = $stepMinutes > 0 ? $stepMinutes : 15;
        if ($timeentry->fetch($id) <= 0) {
            clockifyJsonResponse(array('status' => 'error', 'message' => 'Entrée introuvable'), 404);
        }
        $duration = (int) $timeentry->duration;
        $rounded = (int) (ceil($duration / ($stepMinutes * 60)) * $stepMinutes * 60);
        $timeentry->duration = $rounded;
        if (!empty($timeentry->date_start)) {
            $timeentry->date_end = date('Y-m-d H:i:s', strtotime($timeentry->date_start) + $rounded);
        }
        if ($timeentry->update($user) > 0) {
            clockifyJsonResponse(array('status' => 'success', 'data' => clockifyExportTimeEntry($timeentry)));
        }
        clockifyJsonResponse(array('status' => 'error', 'message' => $timeentry->error ?: 'Erreur de arrondi'), 400);
        break;

    case 'validateEntry':
    case 'approveTimeEntry':
        if (!$user->admin && !$user->hasRight('clockify', 'timeentry', 'write')) {
            clockifyJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
        }
        $id = !empty($postData['id']) ? (int) $postData['id'] : (int) GETPOST('id', 'int');
        $res = $timeentry->validateEntry($id, $user, TimeEntry::STATUS_VALIDATED);
        if ($res > 0) {
            clockifyJsonResponse(array('status' => 'success', 'data' => clockifyExportTimeEntry($timeentry)));
        }
        clockifyJsonResponse(array('status' => 'error', 'message' => $timeentry->error ?: 'Erreur à la validation'), 400);
        break;

    case 'submitWeeklyApproval':
        if (!$user->admin && !$user->hasRight('clockify', 'timeentry', 'write')) {
            clockifyJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
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
                    $updated[] = clockifyExportTimeEntry($timeentry);
                }
            }
        }
        clockifyJsonResponse(array('status' => 'success', 'data' => $updated));
        break;

    case 'rejectEntry':
    case 'rejectTimeEntry':
        if (!$user->admin && !$user->hasRight('clockify', 'timeentry', 'write')) {
            clockifyJsonResponse(array('status' => 'error', 'message' => 'Accès refusé'), 403);
        }
        $id = !empty($postData['id']) ? (int) $postData['id'] : (int) GETPOST('id', 'int');
        $res = $timeentry->validateEntry($id, $user, TimeEntry::STATUS_CANCELED);
        if ($res > 0) {
            clockifyJsonResponse(array('status' => 'success', 'data' => clockifyExportTimeEntry($timeentry)));
        }
        clockifyJsonResponse(array('status' => 'error', 'message' => $timeentry->error ?: 'Erreur au refus'), 400);
        break;

    default:
        http_response_code(404);
        echo json_encode(array('error' => 'Action non reconnue'));
        break;
}
