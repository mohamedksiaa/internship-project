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
 * Step 3 of the TimeFlow -> native llx_projet migration (see the audit
 * "Unification des projets TimeFlow / Dolibarr natif").
 *
 * Uses llx_timeflow_migration_map (written by
 * scripts/migrate_projects_to_native.php, step 2) to repoint:
 *   - llx_timeflow_timeentry.fk_project
 *   - llx_timeflow_project_user.fk_project
 * from the old llx_timeflow_project.rowid values to the corresponding new
 * llx_projet.rowid values.
 *
 * Does NOT touch application code and does NOT migrate project_user rows
 * to llx_element_contact — that is a separate later step, by design (see
 * the migration plan). This script only fixes up the fk_project column
 * values so both tables point at the new native project rows.
 *
 * SAFE BY DEFAULT: dry-run unless --execute is passed.
 *
 * Idempotent: each UPDATE is scoped to "fk_project = <old_rowid>" per map
 * entry; once applied, a row's fk_project equals the new_rowid and no
 * longer matches that WHERE clause, so re-running matches zero rows for it.
 * (This relies on old_rowid and new_rowid ranges not overlapping, which is
 * the case for this migration — verified in the pre-flight check below,
 * which aborts rather than risk a false "already applied" read if they ever did.)
 *
 * Usage:
 *   php scripts/remap_project_fk.php              # dry-run (default)
 *   php scripts/remap_project_fk.php --execute      # real run
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

/**
 * @var DoliDB $db
 */

$dryRun = !in_array('--execute', $argv, true);

echo "=== TimeFlow project FK remap (step 3/3) ===\n";
echo $dryRun ? "MODE: DRY-RUN (no data will be written — pass --execute to apply)\n\n" : "MODE: EXECUTE (writes will be committed)\n\n";

$resql = @$db->query('SELECT 1 FROM llx_timeflow_migration_map LIMIT 1');
if (!$resql) {
	echo "ERROR: llx_timeflow_migration_map does not exist or is empty of structure. Run step 1's SQL and step 2's script first.\n";
	exit(1);
}

$map = array(); // old_rowid => new_rowid
$resql = $db->query('SELECT old_rowid, new_rowid FROM llx_timeflow_migration_map ORDER BY old_rowid ASC');
while ($obj = $db->fetch_object($resql)) {
	$map[(int) $obj->old_rowid] = (int) $obj->new_rowid;
}

if (empty($map)) {
	echo "Nothing to do: llx_timeflow_migration_map is empty. Run step 2 (migrate_projects_to_native.php --execute) first.\n";
	exit(0);
}
echo count($map)." project(s) in the migration map.\n\n";

// Pre-flight: make sure no old_rowid also appears as a new_rowid — if it
// did, the idempotency argument in the header comment would not hold and
// a second run could mis-fire. This is a sanity guard, not expected to
// ever trigger with this migration's actual id ranges.
$oldIds = array_keys($map);
$newIds = array_values($map);
$overlap = array_intersect($oldIds, $newIds);
if (!empty($overlap)) {
	echo "ERROR: id-range overlap detected between old and new project rowids (".implode(',', $overlap)."). Refusing to run — this would need per-row idempotency instead of the WHERE-based approach used here.\n";
	exit(1);
}

/**
 * Reports, then optionally applies, the remap for one table/column pair.
 *
 * @return array{table:string, rows_before:int, rows_updated:int, rows_still_old_after:int}
 */
function remapTable($db, $table, $dryRun, array $map)
{
	$before = (int) $db->fetch_object($db->query(
		'SELECT COUNT(*) AS n FROM '.$table.' WHERE fk_project IN ('.implode(',', array_keys($map)).')'
	))->n;

	echo $table.": ".$before." row(s) currently reference an old (TimeFlow-only) project id.\n";

	$updated = 0;
	foreach ($map as $oldId => $newId) {
		// Count first (both branches): this is also what "rows affected"
		// means for the --execute branch, since after the UPDATE these
		// rows no longer match "fk_project = oldId" to recount them.
		$n = (int) $db->fetch_object($db->query(
			'SELECT COUNT(*) AS n FROM '.$table.' WHERE fk_project = '.$oldId
		))->n;
		if ($n === 0) {
			continue;
		}

		if ($dryRun) {
			echo "  WOULD UPDATE ".$table.": ".$n." row(s) fk_project ".$oldId." -> ".$newId."\n";
		} else {
			$db->query('UPDATE '.$table.' SET fk_project = '.$newId.' WHERE fk_project = '.$oldId);
			echo "  UPDATED ".$table.": ".$n." row(s) fk_project ".$oldId." -> ".$newId."\n";
		}
		$updated += $n;
	}

	$after = (int) $db->fetch_object($db->query(
		'SELECT COUNT(*) AS n FROM '.$table.' WHERE fk_project IN ('.implode(',', array_keys($map)).')'
	))->n;

	return array('table' => $table, 'rows_before' => $before, 'rows_updated' => $updated, 'rows_still_old_after' => $dryRun ? $before : $after);
}

$results = array();
$results[] = remapTable($db, 'llx_timeflow_timeentry', $dryRun, $map);
echo "\n";
$results[] = remapTable($db, 'llx_timeflow_project_user', $dryRun, $map);

// ---------------------------------------------------------------------
// Data-integrity check unrelated to this migration but worth surfacing:
// fk_project values that don't match ANY known old_rowid at all (neither
// migrated nor pending) — these were already orphaned before this script
// ran and won't be fixed by it.
// ---------------------------------------------------------------------
echo "\n=== Orphan check (pre-existing, not created by this migration) ===\n";
foreach (array('llx_timeflow_timeentry', 'llx_timeflow_project_user') as $table) {
	$sql = 'SELECT COUNT(*) AS n FROM '.$table.' t';
	$sql .= ' WHERE t.fk_project IS NOT NULL AND t.fk_project > 0';
	$sql .= ' AND NOT EXISTS (SELECT 1 FROM llx_timeflow_project p WHERE p.rowid = t.fk_project)';
	$sql .= ' AND NOT EXISTS (SELECT 1 FROM llx_projet p2 WHERE p2.rowid = t.fk_project)';
	$orphans = (int) $db->fetch_object($db->query($sql))->n;
	echo $table.": ".$orphans." row(s) reference a fk_project matching neither table.\n";
}

echo "\n=== Summary ===\n";
foreach ($results as $result) {
	echo $result['table'].": before=".$result['rows_before']
		.", ".($dryRun ? "would update" : "updated")."=".$result['rows_updated']
		.", still pointing at an old id after=".$result['rows_still_old_after']."\n";
}

if ($dryRun) {
	echo "\nDry-run only — nothing was written. Re-run with --execute to apply.\n";
} else {
	$stillOld = array_sum(array_column($results, 'rows_still_old_after'));
	if ($stillOld > 0) {
		echo "\nWARNING: ".$stillOld." row(s) still reference an old project id after the update — investigate before proceeding.\n";
		exit(1);
	}
	echo "\nAll rows successfully remapped.\n";
}
exit(0);
