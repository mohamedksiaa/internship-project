<?php
/* Copyright (C) 2026		SuperAdmin
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * \file    test/phpunit/timeentryIdateTimezoneTest.php
 * \ingroup timeflow
 * \brief   createManualEntry() and closeSegmentAndOpenNext() must store the exact requested instant,
 *          on a server whose PHP default timezone is not UTC.
 *
 * Root cause under test: both methods used to pre-format date_start/date_end into a DATETIME string via
 * $db->idate() before calling the generic create() — which (CommonObject::setSaveQuery(), Dolibarr core)
 * unconditionally calls $db->idate() again on every 'datetime'-typed field. idate() applied a second time
 * to its own string output re-renders it tzserver-shifted again, so the stored value lands exactly one
 * server-UTC-offset late. The offset is zero on a server running UTC (so this was invisible there) and
 * depends on summer/winter time on a DST-observing server — covered below with Europe/Paris on both sides
 * of a transition, not just a single fixed offset, so a naive "subtract one hour" patch would still fail
 * half of this file.
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
	if ($parent === $bootstrapDir) {
		break;
	}
	$bootstrapDir = $parent;
}
if (!$foundBootstrap) {
	throw new \RuntimeException('master.inc.php not found. Adjust test bootstrap or set DOL_DOCUMENT_ROOT.');
}
$moduleRoot = dirname(__DIR__, 2);
require_once $moduleRoot . '/class/timeentry.class.php';
require_once DOL_DOCUMENT_ROOT . '/projet/class/project.class.php';

if (empty($user->id)) {
	$user->fetch(1);
	method_exists($user, 'loadRights') ? $user->loadRights() : $user->getrights();
}
$conf->global->MAIN_DISABLE_ALL_MAILS = 1;

/**
 * @backupGlobals disabled
 * @backupStaticAttributes enabled
 */
class TimeentryIdateTimezoneTest extends PHPUnit\Framework\TestCase // @phan-suppress-current-line PhanUndeclaredExtendedClass
{
	/** @var Conf */
	protected $savconf;
	/** @var User */
	protected $savuser;
	/** @var Translate */
	protected $savlangs;
	/** @var DoliDB */
	protected $savdb;
	/** @var string PHP default timezone as it was before this test touched it. */
	private $originalTimezone;
	/** @var int|null A project created once and reused by every test (startTimer() requires one). */
	private static $projectId;

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
		global $db, $user;
		$db->begin(); // whole class runs inside one rolled-back transaction, same convention as timeentryTest.php

