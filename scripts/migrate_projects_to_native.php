#!/usr/bin/env php
<?php
/*
 * Copyright (C) 2026 SuperAdmin
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see https://www.gnu.org/licenses/.
 */

/**
 * Step 2 of the TimeFlow -> native llx_projet migration (see the audit
 * "Unification des projets TimeFlow / Dolibarr natif").
 *
 * For every row in llx_timeflow_project, ensures a corresponding llx_projet
 * row exists (creating one only if genuinely needed) and records the
 * correspondence in llx_timeflow_migration_map, which step 3
 * (remap_project_fk.php) reads afterwards.
 *
 * PREREQUISITES (run manually first, this script does not create schema):
 *   mysql ... < sql/migrate_project_extrafields.sql
 *   mysql ... < sql/migrate_timeflow_migration_map.sql
 *
 * SAFE BY DEFAULT: runs in dry-run mode unless --execute is passed. Dry-run
 * performs the exact same lookups/decisions and prints them, but never
 * writes anything (no project created, no mapping row inserted).
 *
 * Idempotent: a row already present in llx_timeflow_migration_map is
 * skipped on every subsequent run, so re-running after a partial or full
 * previous --execute run only processes what's left (or nothing).
 *
 * Usage:
 *   php scripts/migrate_projects_to_native.php                 # dry-run (default)
 *   php scripts/migrate_projects_to_native.php --execute        # real run
 *   php scripts/migrate_projects_to_native.php --as-user-id=1   # user recorded as
 *                                                                 fk_user_creat when
 *                                                                 the original TimeFlow
 *                                                                 creator can't be
 *                                                                 reliably reused
 *                                                                 (see comment below)
 */

if (!defined('NOTOKENRENEWAL')) {
	define('NOTOKENRENEWAL', '1');
}
if (!defined('NOREQUIREMENU')) {
	define('NOREQUIREMENU', '1');
}
if (!defined('NOREQUIREHTML')) {
	define('NOREQUIREHTML', '1');
}
if (!defined('NOREQUIREAJAX')) {
	define('NOREQUIREAJAX', '1');
}
if (!defined('NOLOGIN')) {
	define('NOLOGIN', '1');
}
if (!defined('NOSESSION')) {
	define('NOSESSION', '1');
}
if (!defined('USESUFFIXINLOG')) {
	define('USESUFFIXINLOG', '_timeflow_migration');
}

$sapi_type = php_sapi_name();
$script_file = basename(__FILE__);
$path = __DIR__.'/';

if (substr($sapi_type, 0, 3) == 'cgi') {
	echo "Error: run this script from the command line (CLI), not CGI.\n";
	exit(1);
}

require_once $path.'../../../master.inc.php';
require_once DOL_DOCUMENT_ROOT.'/projet/class/project.class.php';
require_once DOL_DOCUMENT_ROOT.'/user/class/user.class.php';

/**
 * @var DoliDB $db
 */

// ---------------------------------------------------------------------
// CLI options
// ---------------------------------------------------------------------
$dryRun = !in_array('--execute', $argv, true);
$asUserId = 1; // default: id=1 ('admin' on this install)
foreach ($argv as $arg) {
	if (str_starts_with($arg, '--as-user-id=')) {
		$asUserId = (int) substr($arg, strlen('--as-user-id='));
	}
}

echo "=== TimeFlow -> native project migration (step 2/3) ===\n";
echo $dryRun ? "MODE: DRY-RUN (no data will be written — pass --execute to apply)\n" : "MODE: EXECUTE (writes will be committed)\n";
echo "Acting user for fk_user_creat fallback: id=".$asUserId."\n\n";

