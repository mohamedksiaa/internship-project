<?php
/* Copyright (C) 2026 SuperAdmin - TimeFlow Import */

require_once DOL_DOCUMENT_ROOT.'/user/class/user.class.php';
require_once DOL_DOCUMENT_ROOT.'/user/class/usergroup.class.php';
require_once DOL_DOCUMENT_ROOT.'/projet/class/project.class.php';
require_once DOL_DOCUMENT_ROOT.'/societe/class/societe.class.php';
require_once DOL_DOCUMENT_ROOT.'/core/lib/security2.lib.php'; // getRandomPassword()
dol_include_once('/timeflow/class/timeentry.class.php');

/** Thrown when the acting user lacks the right to create Dolibarr accounts (mapped to HTTP 403). */
class TimeImportForbiddenException extends RuntimeException
{
}

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
 * createConfirmedProjectsAndGroups() below.
 *
 * A Dolibarr account is created from this flow ONLY when an actor who is admin
 * or holds the native Dolibarr right "create users" (user->user->creer) has
 * confirmed it for a Clockify email that matches no account at all, active or
 * disabled (resolveMappingDecisions()); createConfirmedUsers() re-checks
 * everything at execution and gives the account nothing beyond TimeFlow's basic
 * read/write rights.
 */
class TimeImportClockify
{
    /** The only Dolibarr rights a created account gets: TimeFlow timeentry read + write. */
    const BASE_RIGHTS = array('read', 'write');

    /** Target actions that mean "this email is resolved to a real, usable account". */
    const RESOLVED_USER_ACTIONS = array('matched', 'created');

    /** @var User|null Acting user; defaults to the global $user (the AJAX caller). Exposed for tests. */
    public $actor = null;

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
     * Protected: the only caller is previewFromUploadedFile(), which is
     * where the upload is validated (is_uploaded_file(), extension, size)
     * before the path reaches here — this method itself only checks
     * is_readable(), never a directory allow-list.
     *
     * @param string $csvPath
     * @return array
     */
    protected function previewFromCsvPath($csvPath)
    {
        // Same rationale as executeImportFromCsvPath(): resolving user/project/
        // client/group mappings does several SQL round-trips per CSV row
        // (lookup, then insert if unresolved) across resolveUserMapping()/
        // resolveProjectMapping()/resolveClientMapping()/resolveGroupMapping();
        // on a several-hundred-row export this reliably exceeds PHP's default
        // 30s max_execution_time and dies mid-run with a fatal error. Nothing
        // here writes to any table except llx_timeflow_import_mapping/
        // *_link, so a timeout is never data-unsafe — but it shouldn't happen
        // on a single normal-sized preview. Raise it for this request only,
        // regardless of what the server's php.ini otherwise allows.
        set_time_limit(300);

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
            'can_create_users' => $this->canCreateUsers(),
        );
        $displayNameByEmail = array();

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

            $displayName = $this->normalizeString($this->readCell($normalizedRow, $columnIndexes['user_display'] ?? null));
            if ($email !== '' && $displayName !== '' && !isset($displayNameByEmail[$email])) {
                $displayNameByEmail[$email] = $displayName;
            }

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

        $summary['users'] = $this->addUserCreationHints(array_values($summary['users']), $displayNameByEmail);
        $summary['projects'] = array_values($summary['projects']);
        $summary['groups'] = array_values($summary['groups']);
        $summary['clients'] = array_values($summary['clients']);