		$project = new Project($db);
		$project->ref = 'NFIDT-' . substr(md5('idate-tz-test' . microtime()), 0, 10);
		$project->title = 'Projet test fuseau idate()';
		$project->status = Project::STATUS_VALIDATED;
		$project->public = 0;
		$project->date_start = dol_now();
		self::$projectId = $project->create($user);
	}

	protected function setUp(): void
	{
		global $conf, $user, $langs, $db;
		$conf = $this->savconf;
		$user = $this->savuser;
		$langs = $this->savlangs;
		$db = $this->savdb;
		$this->originalTimezone = date_default_timezone_get();
		$this->assertGreaterThan(0, self::$projectId, 'fixture project must exist before any test runs');
	}

	protected function tearDown(): void
	{
		// Every other PHP date/time function in this process (including whatever PHPUnit itself prints)
		// must see the real timezone again once this test is done with it.
		date_default_timezone_set($this->originalTimezone);
	}

	public static function tearDownAfterClass(): void
	{
		global $db;
		$db->rollback();
	}

	/**
	 * One non-DST zone (Africa/Tunis, fixed UTC+1 year-round) plus Europe/Paris on both sides of a DST
	 * transition — the bug's magnitude is the server's CURRENT UTC offset at the instant being stored, so
	 * a winter date and a summer date under the same named zone exercise genuinely different offsets (CET
	 * UTC+1 vs CEST UTC+2), not just the same shift twice under a different zone name.
	 *
	 * @return array<string,array{0:string,1:string}>
	 */
	public static function timezoneAndLocalDateTimeProvider()
	{
		return array(
			'Africa/Tunis (UTC+1, fixe, pas d’heure d’été)' => array('Africa/Tunis', '2026-10-02 14:00:00'),
			'Europe/Paris, date d’hiver (CET, UTC+1)' => array('Europe/Paris', '2026-01-15 14:00:00'),
			'Europe/Paris, date d’été (CEST, UTC+2)' => array('Europe/Paris', '2026-07-15 14:00:00'),
		);
	}

	/** Re-reads date_start/date_end straight from the database, as Unix epochs, so the comparison below is independent of how the current PHP timezone would format them for display. */
	private function fetchStoredEpochs($id)
	{
		global $db;
		$sql = 'SELECT date_start, date_end FROM ' . $db->prefix() . 'timeflow_timeentry WHERE rowid = ' . (int) $id;
		$resql = $db->query($sql);
		$this->assertNotFalse($resql, $db->lasterror());
		$obj = $db->fetch_object($resql);
		return array(
			$db->jdate($obj->date_start),
			$obj->date_end !== null ? $db->jdate($obj->date_end) : null,
		);
	}

	/**
	 * @dataProvider timezoneAndLocalDateTimeProvider
	 * The "add manual entry" UI path: createManualEntry() called directly with a real epoch, exactly as
	 * ajax/timeentry.php's 'createManualEntry' case ends up doing once timeflowParseIncomingDate() has
	 * resolved the posted ISO string to a timestamp.
	 */
	public function testManualEntryStoresExactlyTheRequestedInstant($timezone, $localDateTime)
	{
		date_default_timezone_set($timezone);
		global $db, $user;

		$expectedStart = strtotime($localDateTime);
		$expectedEnd = $expectedStart + 3600;

		$entry = new TimeEntry($db);
		$id = $entry->createManualEntry((int) $user->id, self::$projectId, 0, $expectedStart, $expectedEnd, 'Test fuseau idate() — saisie manuelle', '', 0, $user, null, TimeEntry::STATUS_DRAFT);
		$this->assertGreaterThan(0, $id, $entry->error ?: implode(', ', (array) $entry->errors));

		list($storedStart, $storedEnd) = $this->fetchStoredEpochs($id);
		$this->assertSame($expectedStart, $storedStart, "date_start doit être stocké sans décalage en $timezone");
		$this->assertSame($expectedEnd, $storedEnd, "date_end doit être stocké sans décalage en $timezone");
	}

	/**
	 * @dataProvider timezoneAndLocalDateTimeProvider
	 * The CSV import path: same createManualEntry() call shape as TimeImportClockify::importTimeEntriesFromCsv()
	 * (no $status argument — imported entries default to STATUS_VALIDATED).
	 */
	public function testImportedEntryStoresExactlyTheRequestedInstant($timezone, $localDateTime)
	{
		date_default_timezone_set($timezone);
		global $db, $user;

		// parseCsvDateTime() itself is a thin strtotime() wrapper around the combined date+time cell —
		// reproduced here directly rather than through a real CSV file, since that parsing step was never
		// the buggy part (confirmed separately): this test is about what happens to the timestamp AFTER it
		// reaches createManualEntry(), same as the manual-entry test above.
		$expectedStart = strtotime($localDateTime);
		$expectedEnd = $expectedStart + 3600;

		$entry = new TimeEntry($db);
		$id = $entry->createManualEntry((int) $user->id, self::$projectId, 0, $expectedStart, $expectedEnd, 'Test fuseau idate() — import', '', 0, $user);
		$this->assertGreaterThan(0, $id, $entry->error ?: implode(', ', (array) $entry->errors));
		$this->assertSame(TimeEntry::STATUS_VALIDATED, (int) $entry->status, 'un import ne doit toujours pas passer par le statut brouillon');

		list($storedStart, $storedEnd) = $this->fetchStoredEpochs($id);
		$this->assertSame($expectedStart, $storedStart, "date_start doit être stocké sans décalage en $timezone");
		$this->assertSame($expectedEnd, $storedEnd, "date_end doit être stocké sans décalage en $timezone");
	}

	/**
	 * @dataProvider timezoneAndLocalDateTimeProvider
	 * The midnight-split path: a chrono left running past the max-duration cap, crossing exactly one UTC
	 * midnight, must produce a second segment whose date_start lands exactly on that boundary — not one
	 * server-offset late. closeSegmentAndOpenNext() computes the boundary in UTC regardless of server
	 * timezone (see its own comment), so unlike the two tests above, $localDateTime here only has to place
	 * the start far enough before a UTC midnight for the cap to force exactly one split; the date itself
	 * (winter/summer) still exercises a different DST offset on the storage side of the bug.
	 */
	public function testMidnightSplitSegmentStartsExactlyAtTheUtcBoundary($timezone, $localDateTime)
	{
		date_default_timezone_set($timezone);
		global $db, $user;

		$localStart = strtotime($localDateTime);
		$utcMidnightAfterStart = strtotime(gmdate('Y-m-d 00:00:00', $localStart + 86400) . ' UTC');
		// 18h default cap: start 2h before the UTC midnight, stop 20h after it — total 22h, over the cap,
		// crossing exactly that one boundary (never a second one).
		$start = $utcMidnightAfterStart - 7200;
		$stop = $utcMidnightAfterStart + 72000;
		$this->assertGreaterThan(TimeEntry::getMaxEntryDurationSeconds(), $stop - $start, 'test fixture must actually exceed the cap to force a split');

		$entry = new TimeEntry($db);
		$startRes = $entry->startTimer((int) $user->id, self::$projectId, 0, 'Test fuseau idate() — session a cheval sur minuit', $user);
		$this->assertGreaterThan(0, $startRes, $entry->error ?: implode(', ', (array) $entry->errors));
		// startTimer() always starts "now" — move it back to the fixture's intended start so the elapsed
		// time at stopTimer() matches what this test is actually trying to exercise.
		$db->query('UPDATE ' . $db->prefix() . 'timeflow_timeentry SET date_start = \'' . $db->idate($start) . '\' WHERE rowid = ' . (int) $entry->id);

		$stopRes = $entry->stopTimer($entry->id, $user, $stop);
		$this->assertGreaterThan(0, $stopRes, $entry->error ?: implode(', ', (array) $entry->errors));
		$this->assertCount(1, $entry->splitSegments, 'exactly one UTC midnight must have been crossed');

		$secondSegmentId = (int) $entry->id; // stopTimer() re-fetches $this into the final (second) segment
		$this->assertNotSame((int) $entry->splitSegments[0]->id, $secondSegmentId, 'the final segment must be the successor row, not the one that was closed at midnight');

		list($secondSegmentStart, ) = $this->fetchStoredEpochs($secondSegmentId);
		$this->assertSame($utcMidnightAfterStart, $secondSegmentStart, "le second segment doit commencer exactement a la frontiere UTC, sans decalage, en $timezone");
	}
}
