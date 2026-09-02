<?php
/* Copyright (C) 2007-2017	Laurent Destailleur			<eldy@users.sourceforge.net>
 * Copyright (C) 2023		Alexandre Janniaux			<alexandre.janniaux@gmail.com>
 * Copyright (C) 2026		SuperAdmin
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
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * \file    test/phpunit/TimeEntryTest.php
 * \ingroup timeflow
 * \brief   PHPUnit test for TimeEntry class.
 */

global $conf, $user, $langs, $db;
//define('TEST_DB_FORCE_TYPE','mysql');	// This is to force using mysql driver

//require_once 'PHPUnit/Autoload.php';
// Locate Dolibarr master.inc.php by walking up parent directories
$bootstrapDir = __DIR__;
$foundBootstrap = false;
while (true) {
	if (is_file($bootstrapDir . '/master.inc.php')) {
		require_once $bootstrapDir . '/master.inc.php';
		$foundBootstrap = true;
		break;
	}
	$parent = dirname($bootstrapDir);
	if ($parent === $bootstrapDir) break; // reached filesystem root
	$bootstrapDir = $parent;
}
if (! $foundBootstrap) {
	throw new \RuntimeException('master.inc.php not found. Adjust test bootstrap or set DOL_DOCUMENT_ROOT.');
}
// Require module class relative to module root (two levels above test/phpunit)
$moduleRoot = dirname(__DIR__, 2);
require_once $moduleRoot . '/class/timeentry.class.php';  

if (empty($user->id)) {
	print "Load permissions for admin user nb 1\n";
	$user->fetch(1);
	$user->loadRights();
}
$conf->global->MAIN_DISABLE_ALL_MAILS = 1;

$langs->load("main");


/**
 * Class TimeEntryTest
 *
 * @backupGlobals disabled
 * @backupStaticAttributes enabled
 * @remarks	backupGlobals must be disabled to have db,conf,user and lang not erased.
 * @phan-file-suppress PhanCompatibleVoidTypePHP70
 */
class TimeEntryTest extends PHPUnit\Framework\TestCase  // @phan-suppress-current-line PhanUndeclaredExtendedClass
{
	/**
	 * @var Conf Saved configuration object
	 */
	protected $savconf;
	/**
	 * @var User Saved User object
	 */
	protected $savuser;
	/**
	 * @var Translate Saved translations object (from $langs)
	 */
	protected $savlangs;
	/**
	 * @var DoliDB Saved database object
	 */
	protected $savdb;

	/**
	 * Constructor
	 * We save global variables into local variables
	 *
	 * @param 	string	$name		Name
	 */
	public function __construct($name = '')
	{
		parent::__construct($name);  // @phan-suppress-current-line PhanUndeclaredClass

		//$this->sharedFixture
		global $conf, $user, $langs, $db;
		$this->savconf = $conf;
		$this->savuser = $user;
		$this->savlangs = $langs;
		$this->savdb = $db;

		print __METHOD__." db->type=".$db->type." user->id=".$user->id;
		//print " - db ".$db->db;
		print "\n";
	}

	/**
	 * Global test setup
	 *
	 * @return void No return value
	 */
	public static function setUpBeforeClass(): void
	{
		global $conf, $user, $langs, $db;
		$db->begin(); // This is to have all actions inside a transaction even if test launched without suite.

		print __METHOD__."\n";
	}

	/**
	 * Unit test setup
	 *
	 * @return void No return value
	 */
	protected function setUp(): void
	{
		global $conf, $user, $langs, $db;
		$conf = $this->savconf;
		$user = $this->savuser;
		$langs = $this->savlangs;
		$db = $this->savdb;

		print __METHOD__."\n";
	}

	/**
	 * Unit test teardown
	 *
	 * @return void  No return value
	 */
	protected function tearDown(): void
	{
		print __METHOD__."\n";
	}

	/**
	 * Global test teardown
	 *
	 * @return void No return value
	 */
	public static function tearDownAfterClass(): void
	{
		global $conf, $user, $langs, $db;
		$db->rollback();

		print __METHOD__."\n";
	}


