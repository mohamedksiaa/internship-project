<?php
/* Copyright (C) 2026 SuperAdmin - TimeFlow Import */

require_once DOL_DOCUMENT_ROOT.'/user/class/user.class.php';

/**
 * Clockify CSV preview/import mapping helper.
 *
 * This class is intentionally read-only for time entries and only persists
 * mapping resolution rows in llx_timeflow_import_mapping.
 */
class TimeImportClockify
{
    /** @var DoliDB */
    public $db;

    /** @var string */
    public $sourceSystem = 'clockify';

    /** @var string */
    public $configPath;

    public function __construct($db)
    {
        $this->db = $db;
        $this->configPath = DOL_DOCUMENT_ROOT.'/custom/timeflow/config/import_column_mapping_clockify.json';
    }

    /**
     * Parse an uploaded CSV file and return a structured preview summary.
     *
     * @param array $uploadedFile $_FILES entry
     * @return array
     */
    public function previewFromUploadedFile(array $uploadedFile)
    {
        if (empty($uploadedFile['tmp_name'])) {
            throw new InvalidArgumentException('Fichier CSV manquant.');
        }

        $fileName = basename((string) ($uploadedFile['name'] ?? ''));
        if (!preg_match('/\.csv$/i', $fileName)) {
            throw new InvalidArgumentException('Le fichier doit être un CSV valide (.csv).');
        }

        $fileSize = isset($uploadedFile['size']) ? (int) $uploadedFile['size'] : 0;
        if ($fileSize <= 0 || $fileSize > 10 * 1024 * 1024) {
            throw new InvalidArgumentException('Le fichier CSV est invalide ou dépasse 10 Mo.');
        }

        if (!is_uploaded_file($uploadedFile['tmp_name'])) {
            throw new InvalidArgumentException('Le fichier CSV fourni n’est pas valide.');
        }

        return $this->previewFromCsvPath($uploadedFile['tmp_name']);
    }