// Table prerequisites: fail fast with a clear message rather than a raw
// SQL error if step 1's SQL files haven't been run yet.
$requiredTables = array('llx_timeflow_migration_map');
foreach ($requiredTables as $table) {
	$resql = @$db->query('SELECT 1 FROM '.$table.' LIMIT 1');
	if (!$resql) {
		echo "ERROR: table ".$table." does not exist yet.\n";
		echo "Run: mysql ... < sql/migrate_timeflow_migration_map.sql\n";
		exit(1);
	}
}
$extrafieldColumnCheck = $db->query("SHOW COLUMNS FROM llx_projet_extrafields LIKE 'timeflow_source'");
if (!$extrafieldColumnCheck || $db->num_rows($extrafieldColumnCheck) === 0) {
	echo "ERROR: llx_projet_extrafields.timeflow_source column does not exist yet.\n";
	echo "Run: mysql ... < sql/migrate_project_extrafields.sql\n";
	exit(1);
}

$actingUser = new User($db);
if ($actingUser->fetch($asUserId) <= 0) {
	echo "ERROR: could not fetch user id=".$asUserId." to act as migration author.\n";
	exit(1);
}

// ---------------------------------------------------------------------
// Load already-migrated rows (idempotency)
// ---------------------------------------------------------------------
$alreadyMapped = array(); // old_rowid => new_rowid
$resql = $db->query('SELECT old_rowid, new_rowid FROM llx_timeflow_migration_map');
if ($resql) {
	while ($obj = $db->fetch_object($resql)) {
		$alreadyMapped[(int) $obj->old_rowid] = (int) $obj->new_rowid;
	}
}

// ---------------------------------------------------------------------
// Before counts
// ---------------------------------------------------------------------
$countBefore = array(
	'timeflow_project' => (int) $db->fetch_object($db->query('SELECT COUNT(*) AS n FROM llx_timeflow_project'))->n,
	'projet' => (int) $db->fetch_object($db->query('SELECT COUNT(*) AS n FROM llx_projet'))->n,
	'already_mapped' => count($alreadyMapped),
);
echo "Before: llx_timeflow_project=".$countBefore['timeflow_project']
	.", llx_projet=".$countBefore['projet']
	.", already mapped=".$countBefore['already_mapped']."\n\n";

// ---------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------
$stats = array('created' => 0, 'linked_fk_dolibarr_project' => 0, 'reused_by_ref' => 0, 'skipped_already_mapped' => 0, 'errors' => 0);

$resql = $db->query('SELECT rowid, ref, title, description, fk_dolibarr_project, fk_soc, fk_user_creat, date_creation, source, import_key FROM llx_timeflow_project ORDER BY rowid ASC');
if (!$resql) {
	echo "ERROR: could not read llx_timeflow_project: ".$db->lasterror()."\n";
	exit(1);
}

