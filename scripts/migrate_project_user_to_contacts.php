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
 * Step 4 of the TimeFlow -> native Dolibarr project migration (see the
 * audit "Unification des projets TimeFlow / Dolibarr natif" and the
 * step 2/3 scripts migrate_projects_to_native.php / remap_project_fk.php).
 *
 * For every row in llx_timeflow_project_user, ensures an equivalent
 * internal contact link exists on the corresponding native llx_projet via
 * Dolibarr's own contact API (Project::add_contact()), using role
 * PROJECTCONTRIBUTOR / source 'internal' — see ROLE MAPPING below.
 *
 * DOES NOT touch application code: timeflowCanAccessProject() and every
 * other read/write path in ajax/timeentry.php keep using
 * llx_timeflow_project_user exactly as before. This script only backfills
 * llx_element_contact so it reflects the same access, in preparation for
 * a later step that switches the application code to read from there.
 * Both tables are left in place and both keep being correct for now.
 *
 * ROLE MAPPING (confirms the audit's suggestion):
 *   llx_timeflow_project_user has no role/hierarchy concept at all — a row
 *   just means "this user may access this project". Of the two native
 *   project contact roles (element='project'):
 *     - PROJECTLEADER ("Chef de Projet") implies ownership/management —
 *       using it here would incorrectly promote every assigned user.
 *     - PROJECTCONTRIBUTOR ("Intervenant") means "works on this project",
 *       with no management connotation — the correct, conservative match
 *       for a flat "has access" relationship.
 *   => every row is migrated as PROJECTCONTRIBUTOR, source 'internal'.
 *
 * No mapping/correspondence table is created for this step: unlike step 2
 * (which needed llx_timeflow_migration_map because OTHER tables' foreign
 * keys had to be remapped against the new ids afterwards), nothing reads
 * "which timeflow_project_user row produced which element_contact row"
 * downstream — Project::add_contact() already provides its own idempotency
 * (it checks llx_element_contact itself before inserting, via
 * liste_contact()), so a separate dedup table would just be redundant
 * bookkeeping. Skip decisions are logged to stdout instead.
 *
 * A row is skipped (not an error) when its project has not been migrated
 * to llx_projet yet (i.e. it was created in TimeFlow after step 2 ran —
 * this can keep happening for as long as the application code hasn't been
 * cut over, which is intentionally a later step). Re-running this script
 * later, after that project has gone through steps 2-3, will pick it up.
 *
 * SAFE BY DEFAULT: dry-run unless --execute is passed. Dry-run replicates
 * add_contact()'s own "already linked?" check (via liste_contact(), a
 * read-only call) so the preview matches real behavior, without invoking
 * the actual insert.
 *
 * Usage:
 *   php scripts/migrate_project_user_to_contacts.php              # dry-run (default)
 *   php scripts/migrate_project_user_to_contacts.php --execute      # real run
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

$dryRun = !in_array('--execute', $argv, true);
$roleCode = 'PROJECTCONTRIBUTOR';
$roleSource = 'internal';

echo "=== TimeFlow project_user -> native element_contact migration (step 4) ===\n";
echo $dryRun ? "MODE: DRY-RUN (no data will be written — pass --execute to apply)\n\n" : "MODE: EXECUTE (writes will be committed)\n\n";
echo "Role used for every row: ".$roleCode." / source=".$roleSource." (\"Intervenant\")\n\n";

// Resolve the type-contact id dynamically rather than hardcoding it —
// robust across installs where c_type_contact rowids may differ.
$typeContactId = 0;
$resql = $db->query(
	"SELECT rowid FROM llx_c_type_contact WHERE element='project' AND source='".$db->escape($roleSource)."' AND code='".$db->escape($roleCode)."' AND active=1"
);
if ($resql && $db->num_rows($resql) > 0) {
	$typeContactId = (int) $db->fetch_object($resql)->rowid;
}
if ($typeContactId <= 0) {
	echo "ERROR: could not find an active llx_c_type_contact row for element=project, source=".$roleSource.", code=".$roleCode.".\n";
	exit(1);
}

$actingUser = new User($db);
if ($actingUser->fetch(1) <= 0) {
	echo "ERROR: could not fetch user id=1 to act as migration author.\n";
	exit(1);
}

// ---------------------------------------------------------------------
// Before counts
// ---------------------------------------------------------------------
$totalRows = (int) $db->fetch_object($db->query('SELECT COUNT(*) AS n FROM llx_timeflow_project_user'))->n;
$totalContactsBefore = (int) $db->fetch_object($db->query(
	"SELECT COUNT(*) AS n FROM llx_element_contact ec JOIN llx_c_type_contact tc ON tc.rowid = ec.fk_c_type_contact WHERE tc.element='project'"
))->n;
echo "Before: llx_timeflow_project_user=".$totalRows.", native project contacts (all roles)=".$totalContactsBefore."\n\n";