    /**
     * Parse a CSV file path and return the import preview summary.
     *
     * @param string $csvPath
     * @return array
     */
    public function previewFromCsvPath($csvPath)
    {
        if (!is_readable($csvPath)) {
            throw new RuntimeException('Le fichier CSV ne peut pas être lu.');
        }

        // $csvPath is frequently a PHP upload temp path (e.g. /tmp/phpXXXXXX),
        // which never carries a .csv extension by construction. The extension
        // is validated once, against the real uploaded filename, in
        // previewFromUploadedFile(); re-deriving it from basename($csvPath)
        // here would reject every upload unconditionally.

        $fileSize = @filesize($csvPath);
        if ($fileSize !== false && $fileSize > 10 * 1024 * 1024) {
            throw new InvalidArgumentException('Le fichier CSV dépasse 10 Mo.');
        }

        $config = $this->loadConfig();
        $headerNames = $this->readCsvHeader($csvPath, $config['delimiter'] ?? ',');
        if (empty($headerNames)) {
            throw new RuntimeException('Le fichier CSV est vide ou sans en-tête.');
        }

        $columnIndexes = $this->mapHeadersToIndexes($headerNames, $config['columns'] ?? array());
        $summary = array(
            'source' => $this->sourceSystem,
            'total_rows' => 0,
            'blocked_rows' => 0,
            'skipped_rows' => 0,
            'users' => array(),
            'projects' => array(),
            'groups' => array(),
            'stats' => array(
                'matched_users' => 0,
                'pending_users' => 0,
                'ignored_users' => 0,
                'matched_projects' => 0,
                'pending_projects' => 0,
                'ignored_projects' => 0,
                'matched_groups' => 0,
                'pending_groups' => 0,
            ),
            'messages' => array(
                'blocked_rows' => 'Lignes bloquées : user ou project non vide mais non résolu. Corriger ces éléments avant import.',
                'skipped_rows' => 'Lignes ignorées : user ou project vide. Elles seront exclues automatiquement sans bloquer l’import.',
            ),
            'warnings' => array(),
        );

        $handle = fopen($csvPath, 'r');
        if ($handle === false) {
            throw new RuntimeException('Impossible d’ouvrir le fichier CSV.');
        }

        // Keyed by "email|groupName" purely to deduplicate in memory while
        // scanning the file; llx_timeflow_import_user_group_link also has
        // its own UNIQUE constraint as a second line of defence.
        $userGroupPairs = array();

        $firstLine = true;
        while (($row = fgetcsv($handle, 0, $config['delimiter'] ?? ',')) !== false) {
            if ($firstLine) {
                $firstLine = false;
                continue;
            }

            $summary['total_rows']++;
            $normalizedRow = array_pad($row, max(count($headerNames), 1), '');

            $email = $this->normalizeString($this->readCell($normalizedRow, $columnIndexes['user_email'] ?? null));
            $projectLabel = $this->normalizeString($this->readCell($normalizedRow, $columnIndexes['project'] ?? null));
            $groupsCell = $this->readCell($normalizedRow, $columnIndexes['groups'] ?? null);
            $groupNames = $this->splitGroupNames($groupsCell);

            $userResolution = $this->resolveUserMapping($email, $this->sourceSystem);
            $projectResolution = $this->resolveProjectMapping($projectLabel, $this->sourceSystem);

            if ($userResolution['source_value'] !== '') {
                $summary['users'][$userResolution['source_value']] = $userResolution;
            }
            if ($projectResolution['source_value'] !== '') {
                $summary['projects'][$projectResolution['source_value']] = $projectResolution;
            }

            foreach ($groupNames as $groupName) {
                $groupResolution = $this->resolveGroupMapping($groupName, $this->sourceSystem);
                if ($groupResolution['source_value'] !== '') {
                    $summary['groups'][$groupResolution['source_value']] = $groupResolution;
                }

                if ($email !== '' && $groupName !== '') {
                    $userGroupPairs[$email."\0".$groupName] = array('email' => $email, 'group' => $groupName);
                }
            }

            if ($this->isBlockedRow($userResolution, $projectResolution)) {
                $summary['blocked_rows']++;
            } elseif ($this->isSkippedRow($userResolution, $projectResolution)) {
                $summary['skipped_rows']++;
            }
        }
        fclose($handle);

        foreach ($userGroupPairs as $pair) {
            $this->persistUserGroupLink($this->sourceSystem, $pair['email'], $pair['group'], $this->getCurrentUserId());
        }

        $summary['users'] = array_values($summary['users']);
        $summary['projects'] = array_values($summary['projects']);
        $summary['groups'] = array_values($summary['groups']);

        foreach ($summary['users'] as $userEntry) {
            if ($userEntry['target_action'] === 'matched') {
                $summary['stats']['matched_users']++;
            } elseif ($userEntry['target_action'] === 'create_pending') {
                $summary['stats']['pending_users']++;
            } elseif ($userEntry['target_action'] === 'ignored') {
                $summary['stats']['ignored_users']++;
            }
        }

        foreach ($summary['projects'] as $projectEntry) {
            if ($projectEntry['target_action'] === 'matched') {
                $summary['stats']['matched_projects']++;
            } elseif ($projectEntry['target_action'] === 'create_pending') {
                $summary['stats']['pending_projects']++;
            } elseif ($projectEntry['target_action'] === 'ignored') {
                $summary['stats']['ignored_projects']++;
            }
        }

        foreach ($summary['groups'] as $groupEntry) {
            if ($groupEntry['target_action'] === 'matched') {
                $summary['stats']['matched_groups']++;
            } elseif ($groupEntry['target_action'] === 'create_pending') {
                $summary['stats']['pending_groups']++;
            }
        }

        $summary['blocked_rows'] = (int) $summary['blocked_rows'];
        $summary['skipped_rows'] = (int) $summary['skipped_rows'];

        return $summary;
    }

    /**
     * Splits a CSV "Groupe" cell such as "HRM, IDARA, TBEE, TRAINING" into
     * trimmed, non-empty group names. Unlike user_email/project, a single
     * row can carry several group names at once.
     *
     * @param string $cell
     * @return string[]
     */
    protected function splitGroupNames($cell)
    {
        $names = array();
        foreach (explode(',', (string) $cell) as $piece) {
            $trimmed = $this->normalizeString($piece);
            if ($trimmed !== '') {
                $names[] = $trimmed;
            }
        }

        return array_values(array_unique($names));
    }

