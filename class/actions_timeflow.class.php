<?php
/* Copyright (C) 2023		Laurent Destailleur			<eldy@users.sourceforge.net>
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
 * \file    timeflow/class/actions_timeflow.class.php
 * \ingroup timeflow
 * \brief   Example hook overload.
 *
 * TODO: Write detailed description here.
 */

require_once DOL_DOCUMENT_ROOT.'/core/class/commonhookactions.class.php';

/**
 * Class ActionsTimeFlow
 */
class ActionsTimeFlow extends CommonHookActions
{
	/**
	 * @var DoliDB Database handler.
	 */
	public $db;

	/**
	 * @var string Error code (or message)
	 */
	public $error = '';

	/**
	 * @var string[] Errors
	 */
	public $errors = array();


	/**
	 * @var mixed[] Hook results. Propagated to $hookmanager->resArray for later reuse
	 */
	public $results = array();

	/**
	 * @var ?string String displayed by executeHook() immediately after return
	 */
	public $resprints;

	/**
	 * @var int		Priority of hook (50 is used if value is not defined)
	 */
	public $priority;


	/**
	 * Constructor
	 *
	 *  @param	DoliDB	$db      Database handler
	 */
	public function __construct($db)
	{
		$this->db = $db;
	}


	// getNomUrl(), doActions(), doMassActions(), addMoreMassActions(),
	// beforePDFCreation(), afterPDFCreation(), loadDataForCustomReports(),
	// restrictedArea() and completeTabsHead() — all removed (were here as
	// unmodified ModuleBuilder scaffold, see git history for their prior
	// content): every one of them only ever matched placeholder conditions
	// ModuleBuilder generates ('somecontext1'/'somecontext2',
	// 'context1'/'context2', a 'myobject' feature/right that doesn't exist
	// in this module) that no real TimeFlow context/element/right ever
	// satisfies, so none of them did anything even on paper. More
	// fundamentally, none of them can run at all today regardless of their
	// own content: core/modules/modTimeFlow.class.php declares
	// 'hooks' => array() with every context commented out, so
	// HookManager::initHooks() never registers this module for any hook
	// context and this class is never instantiated. Deleting rather than
	// emptying to a stub: Dolibarr's HookManager calls a hook method only
	// after checking method_exists() on the hook object, so an absent
	// method and a present-but-empty one are behaviorally identical (the
	// hook simply doesn't fire either way) — keeping empty shells here
	// would be dead code with no corresponding benefit. CommonHookActions
	// does not declare these as abstract (every Dolibarr module's own
	// actions_*.class.php implements only the handful of hook names it
	// actually uses, never all of them), so removing them carries no risk
	// of an "abstract method not implemented" fatal.
	//
	// addMoreActionsButtons() and showLinkToObjectBlock() below are kept:
	// both were already deliberately neutralized in earlier passes (see
	// their own comments) rather than left as unadapted scaffold.

	public function addMoreActionsButtons($parameters, &$object, &$action, $hookmanager)
	{
		// Removed: this used to link to ajax/timer.php?action=start, which
		// does not exist — the real timer endpoint (ajax/timeentry.php,
		// action startTimer) requires a POST with a JSON body, a CSRF token,
		// and a non-empty note (3 chars min business rule), none of which a
		// plain <a href> GET link can provide. Properly wiring a "Start
		// timer" button here needs real JS (a note prompt + authenticated
		// fetch()), not a mechanical link fix — left unimplemented rather
		// than shipping another dead link.
		return 0;
	}



	/**
	 * Overload the showLinkToObjectBlock function : add or replace array of object linkable
	 *
	 * @param	array<string,mixed>	$parameters		Hook metadata (context, etc...)
	 * @param	CommonObject		$object			The object to process (an invoice if you are in invoice module, a propale in propale's module, etc...)
	 * @param	?string				$action			Current action (if set). Generally create or edit or null
	 * @param	HookManager			$hookmanager	Hook manager propagated to allow calling another hook
	 * @return	int									Return integer < 0 on error, 0 on success, 1 to replace standard code
	 */
	public function showLinkToObjectBlock($parameters, &$object, &$action, $hookmanager)
	{
		// Never adapted from the ModuleBuilder template: MyObject does not
		// exist in this module (TimeEntry is the real business object), and
		// even TimeEntry has no real 'ref' column the SQL below could select
		// (see the PHP-only fallback in TimeEntry::create()/fetch()) — so
		// there is no safe substitution to make without redesigning what
		// this hook should actually link. Neutralized rather than guessed.
		return 0;
	}
	/* Add other hook methods here... */
}
