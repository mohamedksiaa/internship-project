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
	// loadRights() exists from Dolibarr 20; 19.x only has getrights().
	method_exists($user, 'loadRights') ? $user->loadRights() : $user->getrights();
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
	 * Submitting a time entry whose timer is still running (date_end IS NULL)
	 * makes no sense: there is no finished duration to validate yet. This must
	 * be refused with a clear message and must not touch status/date_submit.
	 */
	public function testSubmitEntryRejectsActiveTimer()
	{
		global $conf, $user, $langs, $db;
		$conf = $this->savconf;
		$user = $this->savuser;
		$langs = $this->savlangs;
		$db = $this->savdb;

		// Projects now live in the native llx_projet table (see hasTimeOverlap()
		// comment); llx_timeflow_project is a pre-migration backup that is empty
		// on this install, so query the table startTimer()/isProjectClosed()
		// actually validate against.
		$projectSql = 'SELECT rowid FROM '.$db->prefix().'projet WHERE entity IN ('.getEntity('project').') AND fk_statut <> '.Project::STATUS_CLOSED.' ORDER BY rowid ASC'.$db->plimit(1);
		$projectRes = $db->query($projectSql);
		$project = $projectRes ? $db->fetch_object($projectRes) : null;
		if (!$project) {
			$this->markTestSkipped('Aucun projet disponible pour tester le démarrage du chrono.');
		}

		$localobject = new TimeEntry($db);
		$entryId = $localobject->startTimer($user->id, (int) $project->rowid, 0, 'Test soumission chrono actif', $user);
		$this->assertGreaterThan(0, $entryId, $localobject->error ?: implode(', ', $localobject->errors));

		$toSubmit = new TimeEntry($db);
		$result = $toSubmit->submitEntry($entryId, $user);
		$this->assertLessThan(0, $result);
		$this->assertStringContainsString('chronomètre', $toSubmit->error);

		$persisted = new TimeEntry($db);
		$this->assertGreaterThan(0, $persisted->fetch($entryId));
		$this->assertSame(TimeEntry::STATUS_DRAFT, (int) $persisted->status);
		$this->assertEmpty($persisted->date_submit);

		// Leave no active timer behind: the whole suite runs inside one
		// uncommitted transaction (see setUpBeforeClass/tearDownAfterClass), so
		// a still-running timer here would make hasActiveTimer() reject every
		// later test that starts a timer for the same user.
		$persisted->stopTimer($entryId, $user);
	}

	/** Pure unit test of the cap arithmetic used by every enforcement point. */
	public function testExceedsMaxDuration()
	{
		$now = dol_now();
		$cap = TimeEntry::getMaxEntryDurationSeconds();

		$this->assertFalse(TimeEntry::exceedsMaxDuration($now, $now + $cap));
		$this->assertTrue(TimeEntry::exceedsMaxDuration($now, $now + $cap + 1));
		// Invalid ranges are somebody else's problem (date-validity checks),
		// not this helper's — it must not itself reject them.
		$this->assertFalse(TimeEntry::exceedsMaxDuration(0, $now));
		$this->assertFalse(TimeEntry::exceedsMaxDuration($now, $now));
		$this->assertFalse(TimeEntry::exceedsMaxDuration($now, $now - 10));
	}

	/**
	 * A correction may only move date_start/date_end earlier than their
	 * already-recorded value — this is what makes the reported "28h27" bug
	 * (a correction pushing date_end into the next day) structurally
	 * impossible, independently of the max-duration cap.
	 */
	public function testCheckBackwardOnlyCorrection()
	{
		$oldStart = strtotime('2026-08-12 09:00:00 UTC');
		$oldEnd = strtotime('2026-08-12 17:00:00 UTC');

		// Moving start or end earlier (the two legitimate real-world cases:
		// "forgot to start on time", "forgot to stop, real end was earlier")
		// must be allowed, together or separately.
		$this->assertSame('', TimeEntry::checkBackwardOnlyCorrection($oldStart, $oldEnd, $oldStart - 3600, $oldEnd));
		$this->assertSame('', TimeEntry::checkBackwardOnlyCorrection($oldStart, $oldEnd, $oldStart, $oldEnd - 3600));
		$this->assertSame('', TimeEntry::checkBackwardOnlyCorrection($oldStart, $oldEnd, $oldStart - 3600, $oldEnd - 3600));
		// Leaving both unchanged must also be allowed.
		$this->assertSame('', TimeEntry::checkBackwardOnlyCorrection($oldStart, $oldEnd, $oldStart, $oldEnd));

		// Moving start later than its recorded value is always refused, no
		// matter how small the shift.
		$startError = TimeEntry::checkBackwardOnlyCorrection($oldStart, $oldEnd, $oldStart + 60, $oldEnd);
		$this->assertNotSame('', $startError);
		$this->assertStringContainsString('début', $startError);
		$this->assertStringContainsString('plus tôt', $startError);

		// Moving end later than its recorded value is always refused, even if
		// it stays comfortably under the max-duration cap and would have been
		// allowed under the old rule.
		$endError = TimeEntry::checkBackwardOnlyCorrection($oldStart, $oldEnd, $oldStart, $oldEnd + 60);
		$this->assertNotSame('', $endError);
		$this->assertStringContainsString('fin', $endError);
		$this->assertStringContainsString('plus tôt', $endError);

		// A newEnd of 0 (no end being set/changed) must never be treated as
		// "later than oldEnd" — this is the createManualEntry()/active-timer
		// case, out of this rule's scope.
		$this->assertSame('', TimeEntry::checkBackwardOnlyCorrection($oldStart, $oldEnd, $oldStart, 0));
	}

	/**
	 * A manual entry whose end date implies a duration beyond the cap must be
	 * refused outright — there is no midnight-split rescue for this path,
	 * only stopTimer() gets that (see testStopTimerSplitsAtMidnightWhenOverCap).
	 */
	public function testCreateManualEntryRejectsDurationOverCap()
	{
		global $conf, $user, $langs, $db;
		$conf = $this->savconf;
		$user = $this->savuser;
		$langs = $this->savlangs;
		$db = $this->savdb;

		$now = dol_now();
		$cap = TimeEntry::getMaxEntryDurationSeconds();

		$entry = new TimeEntry($db);
		$result = $entry->createManualEntry(
			(int) $user->id,
			0,
			0,
			$now - $cap - 3600,
			$now,
			'Test plafond de durée dépassé',
			'',
			0,
			$user,
			null,
			TimeEntry::STATUS_DRAFT
		);
		$this->assertLessThan(0, $result);
		$this->assertStringContainsString((string) TimeEntry::getMaxEntryDurationHours(), $entry->error);

		// The exact same range, one second under the cap, must be accepted.
		$entry2 = new TimeEntry($db);
		$okResult = $entry2->createManualEntry(
			(int) $user->id,
			0,
			0,
			$now - $cap,
			$now,
			'Test plafond de durée respecté',
			'',
			0,
			$user,
			null,
			TimeEntry::STATUS_DRAFT
		);
		$this->assertGreaterThan(0, $okResult, $entry2->error ?: implode(', ', $entry2->errors));
	}

	/**
	 * A timer left running past the cap must never be refused when stopped —
	 * only split at midnight into one segment per calendar day, each keeping
	 * its own accurate date_start/date_end/duration, chained via
	 * fk_split_previous (oldest first) so the UI can show a "continues
	 * tomorrow/yesterday" link without confusing it with a voluntary resume.
	 */
	public function testStopTimerSplitsAtMidnightWhenOverCap()
	{
		global $conf, $user, $langs, $db;
		$conf = $this->savconf;
		$user = $this->savuser;
		$langs = $this->savlangs;
		$db = $this->savdb;

		$projectSql = 'SELECT rowid FROM '.$db->prefix().'projet WHERE entity IN ('.getEntity('project').') AND fk_statut <> '.Project::STATUS_CLOSED.' ORDER BY rowid ASC'.$db->plimit(1);
		$projectRes = $db->query($projectSql);
		$project = $projectRes ? $db->fetch_object($projectRes) : null;
		if (!$project) {
			$this->markTestSkipped('Aucun projet disponible pour tester le démarrage du chrono.');
		}

		$localobject = new TimeEntry($db);
		$entryId = $localobject->startTimer($user->id, (int) $project->rowid, 0, 'Test scission chrono a minuit', $user);
		$this->assertGreaterThan(0, $entryId, $localobject->error ?: implode(', ', $localobject->errors));

		// Force fully deterministic, fixed UTC timestamps for both ends instead
		// of anything relative to "now": 2026-01-01 09:00:00 -> 2026-01-02
		// 14:00:00 is 29h total, split by the midnight between them into a 15h
		// segment and a 14h segment — both comfortably under the 18h default
		// cap, matching the shape of the real "28h27" bug this whole feature
		// was built to prevent.
		$fixedStart = strtotime('2026-01-01 09:00:00 UTC');
		$fixedStop = strtotime('2026-01-02 14:00:00 UTC');
		$midnight = strtotime('2026-01-02 00:00:00 UTC');
		$sql = 'UPDATE '.$db->prefix().'timeflow_timeentry SET date_start = \''.$db->idate($fixedStart).'\' WHERE rowid = '.((int) $entryId);
		$this->assertNotFalse($db->query($sql));

		$toStop = new TimeEntry($db);
		$this->assertGreaterThan(0, $toStop->fetch($entryId));
		$result = $toStop->stopTimer($entryId, $user, $fixedStop);
		$this->assertGreaterThan(0, $result, $toStop->error ?: implode(', ', $toStop->errors));

		// $toStop now represents the final segment: ends at the real stop time.
		$this->assertNotSame($entryId, (int) $toStop->id, 'Final segment should be a new row, not the original one');
		$this->assertSame($midnight, (int) $toStop->date_start);
		$this->assertSame($fixedStop, (int) $toStop->date_end);
		$this->assertSame($fixedStop - $midnight, (int) $toStop->duration);
		$this->assertSame($entryId, (int) $toStop->fk_split_previous);
		$this->assertLessThanOrEqual(TimeEntry::getMaxEntryDurationSeconds(), (int) $toStop->duration);

		$this->assertCount(1, $toStop->splitSegments, 'Expected exactly one earlier segment for a single midnight crossing');
		$firstSegment = $toStop->splitSegments[0];
		$this->assertSame($entryId, (int) $firstSegment->id);
		$this->assertSame($fixedStart, (int) $firstSegment->date_start);
		$this->assertSame($midnight, (int) $firstSegment->date_end);
		$this->assertSame($midnight - $fixedStart, (int) $firstSegment->duration);
		$this->assertEmpty($firstSegment->fk_split_previous);
		$this->assertLessThanOrEqual(TimeEntry::getMaxEntryDurationSeconds(), (int) $firstSegment->duration);

		// The two segments' durations must sum to the exact real elapsed time —
		// this is what guarantees correct per-day totals with no double count
		// and no lost time (see the dashboard/day-grouping analysis).
		$this->assertSame($fixedStop - $fixedStart, (int) $firstSegment->duration + (int) $toStop->duration);

		// Both rows must actually be persisted and independently fetchable.
		$sql = 'SELECT rowid, status, fk_split_previous, duration FROM '.$db->prefix().'timeflow_timeentry';
		$sql .= ' WHERE rowid IN ('.((int) $entryId).', '.((int) $toStop->id).') ORDER BY rowid ASC';
		$res = $db->query($sql);
		$this->assertNotFalse($res);
		$rows = array();
		while ($obj = $db->fetch_object($res)) {
			$rows[] = $obj;
		}
		$this->assertCount(2, $rows);
		foreach ($rows as $row) {
			$this->assertSame(TimeEntry::STATUS_DRAFT, (int) $row->status);
		}
	}

	/**
	 * The nightly cron must close any timer still active from a previous
	 * calendar day at that day's midnight, and continue it into a brand-new
	 * ACTIVE row starting today — unlike stopTimer()'s split, there is no
	 * real "stop": the final segment is left running (date_end NULL),
	 * triggered purely by having crossed a midnight, regardless of the
	 * 18h cap (a 5h overnight timer must be split too).
	 */
	public function testCloseStaleActiveTimersAtMidnightSplitsAndKeepsRunning()
	{
		global $conf, $user, $langs, $db;
		$conf = $this->savconf;
		$user = $this->savuser;
		$langs = $this->savlangs;
		$db = $this->savdb;

		$projectSql = 'SELECT rowid FROM '.$db->prefix().'projet WHERE entity IN ('.getEntity('project').') AND fk_statut <> '.Project::STATUS_CLOSED.' ORDER BY rowid ASC'.$db->plimit(1);
		$projectRes = $db->query($projectSql);
		$project = $projectRes ? $db->fetch_object($projectRes) : null;
		if (!$project) {
			$this->markTestSkipped('Aucun projet disponible pour tester le démarrage du chrono.');
		}

		$localobject = new TimeEntry($db);
		$entryId = $localobject->startTimer($user->id, (int) $project->rowid, 0, 'Test cron scission de minuit', $user);
		$this->assertGreaterThan(0, $entryId, $localobject->error ?: implode(', ', $localobject->errors));

		// Fixed, deterministic dates: started 2026-01-01 22:00 UTC (a short 5h
		// overnight session — well under the 18h cap, proving the cron acts
		// independently of it), "now" is 2026-01-02 03:00 UTC.
		$fixedStart = strtotime('2026-01-01 22:00:00 UTC');
		$fixedNow = strtotime('2026-01-02 03:00:00 UTC');
		$midnight = strtotime('2026-01-02 00:00:00 UTC');
		$sql = 'UPDATE '.$db->prefix().'timeflow_timeentry SET date_start = \''.$db->idate($fixedStart).'\' WHERE rowid = '.((int) $entryId);
		$this->assertNotFalse($db->query($sql));

		$cronRunner = new TimeEntry($db);
		$result = $cronRunner->closeStaleActiveTimersAtMidnight('', $fixedNow);
		$this->assertSame(0, $result, implode(', ', $cronRunner->errors));

		$closedSegment = new TimeEntry($db);
		$this->assertGreaterThan(0, $closedSegment->fetch($entryId));
		$this->assertSame($fixedStart, (int) $closedSegment->date_start);
		$this->assertSame($midnight, (int) $closedSegment->date_end);
		$this->assertSame($midnight - $fixedStart, (int) $closedSegment->duration);
		$this->assertEmpty($closedSegment->fk_split_previous);

		$sql = 'SELECT rowid FROM '.$db->prefix().'timeflow_timeentry WHERE fk_split_previous = '.((int) $entryId);
		$res = $db->query($sql);
		$successor = $res ? $db->fetch_object($res) : null;
		$this->assertNotNull($successor, 'Expected a successor row chained via fk_split_previous');
		$newEntry = new TimeEntry($db);
		$this->assertGreaterThan(0, $newEntry->fetch((int) $successor->rowid));
		$this->assertSame($midnight, (int) $newEntry->date_start);
		$this->assertEmpty($newEntry->date_end, 'The final segment must be left running, not stopped');
		$this->assertSame(0, (int) $newEntry->duration);
		$this->assertSame($entryId, (int) $newEntry->fk_split_previous);
		$this->assertSame((int) $localobject->fk_project, (int) $newEntry->fk_project);
		$this->assertSame($localobject->note, $newEntry->note);

		// Leave no active timer behind for later tests in this suite.
		$newEntry->stopTimer($newEntry->id, $user, $fixedNow);
	}

	/**
	 * A user who kept a tab open across midnight (or a manual split) must
	 * still be able to stop "their" timer using the id they last knew about,
	 * even though the nightly cron already closed that exact row and moved
	 * the live session to a successor. stopTimer() must resolve the stale id
	 * by walking fk_split_previous forward instead of failing with "already
	 * stopped".
	 */
	public function testStopTimerResolvesStaleIdAfterMidnightSplit()
	{
		global $conf, $user, $langs, $db;
		$conf = $this->savconf;
		$user = $this->savuser;
		$langs = $this->savlangs;
		$db = $this->savdb;

		$projectSql = 'SELECT rowid FROM '.$db->prefix().'projet WHERE entity IN ('.getEntity('project').') AND fk_statut <> '.Project::STATUS_CLOSED.' ORDER BY rowid ASC'.$db->plimit(1);
		$projectRes = $db->query($projectSql);
		$project = $projectRes ? $db->fetch_object($projectRes) : null;
		if (!$project) {
			$this->markTestSkipped('Aucun projet disponible pour tester le démarrage du chrono.');
		}

		$localobject = new TimeEntry($db);
		$staleId = $localobject->startTimer($user->id, (int) $project->rowid, 0, 'Test id perime apres cron', $user);
		$this->assertGreaterThan(0, $staleId, $localobject->error ?: implode(', ', $localobject->errors));

		$fixedStart = strtotime('2026-02-01 22:00:00 UTC');
		$fixedNow = strtotime('2026-02-02 09:00:00 UTC');
		$sql = 'UPDATE '.$db->prefix().'timeflow_timeentry SET date_start = \''.$db->idate($fixedStart).'\' WHERE rowid = '.((int) $staleId);
		$this->assertNotFalse($db->query($sql));

		$cronRunner = new TimeEntry($db);
		$this->assertSame(0, $cronRunner->closeStaleActiveTimersAtMidnight('', $fixedNow), implode(', ', $cronRunner->errors));

		// The browser tab still only knows about $staleId — exactly the id it
		// had before the cron ran.
		$toStop = new TimeEntry($db);
		$result = $toStop->stopTimer($staleId, $user, $fixedNow);
		$this->assertGreaterThan(0, $result, $toStop->error ?: implode(', ', $toStop->errors));

		// It must have resolved to the real successor, not the stale row.
		$this->assertNotSame($staleId, (int) $toStop->id);
		$this->assertSame($staleId, (int) $toStop->fk_split_previous);
		$this->assertSame($fixedNow, (int) $toStop->date_end);
		$this->assertNotEmpty($toStop->date_end);

		// The originally-stale row must remain exactly as the cron left it —
		// stopTimer() must not touch it a second time.
		$staleRow = new TimeEntry($db);
		$this->assertGreaterThan(0, $staleRow->fetch($staleId));
		$this->assertNotEmpty($staleRow->date_end);
		$this->assertNotSame((int) $toStop->id, (int) $staleRow->id);
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
		$this->assertGreaterThan(0, $stopResult, (string) $previous->error);

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
		 * A draft that was never submitted has no official value: deleting it
		 * must issue a real physical DELETE, not a soft-delete, and must leave
		 * a lightweight distinct audit trace behind.
		 */
		public function testNeverSubmittedDraftIsHardDeleted()
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
				'Test hard-delete brouillon jamais soumis',
				'',
				0,
				$user,
				null,
				TimeEntry::STATUS_DRAFT
			);
			$this->assertGreaterThan(0, $entryId, $entry->error ?: implode(', ', $entry->errors));

			$toDelete = new TimeEntry($db);
			$this->assertGreaterThan(0, $toDelete->fetch($entryId));
			$delResult = $toDelete->delete($user);
			$this->assertGreaterThan(0, $delResult, $toDelete->error ?: implode(', ', $toDelete->errors));

			// The row must be entirely gone, not merely soft-deleted.
			$sql = 'SELECT rowid FROM '.$db->prefix().'timeflow_timeentry WHERE rowid = '.((int) $entryId);
			$res = $db->query($sql);
			$this->assertNotFalse($res);
			$this->assertNull($db->fetch_object($res), 'Never-submitted draft row still present after delete()');

			// A lightweight, distinct audit trace must remain.
			$sql = 'SELECT action FROM '.$db->prefix().'timeflow_timeentry_modification WHERE fk_timeentry = '.((int) $entryId);
			$res = $db->query($sql);
			$this->assertNotFalse($res);
			$obj = $db->fetch_object($res);
			$this->assertNotNull($obj, 'Missing audit trace for hard-deleted draft');
			$this->assertSame(TimeEntry::MOD_ACTION_DELETE_DRAFT_HARD, $obj->action);
		}

		/**
		 * Even if status is somehow reported back as DRAFT after an entry has
		 * once been submitted (e.g. a future "recall to draft" feature), the
		 * write-once date_submit/fk_user_submit markers must still block the
		 * physical-delete path: only status alone is not trusted for this rule.
		 */
		public function testEntrySubmittedThenRevertedToDraftIsNeverHardDeleted()
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
				'Test protection anti hard-delete apres soumission',
				'',
				0,
				$user,
				null,
				TimeEntry::STATUS_DRAFT
			);
			$this->assertGreaterThan(0, $entryId, $entry->error ?: implode(', ', $entry->errors));

			// Mark it submitted (sets the write-once date_submit/fk_user_submit),
			// then force status back to DRAFT directly at the DB level to
			// simulate a hypothetical future "recall to draft" without relying
			// on any status-reset feature actually existing today. Nobody has
			// decided on it yet (fk_user_valid is still null), but it *was*
			// submitted at least once, so it must not slip through the
			// never-submitted-draft path either.
			$this->assertGreaterThan(0, $entry->submitEntry($entryId, $user), $entry->error ?: implode(', ', $entry->errors));
			$sql = 'UPDATE '.$db->prefix().'timeflow_timeentry SET status = '.TimeEntry::STATUS_DRAFT.' WHERE rowid = '.((int) $entryId);
			$this->assertNotFalse($db->query($sql));

			$admin = new User($db);
			$admin->fetch(1);
			$admin->admin = 1;

			$toDelete = new TimeEntry($db);
			$this->assertGreaterThan(0, $toDelete->fetch($entryId));
			$delResult = $toDelete->delete($admin);
			$this->assertGreaterThan(0, $delResult, $toDelete->error ?: implode(', ', $toDelete->errors));

			// The row must still exist (soft-deleted), never physically removed.
			$sql = 'SELECT date_delete FROM '.$db->prefix().'timeflow_timeentry WHERE rowid = '.((int) $entryId);
			$res = $db->query($sql);
			$this->assertNotFalse($res);
			$row = $db->fetch_object($res);
			$this->assertNotNull($row, 'Entry once submitted was physically removed despite having official history');
			$this->assertNotNull($row->date_delete);
		}

		/**
		 * A submitted entry not yet acted on by any manager has no official
		 * value: it does not appear in the Historique (VALIDATED/REJECTED only)
		 * and a submit click can be a plain human error. Deleting it must issue
		 * a real physical DELETE, distinct from the draft hard-delete audit
		 * action, so the two cases stay distinguishable in the audit trail.
		 */
		public function testSubmittedPendingEntryIsHardDeleted()
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
				'Test hard-delete entree soumise non traitee',
				'',
				0,
				$user,
				null,
				TimeEntry::STATUS_DRAFT
			);
			$this->assertGreaterThan(0, $entryId, $entry->error ?: implode(', ', $entry->errors));
			$this->assertGreaterThan(0, $entry->submitEntry($entryId, $user), $entry->error ?: implode(', ', $entry->errors));

			// Deleting a submitted (non-draft) entry requires the deletevalidated
			// authority regardless of hard/soft outcome — use an admin.
			$admin = new User($db);
			$admin->fetch(1);
			$admin->admin = 1;

			$toDelete = new TimeEntry($db);
			$this->assertGreaterThan(0, $toDelete->fetch($entryId));
			$delResult = $toDelete->delete($admin);
			$this->assertGreaterThan(0, $delResult, $toDelete->error ?: implode(', ', $toDelete->errors));

			// The row must be entirely gone, not merely soft-deleted.
			$sql = 'SELECT rowid FROM '.$db->prefix().'timeflow_timeentry WHERE rowid = '.((int) $entryId);
			$res = $db->query($sql);
			$this->assertNotFalse($res);
			$this->assertNull($db->fetch_object($res), 'Submitted-pending entry row still present after delete()');

			$sql = 'SELECT action FROM '.$db->prefix().'timeflow_timeentry_modification WHERE fk_timeentry = '.((int) $entryId);
			$res = $db->query($sql);
			$this->assertNotFalse($res);
			$obj = $db->fetch_object($res);
			$this->assertNotNull($obj, 'Missing audit trace for hard-deleted submitted entry');
			$this->assertSame(TimeEntry::MOD_ACTION_DELETE_SUBMITTED_HARD, $obj->action);
		}

		/**
		 * Once a manager has validated or rejected an entry, fk_user_valid is
		 * permanently set and the entry must never take the physical-delete
		 * path again — even if a bug or a future feature makes its status look
		 * like DRAFT or SUBMITTED afterward. This is the manager-decision
		 * equivalent of the date_submit/fk_user_submit guard for submission.
		 */
		public function testDecidedEntryIsNeverHardDeletedEvenIfStatusIsManipulatedAfterward()
		{
			global $conf, $user, $langs, $db;
			$conf = $this->savconf;
			$user = $this->savuser;
			$langs = $this->savlangs;
			$db = $this->savdb;

			$admin = new User($db);
			$admin->fetch(1);
			$admin->admin = 1;

			$decisions = array(TimeEntry::STATUS_VALIDATED, TimeEntry::STATUS_CANCELED);
			$forcedStatusesAfterDecision = array(TimeEntry::STATUS_DRAFT, TimeEntry::STATUS_SUBMITTED);

			foreach ($decisions as $decisionStatus) {
				foreach ($forcedStatusesAfterDecision as $forcedStatus) {
					$entry = new TimeEntry($db);
					$now = dol_now();
					$entryId = $entry->createManualEntry(
						(int) $user->id,
						0,
						0,
						$now - 3600,
						$now,
						'Test protection definitive apres decision manager',
						'',
						0,
						$user,
						null,
						TimeEntry::STATUS_DRAFT
					);
					$this->assertGreaterThan(0, $entryId, $entry->error ?: implode(', ', $entry->errors));

					// A real manager decision: this is what sets fk_user_valid.
					$this->assertGreaterThan(0, $entry->validateEntry($entryId, $admin, $decisionStatus), $entry->error ?: implode(', ', $entry->errors));

					// Simulate status being reported back as DRAFT or SUBMITTED
					// afterward, without touching fk_user_valid — exactly what a
					// future status-reset feature could look like.
					$sql = 'UPDATE '.$db->prefix().'timeflow_timeentry SET status = '.$forcedStatus.' WHERE rowid = '.((int) $entryId);
					$this->assertNotFalse($db->query($sql));

					$toDelete = new TimeEntry($db);
					$this->assertGreaterThan(0, $toDelete->fetch($entryId));
					$delResult = $toDelete->delete($admin);
					$this->assertGreaterThan(0, $delResult, $toDelete->error ?: implode(', ', $toDelete->errors));

					// The row must still exist (soft-deleted), never physically removed.
					$sql = 'SELECT date_delete FROM '.$db->prefix().'timeflow_timeentry WHERE rowid = '.((int) $entryId);
					$res = $db->query($sql);
					$this->assertNotFalse($res);
					$row = $db->fetch_object($res);
					$this->assertNotNull($row, 'Entry decided by a manager (status '.$decisionStatus.') was physically removed after status was forced to '.$forcedStatus);
					$this->assertNotNull($row->date_delete);
				}
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

	/**
	 * Creates a draft entry owned by $user, ending one hour before "now" (offset keeps the slots of these tests apart).
	 *
	 * @param int $offsetHours Hours to shift the slot back
	 * @return int Entry id
	 */
	private function createDraftFor($user, $offsetHours)
	{
		global $db;
		$entry = new TimeEntry($db);
		$end = dol_now() - $offsetHours * 3600;
		$id = $entry->createManualEntry((int) $user->id, 0, 0, $end - 1800, $end, 'Test securite soumission', '', 0, $user, null, TimeEntry::STATUS_DRAFT);
		$this->assertGreaterThan(0, $id, $entry->error ?: implode(', ', $entry->errors));
		return (int) $id;
	}

	/** Reads the status of a row straight from the database. */
	private function rawStatus($id)
	{
		global $db;
		$res = $db->query('SELECT status FROM '.$db->prefix().'timeflow_timeentry WHERE rowid = '.((int) $id));
		$obj = $res ? $db->fetch_object($res) : null;
		return $obj ? (int) $obj->status : null;
	}

	/** Reads date_delete of a row straight from the database (null if not soft-deleted or absent). */
	private function rawDateDelete($id)
	{
		global $db;
		$res = $db->query('SELECT date_delete FROM '.$db->prefix().'timeflow_timeentry WHERE rowid = '.((int) $id));
		$obj = $res ? $db->fetch_object($res) : null;
		return ($obj && !empty($obj->date_delete)) ? $obj->date_delete : null;
	}

	/** SEC-07 / A-02: a user cannot submit somebody else's draft; the row stays untouched. */
	public function testSubmitEntryRefusesANonOwner()
	{
		global $db, $user;
		$id = $this->createDraftFor($user, 30);

		$stranger = new User($db);
		$stranger->id = (int) $user->id + 100000;
		$stranger->admin = 0;
		$stranger->rights = new stdClass();

		$entry = new TimeEntry($db);
		$this->assertSame(-2, $entry->submitEntry($id, $stranger));
		$this->assertSame('Accès refusé', $entry->error);
		$this->assertSame(TimeEntry::STATUS_DRAFT, $this->rawStatus($id));
	}

	/** SEC-07 / A-02: not even an administrator submits on behalf of the owner. */
	public function testSubmitEntryRefusesAnAdministratorWhoIsNotTheOwner()
	{
		global $db, $user;
		$id = $this->createDraftFor($user, 31);

		$otherAdmin = new User($db);
		$otherAdmin->id = (int) $user->id + 100001;
		$otherAdmin->admin = 1;

		$entry = new TimeEntry($db);
		$this->assertSame(-2, $entry->submitEntry($id, $otherAdmin));
		$this->assertSame(TimeEntry::STATUS_DRAFT, $this->rawStatus($id));
	}

	/** SEC-08 / A-02: only a draft can be submitted; a validated entry is not sent back to "submitted". */
	public function testSubmitEntryOnlyAcceptsADraft()
	{
		global $db, $user;
		$id = $this->createDraftFor($user, 32);
		$entry = new TimeEntry($db);
		$this->assertGreaterThan(0, $entry->validateEntry($id, $user, TimeEntry::STATUS_VALIDATED));

		$again = new TimeEntry($db);
		$this->assertSame(-1, $again->submitEntry($id, $user));
		$this->assertStringContainsString('brouillon', $again->error);
		$this->assertSame(TimeEntry::STATUS_VALIDATED, $this->rawStatus($id));
	}

	/** A-12: a soft-deleted entry can be neither submitted, validated nor rejected. */
	public function testActionsRefuseASoftDeletedEntry()
	{
		global $db, $user;
		$id = $this->createDraftFor($user, 33);
		$this->assertNotFalse($db->query('UPDATE '.$db->prefix().'timeflow_timeentry SET date_delete = "'.$db->idate(dol_now()).'" WHERE rowid = '.$id));

		$a = new TimeEntry($db);
		$this->assertSame(-1, $a->submitEntry($id, $user));
		$this->assertSame('Entrée introuvable', $a->error);
		$b = new TimeEntry($db);
		$this->assertSame(-1, $b->validateEntry($id, $user, TimeEntry::STATUS_VALIDATED));
		$c = new TimeEntry($db);
		$this->assertSame(-1, $c->validateEntry($id, $user, TimeEntry::STATUS_CANCELED));
		$this->assertSame(TimeEntry::STATUS_DRAFT, $this->rawStatus($id));
	}

	/** The owner can still submit his own draft (no regression). */
	public function testSubmitEntryStillWorksForTheOwner()
	{
		global $db, $user;
		$id = $this->createDraftFor($user, 34);
		$entry = new TimeEntry($db);
		$this->assertGreaterThan(0, $entry->submitEntry($id, $user), (string) $entry->error);
		$this->assertSame(TimeEntry::STATUS_SUBMITTED, $this->rawStatus($id));
	}

	/**
	 * ANO-SCAL-01 fix: timeflowBuildGlobalCsvRows() pages with a keyset cursor
	 * (rowid > $afterId) instead of OFFSET specifically so that a row being
	 * inserted or deleted between two batches can never cause another row to
	 * be skipped or returned twice — an OFFSET-based page would shift every
	 * row's position when one ahead of it is removed or added. This test
	 * creates 4 known rows, deletes one and inserts a new one *between* two
	 * batch calls, and checks the full export is still exactly {r1, r2, r4,
	 * r5} with nothing skipped and nothing duplicated.
	 *
	 * The cursor starts after whatever rowid already exists in this DB (the
	 * reference dataset's own rows) so the test is isolated from them.
	 */
	public function testGlobalCsvExportCursorSkipsNothingAndDuplicatesNothingAcrossInsertAndDelete()
	{
		global $conf, $user, $langs, $db;
		$conf = $this->savconf;
		$user = $this->savuser;
		$langs = $this->savlangs;
		$db = $this->savdb;

		$baseline = (int) $db->fetch_object($db->query('SELECT MAX(rowid) AS m FROM '.$db->prefix().'timeflow_timeentry'))->m;
		$now = dol_now();

		$makeRow = function ($offsetHours, $marker) use ($user, $db, $now) {
			$entry = new TimeEntry($db);
			$start = $now + ($offsetHours * 3600);
			$id = $entry->createManualEntry((int) $user->id, 1, 0, $start, $start + 1800, $marker, '', 0, $user, null, TimeEntry::STATUS_VALIDATED);
			$this->assertGreaterThan(0, $id, $entry->error ?: implode(', ', $entry->errors));
			return $id;
		};

		$r1 = $makeRow(1, 'phpunit_cursor_r1');
		$r2 = $makeRow(2, 'phpunit_cursor_r2');
		$r3 = $makeRow(3, 'phpunit_cursor_r3');
		$r4 = $makeRow(4, 'phpunit_cursor_r4');
		$this->assertTrue($r1 < $r2 && $r2 < $r3 && $r3 < $r4, 'Expected strictly increasing rowids from sequential inserts');

		$batch1 = timeflowBuildGlobalCsvRows($db, $user, $baseline, 2);
		$this->assertCount(2, $batch1['rows']);
		$this->assertSame($r2, $batch1['next_cursor']);
		$totalAfterCreate = $batch1['total_count'];

		// Between the two batches: r3 (not yet fetched) is deleted, and a new
		// row r5 is inserted — exactly the two mutation types a keyset cursor
		// must tolerate without skipping or duplicating anything.
		$toDelete = new TimeEntry($db);
		$toDelete->fetch($r3);
		$this->assertGreaterThan(0, $toDelete->delete($user));
		$r5 = $makeRow(5, 'phpunit_cursor_r5');

		$batch2 = timeflowBuildGlobalCsvRows($db, $user, $batch1['next_cursor'], 2);
		$this->assertCount(2, $batch2['rows'], 'r3 was deleted, so only r4 and r5 should remain in this batch');
		$this->assertSame($r5, $batch2['next_cursor']);
		// Net effect on the filtered total: +4 created, -1 deleted = +3 vs
		// baseline-at-create-time, and unchanged between the two batches
		// (recomputed fresh each call, not a stale snapshot from batch1).
		$this->assertSame($totalAfterCreate, $batch2['total_count']);

		$batch3 = timeflowBuildGlobalCsvRows($db, $user, $batch2['next_cursor'], 2);
		$this->assertCount(0, $batch3['rows']);
		$this->assertNull($batch3['next_cursor']);

		$allNotes = array_map(static fn ($row) => $row[3], array_merge($batch1['rows'], $batch2['rows'], $batch3['rows']));
		sort($allNotes);
		$this->assertSame(['phpunit_cursor_r1', 'phpunit_cursor_r2', 'phpunit_cursor_r4', 'phpunit_cursor_r5'], $allNotes, 'r3 must be absent (deleted), nothing else skipped, nothing duplicated');
	}

	/**
	 * Converts a fetched TimeEntry into the same associative-array shape
	 * timeflowExportTimeEntry() produces (ajax/timeentry.php) — not reachable
	 * from this test without pulling in that file's HTTP dispatch, so the
	 * handful of fields timeflowBuildSummary() actually reads are replicated
	 * directly here, including the same project/user label fallback order
	 * (title then ref; "firstname lastname" then login) so the equivalence
	 * test's label_* dictionaries are a genuine match, not an artifact of a
	 * missing field defaulting to a generic placeholder on one side only.
	 */
	private function exportForSummaryLegacy($entry, $db)
	{
		$projectLabel = null;
		if ($entry->fk_project > 0) {
			$res = $db->query('SELECT title, ref FROM '.$db->prefix().'projet WHERE rowid = '.(int) $entry->fk_project);
			$obj = $res ? $db->fetch_object($res) : null;
			if ($obj) {
				$projectLabel = !empty($obj->title) ? $obj->title : (!empty($obj->ref) ? $obj->ref : null);
			}
		}
		$userLabel = null;
		$res = $db->query('SELECT login, firstname, lastname FROM '.$db->prefix().'user WHERE rowid = '.(int) $entry->fk_user);
		$obj = $res ? $db->fetch_object($res) : null;
		if ($obj) {
			$full = trim(trim((string) $obj->firstname).' '.trim((string) $obj->lastname));
			$userLabel = $full !== '' ? $full : ((string) $obj->login !== '' ? $obj->login : null);
		}

		return array(
			'fk_project' => (int) $entry->fk_project,
			'fk_user' => (int) $entry->fk_user,
			'duration' => (int) $entry->duration,
			'billable' => (int) $entry->billable,
			'status' => (int) $entry->status,
			'tags' => (string) $entry->tags,
			'project_label' => $projectLabel,
			'user_label' => $userLabel,
		);
	}

	/**
	 * F2 (SCAL-02 fix) equivalence test: on data small enough that the OLD
	 * code's row cap never truncated it either (a dedicated test project, not
	 * the 563-row reference set itself, for a clean, fully-known expected
	 * result — same filter mechanism either way), the NEW
	 * timeflowBuildSummaryFromAggregates() (one SQL aggregation) and the OLD
	 * timeflowBuildSummary() (PHP loop over a plain fetchAll()) must return
	 * identical total_seconds/billable_seconds/non_billable_seconds, every
	 * by_X breakdown and X_labels dictionary, and by_status, for the same
	 * filter — field by field, across
	 * several filter combinations, and specifically covering three edge
	 * cases the two code paths must treat identically:
	 *  - an active timer (date_end NULL, duration 0): must still count in
	 *    by_status (both paths count entries regardless of date_end) but
	 *    contribute 0 to every duration sum;
	 *  - a soft-deleted entry (date_delete set, validated-then-deleted so it
	 *    is soft- not hard-deleted — see testSoftDeleteSetsDateAndUser()):
	 *    must be excluded from both, the same way fetchAll()'s built-in
	 *    "date_delete IS NULL" is matched by the new path's own condition;
	 *  - an entry whose date_start is right before the period (excluded by
	 *    both — the period filter is date_start-only, not an overlap test)
	 *    and one whose date_end runs past the period's end (included by
	 *    both, with its FULL duration, not clipped to the period).
	 */
	public function testDashboardSummaryAggregateMatchesLegacyComputation()
	{
		global $conf, $user, $langs, $db;
		$conf = $this->savconf;
		$user = $this->savuser;
		$langs = $this->savlangs;
		$db = $this->savdb;

		require_once DOL_DOCUMENT_ROOT.'/projet/class/project.class.php';
		$proj = new Project($db);
		$proj->ref = 'PHPUNIT-F2-'.mt_rand(100000, 999999);
		$proj->title = 'PHPUnit F2 equivalence test project';
		$proj->socid = 1; // reuses the existing "Acme Corp" test client.
		$proj->status = Project::STATUS_VALIDATED;
		$proj->usage_task = 1;
		$projectId = $proj->create($user);
		$this->assertGreaterThan(0, $projectId, (string) $proj->error);

		$periodFrom = '2026-01-01';
		$periodTo = '2026-01-31';
		$base = strtotime($periodFrom.' 09:00:00 UTC');

		// r1: validated, billable — the plain case.
		$e1 = new TimeEntry($db);
		$r1 = $e1->createManualEntry((int) $user->id, $projectId, 0, $base, $base + 3600, 'r1', '', 1, $user, null, TimeEntry::STATUS_VALIDATED);
		$this->assertGreaterThan(0, $r1, (string) $e1->error);

		// r2: submitted, non-billable.
		$e2 = new TimeEntry($db);
		$r2 = $e2->createManualEntry((int) $user->id, $projectId, 0, $base + 7200, $base + 7200 + 1800, 'r2', '', 0, $user, null, TimeEntry::STATUS_SUBMITTED);
		$this->assertGreaterThan(0, $r2, (string) $e2->error);

		// r3: active timer (date_end NULL, duration 0) inside the period — must count in by_status, contribute 0 to every sum.
		$e3 = new TimeEntry($db);
		$r3 = $e3->startTimer((int) $user->id, $projectId, 0, 'r3 active timer', $user);
		$this->assertGreaterThan(0, $r3, implode(', ', $e3->errors));
		$this->assertNotFalse($db->query('UPDATE '.$db->prefix().'timeflow_timeentry SET date_start = \''.$db->idate($base + 10800).'\' WHERE rowid = '.(int) $r3));

		// r4: validated then soft-deleted — must be excluded from both paths.
		$e4 = new TimeEntry($db);
		$r4 = $e4->createManualEntry((int) $user->id, $projectId, 0, $base + 14400, $base + 14400 + 900, 'r4 soft-deleted', '', 1, $user, null, TimeEntry::STATUS_VALIDATED);
		$this->assertGreaterThan(0, $r4, (string) $e4->error);
		$admin = new User($db);
		$admin->fetch(1);
		$toDelete = new TimeEntry($db);
		$this->assertGreaterThan(0, $toDelete->fetch($r4));
		$this->assertGreaterThan(0, $toDelete->delete($admin), (string) $toDelete->error);
		$this->assertNotNull($this->rawDateDelete($r4), 'r4 must be soft-deleted (date_delete set), not hard-deleted, for this test to mean anything');

		// r5: date_start strictly before the period — excluded by both (date_start-only boundary, not an overlap test).
		$e5 = new TimeEntry($db);
		$r5 = $e5->createManualEntry((int) $user->id, $projectId, 0, strtotime('2025-12-31 23:00:00 UTC'), strtotime('2026-01-01 02:00:00 UTC'), 'r5 before period', '', 1, $user, null, TimeEntry::STATUS_VALIDATED);
		$this->assertGreaterThan(0, $r5, (string) $e5->error);

		// r6: date_start inside the period but date_end well past it — included by both, with its FULL duration
		// (not clipped at the period boundary). A 6-day span would be rejected by createManualEntry()'s own
		// 18h max-duration guard, which is irrelevant to what this test is checking — created as a normal
		// 1h entry, then backdated/extended directly in SQL, same technique as the midnight-cron test above.
		$e6 = new TimeEntry($db);
		$r6DateStart = strtotime('2026-01-30 20:00:00 UTC');
		$r6DateEnd = strtotime('2026-02-05 20:00:00 UTC'); // 6 days later, past periodTo.
		$r6 = $e6->createManualEntry((int) $user->id, $projectId, 0, $r6DateStart, $r6DateStart + 3600, 'r6 straddles end', '', 1, $user, null, TimeEntry::STATUS_VALIDATED);
		$this->assertGreaterThan(0, $r6, (string) $e6->error);
		$r6Duration = $r6DateEnd - $r6DateStart;
		$this->assertNotFalse($db->query('UPDATE '.$db->prefix().'timeflow_timeentry SET date_end = \''.$db->idate($r6DateEnd).'\', duration = '.$r6Duration.' WHERE rowid = '.(int) $r6));

		// --- Build the same WHERE/filter the two getSummaryReports code paths use, scoped to this one test project. ---
		$filter = '(t.fk_project:=:'.$projectId.')';
		$dateRangeSql = timeflowSqlDateTimeCondition($db, 't.date_start', '>=', $periodFrom.' 00:00:00');
		$dateRangeSql .= timeflowSqlDateTimeCondition($db, 't.date_start', '<=', $periodTo.' 23:59:59');

		$whereSql = ' WHERE t.entity IN ('.getEntity('timeentry').')';
		$whereSql .= ' AND t.date_delete IS NULL';
		$whereSql .= timeflowSqlDateTimeCondition($db, 't.date_start', '>=', $periodFrom.' 00:00:00');
		$whereSql .= timeflowSqlDateTimeCondition($db, 't.date_start', '<=', $periodTo.' 23:59:59');
		$whereSql .= ' AND t.fk_project = '.$projectId;

		// --- OLD path: plain fetchAll() (no cap here — proving equivalence requires an untruncated baseline) + PHP loop. ---
		$legacyEntry = new TimeEntry($db);
		$fetched = timeflowRequireRows($legacyEntry->fetchAll('DESC', 't.date_start', 100000, 0, $filter, 'AND', $dateRangeSql), $legacyEntry, 'test:legacy');
		$legacyRows = array();
		foreach ($fetched as $obj) {
			$legacyRows[] = $this->exportForSummaryLegacy($obj, $db);
		}
		$oldSummary = timeflowBuildSummary($legacyRows, $db);

		// --- NEW path: one SQL aggregation. ---
		$newSummary = timeflowBuildSummaryFromAggregates($db, $whereSql);

		// Expect exactly r1, r2, r3 (0s), r6 — r4 (deleted) and r5 (before period) excluded.
		$this->assertCount(4, $legacyRows, 'sanity check on the OLD path\'s own row count before comparing');

		foreach (array('total_seconds', 'billable_seconds', 'non_billable_seconds', 'by_project', 'project_labels', 'by_client', 'client_labels', 'by_user', 'user_labels', 'by_status', 'by_project_employee', 'by_project_client', 'by_project_billable', 'by_employee_client', 'by_employee_billable', 'by_client_billable') as $field) {
			$this->assertSame($oldSummary[$field], $newSummary[$field], "Field '$field' differs between the legacy and the new aggregate computation");
		}

		// Pin down the actual expected values too, not just old==new (both could agree on a shared bug).
		$this->assertSame(3600 + 1800 + 0 + (int) ($r6DateEnd - $r6DateStart), $newSummary['total_seconds']);
		$this->assertSame(3600 + 0 + (int) ($r6DateEnd - $r6DateStart), $newSummary['billable_seconds'], 'r1 and r6 are billable, r2 is not, r3 contributes 0');
		$this->assertSame(4, array_sum($newSummary['by_status']), 'r1..r3 and r6 must all be counted once in by_status, r3 included despite duration=0');
	}
	}  // @phan-suppress-current-line PhanUndeclaredClass