    protected function isBlockedRow(array $userResolution, array $projectResolution)
    {
        $userBlocked = !empty($userResolution['source_value']) && $userResolution['target_action'] === 'create_pending';
        $projectBlocked = !empty($projectResolution['source_value']) && $projectResolution['target_action'] === 'create_pending';
        return $userBlocked || $projectBlocked;
    }

    protected function isSkippedRow(array $userResolution, array $projectResolution)
    {
        $userEmptyOrIgnored = empty($userResolution['source_value']) || $userResolution['target_action'] === 'ignored';
        $projectEmptyOrIgnored = empty($projectResolution['source_value']) || $projectResolution['target_action'] === 'ignored';
        return !$this->isBlockedRow($userResolution, $projectResolution) && ($userEmptyOrIgnored || $projectEmptyOrIgnored);
    }

    /**
     * Load the Clockify CSV mapping configuration.
     *
     * @return array
     */
    public function loadConfig()
    {
        if (!is_readable($this->configPath)) {
            return array(
                'source' => $this->sourceSystem,
                'delimiter' => ',',
                'encoding' => 'UTF-8',
                'columns' => array(
                    'project' => 'Projet',
                    'client' => 'Client',
                    'groups' => 'Groupe',
                    'description' => 'Description',
                    'user_email' => 'Email',
                    'billable' => 'Facturable',
                    'date_start' => 'Date de début',
                    'time_start' => 'Heure de début',
                    'date_end' => 'Date de fin',
                    'time_end' => 'Heure de fin',
                    'duration_decimal' => 'Durée (décimal)',
                ),
                'billable_true_values' => array('Oui'),
                'date_format' => 'm/d/Y',
            );
        }

        $json = file_get_contents($this->configPath);
        if ($json === false) {
            throw new RuntimeException('Impossible de lire la configuration JSON de mapping.');
        }

        $data = json_decode($json, true);
        if (!is_array($data)) {
            throw new RuntimeException('Le fichier de configuration JSON est invalide.');
        }

        return $data;
    }

    protected function readCsvHeader($csvPath, $delimiter)
    {
        $handle = fopen($csvPath, 'r');
        if ($handle === false) {
            return array();
        }

        $header = fgetcsv($handle, 0, $delimiter);
        fclose($handle);

        if (!is_array($header)) {
            return array();
        }

        // Clockify/Windows exports sometimes start with a UTF-8 BOM. Strip it
        // before trimming to preserve exact matches with localized labels.
        if (isset($header[0]) && strncmp((string) $header[0], "\xEF\xBB\xBF", 3) === 0) {
            $header[0] = substr((string) $header[0], 3);
        }

        foreach ($header as $idx => $value) {
            $header[$idx] = $this->normalizeHeader($value);
        }

        return $header;
    }

    protected function normalizeHeader($value)
    {
        return trim((string) $value);
    }

    protected function mapHeadersToIndexes(array $headers, array $expectedColumns)
    {
        $indexes = array();

        foreach ($expectedColumns as $fieldName => $columnLabel) {
            $pos = array_search($columnLabel, $headers, true);
            if ($pos !== false) {
                $indexes[$fieldName] = (int) $pos;
            }
        }

        return $indexes;
    }

    protected function readCell(array $row, $index)
    {
        if ($index === null || !isset($row[(int) $index])) {
            return '';
        }
        return $row[(int) $index];
    }

    protected function normalizeString($value)
    {
        return trim((string) $value);
    }

