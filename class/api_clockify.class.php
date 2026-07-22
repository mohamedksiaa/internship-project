<?php
/* Copyright (C) 2026 SuperAdmin - Clockify Module API */

use Luracast\Restler\RestException;

require_once DOL_DOCUMENT_ROOT.'/api/class/api.class.php';
require_once DOL_DOCUMENT_ROOT.'/custom/clockify/class/timeentry.class.php';

/**
 * API Class for Clockify Module
 *
 * @smart-auto-routing false
 */
class Clockify extends DolibarrApi
{
    /**
     * @var array   $FIELDS     Fields references
     */
    public static $FIELDS = array(
        'rowid',
        'entity',
        'fk_user',
        'fk_project',
        'fk_task',
        'date_start',
        'date_end',
        'duration',
        'note',
        'billable',
        'status'
    );

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
     * @return int ID de la nouvelle entrée
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

        if ($fk_project <= 0) {
            throw new RestException(400, 'fk_project is required');
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

        return $id;
    }

    /**
     * Arrêter un chrono actif
     *
     * @param int $id ID du TimeEntry à stopper
     * @return array
     *
     * @url POST /timeentrys/stop
     */
    public function stopTimer($id)
    {
        if (!DolibarrApiAccess::$user->id) {
            throw new RestException(401, 'Unauthorized');
        }

        $timeentry = new TimeEntry($this->db);
        $res = $timeentry->stopTimer((int) $id, DolibarrApiAccess::$user);

        if ($res <= 0) {
            throw new RestException(500, $timeentry->error ? $timeentry->error : 'Error stopping timer');
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
        if (!DolibarrApiAccess::$user->hasRight('clockify', 'timeentry', 'write')) {
            throw new RestException(403, 'Forbidden');
        }

        $timeentry = new TimeEntry($this->db);
        $res = $timeentry->validateEntry((int) $id, DolibarrApiAccess::$user, TimeEntry::STATUS_VALIDATED);

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
        if (!DolibarrApiAccess::$user->hasRight('clockify', 'timeentry', 'write')) {
            throw new RestException(403, 'Forbidden');
        }

        $timeentry = new TimeEntry($this->db);
        $res = $timeentry->validateEntry((int) $id, DolibarrApiAccess::$user, TimeEntry::STATUS_CANCELED);

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
        $filter = "(t.fk_user:=:".((int) DolibarrApiAccess::$user->id).")";
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
            'billable',
            'status',
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