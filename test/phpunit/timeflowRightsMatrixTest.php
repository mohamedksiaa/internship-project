<?php
/* Copyright (C) 2026		SuperAdmin
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * \file    test/phpunit/timeflowRightsMatrixTest.php
 * \ingroup timeflow
 * \brief   The validated rights matrix and its gate function (security report A-13, decisions D1–D3).
 *
 * Pure unit test: no database access, no real User object — a minimal stub stands in for it.
 */

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
require_once dirname(__DIR__, 2) . '/lib/timeflow.lib.php';

/** Minimal stand-in for Dolibarr's User: only what timeflowUserHasRequiredRight() reads. */
class TimeflowFakeUser
{
	/** @var int */
	public $admin = 0;
	/** @var array<string,bool> 'module.object.right' => held */
	private $rights;

	public function __construct($admin = 0, array $rights = array())
	{
		$this->admin = $admin;
		$this->rights = $rights;
	}

	public function hasRight($module, $object, $right)
	{
		return !empty($this->rights[$module.'.'.$object.'.'.$right]);
	}
}

/**
 * @backupGlobals disabled
 */
class TimeflowRightsMatrixTest extends PHPUnit\Framework\TestCase
{
	public function testMatrixCoversExactlyTheFortyFourActions()
	{
		$matrix = timeflowActionRightsMatrix();
		$this->assertCount(44, $matrix, 'One entry per ajax/timeentry.php action — see annex A of the security report.');
		foreach ($matrix as $action => $need) {
			$this->assertMatchesRegularExpression('/^[a-zA-Z][a-zA-Z0-9]*$/', $action);
			$this->assertContains($need, array('read', 'write', 'readall', 'validate', 'readall+validate', 'admin'), "action $action");
		}
		// A few load-bearing spot checks, one per group, so a careless re-sort of the array is still caught.
		$this->assertSame('read', $matrix['getActiveTimer']);
		$this->assertSame('write', $matrix['submitEntry']);
		$this->assertSame('readall', $matrix['getMyNotifications']);
		$this->assertSame('validate', $matrix['validateEntry']);
		$this->assertSame('readall+validate', $matrix['saveExpectedAbsence']);
		$this->assertSame('admin', $matrix['executeClockifyImport']);
		// Annex A adjustment (2026-09-30): read-only lookups reused outside the import flow (Projects tab)
		// stay 'read', not 'admin', even though the rest of the import flow around them is admin-only.
		$this->assertSame('read', $matrix['listActiveThirdParties']);
		$this->assertSame('read', $matrix['listActiveUsers']);
		$this->assertSame('admin', $matrix['listUserGroups']);
	}

	/** @return array<string,array{0:string}> */
	public function needProvider()
	{
		return array('read' => array('read'), 'write' => array('write'), 'readall' => array('readall'), 'validate' => array('validate'));
	}

	/**
	 * @dataProvider needProvider
	 * D2: a plain user without the specific right is refused; with it, accepted.
	 */
	public function testPlainUserNeedsTheExplicitRight($need)
	{
		$without = new TimeflowFakeUser(0, array());
		$this->assertFalse(timeflowUserHasRequiredRight($without, $need));
		$withOther = new TimeflowFakeUser(0, array('timeflow.timeentry.'.($need === 'read' ? 'write' : 'read') => true));
		$this->assertFalse(timeflowUserHasRequiredRight($withOther, $need), 'a different right must not satisfy this one');
		$with = new TimeflowFakeUser(0, array('timeflow.timeentry.'.$need => true));
		$this->assertTrue(timeflowUserHasRequiredRight($with, $need));
	}

	public function testReadallAndValidateAreBothRequiredForTheCombinedNeed()
	{
		$this->assertFalse(timeflowUserHasRequiredRight(new TimeflowFakeUser(0, array()), 'readall+validate'));
		$this->assertFalse(timeflowUserHasRequiredRight(new TimeflowFakeUser(0, array('timeflow.timeentry.readall' => true)), 'readall+validate'));
		$this->assertFalse(timeflowUserHasRequiredRight(new TimeflowFakeUser(0, array('timeflow.timeentry.validate' => true)), 'readall+validate'));
		$this->assertTrue(timeflowUserHasRequiredRight(new TimeflowFakeUser(0, array('timeflow.timeentry.readall' => true, 'timeflow.timeentry.validate' => true)), 'readall+validate'));
	}

	/** D3: an administrator holds every ordinary right implicitly, with zero TimeFlow rights assigned. */
	public function testAdministratorPassesEveryOrdinaryNeedWithNoExplicitRights()
	{
		$admin = new TimeflowFakeUser(1, array());
		foreach (array('read', 'write', 'readall', 'validate', 'readall+validate') as $need) {
			$this->assertTrue(timeflowUserHasRequiredRight($admin, $need), $need);
		}
	}

	/** D1: 'admin' is the one need D3 does not extend — only a real administrator ever passes it. */
	public function testOnlyARealAdministratorPassesTheAdminNeed()
	{
		$this->assertFalse(timeflowUserHasRequiredRight(new TimeflowFakeUser(0, array(
			'timeflow.timeentry.read' => true, 'timeflow.timeentry.write' => true,
			'timeflow.timeentry.readall' => true, 'timeflow.timeentry.validate' => true,
		)), 'admin'), 'every ordinary right combined still does not grant admin-only actions');
		$this->assertTrue(timeflowUserHasRequiredRight(new TimeflowFakeUser(1, array()), 'admin'));
	}

	public function testUnknownNeedIsRefused()
	{
		$this->assertFalse(timeflowUserHasRequiredRight(new TimeflowFakeUser(0, array('timeflow.timeentry.bogus' => true)), 'bogus'));
	}
}