    /**
     * Resolve or create a mapping entry for a user email.
     *
     * Writes only to llx_timeflow_import_mapping.
     *
     * @param string $email
     * @param string $sourceSystem
     * @return array
     */
    protected function resolveUserMapping($email, $sourceSystem)
    {
        $sourceValue = $this->normalizeString($email);
        if ($sourceValue === '') {
            return array(
                'mapping_type' => 'user',
                'source_system' => $sourceSystem,
                'source_value' => '',
                'target_id' => null,
                'target_action' => 'ignored',
                'status' => 'ignored',
                'new_label' => null,
            );
        }

        $existing = $this->getExistingMapping($sourceSystem, 'user', $sourceValue);
        if (!empty($existing)) {
            return array(
                'mapping_type' => 'user',
                'source_system' => $sourceSystem,
                'source_value' => $existing['source_value'],
                'target_id' => $existing['target_id'],
                'target_action' => $existing['target_action'],
                'status' => $existing['target_action'],
                'new_label' => $existing['new_label'],
            );
        }

        $targetId = $this->findDolibarrUserByEmail($sourceValue);
        $targetAction = $targetId > 0 ? 'matched' : 'create_pending';

        $persisted = $this->persistMapping(
            $sourceSystem,
            'user',
            $sourceValue,
            $targetId > 0 ? (int) $targetId : null,
            $targetAction,
            $this->getCurrentUserId()
        );

        if (!empty($persisted)) {
            return array(
                'mapping_type' => 'user',
                'source_system' => $sourceSystem,
                'source_value' => $persisted['source_value'],
                'target_id' => $persisted['target_id'],
                'target_action' => $persisted['target_action'],
                'status' => $persisted['target_action'],
                'new_label' => null,
            );
        }

        return array(
            'mapping_type' => 'user',
            'source_system' => $sourceSystem,
            'source_value' => $sourceValue,
            'target_id' => $targetId > 0 ? (int) $targetId : null,
            'target_action' => $targetAction,
            'status' => $targetAction,
            'new_label' => null,
        );
    }

    /**
     * Resolve or create a mapping entry for a project label.
     *
     * Writes only to llx_timeflow_import_mapping.
     *
     * @param string $projectLabel
     * @param string $sourceSystem
     * @return array
     */
    protected function resolveProjectMapping($projectLabel, $sourceSystem)
    {
        $sourceValue = $this->normalizeString($projectLabel);
        if ($sourceValue === '') {
            return array(
                'mapping_type' => 'project',
                'source_system' => $sourceSystem,
                'source_value' => '',
                'target_id' => null,
                'target_action' => 'ignored',
                'status' => 'ignored',
                'new_label' => null,
            );
        }

        $existing = $this->getExistingMapping($sourceSystem, 'project', $sourceValue);
        if (!empty($existing)) {
            return array(
                'mapping_type' => 'project',
                'source_system' => $sourceSystem,
                'source_value' => $existing['source_value'],
                'target_id' => $existing['target_id'],
                'target_action' => $existing['target_action'],
                'status' => $existing['target_action'],
                'new_label' => $existing['new_label'],
            );
        }

        $targetId = $this->findTimeflowProjectByRefOrTitle($sourceValue);
        $targetAction = $targetId > 0 ? 'matched' : 'create_pending';

        $persisted = $this->persistMapping(
            $sourceSystem,
            'project',
            $sourceValue,
            $targetId > 0 ? (int) $targetId : null,
            $targetAction,
            $this->getCurrentUserId()
        );

        if (!empty($persisted)) {
            return array(
                'mapping_type' => 'project',
                'source_system' => $sourceSystem,
                'source_value' => $persisted['source_value'],
                'target_id' => $persisted['target_id'],
                'target_action' => $persisted['target_action'],
                'status' => $persisted['target_action'],
                'new_label' => null,
            );
        }

        return array(
            'mapping_type' => 'project',
            'source_system' => $sourceSystem,
            'source_value' => $sourceValue,
            'target_id' => $targetId > 0 ? (int) $targetId : null,
            'target_action' => $targetAction,
            'status' => $targetAction,
            'new_label' => null,
        );
    }

