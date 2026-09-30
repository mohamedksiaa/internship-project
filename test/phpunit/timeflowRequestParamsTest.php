<?php
/* Copyright (C) 2026		SuperAdmin
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * \file    test/phpunit/timeflowRequestParamsTest.php
 * \ingroup timeflow
 * \brief   Strict type validation of the request parameters (security report A-10 / A-11).
 *
 * Pure unit test: no database access.
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

/**
 * @backupGlobals disabled
 */
class TimeflowRequestParamsTest extends PHPUnit\Framework\TestCase
{
	/** @return array<string,array{0:mixed,1:string}> [payload, expected offending name or ''] */
	public function validAndInvalidProvider()
	{
		return array(
			'plain integer id' => array(array('id' => 42), ''),
			'digit string id' => array(array('id' => '42'), ''),
			'zero id' => array(array('id' => 0), ''),
			'empty id means absent' => array(array('id' => ''), ''),
			'null id means absent' => array(array('id' => null), ''),
			'string parameters are free text' => array(array('note' => "O'Brien \" ; DROP TABLE x", 'date_from' => '2026-09-01', 'search' => '100%_'), ''),
			'boolean flags are not identifiers' => array(array('billable' => true, 'all' => false), ''),
			'id lists of integers' => array(array('project_ids' => array(1, 2, '3'), 'user_ids' => array(), 'ids' => array(7)), ''),
			'decisions is a list of objects' => array(array('decisions' => array(array('mapping_type' => 'user', 'source_value' => 'a@b.c'))), ''),

			// A-11: (int) array('x') === 1
			'array as id' => array(array('id' => array('x')), 'id'),
			'empty array as id' => array(array('id' => array()), 'id'),
			'array as entryId' => array(array('entryId' => array('x')), 'entryId'),
			'array as fk_project' => array(array('fk_project' => array(1)), 'fk_project'),
			// (int) "12abc" === 12, (int) "999999999' OR '1'='1" === 999999999
			'digits followed by junk' => array(array('id' => "12abc"), 'id'),
			'injection prefix' => array(array('id' => "999999999' OR '1'='1"), 'id'),
			'negative id' => array(array('id' => -1), 'id'),
			'float id' => array(array('id' => 1.5), 'id'),
			'boolean id' => array(array('id' => true), 'id'),
			'too many digits' => array(array('id' => str_repeat('9', 40)), 'id'),

			// A-10: arrays reaching strtotime()/preg_match()/strip_tags()
			'array as text' => array(array('note' => array('x')), 'note'),
			'array as date_from' => array(array('date_from' => array('2026-01-01')), 'date_from'),
			'array as weekStart' => array(array('weekStart' => array('x')), 'weekStart'),
			'array as token' => array(array('token' => array('x')), 'token'),
			'array as action' => array(array('action' => array('deleteTimeEntry')), 'action'),
			'nested array in an id list' => array(array('ids' => array(array(1))), 'ids'),
			'junk in an id list' => array(array('project_ids' => array('1 OR 1=1')), 'project_ids'),
			'odd key name is not echoed' => array(array("bad\r\nkey" => array('x')), 'inconnu'),
		);
	}

	/**
	 * @dataProvider validAndInvalidProvider
	 * @param array<string,mixed> $payload  Request array
	 * @param string              $expected Name of the offending parameter, '' when the request is valid
	 */
	public function testStrictRequestParams(array $payload, $expected)
	{
		$this->assertSame($expected === '' ? null : $expected, timeflowFindInvalidRequestParam(array($payload)));
	}

	public function testEverySourceIsChecked()
	{
		$this->assertNull(timeflowFindInvalidRequestParam(array(array('id' => 1), array('note' => 'ok'))));
		$this->assertSame('id', timeflowFindInvalidRequestParam(array(array('note' => 'ok'), array('id' => array('x')))));
		$this->assertNull(timeflowFindInvalidRequestParam(array()));
	}
}