	/**
	 * A sample test
	 *
	 * @return bool
	 * @phan-suppress PhanUndeclaredMethod
	 */
	public function testSomething()
	{
		global $conf, $user, $langs, $db;
		$conf = $this->savconf;
		$user = $this->savuser;
		$langs = $this->savlangs;
		$db = $this->savdb;

		$result = true;

		print __METHOD__." result=".((int) $result)."\n";
		$this->assertTrue($result);

		return $result;
	}

	/**
	 * testTimeEntryCreate
	 *
	 * @return int
	 * @phan-suppress PhanUndeclaredMethod
	 */
	public function testTimeEntryCreate()
	{
		global $conf, $user, $langs, $db;
		$conf = $this->savconf;
		$user = $this->savuser;
		$langs = $this->savlangs;
		$db = $this->savdb;

		$localobject = new TimeEntry($this->savdb);
		$start = (int) dol_now();
		$localobject->fk_user = (int) $user->id;
		$localobject->fk_project = 1;
		$localobject->date_start = $this->savdb->idate($start);
		$localobject->date_end = $this->savdb->idate($start + 3600);
		$localobject->duration = 3600;
		$localobject->status = TimeEntry::STATUS_DRAFT;
		$localobject->note = 'Test de création';
		$localobject->is_manually_edited = 0;
		$localobject->occurrence_count = 1;
		$result = $localobject->create($user);

		print __METHOD__." result=".$result."\n";
		$this->assertGreaterThan(0, $result);

		return $result;
	}

	/**
	 * testStartTimerValidation
	 *
	 * Vérifie que startTimer rejette un projet vide et une description
	 * de moins de 3 caractères, même en appel direct (défense en profondeur).
	 *
	 * @return void
	 * @phan-suppress PhanUndeclaredMethod
	 */
	public function testStartTimerValidation()
	{
		global $conf, $user, $langs, $db;
		$conf = $this->savconf;
		$user = $this->savuser;
		$langs = $this->savlangs;
		$db = $this->savdb;

		$localobject = new TimeEntry($this->savdb);

		// Cas 1 : projet vide + description vide → refusé
		$result = $localobject->startTimer($user->id, 0, 0, '');
		print __METHOD__." empty project/note result=".$result."\n";
		$this->assertLessThan(0, $result);
		$this->assertNotEquals('', $localobject->error);

		// Cas 2 : projet vide + description valide → refusé
		$result = $localobject->startTimer($user->id, 0, 0, 'Analyse');
		print __METHOD__." empty project result=".$result."\n";
		$this->assertLessThan(0, $result);
		$this->assertNotEquals('', $localobject->error);

		// Cas 3 : projet valide + description < 3 caractères → refusé
		$result = $localobject->startTimer($user->id, 1, 0, 'ab');
		print __METHOD__." short note result=".$result."\n";
		$this->assertLessThan(0, $result);
		$this->assertNotEquals('', $localobject->error);

		// Cas 4 : description avec uniquement des espaces → refusé
		$result = $localobject->startTimer($user->id, 1, 0, '   ');
		print __METHOD__." whitespace note result=".$result."\n";
		$this->assertLessThan(0, $result);
		$this->assertNotEquals('', $localobject->error);
	}

	/**
	 * A valid timer start must initialize the non-null manual-edit flag to zero.
	 *
	 * @return void
	 * @phan-suppress PhanUndeclaredMethod
	 */
	public function testStartTimerInitializesManualEditFlag()
	{
		global $conf, $user, $langs, $db;
		$conf = $this->savconf;
		$user = $this->savuser;
		$langs = $this->savlangs;
		$db = $this->savdb;

		$projectSql = 'SELECT rowid FROM '.$db->prefix().'timeflow_project WHERE entity IN ('.getEntity('timeflow_project').') ORDER BY rowid ASC'.$db->plimit(1);
		$projectRes = $db->query($projectSql);
		$project = $projectRes ? $db->fetch_object($projectRes) : null;
		if (!$project) {
			$this->markTestSkipped('Aucun projet TimeFlow disponible pour tester le démarrage du chrono.');
		}

		$localobject = new TimeEntry($db);
		$result = $localobject->startTimer($user->id, (int) $project->rowid, 0, 'Test timer valide', $user);
		$this->assertGreaterThan(0, $result, $localobject->error ?: implode(', ', $localobject->errors));
		$this->assertSame(0, (int) $localobject->is_manually_edited);
		$localobject->stopTimer($result, $user);
	}

