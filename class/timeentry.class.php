<?php
/* Copyright (C) 2026 SuperAdmin - Clockify Module */

require_once DOL_DOCUMENT_ROOT.'/core/class/commonobject.class.php';

/**
 * Class for TimeEntry
 */
class TimeEntry extends CommonObject
{
    public $module = 'clockify';
    public $element = 'timeentry';
    public $table_element = 'clockify_timeentry';
    public $picto = 'fa-file';

    public $isextrafieldmanaged = 0;
    public $ismultientitymanaged = 0;

    const STATUS_DRAFT = 0;
    const STATUS_VALIDATED = 1;
    const STATUS_CANCELED = 9;

    public $fields = array(
        'rowid' => array('type'=>'integer', 'label'=>'TechnicalID', 'enabled'=>1, 'visible'=>-2, 'notnull'=>1, 'position'=>1, 'index'=>1),
        'entity' => array('type'=>'integer', 'label'=>'Entity', 'enabled'=>1, 'visible'=>0, 'notnull'=>1, 'default'=>1, 'position'=>5, 'index'=>1),
        'fk_user' => array('type'=>'integer:User:user/class/user.class.php', 'label'=>'User', 'enabled'=>1, 'visible'=>1, 'notnull'=>1, 'position'=>10, 'index'=>1),
        'fk_project' => array('type'=>'integer:Project:projet/class/project.class.php', 'label'=>'Project', 'enabled'=>1, 'visible'=>1, 'position'=>15, 'index'=>1),
        'fk_task' => array('type'=>'integer:Task:projet/class/task.class.php', 'label'=>'Task', 'enabled'=>1, 'visible'=>1, 'position'=>20),
        'date_start' => array('type'=>'datetime', 'label'=>'DateStart', 'enabled'=>1, 'visible'=>1, 'notnull'=>1, 'position'=>25),
        'date_end' => array('type'=>'datetime', 'label'=>'DateEnd', 'enabled'=>1, 'visible'=>1, 'position'=>30),
        'duration' => array('type'=>'integer', 'label'=>'Duration', 'enabled'=>1, 'visible'=>1, 'default'=>0, 'position'=>35),
        'note' => array('type'=>'text', 'label'=>'Note', 'enabled'=>1, 'visible'=>1, 'position'=>40),
        'billable' => array('type'=>'boolean', 'label'=>'Billable', 'enabled'=>1, 'visible'=>1, 'default'=>0, 'position'=>45),
        'status' => array('type'=>'integer', 'label'=>'Status', 'enabled'=>1, 'visible'=>1, 'notnull'=>1, 'default'=>0, 'position'=>50),
        'fk_user_valid' => array('type'=>'integer:User:user/class/user.class.php', 'label'=>'ValidatedBy', 'enabled'=>1, 'visible'=>1, 'position'=>55),
        'date_creation' => array('type'=>'datetime', 'label'=>'DateCreation', 'enabled'=>1, 'visible'=>-2, 'notnull'=>1, 'position'=>500),
        'tms' => array('type'=>'timestamp', 'label'=>'DateModification', 'enabled'=>1, 'visible'=>-2, 'notnull'=>1, 'position'=>501),
        'fk_user_creat' => array('type'=>'integer:User:user/class/user.class.php', 'label'=>'UserAuthor', 'enabled'=>1, 'visible'=>-2, 'notnull'=>1, 'position'=>510),
        'fk_user_modif' => array('type'=>'integer:User:user/class/user.class.php', 'label'=>'UserModif', 'enabled'=>1, 'visible'=>-2, 'position'=>511),
    );

    public $rowid;
    public $entity;
    public $fk_user;
    public $fk_project;
    public $fk_task;
    public $date_start;
    public $date_end;
    public $duration;
    public $note;
    public $billable;
    public $status;
    public $fk_user_valid;
    public $date_creation;
    public $tms;
    public $fk_user_creat;
    public $fk_user_modif;

    public function __construct(DoliDB $db)
    {
        $this->db = $db;
        $this->table_element = 'clockify_timeentry';
    }

    // === MÉTHODES MÉTIER CLOCKIFY ===

    public function hasActiveTimer($fk_user)
    {
        $sql = "SELECT rowid FROM ".MAIN_DB_PREFIX."clockify_timeentry";
        $sql .= " WHERE fk_user = ".((int) $fk_user)." AND date_end IS NULL";
        $resql = $this->db->query($sql);
        if ($resql && $this->db->num_rows($resql) > 0) {
            $obj = $this->db->fetch_object($resql);
            return (int) $obj->rowid;
        }
        return 0;
    }

    public function startTimer($fk_user, $fk_project, $fk_task, $note, $user)
    {
        if ($this->hasActiveTimer($fk_user) > 0) {
            $this->error = "Un chrono est déjà actif pour cet utilisateur";
            return -1;
        }

        $this->fk_user = $fk_user;
        $this->fk_project = $fk_project;
        $this->fk_task = $fk_task;
        $this->note = $note;
        $this->date_start = dol_now();
        $this->date_end = null;
        $this->status = 0;

        return $this->create($user);
    }

    public function stopTimer($id, $user)
    {
        if ($this->fetch($id) <= 0) {
            $this->error = "Entrée introuvable";
            return -1;
        }

        $this->date_end = dol_now();
        $this->duration = $this->calculateDuration();

        return $this->update($user);
    }

    public function calculateDuration()
    {
        if (empty($this->date_end) || empty($this->date_start)) return 0;
        return $this->date_end - $this->date_start;
    }

    // === MÉTHODES CORE DOLIBARR ===
    public function create(User $user, $notrigger = 0) { return $this->createCommon($user, $notrigger); }
    public function fetch($id, $ref = null, $noextrafields = 0, $nolines = 0) { return $this->fetchCommon($id, $ref, '', $noextrafields); }
    public function update(User $user, $notrigger = 0) { return $this->updateCommon($user, $notrigger); }
    public function delete(User $user, $notrigger = 0) { return $this->deleteCommon($user, $notrigger); }
}