<?php
/* Copyright (C) 2026		SuperAdmin
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
 * \file    test/phpunit/timeimportTest.php
 * \ingroup timeflow
 * \brief   PHPUnit test for TimeImportClockify — I1 (unique index on import_key) race handling.
 */

global $conf, $user, $langs, $db;

$bootstrapDir = __DIR__;
$foundBootstrap = false;
while (true) {
	if (is_file($bootstrapDir . '/master.inc.php')) {
		require_once $bootstrapDir . '/master.inc.php';
		$foundBootstrap = true;
		break;
	}
	$parent = dirname($bootstrapDir);
	if ($parent === $bootstrapDir) break;
	$bootstrapDir = $parent;
}
if (!$foundBootstrap) {
	throw new \RuntimeException('master.inc.php not found. Adjust test bootstrap or set DOL_DOCUMENT_ROOT.');
}
$moduleRoot = dirname(__DIR__, 2);
require_once $moduleRoot . '/class/timeentry.class.php';
require_once $moduleRoot . '/class/timeimport.class.php';
require_once DOL_DOCUMENT_ROOT.'/projet/class/project.class.php';

if (empty($user->id)) {
	$user->fetch(1);
	method_exists($user, 'loadRights') ? $user->loadRights() : $user->getrights();
}
$conf->global->MAIN_DISABLE_ALL_MAILS = 1;
$langs->load("main");

/**
 * @backupGlobals disabled
 * @backupStaticAttributes enabled
 */
class TimeImportTest extends PHPUnit\Framework\TestCase // @phan-suppress-current-line PhanUndeclaredExtendedClass
{
	protected $savconf;
	protected $savuser;
	protected $savlangs;
	protected $savdb;

	public function __construct($name = '')
	{
		parent::__construct($name); // @phan-suppress-current-line PhanUndeclaredClass
		global $conf, $user, $langs, $db;
		$this->savconf = $conf;
		$this->savuser = $user;
		$this->savlangs = $langs;
		$this->savdb = $db;
	}

	public static function setUpBeforeClass(): void
	{
		global $db;
		$db->begin();
	}

	protected function setUp(): void
	{
		global $conf, $user, $langs, $db;
		$conf = $this->savconf;
		$user = $this->savuser;
		$langs = $this->savlangs;
		$db = $this->savdb;
	}

	public static function tearDownAfterClass(): void
	{
		global $db;
		$db->rollback();
	}

	/** Calls a protected/private method by name via Reflection. */
	private function callProtected($object, $method, array $args = array())
	{
		$ref = new ReflectionMethod(get_class($object), $method);
		$ref->setAccessible(true);
		return $ref->invokeArgs($object, $args);
	}

	private function makeTestProject($db, $user)
	{
		$proj = new Project($db);
		$proj->ref = 'PHPUNIT-I1-'.mt_rand(100000, 999999);
		$proj->title = 'PHPUnit I1 race test project';
		$proj->socid = 1;
		$proj->status = Project::STATUS_VALIDATED;
		$proj->usage_task = 1;
		$id = $proj->create($user);
		$this->assertGreaterThan(0, $id, (string) $proj->error);
		return $id;
	}