// ---------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------
$stats = array('created' => 0, 'already_linked' => 0, 'skipped_no_native_project' => 0, 'skipped_invalid_user' => 0, 'errors' => 0);
$projectCache = array(); // fk_project => Project object (avoid refetching per row)

$resql = $db->query('SELECT rowid, fk_project, fk_user FROM llx_timeflow_project_user ORDER BY fk_project, fk_user');
if (!$resql) {
	echo "ERROR: could not read llx_timeflow_project_user: ".$db->lasterror()."\n";
	exit(1);
}

while ($row = $db->fetch_object($resql)) {
	$fkProject = (int) $row->fk_project;
	$fkUser = (int) $row->fk_user;
	$label = '[project_user #'.$row->rowid.'] fk_project='.$fkProject.' fk_user='.$fkUser;

	// Project must exist natively. After steps 2-3, migrated projects'
	// fk_project already holds the NEW llx_projet id directly (it was
	// remapped in place) — so this is a plain existence check, not a
	// lookup through the (old_rowid-keyed) migration map.
	if (!array_key_exists($fkProject, $projectCache)) {
		$project = new Project($db);
		$projectCache[$fkProject] = ($project->fetch($fkProject) > 0) ? $project : null;
	}
	$project = $projectCache[$fkProject];
	if ($project === null) {
		echo "SKIP (no native project for fk_project=".$fkProject.", not migrated yet) ".$label."\n";
		$stats['skipped_no_native_project']++;
		continue;
	}

	$user = new User($db);
	if ($user->fetch($fkUser) <= 0) {
		echo "SKIP (fk_user=".$fkUser." does not resolve to a valid Dolibarr user) ".$label."\n";
		$stats['skipped_invalid_user']++;
		continue;
	}

	// Read-only replica of add_contact()'s own dedup check, so dry-run
	// reflects exactly what --execute would decide.
	$existingLinks = $project->liste_contact(-1, $roleSource);
	$alreadyLinked = false;
	if (is_array($existingLinks)) {
		foreach ($existingLinks as $link) {
			if ((int) $link['status'] === 4 && (int) $link['id'] === $fkUser && (int) $link['fk_c_type_contact'] === $typeContactId) {
				$alreadyLinked = true;
				break;
			}
		}
	}

	if ($alreadyLinked) {
		echo "ALREADY LINKED (native project #".$fkProject." <-> user #".$fkUser.") ".$label."\n";
		$stats['already_linked']++;
		continue;
	}

	if ($dryRun) {
		echo "WOULD CREATE native contact (project #".$fkProject." <-> user #".$fkUser." as ".$roleCode.") ".$label."\n";
		$stats['created']++;
		continue;
	}

	$result = $project->add_contact($fkUser, $roleCode, $roleSource, 1); // notrigger=1: pure data backfill
	if ($result > 0) {
		echo "CREATED native contact (project #".$fkProject." <-> user #".$fkUser.") ".$label."\n";
		$stats['created']++;
	} elseif ($result === 0) {
		// add_contact's own concurrent-safe dedup found it already there.
		echo "ALREADY LINKED (per add_contact) ".$label."\n";
		$stats['already_linked']++;
	} else {
		echo "ERROR creating native contact for ".$label.": ".$project->error."\n";
		$stats['errors']++;
	}
}

// ---------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------
echo "\n=== Summary ===\n";
foreach ($stats as $key => $value) {
	echo str_pad($key, 28).": ".$value."\n";
}

$totalContactsAfter = (int) $db->fetch_object($db->query(
	"SELECT COUNT(*) AS n FROM llx_element_contact ec JOIN llx_c_type_contact tc ON tc.rowid = ec.fk_c_type_contact WHERE tc.element='project'"
))->n;
echo "\nAfter: native project contacts (all roles)=".$totalContactsAfter."\n";

if ($dryRun) {
	echo "\nDry-run only — nothing was written. Re-run with --execute to apply.\n";
}
if ($stats['skipped_no_native_project'] > 0) {
	echo "\nNote: ".$stats['skipped_no_native_project']." row(s) skipped because their TimeFlow project has no native counterpart yet — this is expected for projects created after steps 2-3 ran, since application code hasn't been cut over yet. Re-run this script after migrating them.\n";
}
if ($stats['errors'] > 0) {
	echo "\n".$stats['errors']." error(s) occurred — review the log above.\n";
	exit(1);
}
exit(0);
