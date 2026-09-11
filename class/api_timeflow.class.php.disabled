<?php
/* Copyright (C) 2026 SuperAdmin - TimeFlow Module API */

use Luracast\Restler\RestException;

require_once DOL_DOCUMENT_ROOT.'/api/class/api.class.php';
dol_include_once('/timeflow/class/timeentry.class.php');
dol_include_once('/timeflow/lib/timeflow.lib.php');
require_once DOL_DOCUMENT_ROOT.'/projet/class/project.class.php';
require_once DOL_DOCUMENT_ROOT.'/projet/class/task.class.php';

/**
 * API Class for TimeFlow Module
 *
 * @smart-auto-routing false
 */
class TimeFlow extends DolibarrApi
{
    /**
     * Constructor
     */
    public function __construct()
    {
        global $db;
        $this->db = $db;
    }

    /**
     * Récupérer le chrono actif de l'utilisateur connecté
     *
     * @return array|null
     *
     * @url GET /timeentrys/active
     */
    public function getActiveTimer()
    {
        if (!DolibarrApiAccess::$user->id) {
            throw new RestException(401, 'Unauthorized');
        }

        $timeentry = new TimeEntry($this->db);
        $id = $timeentry->hasActiveTimer(DolibarrApiAccess::$user->id);

        if ($id > 0) {
            $result = $timeentry->fetch($id);
            if ($result > 0) {
                return $this->_cleanObjectDatas($timeentry);
            }
        }

        return null;
    }

    /**
     * Démarrer un chrono
     *
     * @param int    $fk_project  ID du projet
     * @param int    $fk_task     ID de la tâche (optionnel)
     * @param string $note        Note / Description
     * @return array{id:int} ID de la nouvelle entrée
     *
     * @url POST /timeentrys/start
     */
    public function startTimer($fk_project = 0, $fk_task = 0, $note = '')
    {
        if (!DolibarrApiAccess::$user->id) {
            throw new RestException(401, 'Unauthorized');
        }

        $fk_project = (int) $fk_project;
        $fk_task = (int) $fk_task;
        $note = trim((string) $note);

        if ($fk_task > 0 && $fk_project <= 0) {
            throw new RestException(400, 'A task can only be selected with a project');
        }

        if ($fk_project > 0) {
            $project = new Project($this->db);
            if ($project->fetch($fk_project) <= 0) {
                throw new RestException(400, 'Selected project was not found');
            }
            // Same restriction ajax/timeentry.php's startTimer action already
            // enforces: a project with at least one PROJECTCONTRIBUTOR contact
            // is closed to everyone else, admins/readall aside.
            if (!timeflowCanAccessProject($this->db, DolibarrApiAccess::$user, $fk_project)) {
                throw new RestException(403, 'Selected project is restricted to specific users');
            }
        }

        if ($fk_task > 0) {
            $task = new Task($this->db);
            if ($task->fetch($fk_task) <= 0 || (int) $task->fk_project !== $fk_project) {
                throw new RestException(400, 'Selected task does not belong to the project');
            }
        }

        $timeentry = new TimeEntry($this->db);
        $id = $timeentry->startTimer(
            DolibarrApiAccess::$user->id,
            $fk_project,
            $fk_task,
            $note,
            DolibarrApiAccess::$user
        );

        if ($id <= 0) {
            throw new RestException(500, $timeentry->error ? $timeentry->error : 'Error starting timer');
        }

        // A structured response is reliable across Dolibarr/Restler versions,
        // while a scalar return value may be emitted as an empty response.
        return array('id' => (int) $id);
    }

    /**
     * Arrêter un chrono actif
     *
     * @param int $id ID du TimeEntry à stopper
     * @return array
     *
     * @url POST /timeentrys/{id}/stop
     */
    public function stopTimer($id)
    {
        if (!DolibarrApiAccess::$user->id) {
            throw new RestException(401, 'Unauthorized');
        }

        $id = (int) $id;
        $timeentry = new TimeEntry($this->db);
        if ($timeentry->fetch($id) <= 0) {
            throw new RestException(404, 'TimeEntry not found');
        }
        if ((int) $timeentry->fk_user !== (int) DolibarrApiAccess::$user->id) {
            throw new RestException(403, 'Forbidden');
        }

        // Not pre-checked here: whether the entry already has a date_end.
        // TimeEntry::stopTimer() resolves a stale id to its real active
        // successor after a midnight split (findActiveSuccessorId()) before
        // ever treating "already stopped" as a hard failure — a pre-check
        // on date_end here would short-circuit that self-healing path.
        $res = $timeentry->stopTimer($id, DolibarrApiAccess::$user);

        if ($res <= 0) {
            $code = ($timeentry->error === 'Ce chrono est déjà arrêté') ? 409 : 500;
            throw new RestException($code, $timeentry->error ? $timeentry->error : 'Error stopping timer');
        }

        return $this->_cleanObjectDatas($timeentry);
    }