	/**
	 * I1's whole point: reproduces the real race in a single-threaded test by inserting the
	 * conflicting row in the exact gap the race exploits — between the import's own
	 * timeEntryAlreadyImported() check (which legitimately finds nothing yet) and its INSERT
	 * (which a concurrent import's INSERT, simulated here, has since made conflict). This is a
	 * genuine DB-level unique-constraint violation, not a mock — if I1's index were missing,
	 * step 3 below would silently succeed and this test would catch that regression too.
	 */
	public function testConcurrentImportRaceIsCaughtByTheUniqueIndexAndLeavesNoOrphanedTrace()
	{
		global $conf, $user, $langs, $db;
		$conf = $this->savconf;
		$user = $this->savuser;
		$langs = $this->savlangs;
		$db = $this->savdb;

		$projectId = $this->makeTestProject($db, $user);
		$import = new TimeImportClockify($db);
		$importKey = 'i1race'.substr(md5((string) mt_rand()), 0, 8); // 14 chars, fits varchar(14).
		$this->assertSame(14, strlen($importKey));

		// Step 1 — sanity: nothing with this key exists yet, exactly what the import's own
		// check would see right before a race (via Reflection: protected method).
		$this->assertFalse($this->callProtected($import, 'timeEntryAlreadyImported', array($importKey)));

		// Step 2 — simulates "a concurrent import wins the race": a real row is created with
		// this import_key, in the gap after step 1's check already ran. import_key is set
		// BEFORE createManualEntry(), matching exactly how the real import path sets it
		// (class/timeimport.class.php: "$timeentry->import_key = $importKey;" right before
		// calling createManualEntry()) — not a separate update() afterward, which is a
		// different code path this test does not need to exercise.
		$winner = new TimeEntry($db);
		$now = dol_now();
		$winner->import_key = $importKey;
		$winnerId = $winner->createManualEntry((int) $user->id, $projectId, 0, $now - 3600, $now, 'race winner', '', 1, $user, null, TimeEntry::STATUS_VALIDATED);
		$this->assertGreaterThan(0, $winnerId, (string) $winner->error);

		$modificationCountBefore = $this->countModificationRows($db, $winnerId);

		// Step 3 — our own import's INSERT, as it runs right after its (now stale) check from
		// step 1 found nothing: same import_key, must collide.
		$loser = new TimeEntry($db);
		$loser->import_key = $importKey;
		$loserResult = $loser->createManualEntry((int) $user->id, $projectId, 0, $now - 7200, $now - 3600, 'race loser', '', 1, $user, null, TimeEntry::STATUS_VALIDATED);

		$this->assertLessThanOrEqual(0, $loserResult, 'The second insert with the same import_key must fail');
		$this->assertSame('DB_ERROR_RECORD_ALREADY_EXISTS', $db->lasterrno());
		$this->assertStringContainsString('uk_timeflow_timeentry_import_key', (string) $db->lasterror());

		// Exactly one row with this import_key — no duplicate ever committed.
		$sql = 'SELECT COUNT(*) AS nb FROM '.$db->prefix()."timeflow_timeentry WHERE import_key = '".$db->escape($importKey)."'";
		$res = $db->query($sql);
		$this->assertSame(1, (int) $db->fetch_object($res)->nb);

		// No orphaned trace from the failed attempt: no new modification/audit row referencing
		// the winner (or anything else) was written as a side effect of the loser's failure —
		// createCommon() rolls back its own transaction, and the import loop only calls
		// logManualCreation()/logAutoValidationOnImport()/update() inside the $newId > 0 branch,
		// never reached here.
		$this->assertSame($modificationCountBefore, $this->countModificationRows($db, $winnerId));

		// And the protected helper the production code actually calls agrees.
		$this->assertTrue($this->callProtected($import, 'wasBlockedByUniqueImportKey', array($loser)));
	}

	/** wasBlockedByUniqueImportKey() must say no for an unrelated failure (e.g. invalid dates). */
	public function testWasBlockedByUniqueImportKeyIsFalseForAnUnrelatedFailure()
	{
		global $conf, $user, $langs, $db;
		$conf = $this->savconf;
		$user = $this->savuser;
		$langs = $this->savlangs;
		$db = $this->savdb;

		$import = new TimeImportClockify($db);
		$entry = new TimeEntry($db);
		// Invalid dates: fails in createManualEntry()'s own PHP validation, before any SQL ever
		// runs — $db->lasterrno()/lasterror() stay at whatever a PREVIOUS, unrelated query last
		// set (possibly still DB_ERROR_RECORD_ALREADY_EXISTS from another test's real duplicate-
		// key failure, since both tests share the same connection). This is exactly why the
		// production check is scoped to $entry->errors (always freshly empty on this new object)
		// rather than the connection-wide lasterrno(): asserts no false positive from that kind
		// of staleness, regardless of what lingers in $db's error state from earlier calls.
		$result = $entry->createManualEntry((int) $user->id, 0, 0, dol_now(), dol_now() - 3600, 'bad dates', '', 1, $user);
		$this->assertLessThanOrEqual(0, $result);
		$this->assertFalse($this->callProtected($import, 'wasBlockedByUniqueImportKey', array($entry)));
	}

	private function countModificationRows($db, $timeentryId)
	{
		$res = $db->query('SELECT COUNT(*) AS nb FROM '.$db->prefix().'timeflow_timeentry_modification WHERE fk_timeentry = '.((int) $timeentryId));
		return (int) $db->fetch_object($res)->nb;
	}
} // @phan-suppress-current-line PhanUndeclaredClass