while ($row = $db->fetch_object($resql)) {
	$oldId = (int) $row->rowid;
	$label = '['.$oldId.'] ref='.$row->ref.' title="'.$row->title.'"';

	if (isset($alreadyMapped[$oldId])) {
		echo "SKIP (already mapped -> new_rowid=".$alreadyMapped[$oldId].") ".$label."\n";
		$stats['skipped_already_mapped']++;
		continue;
	}

	$newId = 0;
	$method = '';

	// Case 1: fk_dolibarr_project already points to a real native project
	// (per the audit this is 0/5 today, but stays correct if that ever
	// changes, and NEVER creates a duplicate when it's set).
	$fkDolibarrProject = (int) $row->fk_dolibarr_project;
	if ($fkDolibarrProject > 0) {
		$check = $db->query('SELECT rowid FROM llx_projet WHERE rowid = '.$fkDolibarrProject);
		if ($check && $db->num_rows($check) > 0) {
			$newId = $fkDolibarrProject;
			$method = 'linked_fk_dolibarr_project';
		} else {
			echo "WARNING: fk_dolibarr_project=".$fkDolibarrProject." set on ".$label." but no such llx_projet row exists — falling back to ref/create.\n";
		}
	}

	// Case 2: a native project with the exact same ref already exists
	// (self-healing safety net — e.g. a previous --execute run created it
	// but the process died before the mapping row was written).
	if ($newId === 0) {
		$check = $db->query("SELECT rowid FROM llx_projet WHERE ref = '".$db->escape($row->ref)."'");
		if ($check && $db->num_rows($check) > 0) {
			$obj = $db->fetch_object($check);
			$newId = (int) $obj->rowid;
			$method = 'reused_by_ref';
		}
	}

	// Case 3: create it
	if ($newId === 0) {
		if ($dryRun) {
			echo "WOULD CREATE native project for ".$label." (fk_soc=".((int) $row->fk_soc).", source=".$row->source.")\n";
			$stats['created']++;
			continue;
		}

		$project = new Project($db);
		$project->ref = $row->ref;
		$project->title = $row->title;
		$project->description = (string) $row->description;
		$project->socid = (int) $row->fk_soc;
		$project->status = Project::STATUS_VALIDATED; // "Ouvert"
		$project->usage_task = 1; // TimeFlow already relies on native tasks (llx_projet_task)
		$project->array_options['options_timeflow_source'] = (string) $row->source;
		$project->array_options['options_timeflow_import_key'] = (string) $row->import_key;

		$createResult = $project->create($actingUser, 1); // notrigger=1: pure data backfill, no notifications
		if ($createResult <= 0) {
			echo "ERROR creating native project for ".$label.": ".$project->error."\n";
			$stats['errors']++;
			continue;
		}
		$newId = (int) $createResult;
		$method = 'created';

		// create() always stamps fk_user_creat/datec with the acting user
		// and "now" — overwrite both to preserve the original TimeFlow
		// authorship/creation date for continuity.
		$fixupSql = 'UPDATE llx_projet SET fk_user_creat = '.((int) $row->fk_user_creat);
		$fixupSql .= ", datec = '".$db->escape($row->date_creation)."'";
		$fixupSql .= ' WHERE rowid = '.$newId;
		if (!$db->query($fixupSql)) {
			echo "WARNING: created native project rowid=".$newId." but failed to fix up fk_user_creat/datec: ".$db->lasterror()."\n";
		}

		echo "CREATED native project rowid=".$newId." for ".$label."\n";
	} else {
		echo strtoupper(str_replace('_', ' ', $method))." -> native project rowid=".$newId." for ".$label."\n";
	}

	$stats[$method]++;

	if (!$dryRun) {
		$mapSql = 'INSERT INTO llx_timeflow_migration_map (old_rowid, new_rowid, method, date_creation)';
		$mapSql .= ' VALUES ('.$oldId.', '.$newId.", '".$db->escape($method)."', '".$db->idate(dol_now())."')";
		if (!$db->query($mapSql)) {
			echo "ERROR: created/linked native project rowid=".$newId." but failed to write the mapping row for old_rowid=".$oldId.": ".$db->lasterror()."\n";
			$stats['errors']++;
		}
	}
}

// ---------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------
echo "\n=== Summary ===\n";
foreach ($stats as $key => $value) {
	echo str_pad($key, 28).": ".$value."\n";
}

$countAfter = array(
	'timeflow_project' => (int) $db->fetch_object($db->query('SELECT COUNT(*) AS n FROM llx_timeflow_project'))->n,
	'projet' => (int) $db->fetch_object($db->query('SELECT COUNT(*) AS n FROM llx_projet'))->n,
	'mapped' => (int) $db->fetch_object($db->query('SELECT COUNT(*) AS n FROM llx_timeflow_migration_map'))->n,
);
echo "\nAfter: llx_timeflow_project=".$countAfter['timeflow_project']
	.", llx_projet=".$countAfter['projet']
	.", mapped=".$countAfter['mapped']."\n";

if ($dryRun) {
	echo "\nDry-run only — nothing was written. Re-run with --execute to apply.\n";
}
if ($stats['errors'] > 0) {
	echo "\n".$stats['errors']." error(s) occurred — review the log above before proceeding to step 3.\n";
	exit(1);
}
exit(0);