    /**
     * Valider une entrée de temps
     *
     * @param int $id ID du TimeEntry à valider
     * @return array
     *
     * @url POST /timeentrys/{id}/validate
     */
    public function validateEntry($id)
    {
        if (!DolibarrApiAccess::$user->id) {
            throw new RestException(401, 'Unauthorized');
        }
        if (empty(DolibarrApiAccess::$user->admin) && !DolibarrApiAccess::$user->hasRight('timeflow', 'timeentry', 'validate')) {
            throw new RestException(403, 'Forbidden');
        }

        $id = (int) $id;
        $timeentry = new TimeEntry($this->db);
        if ($timeentry->fetch($id) <= 0) {
            throw new RestException(404, 'TimeEntry not found');
        }

        $res = $timeentry->validateEntry($id, DolibarrApiAccess::$user, TimeEntry::STATUS_VALIDATED);

        if ($res <= 0) {
            throw new RestException(500, $timeentry->error ? $timeentry->error : 'Error validating timer');
        }

        return $this->_cleanObjectDatas($timeentry);
    }

    /**
     * Refuser une entrée de temps
     *
     * @param int $id ID du TimeEntry à refuser
     * @return array
     *
     * @url POST /timeentrys/{id}/reject
     */
    public function rejectEntry($id)
    {
        if (!DolibarrApiAccess::$user->id) {
            throw new RestException(401, 'Unauthorized');
        }
        if (empty(DolibarrApiAccess::$user->admin) && !DolibarrApiAccess::$user->hasRight('timeflow', 'timeentry', 'validate')) {
            throw new RestException(403, 'Forbidden');
        }

        $id = (int) $id;
        $timeentry = new TimeEntry($this->db);
        if ($timeentry->fetch($id) <= 0) {
            throw new RestException(404, 'TimeEntry not found');
        }

        $res = $timeentry->validateEntry($id, DolibarrApiAccess::$user, TimeEntry::STATUS_CANCELED);

        if ($res <= 0) {
            throw new RestException(500, $timeentry->error ? $timeentry->error : 'Error rejecting timer');
        }

        return $this->_cleanObjectDatas($timeentry);
    }

    /**
     * Obtenir toutes les saisies de temps de l'utilisateur
     *
     * @param int $limit  Nombre max de résultats
     * @param int $offset Offset
     * @return array
     *
     * @url GET /timeentrys
     */
    public function index($limit = 100, $offset = 0)
    {
        if (!DolibarrApiAccess::$user->id) {
            throw new RestException(401, 'Unauthorized');
        }

        $timeentry = new TimeEntry($this->db);
        $canReadAll = !empty(DolibarrApiAccess::$user->admin)
            || DolibarrApiAccess::$user->hasRight('timeflow', 'timeentry', 'readall');
        $filter = $canReadAll ? '' : "(t.fk_user:=:".((int) DolibarrApiAccess::$user->id).")";
        $result = $timeentry->fetchAll('DESC', 't.date_start', (int) $limit, (int) $offset, $filter);

        if (is_array($result)) {
            $data = array();
            foreach ($result as $obj) {
                $data[] = $this->_cleanObjectDatas($obj);
            }
            return $data;
        }

        return array();
    }

    /**
     * Nettoyer les propriétés de l'objet pour la réponse JSON API
     *
     * @param Object $object Objet Dolibarr
     * @return array
     */
    protected function _cleanObjectDatas($object)
    {
        $object = parent::_cleanObjectDatas($object);

        if (!is_object($object)) {
            return array();
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
            'tms'
        );

        $cleaned = array();
        foreach ($allowedFields as $field) {
            if (property_exists($object, $field)) {
                $cleaned[$field] = $object->{$field};
            }
        }

        unset($cleaned['db']);
        unset($cleaned['error']);
        unset($cleaned['errors']);

        return $cleaned;
    }
}