        foreach ($summary['users'] as $userEntry) {
            if (in_array($userEntry['target_action'], self::RESOLVED_USER_ACTIONS, true)) {
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
     * Splits a CSV "Groupe" cell such as "HRM, Administration, TBEE, CMS" into
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
            if (in_array($existing['target_action'], self::RESOLVED_USER_ACTIONS, true) && !$this->userExistsAndActive((int) $existing['target_id'])) {
                // Matched earlier (possibly by the old code, which matched disabled accounts too),
                // but that account is disabled or gone: ask again instead of importing into it.
                $previousTargetLogin = $this->loginOfDisabledUser((int) $existing['target_id']);
                $this->downgradeUserMapping($existing['rowid']);
                $existing['target_id'] = null;
                $existing['target_action'] = 'create_pending';
                $existing['new_label'] = null;
            }

            $resolved = $this->withDisabledAccountWarning(array(
                'mapping_type' => 'user',
                'source_system' => $sourceSystem,
                'source_value' => $existing['source_value'],
                'target_id' => $existing['target_id'],
                'target_action' => $existing['target_action'],
                'status' => $existing['target_action'],
                'new_label' => $existing['new_label'],
            ), $sourceValue);
            if (isset($previousTargetLogin) && $previousTargetLogin !== null && empty($resolved['warning'])) {
                // The mapping had been made by hand to an account (whatever its email) that is disabled now.
                $resolved['warning'] = 'disabled_account';
                $resolved['disabled_login'] = $previousTargetLogin;
            }

            return $resolved;
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
            return $this->withDisabledAccountWarning(array(
                'mapping_type' => 'user',
                'source_system' => $sourceSystem,
                'source_value' => $persisted['source_value'],
                'target_id' => $persisted['target_id'],
                'target_action' => $persisted['target_action'],
                'status' => $persisted['target_action'],
                'new_label' => null,
            ), $sourceValue);
        }

        return $this->withDisabledAccountWarning(array(
            'mapping_type' => 'user',
            'source_system' => $sourceSystem,
            'source_value' => $sourceValue,
            'target_id' => $targetId > 0 ? (int) $targetId : null,
            'target_action' => $targetAction,
            'status' => $targetAction,
            'new_label' => null,
        ), $sourceValue);
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
            list($existing, $targetMissing) = $this->checkExistingTarget('project', $existing);

            return $this->withTargetMissingWarning(array(
                'mapping_type' => 'project',
                'source_system' => $sourceSystem,
                'source_value' => $existing['source_value'],
                'target_id' => $existing['target_id'],
                'target_action' => $existing['target_action'],
                'status' => $existing['target_action'],
                'new_label' => $existing['new_label'],
            ), $targetMissing);
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
            list($existing, $targetMissing) = $this->checkExistingTarget('group', $existing);

            return $this->withTargetMissingWarning(array(
                'mapping_type' => 'group',
                'source_system' => $sourceSystem,
                'source_value' => $existing['source_value'],
                'target_id' => $existing['target_id'],
                'target_action' => $existing['target_action'],
                'status' => $existing['target_action'],
                'new_label' => $existing['new_label'],
            ), $targetMissing);
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

    /**
     * The Dolibarr account carrying this email, whatever its status. When several
     * accounts share it (Dolibarr refuses that today, older data may not), an
     * active one wins over a disabled one.
     *
     * @return array{id:int,login:string,active:bool}|null
     */
    protected function lookupDolibarrUserByEmail($email)
    {
        $email = trim((string) $email);
        if ($email === '') {
            return null;
        }

        $sql = 'SELECT rowid, login, statut';
        $sql .= ' FROM '.$this->db->prefix().'user';
        $sql .= ' WHERE email = \''.$this->db->escape($email).'\'';
        $sql .= ' AND entity IN ('.getEntity('user').')';
        $sql .= ' ORDER BY statut DESC, rowid ASC LIMIT 1';

        $res = $this->db->query($sql);
        if (!$res) {
            return null;
        }

        $obj = $this->db->fetch_object($res);
        if (!$obj) {
            return null;
        }

        return array('id' => (int) $obj->rowid, 'login' => (string) $obj->login, 'active' => ((int) $obj->statut) === 1);
    }

    /**
     * The ACTIVE Dolibarr account carrying this email, or 0. A disabled account is
     * deliberately not returned: silently attributing imported time to it would
     * hide that the person can no longer log in (see resolveUserMapping()).
     */
    protected function findDolibarrUserByEmail($email)
    {
        $found = $this->lookupDolibarrUserByEmail($email);

        return ($found !== null && $found['active']) ? $found['id'] : 0;
    }

    /**
     * Puts a user mapping back to "pending" when the account it points to can no
     * longer receive imported time (disabled since, or deleted). Persisted, so every
     * later step sees the same state.
     */
    protected function downgradeUserMapping($mappingRowId)
    {
        $sql = 'UPDATE '.$this->db->prefix().'timeflow_import_mapping SET';
        $sql .= " target_id = NULL, target_action = 'create_pending', new_label = NULL";
        $sql .= ' WHERE rowid = '.(int) $mappingRowId;
        $this->db->query($sql);
    }

    /** Whether the Dolibarr record a project / client / group mapping points to still exists. */
    protected function targetStillExists($mappingType, $targetId)
    {
        $targetId = (int) $targetId;
        if ($targetId <= 0) {
            return false;
        }
        switch ($mappingType) {
            case 'project':
                return $this->timeflowProjectExists($targetId);
            case 'client':
                return $this->societeExists($targetId);
            case 'group':
                return $this->usergroupExists($targetId);
        }

        return true;
    }

    /**
     * Sends a project / client / group mapping back to "pending" WITHOUT forgetting which record it
     * pointed to: the dangling target_id is what lets every later preview keep saying "that element
     * no longer exists in Dolibarr" (a fresh decision replaces or clears it).
     */
    protected function downgradeKeepingTarget($mappingRowId)
    {
        $sql = 'UPDATE '.$this->db->prefix().'timeflow_import_mapping SET';
        $sql .= " target_action = 'create_pending', new_label = NULL";
        $sql .= ' WHERE rowid = '.(int) $mappingRowId;
        $this->db->query($sql);
    }

    /**
     * Revalidates an existing project / client / group mapping against Dolibarr. A resolved one whose
     * target was deleted (or merged) since goes back to pending; a pending one that still remembers a
     * dead target keeps being flagged. Renaming is harmless: mappings follow the record's id.
     *
     * @return array{0:array,1:bool} The (possibly downgraded) mapping and whether its target is missing
     */
    protected function checkExistingTarget($mappingType, array $existing)
    {
        $action = $existing['target_action'];
        $hadTarget = !empty($existing['target_id']) && (int) $existing['target_id'] > 0;
        if (in_array($action, array('matched', 'created'), true) && !$this->targetStillExists($mappingType, (int) $existing['target_id'])) {
            $this->downgradeKeepingTarget($existing['rowid']);
            $existing['target_action'] = 'create_pending';
            $existing['new_label'] = null;

            return array($existing, true);
        }
        if ($action === 'create_pending' && $hadTarget && !$this->targetStillExists($mappingType, (int) $existing['target_id'])) {
            return array($existing, true);
        }

        return array($existing, false);
    }

    protected function withTargetMissingWarning(array $resolution, $targetMissing)
    {
        if ($targetMissing) {
            $resolution['warning'] = 'target_missing';
        }

        return $resolution;
    }

    /**
     * Login of a user that exists but is disabled, null otherwise.
     */
    protected function loginOfDisabledUser($userId)
    {
        $res = $this->db->query('SELECT login, statut FROM '.$this->db->prefix().'user WHERE rowid = '.((int) $userId));
        $obj = $res ? $this->db->fetch_object($res) : null;

        return ($obj && ((int) $obj->statut) !== 1) ? (string) $obj->login : null;
    }

    /**
     * Adds the "this email belongs to a DISABLED account" warning to a pending user row.
     *
     * @param array  $resolution A user row from resolveUserMapping()
     * @param string $email
     * @return array
     */
    protected function withDisabledAccountWarning(array $resolution, $email)
    {
        if ($resolution['target_action'] !== 'create_pending') {
            return $resolution;
        }
        $found = $this->lookupDolibarrUserByEmail($email);
        if ($found !== null && !$found['active']) {
            $resolution['warning'] = 'disabled_account';
            $resolution['disabled_login'] = $found['login'];
        }

        return $resolution;
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
            list($existing, $targetMissing) = $this->checkExistingTarget('client', $existing);

            return $this->withTargetMissingWarning(array(
                'mapping_type' => 'client',
                'source_system' => $sourceSystem,
                'source_value' => $existing['source_value'],
                'target_id' => $existing['target_id'],
                'target_action' => $existing['target_action'],
                'status' => $existing['target_action'],
                'new_label' => $existing['new_label'],
            ), $targetMissing);
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

    /** The acting user: the explicit $actor (tests), else the AJAX caller's global $user. */
    protected function getActor()
    {
        global $user;

        return $this->actor instanceof User ? $this->actor : $user;
    }

    /**
     * Whether the actor may create Dolibarr accounts: Dolibarr admin, or the native
     * "create users" right. Never TimeFlow's own write right, which every employee has.
     */
    public function canCreateUsers($actor = null)
    {
        $actor = $actor ?: $this->getActor();

        return is_object($actor) && !empty($actor->id) && (!empty($actor->admin) || $actor->hasRight('user', 'user', 'creer'));
    }

    protected function loginIsTaken($login)
    {
        global $conf;

        $sql = 'SELECT COUNT(*) AS nb FROM '.$this->db->prefix().'user';
        $sql .= " WHERE login = '".$this->db->escape($login)."'";
        $sql .= ' AND entity IN ('.((int) $conf->entity).', 0)';
        $res = $this->db->query($sql);
        $obj = $res ? $this->db->fetch_object($res) : null;

        return !$obj || (int) $obj->nb > 0;
    }

    protected function loginIsWellFormed($login)
    {
        return (bool) preg_match('/^[A-Za-z0-9._-]{1,50}$/', (string) $login);
    }

    /**
     * Login, first name and last name proposed for a Clockify email and display name.
     * The login is the email's local part, lower-cased and reduced to [a-z0-9._-]
     * ("@" is forbidden in Dolibarr logins), with a number appended while it is taken.
     *
     * @param string   $email
     * @param string   $displayName
     * @param string[] $reservedLogins Logins already proposed for other rows of the same file
     * @return array{login:string,firstname:string,lastname:string}
     */
    public function suggestUserIdentity($email, $displayName, array $reservedLogins = array())
    {
        $local = strstr((string) $email, '@', true);
        $local = $local === false ? (string) $email : $local;
        $base = strtolower(preg_replace('/[^A-Za-z0-9._-]/', '', dol_string_unaccent($local)));
        $base = substr($base !== '' ? $base : 'user', 0, 40);

        $login = $base;
        for ($i = 2; $i < 1000 && (in_array($login, $reservedLogins, true) || $this->loginIsTaken($login)); $i++) {
            $login = $base.$i;
        }

        $parts = preg_split('/\s+/', trim((string) $displayName), -1, PREG_SPLIT_NO_EMPTY);
        if (count($parts) >= 2) {
            $firstname = array_shift($parts);
            $lastname = implode(' ', $parts);
        } elseif (count($parts) === 1) {
            $firstname = '';
            $lastname = $parts[0];
        } else {
            $firstname = '';
            $lastname = $base;
        }

        return array('login' => $login, 'firstname' => substr($firstname, 0, 50), 'lastname' => substr($lastname, 0, 50));
    }

    /**
     * Adds what the "create this user" form needs to the user rows of a preview:
     * a proposal for pending rows, the saved choice for confirmed ones.
     */
    protected function addUserCreationHints(array $rows, array $displayNameByEmail)
    {
        $reserved = array();
        foreach ($rows as $index => $row) {
            $email = $row['source_value'];
            if ($row['target_action'] === 'create_pending') {
                $displayName = $displayNameByEmail[$email] ?? '';
                $suggestion = $this->suggestUserIdentity($email, $displayName, $reserved);
                $reserved[] = $suggestion['login'];
                $rows[$index]['email_valid'] = isValidEmail($email);
                $rows[$index]['display_name'] = $displayName;
                $rows[$index]['suggested_login'] = $suggestion['login'];
                $rows[$index]['suggested_firstname'] = $suggestion['firstname'];
                $rows[$index]['suggested_lastname'] = $suggestion['lastname'];
            } elseif ($row['target_action'] === 'create_confirmed') {
                $identity = json_decode((string) $row['new_label'], true);
                if (is_array($identity)) {
                    $rows[$index]['new_login'] = (string) ($identity['login'] ?? '');
                    $rows[$index]['new_firstname'] = (string) ($identity['firstname'] ?? '');
                    $rows[$index]['new_lastname'] = (string) ($identity['lastname'] ?? '');
                    $reserved[] = (string) ($identity['login'] ?? '');
                }
            }
        }

        return $rows;
    }

    /**
     * Validates a "create this account" decision and returns the identity to store.
     * Everything that can be refused is refused here, before any write.
     *
     * @throws TimeImportForbiddenException when the actor may not create accounts
     * @throws InvalidArgumentException     for anything else wrong with the decision
     */
    protected function validateUserCreationDecision(array $decision, $index, array $loginsInBatch)
    {
        $email = trim((string) ($decision['source_value'] ?? ''));

        if (!$this->canCreateUsers()) {
            throw new TimeImportForbiddenException('Vous n’avez pas le droit de créer des comptes utilisateurs Dolibarr.');
        }
        if (!isValidEmail($email)) {
            throw new InvalidArgumentException('« '.$email.' » n’est pas une adresse email valide : impossible de créer le compte (les identifiants lui sont envoyés par email).');
        }
        $existing = $this->lookupDolibarrUserByEmail($email);
        if ($existing !== null) {
            throw new InvalidArgumentException($existing['active']
                ? 'Un compte existe déjà pour « '.$email.' » (« '.$existing['login'].' ») : associez-le au lieu d’en créer un.'
                : 'Un compte désactivé existe déjà pour « '.$email.' » : compte désactivé : '.$existing['login'].'. Aucun doublon n’est créé ; réactivez-le dans Dolibarr ou associez l’email à un autre compte.');
        }

        $login = trim((string) ($decision['new_login'] ?? ''));
        if (!$this->loginIsWellFormed($login)) {
            throw new InvalidArgumentException('Identifiant invalide pour « '.$email.' » : 1 à 50 caractères parmi lettres, chiffres, point, tiret et tiret bas.');
        }
        if ($this->loginIsTaken($login) || in_array(strtolower($login), $loginsInBatch, true)) {
            throw new InvalidArgumentException('L’identifiant « '.$login.' » est déjà pris (décision à l’index '.$index.').');
        }

        $firstname = trim((string) ($decision['new_firstname'] ?? ''));
        $lastname = trim((string) ($decision['new_lastname'] ?? ''));
        if ($lastname === '') {
            throw new InvalidArgumentException('Le nom est obligatoire pour créer le compte de « '.$email.' ».');
        }
        if (dol_strlen($firstname) > 50 || dol_strlen($lastname) > 50) {
            throw new InvalidArgumentException('Prénom et nom : 50 caractères au maximum.');
        }

        return array('login' => $login, 'firstname' => $firstname, 'lastname' => $lastname);
    }

    /**
     * Apply a batch of mapping resolution decisions.
     *
     * A 'create_new' decision on a user only records the confirmed identity
     * (login, first name, last name) against the mapping row — validated here, and
     * allowed only for an actor who may create accounts. The account itself is
     * created at the real import step (createConfirmedUsers()). It never inserts a
     * project row either: a 'create_new' decision on a project only
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
        $loginsInBatch = array();
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

            $targetId = null;
            $newLabel = null;

            if ($resolution === 'create_new' && $mappingType === 'user') {
                $identity = $this->validateUserCreationDecision($decision, $index, $loginsInBatch);
                $loginsInBatch[] = strtolower($identity['login']);
                $normalized[] = array(
                    'mapping_type' => 'user',
                    'source_value' => $sourceValue,
                    'resolution' => 'create_new',
                    'target_id' => null,
                    'new_label' => json_encode($identity, JSON_UNESCAPED_UNICODE),
                );
                continue;
            }

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
                // Projects, groups and clients: a title. (Users took the branch above.)
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
     * decision, scoped to the values actually referenced by the CSV file
     * currently being imported. The caller must refuse to run the import
     * while this is non-empty — running anyway would mean guessing what the
     * user wants for elements they were never asked to confirm.
     *
     * Deliberately scoped by $scopedValues rather than checking every
     * 'create_pending' row for this source_system: llx_timeflow_import_mapping
     * accumulates across every import ever previewed, by any user, so an
     * unscoped check would let a leftover unresolved row from a completely
     * unrelated earlier import (this user's or anyone else's) block a new
     * import that never mentions it.
     *
     * @param array{project?: string[], group?: string[], client?: string[]} $scopedValues
     *        Distinct source values found in the current CSV, as returned by
     *        extractDistinctSourceValuesFromCsv().
     * @return string[] e.g. ["project:ACME-CORE", "group:HRM", "client:ACME"]
     */
    protected function findPendingProjectAndGroupMappings(array $scopedValues)
    {
        $pending = array();

        // Alphabetical by mapping_type, matching the previous single-query
        // ORDER BY mapping_type, source_value.
        foreach (array('client', 'group', 'project') as $mappingType) {
            $inList = $this->sqlStringInList($scopedValues[$mappingType] ?? array());
            if ($inList === null) {
                continue;
            }

            $sql = 'SELECT mapping_type, source_value FROM '.$this->db->prefix().'timeflow_import_mapping';
            $sql .= " WHERE source_system = '".$this->db->escape($this->sourceSystem)."'";
            $sql .= " AND mapping_type = '".$this->db->escape($mappingType)."'";
            $sql .= " AND target_action = 'create_pending'";
            $sql .= ' AND source_value IN ('.$inList.')';
            $sql .= ' ORDER BY source_value';

            $resql = $this->db->query($sql);
            if ($resql) {
                while ($obj = $this->db->fetch_object($resql)) {
                    $pending[] = $obj->mapping_type.':'.$obj->source_value;
                }
            }
        }

        return $pending;
    }

    /**
     * Builds a safe SQL "IN (...)" list of escaped string literals.
     *
     * Returns null when $values is empty — callers must treat that as "this
     * type has nothing to scope to, so match nothing" and skip the query
     * entirely, never fall back to an unfiltered one.
     *
     * @param string[] $values
     * @return string|null
     */
    protected function sqlStringInList(array $values)
    {
        $values = array_values(array_unique(array_filter($values, function ($v) {
            return $v !== '';
        })));
        if (empty($values)) {
            return null;
        }

        $escaped = array();
        foreach ($values as $value) {
            $escaped[] = '\''.$this->db->escape((string) $value).'\'';
        }
        return implode(', ', $escaped);
    }

    /**
     * Distinct, trimmed user/project/group/client values found in this CSV
     * — the scope every execution-time mapping query below is filtered to,
     * so a llx_timeflow_import_mapping (or *_link) row left over from an
     * unrelated earlier import is never read, created from, blocked on, or
     * acted on by a run that never mentioned it. Mirrors the same cell
     * extraction as previewFromCsvPath(), minus the mapping resolution —
     * nothing is persisted here.
     *
     * @param string $csvPath
     * @return array{user: string[], project: string[], group: string[], client: string[]}
     */
    protected function extractDistinctSourceValuesFromCsv($csvPath)
    {
        $config = $this->loadConfig();
        $delimiter = $config['delimiter'] ?? ',';
        $headerNames = $this->readCsvHeader($csvPath, $delimiter);
        if (empty($headerNames)) {
            throw new RuntimeException('Le fichier CSV est vide ou sans en-tête.');
        }
        $columnIndexes = $this->mapHeadersToIndexes($headerNames, $config['columns'] ?? array());

        $values = array('user' => array(), 'project' => array(), 'group' => array(), 'client' => array());

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
            $projectLabel = $this->normalizeString($this->readCell($normalizedRow, $columnIndexes['project'] ?? null));
            $clientLabel = $this->normalizeString($this->readCell($normalizedRow, $columnIndexes['client'] ?? null));
            $groupsCell = $this->readCell($normalizedRow, $columnIndexes['groups'] ?? null);

            if ($email !== '') {
                $values['user'][$email] = true;
            }
            if ($projectLabel !== '') {
                $values['project'][$projectLabel] = true;
            }
            if ($clientLabel !== '') {
                $values['client'][$clientLabel] = true;
            }
            foreach ($this->splitGroupNames($groupsCell) as $groupName) {
                $values['group'][$groupName] = true;
            }
        }
        fclose($handle);

        return array(
            'user' => array_keys($values['user']),
            'project' => array_keys($values['project']),
            'group' => array_keys($values['group']),
            'client' => array_keys($values['client']),
        );
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
     * @param User   $user         Acting user — becomes fk_user_creat on the
     *                             created llx_societe rows.
     * @param array  $report       Accumulator, mutated in place:
     *                             'clients_created', 'errors'.
     * @param string[] $clientValues Client values from the current CSV
     *                             (extractDistinctSourceValuesFromCsv()['client'])
     *                             — scopes creation to this import, so a
     *                             client confirmed by a different, unrelated
     *                             earlier import is never created here.
     */
    protected function createConfirmedClients(User $user, array &$report, array $clientValues)
    {
        $inList = $this->sqlStringInList($clientValues);
        if ($inList === null) {
            return;
        }

        $sql = 'SELECT rowid, source_value, new_label';
        $sql .= ' FROM '.$this->db->prefix().'timeflow_import_mapping';
        $sql .= " WHERE source_system = '".$this->db->escape($this->sourceSystem)."'";
        $sql .= " AND mapping_type = 'client'";
        $sql .= " AND target_action = 'create_confirmed'";
        $sql .= ' AND source_value IN ('.$inList.')';
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
     * Creates every project/group mapping row still at 'create_confirmed'.
     * The WHERE clause below only ever selects mapping_type IN ('project',
     * 'group'): a Dolibarr account is never created here. Accounts are created
     * by createConfirmedUsers() alone, only for an actor who is admin or holds
     * the native "create users" right, with only TimeFlow's basic rights.
     *
     * @param User     $user          Acting user (importing admin) — becomes
     *                                fk_user_creat on the created
     *                                llx_projet/llx_usergroup rows.
     * @param array    $report        Accumulator, mutated in place:
     *                                'projects_created', 'groups_created',
     *                                'errors'.
     * @param string[] $projectValues Project values from the current CSV.
     * @param string[] $groupValues   Group values from the current CSV —
     *                                together with $projectValues, scopes
     *                                creation to this import, so a
     *                                project/group confirmed by a
     *                                different, unrelated earlier import is
     *                                never created here.
     */
    protected function createConfirmedProjectsAndGroups(User $user, array &$report, array $projectValues, array $groupValues)
    {
        global $conf;

        $conditions = array();
        $projectInList = $this->sqlStringInList($projectValues);
        if ($projectInList !== null) {
            $conditions[] = "(mapping_type = 'project' AND source_value IN (".$projectInList."))";
        }
        $groupInList = $this->sqlStringInList($groupValues);
        if ($groupInList !== null) {
            $conditions[] = "(mapping_type = 'group' AND source_value IN (".$groupInList."))";
        }
        if (empty($conditions)) {
            return;
        }

        $sql = 'SELECT rowid, mapping_type, source_value, new_label';
        $sql .= ' FROM '.$this->db->prefix().'timeflow_import_mapping';
        $sql .= " WHERE source_system = '".$this->db->escape($this->sourceSystem)."'";
        $sql .= " AND target_action = 'create_confirmed'";
        $sql .= ' AND ('.implode(' OR ', $conditions).')';
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
     * be 'matched' or 'created' (an account this import created), the group
     * side must be 'matched' or 'created'. Anything else is counted as
     * skipped, never silently dropped.
     *
     * A pair whose membership already exists is counted apart
     * ('group_memberships_existing') and left untouched: User::SetInGroup()
     * does a DELETE-then-INSERT and fires USER_MODIFY, which a re-run of the
     * import must not do for nothing. A membership that fails is contained
     * (skipped + an error entry), it never aborts the import.
     *
     * @param array    $report      Accumulator, mutated in place.
     * @param string[] $userValues  User (email) values from the current CSV.
     * @param string[] $groupValues Group values from the current CSV —
     *                              together with $userValues, scopes this to
     *                              pairs recorded by this import, so a pair
     *                              left over by a different, unrelated
     *                              earlier import is never re-applied here.
     */
    protected function applyGroupMemberships(array &$report, array $userValues, array $groupValues)
    {
        global $conf;

        $userInList = $this->sqlStringInList($userValues);
        $groupInList = $this->sqlStringInList($groupValues);
        if ($userInList === null || $groupInList === null) {
            return;
        }

        $sql = 'SELECT user_source_value, group_source_value';
        $sql .= ' FROM '.$this->db->prefix().'timeflow_import_user_group_link';
        $sql .= " WHERE source_system = '".$this->db->escape($this->sourceSystem)."'";
        $sql .= ' AND user_source_value IN ('.$userInList.')';
        $sql .= ' AND group_source_value IN ('.$groupInList.')';

        $resql = $this->db->query($sql);
        if (!$resql) {
            throw new RuntimeException('Erreur SQL lors de la lecture des associations utilisateur/groupe : '.$this->db->lasterror());
        }

        // Read every pair first: the loop below runs other queries (and may fail on one of them).
        $pairs = array();
        while ($pair = $this->db->fetch_object($resql)) {
            $pairs[] = $pair;
        }

        foreach ($pairs as $obj) {
            $userMapping = $this->getExistingMapping($this->sourceSystem, 'user', $obj->user_source_value);
            $groupMapping = $this->getExistingMapping($this->sourceSystem, 'group', $obj->group_source_value);

            $resolvedUserId = (!empty($userMapping) && in_array($userMapping['target_action'], self::RESOLVED_USER_ACTIONS, true))
                ? (int) $userMapping['target_id'] : 0;
            $resolvedGroupId = (!empty($groupMapping) && in_array($groupMapping['target_action'], array('matched', 'created'), true))
                ? (int) $groupMapping['target_id'] : 0;

            if ($resolvedUserId <= 0 || $resolvedGroupId <= 0) {
                $report['group_memberships_skipped']++;
                continue;
            }

            // Already a member: nothing to do. Calling SetInGroup() again would DELETE + INSERT the link
            // and fire USER_MODIFY for nothing, re-triggering whatever listens to it.
            if ($this->isGroupMember($resolvedUserId, $resolvedGroupId, (int) ($conf->entity ?? 1))) {
                $report['group_memberships_existing']++;
                continue;
            }

            // An account created by this import never joins a group that carries more than
            // TimeFlow's basic rights (it would inherit them, defeating "basic rights only").
            // Checked whatever the group's mapping status: a group this import created is empty at first, but an admin
            // may have given it more rights since (then a later import must not enrol new accounts in it).
            if ($userMapping['target_action'] === 'created' && $this->groupHasRightsBeyondBase($resolvedGroupId)) {
                $report['group_memberships_withheld'][] = array(
                    'user' => $obj->user_source_value,
                    'group' => $obj->group_source_value,
                    'reason' => 'group_has_extra_rights',
                );
                continue;
            }

            $targetUser = $this->newUserObject();
            if ($targetUser->fetch($resolvedUserId) <= 0) {
                $report['group_memberships_skipped']++;
                continue;
            }

            $failure = null;
            $openBefore = (int) $this->db->transaction_opened;
            try {
                $result = $targetUser->SetInGroup($resolvedGroupId, (int) ($conf->entity ?? 1));
                if ($result <= 0) {
                    $failure = (string) $targetUser->error;
                }
            } catch (Throwable $e) {
                // e.g. the group vanished after the revalidation: contained, reported, the import goes on.
                $this->rollbackLeftOpenSince($openBefore);
                $result = -1;
                $failure = $e->getMessage();
            }
            if ($result > 0) {
                $report['group_memberships_created']++;
            } else {
                $report['group_memberships_skipped']++;
                $report['errors'][] = array(
                    'type' => 'group_membership',
                    'source_value' => $obj->user_source_value.' / '.$obj->group_source_value,
                    'message' => 'Rattachement impossible : '.($failure !== '' ? $failure : 'erreur inconnue'),
                );
            }
        }
    }

    /**
     * Rolls back the transaction levels a failed Dolibarr call left open (its own begin() with no commit),
     * and only those: an enclosing transaction, if any, is not the failed call's to undo.
     */
    protected function rollbackLeftOpenSince($levelBefore)
    {
        while ((int) $this->db->transaction_opened > (int) $levelBefore) {
            $this->db->rollback();
        }
    }

    /** Factories, so the two calls that reach into Dolibarr per pair can be replaced in tests. */
    protected function newUserObject()
    {
        return new User($this->db);
    }

    protected function newProjectObject()
    {
        return new Project($this->db);
    }

    protected function isGroupMember($userId, $groupId, $entity)
    {
        $sql = 'SELECT 1 FROM '.$this->db->prefix().'usergroup_user';
        $sql .= ' WHERE fk_user = '.((int) $userId).' AND fk_usergroup = '.((int) $groupId).' AND entity = '.((int) $entity);
        $res = $this->db->query($sql);

        return $res && $this->db->num_rows($res) > 0;
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
     * the user side must be 'matched' or 'created' (an account this import
     * created), the project side must be 'matched' or 'created'. Anything else
     * is counted as skipped, never silently dropped.
     *
     * add_contact() does its own dedup (checks llx_element_contact before
     * inserting): returns 1 on creation, 0 if the contact already exists,
     * a negative code on error — so calling it twice for the same pair
     * (e.g. a re-run of the import, or a user already added manually) is a
     * safe no-op, never a duplicate.
     *
     * @param array    $report        Accumulator, mutated in place.
     * @param string[] $projectValues Project values from the current CSV.
     * @param string[] $userValues    User (email) values from the current
     *                                CSV — together with $projectValues,
     *                                scopes this to pairs recorded by this
     *                                import, so a pair left over by a
     *                                different, unrelated earlier import is
     *                                never re-applied here.
     */
    protected function applyProjectContributors(array &$report, array $projectValues, array $userValues)
    {
        $projectInList = $this->sqlStringInList($projectValues);
        $userInList = $this->sqlStringInList($userValues);
        if ($projectInList === null || $userInList === null) {
            return;
        }

        $sql = 'SELECT project_source_value, user_source_value';
        $sql .= ' FROM '.$this->db->prefix().'timeflow_import_project_user_link';
        $sql .= " WHERE source_system = '".$this->db->escape($this->sourceSystem)."'";
        $sql .= ' AND project_source_value IN ('.$projectInList.')';
        $sql .= ' AND user_source_value IN ('.$userInList.')';

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
            $resolvedUserId = (!empty($userMapping) && in_array($userMapping['target_action'], self::RESOLVED_USER_ACTIONS, true))
                ? (int) $userMapping['target_id'] : 0;

            if ($resolvedProjectId <= 0 || $resolvedUserId <= 0) {
                $report['project_contacts_skipped']++;
                continue;
            }

            if (!array_key_exists($resolvedProjectId, $projectCache)) {
                $project = $this->newProjectObject();
                $projectCache[$resolvedProjectId] = $project->fetch($resolvedProjectId) > 0 ? $project : null;
            }
            $project = $projectCache[$resolvedProjectId];
            if ($project === null) {
                $report['project_contacts_skipped']++;
                continue;
            }

            $openBefore = (int) $this->db->transaction_opened;
            try {
                $result = $project->add_contact($resolvedUserId, 'PROJECTCONTRIBUTOR', 'internal', 1);
            } catch (Throwable $e) {
                $this->rollbackLeftOpenSince($openBefore);
                $project->error = $e->getMessage();
                $result = -1;
            }
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
     *     "jdupont" is never mistaken for "Prénom Nom") AND firstname AND
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
        // Every email seen in this CSV, regardless of whether that row also
        // carried a display name — scopes the enrichment query below to
        // this import, so a 'matched' user only ever mentioned by a
        // different, unrelated earlier import is never touched here.
        $emailsSeen = array();
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
            if ($email !== '') {
                $emailsSeen[$email] = true;
            }
            if ($email !== '' && $displayName !== '' && !isset($displayNameByEmail[$email])) {
                $displayNameByEmail[$email] = $displayName;
            }
        }
        fclose($handle);

        $inList = $this->sqlStringInList(array_keys($emailsSeen));
        if ($inList === null) {
            return;
        }

        $sql = 'SELECT DISTINCT source_value, target_id';
        $sql .= ' FROM '.$this->db->prefix().'timeflow_import_mapping';
        $sql .= " WHERE source_system = '".$this->db->escape($this->sourceSystem)."'";
        $sql .= " AND mapping_type = 'user'";
        $sql .= " AND target_action IN ('matched', 'created')";
        $sql .= ' AND source_value IN ('.$inList.')';

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
     * resolve to a real Dolibarr id (user: 'matched', or 'created' by
     * createConfirmedUsers(); project: 'matched' or 'created' by
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
            if (empty($userMapping) || !in_array($userMapping['target_action'], self::RESOLVED_USER_ACTIONS, true)) {
                // Covers exactly the case that must never be lost silently:
                // an email with no matching Dolibarr account (still
                // create_pending, or somehow no mapping row at all).
                $report['time_entries_skipped_unresolved']++;
                $found = $this->lookupDolibarrUserByEmail($email);
                $report['unresolved_rows'][] = array('row' => $rowNumber, 'reason' => ($found !== null && !$found['active']) ? 'user_disabled' : 'user_not_found', 'value' => $email);
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
            // No status arg: imported entries now use createManualEntry()'s
            // natural default (STATUS_VALIDATED) instead of being forced to
            // DRAFT — a Clockify import no longer needs a manual bulk
            // validation pass afterward.
            $newId = $timeentry->createManualEntry(
                $resolvedUserId,
                $resolvedProjectId,
                0,
                $startTimestamp,
                $endTimestamp,
                $description,
                '',
                $billable,
                $rowUser
            );

            if ($newId > 0) {
                $timeentry->fetch($newId);
                // createManualEntry() sets fk_user_valid to $fk_user (the
                // entry's owner) for its other callers, e.g. self-validated
                // manual entries. Here the "validator" is really whoever
                // executed the import, so it's corrected to the importing
                // admin right after creation, then persisted silently
                // (empty $reason -> no audit row for this call; the
                // dedicated validation row below covers the audit trail).
                $timeentry->fk_user_valid = (int) $user->id;
                $timeentry->update($user);
                $timeentry->logManualCreation($user, 'Import CSV Clockify');
                $timeentry->logAutoValidationOnImport($user, 'Validation automatique — import Clockify');
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
     * Whether a Dolibarr group carries any right other than TimeFlow's basic
     * timeentry read/write (another module, or readall/validate/delete...).
     */
    protected function groupHasRightsBeyondBase($groupId)
    {
        $sql = 'SELECT rd.module, rd.perms, rd.subperms';
        $sql .= ' FROM '.$this->db->prefix().'usergroup_rights gr';
        $sql .= ' LEFT JOIN '.$this->db->prefix().'rights_def rd ON rd.id = gr.fk_id';
        $sql .= ' WHERE gr.fk_usergroup = '.((int) $groupId);
        $res = $this->db->query($sql);
        if (!$res) {
            return true; // cannot tell: do not enrol
        }
        while ($obj = $this->db->fetch_object($res)) {
            if (!($obj->module === 'timeflow' && $obj->perms === 'timeentry' && in_array($obj->subperms, self::BASE_RIGHTS, true))) {
                return true;
            }
        }

        return false;
    }

    /**
     * Ids of the TimeFlow rights every created account gets (timeentry read + write).
     *
     * @return int[]
     */
    protected function baseRightIds()
    {
        global $conf;

        $ids = array();
        $sql = 'SELECT id FROM '.$this->db->prefix()."rights_def WHERE module = 'timeflow' AND perms = 'timeentry'";
        $sql .= " AND subperms IN ('".implode("','", self::BASE_RIGHTS)."') AND entity = ".((int) $conf->entity);
        $res = $this->db->query($sql);
        while ($res && ($obj = $this->db->fetch_object($res))) {
            $ids[] = (int) $obj->id;
        }
        sort($ids);

        return $ids;
    }

    /** Removes every trace of a half-created account (used when its transaction could not simply be rolled back). */
    protected function discardAccount($userId)
    {
        $userId = (int) $userId;
        if ($userId <= 0) {
            return;
        }
        $prefix = $this->db->prefix();
        foreach (array('user_rights' => 'fk_user', 'usergroup_user' => 'fk_user', 'user_param' => 'fk_user', 'user' => 'rowid') as $table => $column) {
            $this->db->query('DELETE FROM '.$prefix.$table.' WHERE '.$column.' = '.$userId);
        }
    }

    /**
     * Creates the Dolibarr accounts the actor confirmed ('create_confirmed' user
     * mappings of this file), one transaction per account:
     *   create -> keep ONLY TimeFlow timeentry read+write -> verify -> random password -> commit,
     * then the native "send login information" email (after the commit: a mail failure
     * never undoes the account, and the password never appears in the report).
     * Everything is re-checked here, not trusted from the confirmation: the actor's
     * right, the email and the login still being free.
     */
    protected function createConfirmedUsers(User $actor, array &$report, array $emails)
    {
        global $conf;

        $inList = $this->sqlStringInList($emails);
        if ($inList === null) {
            return;
        }

        $sql = 'SELECT rowid, source_value, new_label FROM '.$this->db->prefix().'timeflow_import_mapping';
        $sql .= " WHERE source_system = '".$this->db->escape($this->sourceSystem)."' AND mapping_type = 'user'";
        $sql .= " AND target_action = 'create_confirmed' AND source_value IN (".$inList.') ORDER BY rowid ASC';
        $resql = $this->db->query($sql);
        if (!$resql) {
            throw new RuntimeException('Erreur SQL lors de la lecture des comptes à créer : '.$this->db->lasterror());
        }
        $rows = array();
        while ($obj = $this->db->fetch_object($resql)) {
            $rows[] = $obj;
        }
        if (empty($rows)) {
            return;
        }

        $fail = function ($row, $message, $downgrade) use (&$report) {
            $report['errors'][] = array('type' => 'user', 'source_value' => $row->source_value, 'message' => $message);
            if ($downgrade) {
                $this->downgradeUserMapping($row->rowid);
            }
        };

        if (!$this->canCreateUsers($actor)) {
            foreach ($rows as $row) {
                $fail($row, 'Création refusée : droit « créer des utilisateurs » (ou administrateur) requis.', false);
            }

            return;
        }

        $baseRights = $this->baseRightIds();
        if (count($baseRights) !== count(self::BASE_RIGHTS)) {
            foreach ($rows as $row) {
                $fail($row, 'Création refusée : les droits TimeFlow de base sont introuvables (module désactivé ?).', false);
            }

            return;
        }

        foreach ($rows as $row) {
            $identity = json_decode((string) $row->new_label, true);
            $email = (string) $row->source_value;
            if (!is_array($identity) || empty($identity['login']) || !isset($identity['lastname']) || trim($identity['lastname']) === '') {
                $fail($row, 'Identité du compte manquante : décidez à nouveau pour cet email.', true);
                continue;
            }
            if (!isValidEmail($email)) {
                $fail($row, 'Adresse email invalide : compte non créé.', true);
                continue;
            }
            $existing = $this->lookupDolibarrUserByEmail($email);
            if ($existing !== null) {
                $fail($row, 'Un compte existe déjà pour cet email (« '.$existing['login'].' »)'.($existing['active'] ? '' : ' — compte désactivé').' : compte non créé.', true);
                continue;
            }
            if (!$this->loginIsWellFormed($identity['login']) || $this->loginIsTaken($identity['login'])) {
                $fail($row, 'L’identifiant « '.$identity['login'].' » n’est plus disponible : compte non créé.', true);
                continue;
            }

            $password = getRandomPassword(false); // Dolibarr's configured password generator (same as the user card)
            $newUser = new User($this->db);
            $newUser->login = $identity['login'];
            $newUser->email = $email;
            $newUser->firstname = (string) ($identity['firstname'] ?? '');
            $newUser->lastname = (string) $identity['lastname'];
            $newUser->admin = 0;
            $newUser->employee = 1;
            $newUser->entity = (int) $conf->entity;

            $this->db->begin();
            $newId = $newUser->create($actor);
            $problem = null;
            if ($newId <= 0) {
                $problem = $newUser->error ?: 'Erreur inconnue à la création du compte.';
                $newId = 0;
            } else {
                // Dolibarr grants its "default rights" (other modules') on creation: keep only the TimeFlow basics.
                $this->db->query('DELETE FROM '.$this->db->prefix().'user_rights WHERE fk_user = '.((int) $newId));
                foreach ($baseRights as $rightId) {
                    if ($newUser->addrights($rightId) <= 0) {
                        $problem = 'Impossible d’attribuer les droits TimeFlow de base.';
                        break;
                    }
                }
                if ($problem === null && !$this->accountIsExactlyBasic($newId, $baseRights)) {
                    $problem = 'Vérification des droits du compte créé échouée : compte annulé.';
                }
                if ($problem === null) {
                    $passwordResult = $newUser->setPassword($actor, $password);
                    if (is_int($passwordResult) && $passwordResult < 0) {
                        $problem = 'Impossible de définir le mot de passe : '.$newUser->error;
                    }
                }
            }

            if ($problem !== null) {
                $this->db->rollback();
                $this->discardAccount($newId);
                $fail($row, $problem, false);
                continue;
            }
            $this->db->commit();

            $this->markMappingCreated($row->rowid, $newId);

            $entry = array('source_value' => $email, 'id' => $newId, 'login' => $identity['login'], 'email_sent' => false, 'email_error' => null);
            if (getDolGlobalString('MAIN_DISABLE_ALL_MAILS')) {
                $entry['email_error'] = 'mail_disabled';
            } else {
                $fresh = new User($this->db);
                $fresh->fetch($newId);
                $fresh->conf->MAIN_LANG_DEFAULT = ''; // like the user card: mail in the current language
                if ($fresh->send_password($actor, $password, 0) > 0) {
                    $entry['email_sent'] = true;
                } else {
                    $entry['email_error'] = (string) $fresh->error;
                }
            }
            $report['users_created'][] = $entry;
        }
    }

    /** The account has exactly the given rights (and no others), is active, is not admin, and belongs to no group. */
    protected function accountIsExactlyBasic($userId, array $expectedRightIds)
    {
        $prefix = $this->db->prefix();
        $rights = array();
        $res = $this->db->query('SELECT fk_id FROM '.$prefix.'user_rights WHERE fk_user = '.((int) $userId));
        while ($res && ($obj = $this->db->fetch_object($res))) {
            $rights[] = (int) $obj->fk_id;
        }
        sort($rights);
        $admin = $this->db->query('SELECT admin, statut FROM '.$prefix.'user WHERE rowid = '.((int) $userId));
        $adminObj = $admin ? $this->db->fetch_object($admin) : null;
        $groups = $this->db->query('SELECT COUNT(*) AS nb FROM '.$prefix.'usergroup_user WHERE fk_user = '.((int) $userId));
        $groupsObj = $groups ? $this->db->fetch_object($groups) : null;

        return $rights === array_values($expectedRightIds) && $adminObj && (int) $adminObj->admin === 0 && (int) $adminObj->statut === 1 && $groupsObj && (int) $groupsObj->nb === 0;
    }

    /** @var string[] "type:value" of the mappings sent back to pending by revalidateTargetMappings() in this run. */
    protected $missingTargets = array();

    /**
     * Same revalidation as for users, for the three other kinds of mapping: every project, client and
     * group of this file whose Dolibarr record no longer exists goes back to pending.
     */
    protected function revalidateTargetMappings(array $scopedValues)
    {
        foreach (array('project', 'client', 'group') as $type) {
            foreach ($scopedValues[$type] ?? array() as $value) {
                $mapping = $this->getExistingMapping($this->sourceSystem, $type, $value);
                if (empty($mapping)) {
                    continue;
                }
                list($mapping, $missing) = $this->checkExistingTarget($type, $mapping);
                if ($missing) {
                    $this->missingTargets[] = $type.':'.$value;
                }
            }
        }
    }

    /**
     * Sends back to pending every matched user whose account is disabled or gone.
     */
    protected function revalidateUserMappings(array $emails)
    {
        foreach ($emails as $email) {
            $mapping = $this->getExistingMapping($this->sourceSystem, 'user', $email);
            if (!empty($mapping) && in_array($mapping['target_action'], self::RESOLVED_USER_ACTIONS, true) && !$this->userExistsAndActive((int) $mapping['target_id'])) {
                $this->downgradeUserMapping($mapping['rowid']);
            }
        }
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
     * Refuses to run at all while any project/client/group mapping is still
     * 'create_pending' (findPendingProjectAndGroupMappings()) — every
     * confirmed decision is executed, but nothing is guessed. Mappings whose
     * Dolibarr record was deleted since the preview are sent back to pending
     * first (revalidateTargetMappings()), so that refusal names them.
     *
     * Failures are handled per-item, not as one all-or-nothing transaction:
     * a failed project/group creation, or a CSV row that can't be turned
     * into a time entry, is recorded in the report and processing
     * continues — see $report['errors'] and $report['unresolved_rows'].
     *
     * Protected: the only caller is executeImportFromUploadedFile(), which
     * is where the upload is validated (is_uploaded_file(), extension,
     * size) before the path reaches here — this method itself only checks
     * is_readable(), never a directory allow-list.
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
    protected function executeImportFromCsvPath($csvPath, User $user)
    {
        // A full run does several SQL round-trips per CSV row (mapping
        // lookups, overlap check, create) across every pipeline step below;
        // on a several-hundred-row export this reliably exceeds PHP's
        // default 30s max_execution_time and dies mid-run with a fatal
        // error. Each step is independently idempotent/resumable (see
        // markMappingCreated(), timeEntryAlreadyImported()), so a timeout
        // here was never data-unsafe — but it shouldn't happen on a single
        // normal-sized import. Raise it for this request only, regardless
        // of what the server's php.ini otherwise allows.
        set_time_limit(300);

        if (!is_readable($csvPath)) {
            throw new RuntimeException('Le fichier CSV ne peut pas être lu.');
        }

        $scopedValues = $this->extractDistinctSourceValuesFromCsv($csvPath);

        // A project, client or group resolved at preview time may have been deleted in Dolibarr since:
        // it goes back to pending and the refusal below names it, instead of crashing half-way.
        $this->missingTargets = array();
        $this->revalidateTargetMappings($scopedValues);

        $pending = $this->findPendingProjectAndGroupMappings($scopedValues);
        if (!empty($pending)) {
            $message = 'Des éléments restent à résoudre avant de lancer l’import : '.implode(', ', $pending);
            if (!empty($this->missingTargets)) {
                $message .= ' — introuvable(s) dans Dolibarr (supprimé(s) depuis l’aperçu ?) : '.implode(', ', $this->missingTargets).'. Relancez la prévisualisation pour les résoudre à nouveau.';
            }
            throw new InvalidArgumentException($message);
        }

        // An account matched at preview time may have been disabled (or deleted) since:
        // such users go back to pending and their rows are reported, not imported.
        $this->revalidateUserMappings($scopedValues['user']);

        $report = array(
            'clients_created' => array(),
            'projects_created' => array(),
            'groups_created' => array(),
            'group_memberships_created' => 0,
            'group_memberships_existing' => 0,
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
            'users_created' => array(),
            'group_memberships_withheld' => array(),
        );

        $this->createConfirmedUsers($user, $report, $scopedValues['user']);
        $this->createConfirmedClients($user, $report, $scopedValues['client']);
        $this->createConfirmedProjectsAndGroups($user, $report, $scopedValues['project'], $scopedValues['group']);
        $this->enrichMatchedUsersFromCsv($csvPath, $user, $report);
        $this->applyGroupMemberships($report, $scopedValues['user'], $scopedValues['group']);
        $this->applyProjectContributors($report, $scopedValues['project'], $scopedValues['user']);
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