	/**
	 * Resuming a stopped task must create a brand new entry (same project,
	 * task and note copied from the previous one) rather than reopening/
	 * rewriting the old row. This mirrors what ajax/timeentry.php's
	 * 'restartTimer' case now does: fetch the old entry to read its
	 * project/task/note/tags/billable, then call startTimer() on a fresh
	 * object. The assertions here protect the two guarantees the whole
	 * redesign depends on: the new row is fully independent (own id, own
	 * date_start/date_end/duration always coherent with each other) and the
	 * old row is never touched — no more retroactive rewrite of a previous
	 * segment's date_start/date_end/duration on resume.
	 *
	 * @return void
	 * @phan-suppress PhanUndeclaredMethod
	 */
	public function testResumeCreatesNewEntryAndLeavesPreviousOneUntouched()
	{
		global $conf, $user, $langs, $db;
		$conf = $this->savconf;
		$user = $this->savuser;
		$langs = $this->savlangs;
		$db = $this->savdb;

		$projectSql = 'SELECT rowid FROM '.$db->prefix().'projet WHERE entity IN ('.getEntity('project').') ORDER BY rowid ASC'.$db->plimit(1);
		$projectRes = $db->query($projectSql);
		$project = $projectRes ? $db->fetch_object($projectRes) : null;
		if (!$project) {
			$this->markTestSkipped('Aucun projet natif disponible pour tester la reprise du chrono.');
		}
		$fkProject = (int) $project->rowid;

		// Simulates the original task: started, then stopped a while later.
		$previous = new TimeEntry($db);
		$startResult = $previous->startTimer($user->id, $fkProject, 0, 'Tâche à reprendre — test', $user);
		$this->assertGreaterThan(0, $startResult, $previous->error ?: implode(', ', $previous->errors));
		$stopResult = $previous->stopTimer($startResult, $user);
		$this->assertGreaterThan(0, $stopResult, $previous->error);

		$previousBefore = new TimeEntry($db);
		$previousBefore->fetch($startResult);
		$snapshotStart = $previousBefore->date_start;
		$snapshotEnd = $previousBefore->date_end;
		$snapshotDuration = (int) $previousBefore->duration;
		$snapshotStatus = (int) $previousBefore->status;
		$this->assertSame($snapshotEnd ? (int) $snapshotEnd - (int) $snapshotStart : 0, $snapshotDuration, 'La durée arrêtée doit déjà être cohérente avec date_end - date_start.');

		// Simulates the ajax 'restartTimer' case: read the previous entry's
		// project/task/note, then create a fresh entry with them — never
		// touching $previous itself.
		$resumed = new TimeEntry($db);
		$resumeResult = $resumed->startTimer($user->id, (int) $previousBefore->fk_project, (int) $previousBefore->fk_task, (string) $previousBefore->note, $user, (string) $previousBefore->tags, (int) $previousBefore->billable);
		$this->assertGreaterThan(0, $resumeResult, $resumed->error ?: implode(', ', $resumed->errors));
		$this->assertNotEquals($startResult, $resumeResult, 'La reprise doit créer une ligne distincte, jamais réutiliser l’ancien id.');

		// The new entry starts its own, independent, always-coherent segment.
		$this->assertSame(0, (int) $resumed->duration);
		$this->assertNull($resumed->date_end);
		$this->assertSame((string) $previousBefore->note, (string) $resumed->note);
		$this->assertSame((int) $previousBefore->fk_project, (int) $resumed->fk_project);

		// The previous entry must be byte-for-byte unchanged after the resume.
		$previousAfter = new TimeEntry($db);
		$previousAfter->fetch($startResult);
		$this->assertSame((string) $snapshotStart, (string) $previousAfter->date_start);
		$this->assertSame((string) $snapshotEnd, (string) $previousAfter->date_end);
		$this->assertSame($snapshotDuration, (int) $previousAfter->duration);
		$this->assertSame($snapshotStatus, (int) $previousAfter->status);

		$resumed->stopTimer($resumeResult, $user);
	}