    /**
     * Resolve or create a mapping entry for a Clockify group name against
     * llx_usergroup. Writes only to llx_timeflow_import_mapping — never to
     * llx_usergroup itself.
     *
     * @param string $groupName
     * @param string $sourceSystem
     * @return array
     */
    protected function resolveGroupMapping($groupName, $sourceSystem)
    {
        $sourceValue = $this->normalizeString($groupName);
        if ($sourceValue === '') {
            return array(
                'mapping_type' => 'group',
                'source_system' => $sourceSystem,
                'source_value' => '',
                'target_id' => null,
                'target_action' => 'ignored',
                'status' => 'ignored',
                'new_label' => null,
            );
        }

        $existing = $this->getExistingMapping($sourceSystem, 'group', $sourceValue);
        if (!empty($existing)) {
            return array(
                'mapping_type' => 'group',
                'source_system' => $sourceSystem,
                'source_value' => $existing['source_value'],
                'target_id' => $existing['target_id'],
                'target_action' => $existing['target_action'],
                'status' => $existing['target_action'],
                'new_label' => $existing['new_label'],
            );
        }

        $targetId = $this->findUserGroupByName($sourceValue);
        $targetAction = $targetId > 0 ? 'matched' : 'create_pending';

        $persisted = $this->persistMapping(
            $sourceSystem,
            'group',
            $sourceValue,
            $targetId > 0 ? (int) $targetId : null,
            $targetAction,
            $this->getCurrentUserId()
        );

        if (!empty($persisted)) {
            return array(
                'mapping_type' => 'group',
                'source_system' => $sourceSystem,
                'source_value' => $persisted['source_value'],
                'target_id' => $persisted['target_id'],
                'target_action' => $persisted['target_action'],
                'status' => $persisted['target_action'],
                'new_label' => null,
            );
        }

        return array(
            'mapping_type' => 'group',
            'source_system' => $sourceSystem,
            'source_value' => $sourceValue,
            'target_id' => $targetId > 0 ? (int) $targetId : null,
            'target_action' => $targetAction,
            'status' => $targetAction,
            'new_label' => null,
        );
    }

    protected function getExistingMapping($sourceSystem, $mappingType, $sourceValue)
    {
        $sourceSystem = trim((string) $sourceSystem);
        $mappingType = trim((string) $mappingType);
        $sourceValue = trim((string) $sourceValue);

        $sql = 'SELECT rowid, source_system, mapping_type, source_value, target_id, target_action, new_label';
        $sql .= ' FROM '.$this->db->prefix().'timeflow_import_mapping';
        $sql .= ' WHERE source_system = \''.$this->db->escape($sourceSystem).'\'';
        $sql .= ' AND mapping_type = \''.$this->db->escape($mappingType).'\'';
        $sql .= ' AND source_value = \''.$this->db->escape($sourceValue).'\'';
        $sql .= ' LIMIT 1';

        $res = $this->db->query($sql);
        if (!$res) {
            return array();
        }

        $obj = $this->db->fetch_object($res);
        if (!$obj) {
            return array();
        }

        return array(
            'rowid' => (int) $obj->rowid,
            'source_system' => (string) $obj->source_system,
            'mapping_type' => (string) $obj->mapping_type,
            'source_value' => (string) $obj->source_value,
            'target_id' => $obj->target_id !== null ? (int) $obj->target_id : null,
            'new_label' => $obj->new_label !== null && $obj->new_label !== '' ? (string) $obj->new_label : null,
            'target_action' => (string) $obj->target_action,
        );
    }

