<?php
/* Copyright (C) 2026 SuperAdmin - TimeFlow Import */

require_once DOL_DOCUMENT_ROOT.'/user/class/user.class.php';
require_once DOL_DOCUMENT_ROOT.'/user/class/usergroup.class.php';
require_once DOL_DOCUMENT_ROOT.'/projet/class/project.class.php';
require_once DOL_DOCUMENT_ROOT.'/societe/class/societe.class.php';
dol_include_once('/timeflow/class/timeentry.class.php');

/**
 * Clockify CSV preview/import mapping helper, and — once the user has
 * resolved every ambiguous mapping — the executor that turns those
 * decisions into real Dolibarr data (executeImportFromUploadedFile()).
 *
 * Preview/mapping resolution (previewFromUploadedFile,
 * resolveMappingDecisions, called from previewClockifyImport /
 * resolveClockifyMapping) only ever writes to llx_timeflow_import_mapping /
 * llx_timeflow_import_user_group_link — never to llx_projet, llx_usergroup,
 * llx_user or llx_timeflow_timeentry. Execution (executeImportFromUploadedFile,
 * called from the separate executeClockifyImport action) is the only code
 * path in this class that creates real entities, and it does so strictly
 * from mapping rows the user already confirmed (target_action='create_confirmed'
 * for projects/groups) or already matched to an existing record — see
 * createConfirmedProjectsAndGroups() below for why a llx_user row can never
 * be created from this flow, structurally, not just by convention.
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
            'clients' => array(),
            'stats' => array(
                'matched_users' => 0,
                'pending_users' => 0,
                'ignored_users' => 0,
                'matched_projects' => 0,
                'pending_projects' => 0,
                'ignored_projects' => 0,
                'matched_groups' => 0,
                'pending_groups' => 0,
                'matched_clients' => 0,
                'pending_clients' => 0,
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
        // Same idea for "project|client" — a project belongs to one client
        // in Clockify, so in practice every row for a given project should
        // agree, but we don't assume that: the link table just records
        // whatever pairs were seen, deduplicated by the UNIQUE constraint.
        $projectClientPairs = array();
        // Same idea for "project|user" — grants project access (native
        // PROJECTCONTRIBUTOR contact) to exactly the users the CSV rows
        // name for that project, never anything wider (e.g. never expanded
        // through a group's other members).
        $userProjectPairs = array();

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
            $clientLabel = $this->normalizeString($this->readCell($normalizedRow, $columnIndexes['client'] ?? null));
            $groupsCell = $this->readCell($normalizedRow, $columnIndexes['groups'] ?? null);
            $groupNames = $this->splitGroupNames($groupsCell);

            $userResolution = $this->resolveUserMapping($email, $this->sourceSystem);
            $projectResolution = $this->resolveProjectMapping($projectLabel, $this->sourceSystem);
            $clientResolution = $this->resolveClientMapping($clientLabel, $this->sourceSystem);

            if ($userResolution['source_value'] !== '') {
                $summary['users'][$userResolution['source_value']] = $userResolution;
            }
            if ($projectResolution['source_value'] !== '') {
                $summary['projects'][$projectResolution['source_value']] = $projectResolution;
            }
            if ($clientResolution['source_value'] !== '') {
                $summary['clients'][$clientResolution['source_value']] = $clientResolution;
            }

            if ($projectLabel !== '' && $clientLabel !== '') {
                $projectClientPairs[$projectLabel."\0".$clientLabel] = array('project' => $projectLabel, 'client' => $clientLabel);
            }

            if ($email !== '' && $projectLabel !== '') {
                $userProjectPairs[$projectLabel."\0".$email] = array('project' => $projectLabel, 'email' => $email);
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

        foreach ($projectClientPairs as $pair) {
            $this->persistProjectClientLink($this->sourceSystem, $pair['project'], $pair['client'], $this->getCurrentUserId());
        }

        foreach ($userProjectPairs as $pair) {
            $this->persistProjectUserLink($this->sourceSystem, $pair['project'], $pair['email'], $this->getCurrentUserId());
        }

        $summary['users'] = array_values($summary['users']);
        $summary['projects'] = array_values($summary['projects']);
        $summary['groups'] = array_values($summary['groups']);
        $summary['clients'] = array_values($summary['clients']);

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

        foreach ($summary['clients'] as $clientEntry) {
            if ($clientEntry['target_action'] === 'matched') {
                $summary['stats']['matched_clients']++;
            } elseif ($clientEntry['target_action'] === 'create_pending') {
                $summary['stats']['pending_clients']++;
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

        // Projects live in the native llx_projet table (TimeFlow -> native
        // project migration) — llx_timeflow_project is kept read-only as a
        // pre-migration backup, no longer written to.
        $sql = 'SELECT rowid';
        $sql .= ' FROM '.$this->db->prefix().'projet';
        $sql .= ' WHERE entity IN ('.getEntity('project').')';
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

    protected function findSocieteByName($clientName)
    {
        $clientName = trim((string) $clientName);
        if ($clientName === '') {
            return 0;
        }

        $sql = 'SELECT rowid';
        $sql .= ' FROM '.$this->db->prefix().'societe';
        $sql .= ' WHERE entity IN ('.getEntity('societe').')';
        $sql .= ' AND LOWER(nom) = LOWER(\''.$this->db->escape($clientName).'\')';
        $sql .= ' LIMIT 1';

        $res = $this->db->query($sql);
        if (!$res) {
            return 0;
        }

        $obj = $this->db->fetch_object($res);
        return $obj ? (int) $obj->rowid : 0;
    }

    /**
     * Resolve or create a mapping entry for a Clockify client name against
     * llx_societe. Writes only to llx_timeflow_import_mapping — never to
     * llx_societe itself. Matching is trim + case-insensitive exact match,
     * same tolerance as resolveProjectMapping()/resolveGroupMapping().
     *
     * @param string $clientName
     * @param string $sourceSystem
     * @return array
     */
    protected function resolveClientMapping($clientName, $sourceSystem)
    {
        $sourceValue = $this->normalizeString($clientName);
        if ($sourceValue === '') {
            return array(
                'mapping_type' => 'client',
                'source_system' => $sourceSystem,
                'source_value' => '',
                'target_id' => null,
                'target_action' => 'ignored',
                'status' => 'ignored',
                'new_label' => null,
            );
        }

        $existing = $this->getExistingMapping($sourceSystem, 'client', $sourceValue);
        if (!empty($existing)) {
            return array(
                'mapping_type' => 'client',
                'source_system' => $sourceSystem,
                'source_value' => $existing['source_value'],
                'target_id' => $existing['target_id'],
                'target_action' => $existing['target_action'],
                'status' => $existing['target_action'],
                'new_label' => $existing['new_label'],
            );
        }

        $targetId = $this->findSocieteByName($sourceValue);
        $targetAction = $targetId > 0 ? 'matched' : 'create_pending';

        $persisted = $this->persistMapping(
            $sourceSystem,
            'client',
            $sourceValue,
            $targetId > 0 ? (int) $targetId : null,
            $targetAction,
            $this->getCurrentUserId()
        );

        if (!empty($persisted)) {
            return array(
                'mapping_type' => 'client',
                'source_system' => $sourceSystem,
                'source_value' => $persisted['source_value'],
                'target_id' => $persisted['target_id'],
                'target_action' => $persisted['target_action'],
                'status' => $persisted['target_action'],
                'new_label' => null,
            );
        }

        return array(
            'mapping_type' => 'client',
            'source_system' => $sourceSystem,
            'source_value' => $sourceValue,
            'target_id' => $targetId > 0 ? (int) $targetId : null,
            'target_action' => $targetAction,
            'status' => $targetAction,
            'new_label' => null,
        );
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

    /**
     * Records a (project, client) association found in the CSV, so the real
     * import step can later set llx_projet.fk_soc once both sides of the
     * mapping are resolved. Never writes to llx_projet itself.
     */
    protected function persistProjectClientLink($sourceSystem, $projectLabel, $clientName, $userId)
    {
        global $conf;

        $sourceSystem = trim((string) $sourceSystem);
        $projectLabel = trim((string) $projectLabel);
        $clientName = trim((string) $clientName);
        if ($projectLabel === '' || $clientName === '') {
            return false;
        }

        $now = dol_now();
        $sql = 'INSERT INTO '.$this->db->prefix().'timeflow_import_project_client_link';
        $sql .= ' (entity, source_system, project_source_value, client_source_value, date_creation, fk_user_creat)';
        $sql .= ' VALUES (';
        $sql .= (int) ($conf->entity ?? 1).', ';
        $sql .= '\''.$this->db->escape($sourceSystem).'\', ';
        $sql .= '\''.$this->db->escape($projectLabel).'\', ';
        $sql .= '\''.$this->db->escape($clientName).'\', ';
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

            throw new RuntimeException('Erreur SQL lors de l’enregistrement de l’association projet/client pour « '.$projectLabel.' » / « '.$clientName.' » : '.$error);
        }

        return true;
    }

    /**
     * Records a (project, user) association found in the CSV, so the real
     * import step can later grant project access via the native contact
     * mechanism (Project::add_contact()) once both sides of the mapping
     * are resolved. Never writes to llx_element_contact itself.
     */
    protected function persistProjectUserLink($sourceSystem, $projectLabel, $userEmail, $userId)
    {
        global $conf;

        $sourceSystem = trim((string) $sourceSystem);
        $projectLabel = trim((string) $projectLabel);
        $userEmail = trim((string) $userEmail);
        if ($projectLabel === '' || $userEmail === '') {
            return false;
        }

        $now = dol_now();
        $sql = 'INSERT INTO '.$this->db->prefix().'timeflow_import_project_user_link';
        $sql .= ' (entity, source_system, project_source_value, user_source_value, date_creation, fk_user_creat)';
        $sql .= ' VALUES (';
        $sql .= (int) ($conf->entity ?? 1).', ';
        $sql .= '\''.$this->db->escape($sourceSystem).'\', ';
        $sql .= '\''.$this->db->escape($projectLabel).'\', ';
        $sql .= '\''.$this->db->escape($userEmail).'\', ';
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

            throw new RuntimeException('Erreur SQL lors de l’enregistrement de l’association projet/utilisateur pour « '.$projectLabel.' » / « '.$userEmail.' » : '.$error);
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
     * This never creates a Dolibarr user account, and never inserts a
     * project row: a 'create_new' decision on a project only
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
            if (!in_array($mappingType, array('user', 'project', 'group', 'client'), true)) {
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
                if ($mappingType === 'client' && !$this->societeExists($targetId)) {
                    throw new InvalidArgumentException('Client Dolibarr introuvable pour « '.$sourceValue.' ».');
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

        $sql = 'SELECT rowid FROM '.$this->db->prefix().'projet';
        $sql .= ' WHERE rowid = '.$projectId;
        $sql .= ' AND entity IN ('.getEntity('project').')';

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

    protected function societeExists($societeId)
    {
        $societeId = (int) $societeId;
        if ($societeId <= 0) {
            return false;
        }

        $sql = 'SELECT rowid FROM '.$this->db->prefix().'societe';
        $sql .= ' WHERE rowid = '.$societeId;
        $sql .= ' AND entity IN ('.getEntity('societe').')';

        $res = $this->db->query($sql);
        return $res && $this->db->num_rows($res) > 0;
    }

    // -----------------------------------------------------------------
    // Execution — everything below this point may write to llx_projet,
    // llx_usergroup, llx_usergroup_user and llx_timeflow_timeentry.
    // -----------------------------------------------------------------

    /**
     * Project/group/client mapping rows that are still waiting on a user
     * decision. The caller must refuse to run the import while this is
     * non-empty — running anyway would mean guessing what the user wants
     * for elements they were never asked to confirm.
     *
     * @return string[] e.g. ["project:TB-UNITED", "group:HRM", "client:ACME"]
     */
    protected function findPendingProjectAndGroupMappings()
    {
        $sql = 'SELECT mapping_type, source_value FROM '.$this->db->prefix().'timeflow_import_mapping';
        $sql .= " WHERE source_system = '".$this->db->escape($this->sourceSystem)."'";
        $sql .= " AND mapping_type IN ('project', 'group', 'client')";
        $sql .= " AND target_action = 'create_pending'";
        $sql .= ' ORDER BY mapping_type, source_value';

        $pending = array();
        $resql = $this->db->query($sql);
        if ($resql) {
            while ($obj = $this->db->fetch_object($resql)) {
                $pending[] = $obj->mapping_type.':'.$obj->source_value;
            }
        }
        return $pending;
    }

    /**
     * Records that a mapping row's "create automatically" decision was
     * actually carried out — target_id becomes the real new row's id,
     * target_action moves from 'create_confirmed' (intent) to 'created'
     * (done). Idempotent from the caller's point of view: a row already at
     * 'created' is simply never selected again by
     * createConfirmedProjectsAndGroups()'s WHERE clause.
     */
    protected function markMappingCreated($mappingRowId, $newTargetId)
    {
        $sql = 'UPDATE '.$this->db->prefix().'timeflow_import_mapping SET';
        $sql .= ' target_id = '.(int) $newTargetId.',';
        $sql .= " target_action = 'created'";
        $sql .= ' WHERE rowid = '.(int) $mappingRowId;
        $this->db->query($sql);
    }

    /**
     * Stable per-row dedup key so re-running the import on the same (or an
     * overlapping) CSV export never creates duplicate time entries — the
     * `import_key` column has existed on TimeEntry since the module was
     * built, but nothing ever populated it until now. Truncated to 14
     * chars to fit the column (varchar(14), inherited from Dolibarr's
     * usual import_key convention).
     */
    protected function computeImportKey($email, $projectSourceValue, $startTimestamp, $endTimestamp)
    {
        $raw = $this->sourceSystem.'|'.$email.'|'.$projectSourceValue.'|'.$startTimestamp.'|'.$endTimestamp;
        return substr(sha1($raw), 0, 14);
    }

    /**
     * Whether a time entry with this import_key was already created by a
     * previous run of this (or an overlapping) import.
     */
    protected function timeEntryAlreadyImported($importKey)
    {
        $sql = 'SELECT 1 FROM '.$this->db->prefix().'timeflow_timeentry';
        $sql .= " WHERE import_key = '".$this->db->escape($importKey)."'";
        $sql .= ' LIMIT 1';
        $resql = $this->db->query($sql);
        return $resql && $this->db->num_rows($resql) > 0;
    }

    /**
     * Creates every client mapping row still at 'create_confirmed'. Must
     * run before createConfirmedProjectsAndGroups(): a project row created
     * right after this one can look up its resolved client id via
     * llx_timeflow_import_project_client_link + this method's freshly
     * 'created' mapping rows.
     *
     * @param User  $user   Acting user — becomes fk_user_creat on the
     *                      created llx_societe rows.
     * @param array $report Accumulator, mutated in place: 'clients_created',
     *                      'errors'.
     */
    protected function createConfirmedClients(User $user, array &$report)
    {
        $sql = 'SELECT rowid, source_value, new_label';
        $sql .= ' FROM '.$this->db->prefix().'timeflow_import_mapping';
        $sql .= " WHERE source_system = '".$this->db->escape($this->sourceSystem)."'";
        $sql .= " AND mapping_type = 'client'";
        $sql .= " AND target_action = 'create_confirmed'";
        $sql .= ' ORDER BY rowid ASC';

        $resql = $this->db->query($sql);
        if (!$resql) {
            throw new RuntimeException('Erreur SQL lors de la lecture des clients à créer : '.$this->db->lasterror());
        }

        $rows = array();
        while ($obj = $this->db->fetch_object($resql)) {
            $rows[] = $obj;
        }

        foreach ($rows as $row) {
            $title = !empty($row->new_label) ? $row->new_label : $row->source_value;

            $societe = new Societe($this->db);
            $societe->name = $title;
            $societe->client = 1;
            $societe->code_client = '-1';

            $newId = $societe->create($user);
            if ($newId > 0) {
                $this->markMappingCreated($row->rowid, $newId);
                $report['clients_created'][] = array('source_value' => $row->source_value, 'id' => $newId, 'title' => $title);
            } else {
                $report['errors'][] = array(
                    'type' => 'client',
                    'source_value' => $row->source_value,
                    'message' => !empty($societe->errors) ? implode(' ', $societe->errors) : ($societe->error ?: 'Erreur inconnue à la création du client'),
                );
            }
        }
    }

    /**
     * Resolves the Dolibarr third-party id attached to a Clockify project,
     * via llx_timeflow_import_project_client_link. Returns 0 if the project
     * has no linked client in the CSV, or if that client's mapping isn't
     * resolved to a real llx_societe row (matched or just created).
     */
    protected function findResolvedClientIdForProject($projectSourceValue)
    {
        $sql = 'SELECT client_source_value';
        $sql .= ' FROM '.$this->db->prefix().'timeflow_import_project_client_link';
        $sql .= " WHERE source_system = '".$this->db->escape($this->sourceSystem)."'";
        $sql .= " AND project_source_value = '".$this->db->escape($projectSourceValue)."'";
        $sql .= ' LIMIT 1';

        $resql = $this->db->query($sql);
        if (!$resql) {
            return 0;
        }

        $obj = $this->db->fetch_object($resql);
        if (!$obj) {
            return 0;
        }

        $clientMapping = $this->getExistingMapping($this->sourceSystem, 'client', $obj->client_source_value);
        if (empty($clientMapping) || !in_array($clientMapping['target_action'], array('matched', 'created'), true)) {
            return 0;
        }

        return (int) $clientMapping['target_id'];
    }

    /**
     * Creates every project/group mapping row still at 'create_confirmed'
     * — never 'user': the WHERE clause below only ever selects
     * mapping_type IN ('project', 'group'), so there is no code path here
     * that can reach a llx_user INSERT, structurally, regardless of what
     * target_action a 'user' row might carry (and resolveMappingDecisions()
     * already refuses to ever set target_action='create_confirmed' on a
     * 'user' row in the first place — this is defense in depth on top of
     * that, not the only guard).
     *
     * @param User  $user   Acting user (importing admin) — becomes fk_user_creat
     *                      on the created llx_projet/llx_usergroup rows.
     * @param array $report Accumulator, mutated in place: 'projects_created',
     *                      'groups_created', 'errors'.
     */
    protected function createConfirmedProjectsAndGroups(User $user, array &$report)
    {
        global $conf;

        $sql = 'SELECT rowid, mapping_type, source_value, new_label';
        $sql .= ' FROM '.$this->db->prefix().'timeflow_import_mapping';
        $sql .= " WHERE source_system = '".$this->db->escape($this->sourceSystem)."'";
        $sql .= " AND mapping_type IN ('project', 'group')";
        $sql .= " AND target_action = 'create_confirmed'";
        $sql .= ' ORDER BY rowid ASC';

        $resql = $this->db->query($sql);
        if (!$resql) {
            throw new RuntimeException('Erreur SQL lors de la lecture des éléments à créer : '.$this->db->lasterror());
        }

        $rows = array();
        while ($obj = $this->db->fetch_object($resql)) {
            $rows[] = $obj;
        }

        foreach ($rows as $row) {
            $title = !empty($row->new_label) ? $row->new_label : $row->source_value;

            if ($row->mapping_type === 'project') {
                $project = new Project($this->db);
                // Suffixed with the mapping rowid: several projects can be
                // created in the same second within one batch, and CPJ-*
                // refs elsewhere in the module are only timestamp-based.
                $project->ref = 'CPJ-'.date('YmdHis').'-'.$row->rowid;
                $project->title = $title;
                $project->status = Project::STATUS_VALIDATED;
                $project->usage_task = 1;
                $project->array_options['options_timeflow_source'] = $this->sourceSystem;

                $resolvedClientId = $this->findResolvedClientIdForProject($row->source_value);
                if ($resolvedClientId > 0) {
                    $project->socid = $resolvedClientId;
                }

                $newId = $project->create($user);
                if ($newId > 0) {
                    $this->markMappingCreated($row->rowid, $newId);
                    $report['projects_created'][] = array('source_value' => $row->source_value, 'id' => $newId, 'title' => $title);
                } else {
                    $report['errors'][] = array(
                        'type' => 'project',
                        'source_value' => $row->source_value,
                        'message' => $project->error ?: 'Erreur inconnue à la création du projet',
                    );
                }
            } elseif ($row->mapping_type === 'group') {
                $group = new UserGroup($this->db);
                $group->nom = $title;
                $group->entity = (int) ($conf->entity ?? 1);

                $newId = $group->create();
                if ($newId > 0) {
                    $this->markMappingCreated($row->rowid, $newId);
                    $report['groups_created'][] = array('source_value' => $row->source_value, 'id' => $newId, 'title' => $title);
                } else {
                    $report['errors'][] = array(
                        'type' => 'group',
                        'source_value' => $row->source_value,
                        'message' => $group->error ?: 'Erreur inconnue à la création du groupe',
                    );
                }
            }
        }
    }

    /**
     * Applies every (user, group) pair recorded in
     * llx_timeflow_import_user_group_link — by this point
     * createConfirmedProjectsAndGroups() has already run, so a group that
     * was 'create_confirmed' now has a real target_id. A pair is applied
     * only if BOTH sides resolve to a real Dolibarr id: the user side must
     * be 'matched' (a user is never created by this flow), the group side
     * must be 'matched' or 'created'. Anything else is counted as skipped,
     * never silently dropped.
     *
     * User::SetInGroup() does its own DELETE-then-INSERT on
     * llx_usergroup_user, so calling it twice for the same pair (e.g. a
     * re-run of the import) is a safe no-op, not a duplicate.
     */
    protected function applyGroupMemberships(array &$report)
    {
        global $conf;

        $sql = 'SELECT user_source_value, group_source_value';
        $sql .= ' FROM '.$this->db->prefix().'timeflow_import_user_group_link';
        $sql .= " WHERE source_system = '".$this->db->escape($this->sourceSystem)."'";

        $resql = $this->db->query($sql);
        if (!$resql) {
            throw new RuntimeException('Erreur SQL lors de la lecture des associations utilisateur/groupe : '.$this->db->lasterror());
        }

        while ($obj = $this->db->fetch_object($resql)) {
            $userMapping = $this->getExistingMapping($this->sourceSystem, 'user', $obj->user_source_value);
            $groupMapping = $this->getExistingMapping($this->sourceSystem, 'group', $obj->group_source_value);

            $resolvedUserId = (!empty($userMapping) && $userMapping['target_action'] === 'matched')
                ? (int) $userMapping['target_id'] : 0;
            $resolvedGroupId = (!empty($groupMapping) && in_array($groupMapping['target_action'], array('matched', 'created'), true))
                ? (int) $groupMapping['target_id'] : 0;

            if ($resolvedUserId <= 0 || $resolvedGroupId <= 0) {
                $report['group_memberships_skipped']++;
                continue;
            }

            $targetUser = new User($this->db);
            if ($targetUser->fetch($resolvedUserId) <= 0) {
                $report['group_memberships_skipped']++;
                continue;
            }

            $result = $targetUser->SetInGroup($resolvedGroupId, (int) ($conf->entity ?? 1));
            if ($result > 0) {
                $report['group_memberships_created']++;
            } else {
                $report['group_memberships_skipped']++;
            }
        }
    }

    /**
     * Grants project access for every (project, user) pair recorded in
     * llx_timeflow_import_project_user_link, via the native project contact
     * mechanism (Project::add_contact(), role PROJECTCONTRIBUTOR/internal —
     * the same rule timeflowCanAccessProject()/timeflowFetchProjects()
     * consult). Deliberately project<->user only: Dolibarr's native contact
     * system has no group-level contact, and a CSV row never states
     * anything about a whole group's access, only about the one user on
     * that row — so nothing here is ever derived from group membership.
     *
     * A pair is applied only if BOTH sides resolve to a real Dolibarr id:
     * the user side must be 'matched' (a user is never created by this
     * flow), the project side must be 'matched' or 'created'. Anything else
     * is counted as skipped, never silently dropped.
     *
     * add_contact() does its own dedup (checks llx_element_contact before
     * inserting): returns 1 on creation, 0 if the contact already exists,
     * a negative code on error — so calling it twice for the same pair
     * (e.g. a re-run of the import, or a user already added manually) is a
     * safe no-op, never a duplicate.
     */
    protected function applyProjectContributors(array &$report)
    {
        $sql = 'SELECT project_source_value, user_source_value';
        $sql .= ' FROM '.$this->db->prefix().'timeflow_import_project_user_link';
        $sql .= " WHERE source_system = '".$this->db->escape($this->sourceSystem)."'";

        $resql = $this->db->query($sql);
        if (!$resql) {
            throw new RuntimeException('Erreur SQL lors de la lecture des associations projet/utilisateur : '.$this->db->lasterror());
        }

        $projectCache = array();

        while ($obj = $this->db->fetch_object($resql)) {
            $projectMapping = $this->getExistingMapping($this->sourceSystem, 'project', $obj->project_source_value);
            $userMapping = $this->getExistingMapping($this->sourceSystem, 'user', $obj->user_source_value);

            $resolvedProjectId = (!empty($projectMapping) && in_array($projectMapping['target_action'], array('matched', 'created'), true))
                ? (int) $projectMapping['target_id'] : 0;
            $resolvedUserId = (!empty($userMapping) && $userMapping['target_action'] === 'matched')
                ? (int) $userMapping['target_id'] : 0;

            if ($resolvedProjectId <= 0 || $resolvedUserId <= 0) {
                $report['project_contacts_skipped']++;
                continue;
            }

            if (!array_key_exists($resolvedProjectId, $projectCache)) {
                $project = new Project($this->db);
                $projectCache[$resolvedProjectId] = $project->fetch($resolvedProjectId) > 0 ? $project : null;
            }
            $project = $projectCache[$resolvedProjectId];
            if ($project === null) {
                $report['project_contacts_skipped']++;
                continue;
            }

            $result = $project->add_contact($resolvedUserId, 'PROJECTCONTRIBUTOR', 'internal', 1);
            if ($result > 0) {
                $report['project_contacts_created']++;
            } elseif ($result === 0) {
                // Already linked (previous run, or added manually) — not an error.
                $report['project_contacts_skipped']++;
            } else {
                $report['errors'][] = array(
                    'type' => 'project_contact',
                    'source_value' => $obj->project_source_value.' / '.$obj->user_source_value,
                    'message' => $project->error ?: 'Erreur inconnue lors du rattachement utilisateur/projet',
                );
            }
        }
    }

    /**
     * Best-effort profile completion for every 'matched' user, from the
     * CSV's "Email"/"Utilisateur" columns. Deliberately additive-only —
     * never overwrites data that's already on the native llx_user row:
     *
     *   - email: filled from the mapping's own source_value (the exact
     *     email that was used to match this user) ONLY if the native
     *     email field is currently empty. A pre-existing native email is
     *     never touched, even if it differs from the CSV's — that native
     *     value is trusted over the import (e.g. a real account whose
     *     native email uses a different domain than the CSV export).
     *   - firstname/lastname: split from the "Utilisateur" display name
     *     ONLY if that value contains a space (so a bare login like
     *     "bacem" is never mistaken for "Prénom Nom") AND firstname AND
     *     lastname are BOTH currently empty — a single already-filled
     *     field is enough to skip, since we can't know which of the two
     *     it corresponds to. Split on the first space: everything before
     *     is firstname, everything after (however many words) is lastname.
     *
     * Never touches login, password, or any other field — User::update()
     * is called right after a fresh fetch() with nothing else modified on
     * the object, so pass/pass_indatabase stay identical and no password
     * reset is triggered.
     */
    protected function enrichMatchedUsersFromCsv($csvPath, User $user, array &$report)
    {
        $config = $this->loadConfig();
        $delimiter = $config['delimiter'] ?? ',';
        $headerNames = $this->readCsvHeader($csvPath, $delimiter);
        if (empty($headerNames)) {
            return;
        }
        $columnIndexes = $this->mapHeadersToIndexes($headerNames, $config['columns'] ?? array());

        $displayNameByEmail = array();
        $handle = fopen($csvPath, 'r');
        if ($handle === false) {
            throw new RuntimeException('Impossible d’ouvrir le fichier CSV.');
        }
        $firstLine = true;
        while (($row = fgetcsv($handle, 0, $delimiter)) !== false) {
            if ($firstLine) {
                $firstLine = false;
                continue;
            }
            $normalizedRow = array_pad($row, max(count($headerNames), 1), '');
            $email = $this->normalizeString($this->readCell($normalizedRow, $columnIndexes['user_email'] ?? null));
            $displayName = $this->normalizeString($this->readCell($normalizedRow, $columnIndexes['user_display'] ?? null));
            if ($email !== '' && $displayName !== '' && !isset($displayNameByEmail[$email])) {
                $displayNameByEmail[$email] = $displayName;
            }
        }
        fclose($handle);

        $sql = 'SELECT DISTINCT source_value, target_id';
        $sql .= ' FROM '.$this->db->prefix().'timeflow_import_mapping';
        $sql .= " WHERE source_system = '".$this->db->escape($this->sourceSystem)."'";
        $sql .= " AND mapping_type = 'user'";
        $sql .= " AND target_action = 'matched'";

        $resql = $this->db->query($sql);
        if (!$resql) {
            throw new RuntimeException('Erreur SQL lors de la lecture des utilisateurs résolus : '.$this->db->lasterror());
        }

        $processedUserIds = array();
        while ($obj = $this->db->fetch_object($resql)) {
            $targetUserId = (int) $obj->target_id;
            if ($targetUserId <= 0 || isset($processedUserIds[$targetUserId])) {
                continue;
            }
            $processedUserIds[$targetUserId] = true;

            $targetUser = new User($this->db);
            if ($targetUser->fetch($targetUserId) <= 0) {
                continue;
            }

            $emailFilled = false;
            $nameFilled = false;

            if (trim((string) $targetUser->email) === '') {
                $targetUser->email = $obj->source_value;
                $emailFilled = true;
            }

            if (trim((string) $targetUser->firstname) === '' && trim((string) $targetUser->lastname) === '') {
                $displayName = $displayNameByEmail[$obj->source_value] ?? '';
                if (strpos($displayName, ' ') !== false) {
                    $parts = explode(' ', $displayName, 2);
                    $targetUser->firstname = trim($parts[0]);
                    $targetUser->lastname = trim($parts[1]);
                    $nameFilled = true;
                }
            }

            if (!$emailFilled && !$nameFilled) {
                continue;
            }

            $result = $targetUser->update($user);
            if ($result > 0) {
                if ($emailFilled) {
                    $report['user_emails_filled']++;
                }
                if ($nameFilled) {
                    $report['user_names_filled']++;
                }
            } else {
                $report['errors'][] = array(
                    'type' => 'user_enrichment',
                    'source_value' => $obj->source_value,
                    'message' => $targetUser->error ?: 'Erreur inconnue lors de la mise à jour de la fiche utilisateur',
                );
            }
        }
    }

    /**
     * Combines a date cell and a time cell into a unix timestamp. Tries
     * PHP's permissive strtotime() first (handles most real-world exports
     * without needing an exact format), then falls back to the CSV
     * config's declared date_format for a date-only value (midnight) —
     * there is no configured time_format, Clockify's own exports vary too
     * much to pin one down reliably.
     *
     * @return int|false
     */
    protected function parseCsvDateTime($dateCell, $timeCell, $dateFormat)
    {
        if ($dateCell === '') {
            return false;
        }

        $combined = trim($dateCell.' '.$timeCell);
        $timestamp = strtotime($combined);
        if ($timestamp !== false) {
            return $timestamp;
        }

        $dateOnly = DateTime::createFromFormat($dateFormat, $dateCell);
        if ($dateOnly !== false) {
            return $dateOnly->getTimestamp();
        }

        return false;
    }

    /**
     * Re-parses the same CSV a second time (the upload from preview is
     * gone by the time the user confirms — see the design note on
     * executeImportFromCsvPath()) and creates one draft TimeEntry per
     * eligible row.
     *
     * A row is eligible only if BOTH its user and its project already
     * resolve to a real Dolibarr id (user: 'matched' — never created by
     * this flow; project: 'matched' or 'created' by
     * createConfirmedProjectsAndGroups(), called before this method).
     * Every other outcome (empty cell, unresolved value, unparsable dates,
     * a time overlap, already imported, or a hard creation error) is
     * counted in a specific $report bucket and — beyond the empty-cell
     * case, which mirrors the preview's own "skipped" rule and is not a
     * problem — also logged in $report['unresolved_rows'] with the row
     * number and reason, so nothing is ever dropped without a trace.
     */
    protected function importTimeEntriesFromCsv($csvPath, User $user, array &$report)
    {
        $config = $this->loadConfig();
        $delimiter = $config['delimiter'] ?? ',';
        $headerNames = $this->readCsvHeader($csvPath, $delimiter);
        if (empty($headerNames)) {
            throw new RuntimeException('Le fichier CSV est vide ou sans en-tête.');
        }
        $columnIndexes = $this->mapHeadersToIndexes($headerNames, $config['columns'] ?? array());
        $dateFormat = $config['date_format'] ?? 'm/d/Y';
        $billableTrueValues = array_map(array($this, 'normalizeString'), $config['billable_true_values'] ?? array('Oui'));

        $handle = fopen($csvPath, 'r');
        if ($handle === false) {
            throw new RuntimeException('Impossible d’ouvrir le fichier CSV.');
        }

        $firstLine = true;
        $rowNumber = 1;
        while (($row = fgetcsv($handle, 0, $delimiter)) !== false) {
            if ($firstLine) {
                $firstLine = false;
                continue;
            }
            $rowNumber++;

            $normalizedRow = array_pad($row, max(count($headerNames), 1), '');

            $email = $this->normalizeString($this->readCell($normalizedRow, $columnIndexes['user_email'] ?? null));
            $projectLabel = $this->normalizeString($this->readCell($normalizedRow, $columnIndexes['project'] ?? null));
            $description = $this->normalizeString($this->readCell($normalizedRow, $columnIndexes['description'] ?? null));
            $billableCell = $this->normalizeString($this->readCell($normalizedRow, $columnIndexes['billable'] ?? null));
            $dateStartCell = $this->normalizeString($this->readCell($normalizedRow, $columnIndexes['date_start'] ?? null));
            $timeStartCell = $this->normalizeString($this->readCell($normalizedRow, $columnIndexes['time_start'] ?? null));
            $dateEndCell = $this->normalizeString($this->readCell($normalizedRow, $columnIndexes['date_end'] ?? null));
            $timeEndCell = $this->normalizeString($this->readCell($normalizedRow, $columnIndexes['time_end'] ?? null));
            $durationCell = $this->normalizeString($this->readCell($normalizedRow, $columnIndexes['duration_decimal'] ?? null));

            // Same "empty user or project => excluded, not an error" rule
            // the preview already applies (isSkippedRow()).
            if ($email === '' || $projectLabel === '') {
                $report['time_entries_skipped_empty']++;
                continue;
            }

            $userMapping = $this->getExistingMapping($this->sourceSystem, 'user', $email);
            if (empty($userMapping) || $userMapping['target_action'] !== 'matched') {
                // Covers exactly the case that must never be lost silently:
                // an email with no matching Dolibarr account (still
                // create_pending, or somehow no mapping row at all).
                $report['time_entries_skipped_unresolved']++;
                $report['unresolved_rows'][] = array('row' => $rowNumber, 'reason' => 'user_not_found', 'value' => $email);
                continue;
            }
            $resolvedUserId = (int) $userMapping['target_id'];

            $projectMapping = $this->getExistingMapping($this->sourceSystem, 'project', $projectLabel);
            if (empty($projectMapping) || !in_array($projectMapping['target_action'], array('matched', 'created'), true)) {
                $report['time_entries_skipped_unresolved']++;
                $report['unresolved_rows'][] = array('row' => $rowNumber, 'reason' => 'project_not_resolved', 'value' => $projectLabel);
                continue;
            }
            $resolvedProjectId = (int) $projectMapping['target_id'];

            $startTimestamp = $this->parseCsvDateTime($dateStartCell, $timeStartCell, $dateFormat);
            $endTimestamp = $this->parseCsvDateTime($dateEndCell, $timeEndCell, $dateFormat);
            if ($endTimestamp === false && $startTimestamp !== false) {
                $durationHours = str_replace(',', '.', $durationCell);
                if (is_numeric($durationHours) && (float) $durationHours > 0) {
                    $endTimestamp = $startTimestamp + (int) round(((float) $durationHours) * 3600);
                }
            }
            if ($startTimestamp === false || $endTimestamp === false || $endTimestamp <= $startTimestamp) {
                $report['time_entries_skipped_invalid']++;
                $report['unresolved_rows'][] = array('row' => $rowNumber, 'reason' => 'invalid_dates', 'value' => $dateStartCell.' '.$timeStartCell.' -> '.$dateEndCell.' '.$timeEndCell);
                continue;
            }

            $importKey = $this->computeImportKey($email, $projectLabel, $startTimestamp, $endTimestamp);
            if ($this->timeEntryAlreadyImported($importKey)) {
                $report['time_entries_skipped_already_imported']++;
                continue;
            }

            $rowUser = new User($this->db);
            if ($rowUser->fetch($resolvedUserId) <= 0) {
                $report['time_entries_skipped_unresolved']++;
                $report['unresolved_rows'][] = array('row' => $rowNumber, 'reason' => 'user_not_found', 'value' => $email);
                continue;
            }

            $timeentry = new TimeEntry($this->db);
            if ($timeentry->hasTimeOverlap($resolvedUserId, $startTimestamp, $endTimestamp)) {
                $report['time_entries_skipped_invalid']++;
                $report['unresolved_rows'][] = array('row' => $rowNumber, 'reason' => 'overlap', 'value' => $email);
                continue;
            }

            $billable = in_array($billableCell, $billableTrueValues, true) ? 1 : 0;
            $timeentry->import_key = $importKey;
            $newId = $timeentry->createManualEntry(
                $resolvedUserId,
                $resolvedProjectId,
                0,
                $startTimestamp,
                $endTimestamp,
                $description,
                '',
                $billable,
                $rowUser,
                null,
                TimeEntry::STATUS_DRAFT
            );

            if ($newId > 0) {
                $timeentry->fetch($newId);
                $timeentry->logManualCreation($user, 'Import CSV Clockify');
                $report['time_entries_created']++;
            } else {
                $report['time_entries_skipped_invalid']++;
                $report['unresolved_rows'][] = array('row' => $rowNumber, 'reason' => 'create_error', 'value' => (string) $timeentry->error);
            }
        }
        fclose($handle);
    }

    /**
     * Entry point for the executeClockifyImport AJAX action — validates the
     * upload exactly like previewFromUploadedFile() does, then delegates.
     *
     * @param array $uploadedFile $_FILES entry
     * @param User  $user         Acting user (the importing admin)
     * @return array Execution report, see executeImportFromCsvPath().
     */
    public function executeImportFromUploadedFile(array $uploadedFile, User $user)
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

        return $this->executeImportFromCsvPath($uploadedFile['tmp_name'], $user);
    }

    /**
     * Runs the real import: creates every confirmed project/group, links
     * every resolvable (user, group) pair, then creates one draft
     * TimeEntry per eligible CSV row.
     *
     * DESIGN NOTE — why this takes a CSV path (a second upload) rather than
     * reading from something already stored: previewFromCsvPath() never
     * persists row-level data (date/time/duration/description), only the
     * distinct set of user/project/group values found across the file, so
     * there is nothing left to read from once the preview request ends —
     * the browser resubmits the same file the user already picked once the
     * mapping is fully resolved.
     *
     * Refuses to run at all while any project/group mapping is still
     * 'create_pending' (findPendingProjectAndGroupMappings()) — every
     * confirmed decision is executed, but nothing is guessed.
     *
     * Failures are handled per-item, not as one all-or-nothing transaction:
     * a failed project/group creation, or a CSV row that can't be turned
     * into a time entry, is recorded in the report and processing
     * continues — see $report['errors'] and $report['unresolved_rows'].
     *
     * @return array{
     *   clients_created: array, projects_created: array, groups_created: array,
     *   group_memberships_created: int, group_memberships_skipped: int,
     *   project_contacts_created: int, project_contacts_skipped: int,
     *   user_emails_filled: int, user_names_filled: int,
     *   time_entries_created: int, time_entries_skipped_empty: int,
     *   time_entries_skipped_unresolved: int,
     *   time_entries_skipped_already_imported: int,
     *   time_entries_skipped_invalid: int,
     *   unresolved_rows: array, errors: array
     * }
     */
    public function executeImportFromCsvPath($csvPath, User $user)
    {
        if (!is_readable($csvPath)) {
            throw new RuntimeException('Le fichier CSV ne peut pas être lu.');
        }

        $pending = $this->findPendingProjectAndGroupMappings();
        if (!empty($pending)) {
            throw new InvalidArgumentException('Des éléments restent à résoudre avant de lancer l’import : '.implode(', ', $pending));
        }

        $report = array(
            'clients_created' => array(),
            'projects_created' => array(),
            'groups_created' => array(),
            'group_memberships_created' => 0,
            'group_memberships_skipped' => 0,
            'project_contacts_created' => 0,
            'project_contacts_skipped' => 0,
            'user_emails_filled' => 0,
            'user_names_filled' => 0,
            'time_entries_created' => 0,
            'time_entries_skipped_empty' => 0,
            'time_entries_skipped_unresolved' => 0,
            'time_entries_skipped_already_imported' => 0,
            'time_entries_skipped_invalid' => 0,
            'unresolved_rows' => array(),
            'errors' => array(),
        );

        $this->createConfirmedClients($user, $report);
        $this->createConfirmedProjectsAndGroups($user, $report);
        $this->enrichMatchedUsersFromCsv($csvPath, $user, $report);
        $this->applyGroupMemberships($report);
        $this->applyProjectContributors($report);
        $this->importTimeEntriesFromCsv($csvPath, $user, $report);

        // Keep the response payload bounded regardless of CSV size — the
        // aggregate counters above stay exact either way.
        if (count($report['unresolved_rows']) > 200) {
            $report['unresolved_rows'] = array_slice($report['unresolved_rows'], 0, 200);
            $report['unresolved_rows_truncated'] = true;
        }

        return $report;
    }
}
