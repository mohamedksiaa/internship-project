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

top_httphead('application/json');

// Vérification authentification
if (empty($user->id)) {
    http_response_code(401);
    echo json_encode(array('error' => 'Non autorisé'));
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

switch ($action) {
    case 'getActiveTimer':
        $id = $timeentry->hasActiveTimer($user->id);
        if ($id > 0) {
            $timeentry->fetch($id);
            echo json_encode(array('status' => 'success', 'data' => $timeentry));
        } else {
            echo json_encode(array('status' => 'success', 'data' => null));
        }
        break;

    case 'startTimer':
        $fk_project = !empty($postData['fk_project']) ? (int)$postData['fk_project'] : (int)GETPOST('fk_project', 'int');
        $fk_task = !empty($postData['fk_task']) ? (int)$postData['fk_task'] : (int)GETPOST('fk_task', 'int');
        $note = !empty($postData['note']) ? $postData['note'] : GETPOST('note', 'restricthtml');

        $id = $timeentry->startTimer($user->id, $fk_project, $fk_task, $note, $user);
        if ($id > 0) {
            $timeentry->fetch($id);
            echo json_encode(array('status' => 'success', 'data' => $timeentry));
        } else {
            http_response_code(400);
            echo json_encode(array('status' => 'error', 'message' => $timeentry->error ?: 'Erreur au démarrage'));
        }
        break;

    case 'stopTimer':
        $id = !empty($postData['id']) ? (int)$postData['id'] : (int)GETPOST('id', 'int');
        $res = $timeentry->stopTimer($id, $user);
        if ($res > 0) {
            echo json_encode(array('status' => 'success', 'data' => $timeentry));
        } else {
            http_response_code(400);
            echo json_encode(array('status' => 'error', 'message' => $timeentry->error ?: 'Erreur à l\'arrêt'));
        }
        break;

    default:
        http_response_code(404);
        echo json_encode(array('error' => 'Action non reconnue'));
        break;
}