    protected function persistMapping($sourceSystem, $mappingType, $sourceValue, $targetId, $targetAction, $userId)
    {
        global $conf;

        $sourceSystem = trim((string) $sourceSystem);
        $mappingType = trim((string) $mappingType);
        $sourceValue = trim((string) $sourceValue);
        $targetAction = in_array($targetAction, array('matched', 'create_pending', 'ignored'), true) ? $targetAction : 'create_pending';

        $now = dol_now();
        $sql = 'INSERT INTO '.$this->db->prefix().'timeflow_import_mapping';
        $sql .= ' (entity, source_system, mapping_type, source_value, target_id, target_action, date_creation, fk_user_creat)';
        $sql .= ' VALUES (';
        $sql .= (int) ($conf->entity ?? 1).', ';
        $sql .= '\''.$this->db->escape($sourceSystem).'\', ';
        $sql .= '\''.$this->db->escape($mappingType).'\', ';
        $sql .= '\''.$this->db->escape($sourceValue).'\', ';
        $sql .= ($targetId === null ? 'NULL' : (int) $targetId).', ';
        $sql .= '\''.$this->db->escape($targetAction).'\', ';
        $sql .= '\''.$this->db->idate($now).'\', ';
        $sql .= (int) $userId;
        $sql .= ')';

        $result = $this->db->query($sql);
        if (!$result) {
            $error = $this->db->lasterror();
            if (preg_match('/(Duplicate entry|1062|23000)/i', $error)) {
                $existing = $this->getExistingMapping($sourceSystem, $mappingType, $sourceValue);
                if (!empty($existing)) {
                    return $existing;
                }
            }

            throw new RuntimeException('Erreur SQL lors de la persistance du mapping '.$mappingType.' pour '.$sourceSystem.': '.$error);
        }

        return array(
            'rowid' => (int) $this->db->last_insert_id($this->db->prefix().'timeflow_import_mapping'),
            'source_system' => $sourceSystem,
            'mapping_type' => $mappingType,
            'source_value' => $sourceValue,
            'target_id' => $targetId !== null ? (int) $targetId : null,
            'target_action' => $targetAction,
        );
    }

    protected function findDolibarrUserByEmail($email)
    {
        $email = trim((string) $email);
        if ($email === '') {
            return 0;
        }

        $user = new User($this->db);
        $result = $user->fetch(0, '', '', $email);
        if ($result > 0 && !empty($user->id)) {
            return (int) $user->id;
        }

        $sql = 'SELECT rowid';
        $sql .= ' FROM '.$this->db->prefix().'user';
        $sql .= ' WHERE email = \''.$this->db->escape($email).'\'';
        $sql .= ' AND entity IN ('.getEntity('user').')';
        $sql .= ' ORDER BY rowid ASC LIMIT 1';

        $res = $this->db->query($sql);
        if (!$res) {
            return 0;
        }

        $obj = $this->db->fetch_object($res);
        return $obj ? (int) $obj->rowid : 0;
    }

    protected function findTimeflowProjectByRefOrTitle($projectLabel)
    {
        $projectLabel = trim((string) $projectLabel);
        if ($projectLabel === '') {
            return 0;
        }

        $sql = 'SELECT rowid';
        $sql .= ' FROM '.$this->db->prefix().'timeflow_project';
        $sql .= ' WHERE entity IN ('.getEntity('timeflow_project').')';
        $sql .= ' AND (LOWER(ref) = LOWER(\''.$this->db->escape($projectLabel).'\') OR LOWER(title) = LOWER(\''.$this->db->escape($projectLabel).'\'))';
        $sql .= ' LIMIT 1';

        $res = $this->db->query($sql);
        if (!$res) {
            return 0;
        }

        $obj = $this->db->fetch_object($res);
        return $obj ? (int) $obj->rowid : 0;
    }

    protected function findUserGroupByName($groupName)
    {
        $groupName = trim((string) $groupName);
        if ($groupName === '') {
            return 0;
        }

        $sql = 'SELECT rowid';
        $sql .= ' FROM '.$this->db->prefix().'usergroup';
        $sql .= ' WHERE entity IN ('.getEntity('usergroup').')';
        $sql .= ' AND LOWER(nom) = LOWER(\''.$this->db->escape($groupName).'\')';
        $sql .= ' LIMIT 1';

        $res = $this->db->query($sql);
        if (!$res) {
            return 0;
        }

        $obj = $this->db->fetch_object($res);
        return $obj ? (int) $obj->rowid : 0;
    }

