<?php
/* Copyright (C) 2026		SuperAdmin
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * \file    test/phpunit/timeflowActiveDirectoryTest.php
 * \ingroup timeflow
 * \brief   timeflowFetchActiveUsers()/timeflowFetchActiveThirdParties() scoping for a non-readall caller
 *          (security report A-13 follow-up: listActiveUsers/listActiveThirdParties must not hand a plain
 *          reader the whole company directory just because they carry the 'read' right).
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
require_once $moduleRoot . '/lib/timeflow.lib.php';
require_once DOL_DOCUMENT_ROOT . '/societe/class/societe.class.php';
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
class TimeflowActiveDirectoryTest extends PHPUnit\Framework\TestCase // @phan-suppress-current-line PhanUndeclaredExtendedClass
{
	/** @var Conf */
	protected $savconf;
	/** @var User */
	protected $savuser;
	/** @var Translate */
	protected $savlangs;
	/** @var DoliDB */
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
		$db->begin(); // whole class runs inside one rolled-back transaction — see tearDownAfterClass
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

	/**
	 * A non-admin, non-readall caller with the given id — everything timeflowUserHasRequiredRight()/
	 * timeflowAuthorizedProjectIdList()/getProjectsAuthorizedForUser() read from $user in this code path is
	 * ->admin, ->socid and ->id (checked directly in Dolibarr core — see project.class.php's
	 * getProjectsAuthorizedForUser()) plus ->hasRight(), so a real User row is never required here.
	 */
	private function fakeCaller($id)
	{
		return new class($id) {
			public $admin = 0;
			public $id;
			public $socid = 0;
			public function __construct($id) { $this->id = $id; }
			public function hasRight($module, $object, $right) { return false; }
		};
	}

	/** A caller who may read every entry (admin=1, or readall via hasRight()). */
	private function fakeUser($admin = 0, $readall = false)
	{
		return new class($admin, $readall) {
			public $admin;
			private $readall;
			public function __construct($admin, $readall) { $this->admin = $admin; $this->readall = $readall; }
			public function hasRight($module, $object, $right) { return $right === 'readall' && $this->readall; }
		};
	}

	/** Creates a non-public (so native visibility depends on the contact assignment, not on p.public=1), validated project for $socId (0 = none) and returns its id. */
	private function makeProject($title, $socId = 0)
	{
		global $db, $user;
		$project = new Project($db);
		$project->ref = 'NFADT-' . substr(md5($title . microtime()), 0, 10);
		$project->title = $title;
		$project->socid = $socId;
		$project->status = Project::STATUS_VALIDATED;
		$project->public = 0;
		$project->date_start = dol_now();
		$id = $project->create($user);
		$this->assertGreaterThan(0, $id, $project->error ?: implode(', ', $project->errors));
		return (int) $id;
	}

	private function makeClient($name)
	{
		global $db, $user;
		$soc = new Societe($db);
		$soc->name = $name;
		$soc->client = 1;
		$id = $soc->create($user);
		$this->assertGreaterThan(0, $id, $soc->error ?: implode(', ', $soc->errors));
		return (int) $id;
	}

	/** Creates a real, active user (login/firstname/lastname set before create(), as User::create() requires) and returns their id. */
	private function makeUser($label)
	{
		global $db, $user;
		$fresh = new User($db);
		$fresh->login = 'nf_adt_' . substr(md5($label . microtime()), 0, 12);
		$fresh->firstname = 'NFADT';
		$fresh->lastname = $label;
		$fresh->statut = 1;
		$id = $fresh->create($user);
		$this->assertGreaterThan(0, $id, $fresh->error ?: implode(', ', (array) $fresh->errors));
		return (int) $id;
	}

	/** Adds $userId as PROJECTCONTRIBUTOR on $projectId (same native mechanism the module already reuses). */
	private function addContributor($projectId, $userId)
	{
		global $db;
		$project = new Project($db);
		$this->assertGreaterThan(0, $project->fetch($projectId));
		$res = $project->add_contact($userId, 'PROJECTCONTRIBUTOR', 'internal');
		$this->assertGreaterThan(0, $res, $project->error ?: implode(', ', (array) $project->errors));
	}

	public function testUnrestrictedCallerGetsTheFullDirectoryWithLoginAndNames()
	{
		global $db;
		$users = timeflowFetchActiveUsers($db, $this->fakeUser(0, true));
		$this->assertNotEmpty($users);
		$this->assertArrayHasKey('login', $users[0]);
		$this->assertArrayHasKey('firstname', $users[0]);
		$this->assertArrayHasKey('lastname', $users[0]);

		$parties = timeflowFetchActiveThirdParties($db, $this->fakeUser(0, true));
		$this->assertNotEmpty($parties);
		$this->assertArrayHasKey('title', $parties[0]);
	}

	public function testNullUserDefaultsToUnrestricted()
	{
		global $db;
		$users = timeflowFetchActiveUsers($db, null);
		$this->assertNotEmpty($users);
		$this->assertArrayHasKey('login', $users[0]);
	}

	public function testAdminGetsTheFullDirectoryEvenWithoutTheReadallFlagSet()
	{
		global $db;
		$users = timeflowFetchActiveUsers($db, $this->fakeUser(1, false));
		$this->assertNotEmpty($users);
		$this->assertArrayHasKey('login', $users[0]);
	}

	/** The reproduction the module owner asked for: a restricted caller sees only their visible projects' people/clients, minimal fields. */
	public function testRestrictedCallerSeesOnlyContributorsAndClientsOfTheirOwnProjectsWithMinimalFields()
	{
		global $db;
		$tag = 'nfADT' . dol_now();
		$clientA = $this->makeClient('Client A ' . $tag);
		$clientB = $this->makeClient('Client B ' . $tag);
		$projectA = $this->makeProject('Projet A ' . $tag, $clientA);
		$projectB = $this->makeProject('Projet B ' . $tag, $clientB);

		// Two distinct synthetic users — the caller (contributor of A only) and a stranger (contributor of B
		// only) — kept separate from the bootstrap $user (which only acts as the fixtures' creator/actor
		// below, never as the subject under test): reusing $user for both would make it a contributor of
		// both projects by construction, which is exactly the scoping this test is meant to disprove.
		$callerId = $this->makeUser('Caller' . $tag);
		$strangerId = $this->makeUser('Stranger' . $tag);

		$this->addContributor($projectA, $callerId);
		$this->addContributor($projectB, $strangerId);

		// Restricted caller who can only see $projectA (native visibility — getProjectsAuthorizedForUser()
		// resolves to "projects this user contributes to" for a plain, non-admin/non-readall user).
		$caller = $this->fakeCaller($callerId);

		$users = timeflowFetchActiveUsers($db, $caller);
		$ids = array_column($users, 'id');
		$this->assertContains($callerId, $ids, 'the project A contributor (the caller themselves) must be visible');
		$this->assertNotContains($strangerId, $ids, 'a project-B-only contributor must not leak to a project-A-only caller');
		// Read the loop in timeflowFetchActiveUsers(): DISTINCT in the SQL plus one push per fetched row means
		// exactly one $users[] entry per user id — no duplicate row from a user contributing to A more than
		// once, and no accidental double-append.
		$this->assertSame(count($ids), count(array_unique($ids)), 'each user must appear exactly once');
		foreach ($users as $row) {
			$this->assertSame(array('id', 'rowid', 'label'), array_keys($row), 'no other field is present');
			foreach (array('login', 'firstname', 'lastname', 'email') as $forbidden) {
				$this->assertArrayNotHasKey($forbidden, $row, "'$forbidden' must not be exposed to a non-readall caller");
			}
		}

		$parties = timeflowFetchActiveThirdParties($db, $caller);
		$titles = array_column($parties, 'title');
		$this->assertContains('Client A ' . $tag, $titles);
		$this->assertNotContains('Client B ' . $tag, $titles, 'a client only reachable via a non-visible project must not leak');
		$this->assertSame(count($titles), count(array_unique($titles)), 'each client must appear exactly once');
	}

	public function testRestrictedCallerWithNoVisibleProjectsGetsAnEmptyList()
	{
		global $db;
		$caller = $this->fakeCaller(999999901); // an id with no element_contact rows at all in this transaction
		$this->assertSame(array(), timeflowFetchActiveUsers($db, $caller));
		$this->assertSame(array(), timeflowFetchActiveThirdParties($db, $caller));
	}
}