	/**
	 * A normal user must never delete an entry once it has been validated.
	 * The assertion reloads the row after the failed deletion attempt so this
	 * protects against a false error returned after a DELETE was executed.
	 *
	 * @return void
	 * @phan-suppress PhanUndeclaredMethod
	 */
	public function testValidatedEntryCannotBeDeletedByNormalUser()
	{
		global $conf, $user, $langs, $db;
		$conf = $this->savconf;
		$user = $this->savuser;
		$langs = $this->savlangs;
		$db = $this->savdb;

		$entry = new TimeEntry($db);
		$now = dol_now();
		$entryId = $entry->createManualEntry(
			(int) $user->id,
			0,
			0,
			$now - 3600,
			$now,
			'Test protection suppression validation',
			'',
			0,
			$user,
			null,
			TimeEntry::STATUS_DRAFT
		);
		$this->assertGreaterThan(0, $entryId, $entry->error ?: implode(', ', $entry->errors));

		$this->assertGreaterThan(0, $entry->validateEntry($entryId, $user, TimeEntry::STATUS_VALIDATED), $entry->error ?: implode(', ', $entry->errors));

		// This is deliberately a non-admin user with no TimeFlow rights.  Its id
		// matches the entry owner so the test proves the status rule, not merely
		// an ownership denial.
		$normalUser = new User($db);
		$normalUser->id = (int) $user->id;
		$normalUser->admin = 0;
		$normalUser->rights = null;

		$entryToDelete = new TimeEntry($db);
		$this->assertGreaterThan(0, $entryToDelete->fetch($entryId));
		$deleteResult = $entryToDelete->delete($normalUser);
		$this->assertLessThan(0, $deleteResult);
		$this->assertStringContainsString('immuable', $entryToDelete->error);

		$persistedEntry = new TimeEntry($db);
		$this->assertGreaterThan(0, $persistedEntry->fetch($entryId));
		$this->assertSame(TimeEntry::STATUS_VALIDATED, (int) $persistedEntry->status);
	}

	/**
	 * testTimeEntryDelete
	 *
	 * @param	int		$id		Id of object
	 * @return	int
	 *
	 * @depends	testTimeEntryCreate
	 * The depends says test is run only if previous is ok
	 * @phan-suppress PhanUndeclaredMethod
	 */
	public function testTimeEntryDelete($id)
	{
		global $conf, $user, $langs, $db;
		$conf = $this->savconf;
		$user = $this->savuser;
		$langs = $this->savlangs;
		$db = $this->savdb;

		$localobject = new TimeEntry($this->savdb);
		$result = $localobject->fetch($id);
		$result = $localobject->delete($user);

		print __METHOD__." id=".$id." result=".$result."\n";
		$this->assertLessThan($result, 0);
		return $result;
	}