    /**
     * Records a (user, group) association found in the CSV, so the real
     * import step can later create the matching llx_usergroup_user row
     * once both sides of the mapping are resolved. Never writes to
     * llx_usergroup_user itself.
     */
    protected function persistUserGroupLink($sourceSystem, $userEmail, $groupName, $userId)
    {
        global $conf;

        $sourceSystem = trim((string) $sourceSystem);
        $userEmail = trim((string) $userEmail);
        $groupName = trim((string) $groupName);
        if ($userEmail === '' || $groupName === '') {
            return false;
        }

        $now = dol_now();
        $sql = 'INSERT INTO '.$this->db->prefix().'timeflow_import_user_group_link';
        $sql .= ' (entity, source_system, user_source_value, group_source_value, date_creation, fk_user_creat)';
        $sql .= ' VALUES (';
        $sql .= (int) ($conf->entity ?? 1).', ';
        $sql .= '\''.$this->db->escape($sourceSystem).'\', ';
        $sql .= '\''.$this->db->escape($userEmail).'\', ';
        $sql .= '\''.$this->db->escape($groupName).'\', ';
        $sql .= '\''.$this->db->idate($now).'\', ';
        $sql .= (int) $userId;
        $sql .= ')';

        $result = $this->db->query($sql);
        if (!$result) {
            $error = $this->db->lasterror();
            if (preg_match('/(Duplicate entry|1062|23000)/i', $error)) {
                // Already recorded for this import — not an error.
                return true;
            }

            throw new RuntimeException('Erreur SQL lors de l’enregistrement de l’association utilisateur/groupe pour « '.$userEmail.' » / « '.$groupName.' » : '.$error);
        }

        return true;
    }

    protected function getCurrentUserId()
    {
        global $user;
        return !empty($user->id) ? (int) $user->id : 0;
    }

    /**
     * Apply a batch of mapping resolution decisions.
     *
     * This never creates a Dolibarr user account, and never inserts a row
     * into llx_timeflow_project: a 'create_new' decision on a project only
     * records the confirmed title against the mapping row (target_id stays
     * NULL, target_action becomes 'create_confirmed'). The actual project
     * row is created later, at the real import step. Every decision is
     * validated before any write happens, so a single invalid decision
     * rejects the whole batch instead of leaving a partially-applied state.
     *
     * @param array $decisions Each item: mapping_type, source_value,
     *                         resolution ('matched'|'create_new'),
     *                         target_id (required if matched),
     *                         new_title (optional if create_new, defaults
     *                         to source_value).
     * @return array Updated mapping rows, one per decision.
     */
    public function resolveMappingDecisions(array $decisions)
    {
        if (empty($decisions)) {
            throw new InvalidArgumentException('Aucune décision de résolution fournie.');
        }

        $normalized = array();
        foreach ($decisions as $index => $decision) {
            if (!is_array($decision)) {
                throw new InvalidArgumentException('Décision invalide à l’index '.$index.'.');
            }

            $mappingType = trim((string) ($decision['mapping_type'] ?? ''));
            if (!in_array($mappingType, array('user', 'project', 'group'), true)) {
                throw new InvalidArgumentException('Type de mapping invalide à l’index '.$index.' : "'.$mappingType.'".');
            }

            $sourceValue = trim((string) ($decision['source_value'] ?? ''));
            if ($sourceValue === '') {
                throw new InvalidArgumentException('Valeur source manquante à l’index '.$index.'.');
            }

            $resolution = trim((string) ($decision['resolution'] ?? ''));
            if (!in_array($resolution, array('matched', 'create_new'), true)) {
                throw new InvalidArgumentException('Résolution invalide à l’index '.$index.' : "'.$resolution.'".');
            }

            // We never create Dolibarr user accounts automatically from an
            // import: a Clockify email with no Dolibarr match must be
            // associated with an existing user, never auto-provisioned.
            if ($resolution === 'create_new' && $mappingType === 'user') {
                throw new InvalidArgumentException('La création automatique d’un compte utilisateur n’est pas autorisée. Associez « '.$sourceValue.' » à un utilisateur Dolibarr existant.');
            }

            $targetId = null;
            $newLabel = null;

            if ($resolution === 'matched') {
                $targetId = isset($decision['target_id']) ? (int) $decision['target_id'] : 0;
                if ($targetId <= 0) {
                    throw new InvalidArgumentException('Identifiant cible manquant pour « '.$sourceValue.' ».');
                }
                if ($mappingType === 'user' && !$this->userExistsAndActive($targetId)) {
                    throw new InvalidArgumentException('Utilisateur Dolibarr introuvable ou inactif pour « '.$sourceValue.' ».');
                }
                if ($mappingType === 'project' && !$this->timeflowProjectExists($targetId)) {
                    throw new InvalidArgumentException('Projet TimeFlow introuvable pour « '.$sourceValue.' ».');
                }
                if ($mappingType === 'group' && !$this->usergroupExists($targetId)) {
                    throw new InvalidArgumentException('Groupe Dolibarr introuvable pour « '.$sourceValue.' ».');
                }
            } else {
                // Auto-creating a group is allowed (no password/account
                // implication), unlike a user — only 'user' is rejected above.
                $newLabel = trim((string) ($decision['new_title'] ?? $sourceValue));
                if ($newLabel === '') {
                    throw new InvalidArgumentException('Nom manquant pour la création de « '.$sourceValue.' ».');
                }
            }

            $normalized[] = array(
                'mapping_type' => $mappingType,
                'source_value' => $sourceValue,
                'resolution' => $resolution,
                'target_id' => $targetId,
                'new_label' => $newLabel,
            );
        }

        $updated = array();
        foreach ($normalized as $decision) {
            $targetAction = $decision['resolution'] === 'matched' ? 'matched' : 'create_confirmed';

            $sql = 'UPDATE '.$this->db->prefix().'timeflow_import_mapping SET';
            $sql .= ' target_id = '.($decision['target_id'] !== null ? (int) $decision['target_id'] : 'NULL').',';
            $sql .= ' target_action = \''.$this->db->escape($targetAction).'\',';
            $sql .= ' new_label = '.($decision['new_label'] !== null ? '\''.$this->db->escape($decision['new_label']).'\'' : 'NULL');
            $sql .= ' WHERE source_system = \''.$this->db->escape($this->sourceSystem).'\'';
            $sql .= ' AND mapping_type = \''.$this->db->escape($decision['mapping_type']).'\'';
            $sql .= ' AND source_value = \''.$this->db->escape($decision['source_value']).'\'';

            $result = $this->db->query($sql);
            if (!$result) {
                throw new RuntimeException('Erreur SQL lors de la mise à jour du mapping pour « '.$decision['source_value'].' » : '.$this->db->lasterror());
            }

            $existing = $this->getExistingMapping($this->sourceSystem, $decision['mapping_type'], $decision['source_value']);
            if (empty($existing)) {
                throw new RuntimeException('Mapping introuvable pour « '.$decision['source_value'].' ». Relancez la prévisualisation du fichier.');
            }

            $updated[] = array(
                'mapping_type' => $existing['mapping_type'],
                'source_system' => $this->sourceSystem,
                'source_value' => $existing['source_value'],
                'target_id' => $existing['target_id'],
                'target_action' => $existing['target_action'],
                'status' => $existing['target_action'],
                'new_label' => $existing['new_label'],
            );
        }

        return $updated;
    }

    protected function userExistsAndActive($userId)
    {
        $userId = (int) $userId;
        if ($userId <= 0) {
            return false;
        }

        $sql = 'SELECT rowid FROM '.$this->db->prefix().'user';
        $sql .= ' WHERE rowid = '.$userId;
        $sql .= ' AND statut = 1';
        $sql .= ' AND entity IN ('.getEntity('user').')';

        $res = $this->db->query($sql);
        return $res && $this->db->num_rows($res) > 0;
    }

    protected function timeflowProjectExists($projectId)
    {
        $projectId = (int) $projectId;
        if ($projectId <= 0) {
            return false;
        }

        $sql = 'SELECT rowid FROM '.$this->db->prefix().'timeflow_project';
        $sql .= ' WHERE rowid = '.$projectId;
        $sql .= ' AND entity IN ('.getEntity('timeflow_project').')';

        $res = $this->db->query($sql);
        return $res && $this->db->num_rows($res) > 0;
    }

    protected function usergroupExists($groupId)
    {
        $groupId = (int) $groupId;
        if ($groupId <= 0) {
            return false;
        }

        $sql = 'SELECT rowid FROM '.$this->db->prefix().'usergroup';
        $sql .= ' WHERE rowid = '.$groupId;
        $sql .= ' AND entity IN ('.getEntity('usergroup').')';

        $res = $this->db->query($sql);
        return $res && $this->db->num_rows($res) > 0;
    }
}