	/**
	 * testSoftDeleteSetsDateAndUser
	 *
	 * Verifies that deleting a validated entry by an admin produces a soft-delete
	 * by setting `date_delete` (and `fk_user_delete` when available).
	 */
	public function testSoftDeleteSetsDateAndUser()
	{
		global $conf, $user, $langs, $db;
		$conf = $this->savconf;
		$user = $this->savuser;
		$langs = $this->savlangs;
		$db = $this->savdb;

		// Create a draft entry and validate it so deletion will soft-delete.
		$entry = new TimeEntry($db);
		$now = dol_now();
		$entryId = $entry->createManualEntry(
			(int) $user->id,
			0,
			0,
			$now - 3600,
			$now,
			'Test soft-delete',
			'',
			0,
			$user,
			null,
			TimeEntry::STATUS_DRAFT
		);
		$this->assertGreaterThan(0, $entryId, $entry->error ?: implode(', ', $entry->errors));

		$this->assertGreaterThan(0, $entry->validateEntry($entryId, $user, TimeEntry::STATUS_VALIDATED), $entry->error ?: implode(', ', $entry->errors));

		// Use admin user to perform deletion which should succeed.
		$admin = new User($db);
		$admin->fetch(1);
		$admin->admin = 1;

		$toDelete = new TimeEntry($db);
		$this->assertGreaterThan(0, $toDelete->fetch($entryId));
		$delResult = $toDelete->delete($admin);
		$this->assertGreaterThan(0, $delResult, $toDelete->error ?: implode(', ', $toDelete->errors));

		// Inspect raw row to ensure soft-delete columns are set when present.
		$sql = 'SELECT date_delete, fk_user_delete FROM '.$db->prefix().'timeflow_timeentry WHERE rowid = '.((int) $entryId);
		$res = $db->query($sql);
		$this->assertNotFalse($res);
		$row = $db->fetch_object($res);
		// date_delete must be set
		$this->assertNotNull($row->date_delete);
		// If fk_user_delete column exists, it must match admin id
		if (property_exists($row, 'fk_user_delete')) {
			$this->assertSame((int) $admin->id, (int) $row->fk_user_delete);
		}
		}


		/**
		 * testSoftDeletedEntryVisibility
		 *
		 * Validates that a soft-deleted entry is removed from active lists
		 * (fetchAll/fetchVisible) but remains present when querying the
		 * processed history (by status = validated).
		 */
		public function testSoftDeletedEntryVisibility()
		{
			global $conf, $user, $langs, $db;
			$conf = $this->savconf;
			$user = $this->savuser;
			$langs = $this->savlangs;
			$db = $this->savdb;

			$entry = new TimeEntry($db);
			$now = dol_now();
			$entryId = $entry->createManualEntry(
				(int) $user->id,
				0,
				0,
				$now - 3600,
				$now,
				'Visibility test',
				'',
				0,
				$user,
				null,
				TimeEntry::STATUS_DRAFT
			);
			$this->assertGreaterThan(0, $entryId, $entry->error ?: implode(', ', $entry->errors));

			$this->assertGreaterThan(0, $entry->validateEntry($entryId, $user, TimeEntry::STATUS_VALIDATED), $entry->error ?: implode(', ', $entry->errors));

			$admin = new User($db);
			$admin->fetch(1);
			$admin->admin = 1;

			$toDelete = new TimeEntry($db);
			$this->assertGreaterThan(0, $toDelete->fetch($entryId));
			$delResult = $toDelete->delete($admin);
			$this->assertGreaterThan(0, $delResult, $toDelete->error ?: implode(', ', $toDelete->errors));

			// Active list (fetchAll) must not contain the soft-deleted entry.
			$te = new TimeEntry($db);
			$active = $te->fetchAll('DESC', 't.date_start', 1000, 0, '');
			$this->assertIsArray($active);
			$this->assertArrayNotHasKey((int)$entryId, $active, 'Soft-deleted entry found in active list');

			// Processed history: raw DB query filtering by status must still find it.
			$sql = 'SELECT rowid FROM '.$db->prefix().'timeflow_timeentry WHERE status = '.TimeEntry::STATUS_VALIDATED.' AND rowid = '.((int) $entryId);
			$res = $db->query($sql);
			$obj = $res ? $db->fetch_object($res) : null;
			$this->assertNotNull($obj, 'Soft-deleted validated entry missing from history query');
			$this->assertSame((int)$entryId, (int)$obj->rowid);
		}
	}  // @phan-suppress-current-line PhanUndeclaredClass
