<?php
/* Copyright (C) 2001-2005  Rodolphe Quiedeville    <rodolphe@quiedeville.org>
 * Copyright (C) 2004-2015  Laurent Destailleur     <eldy@users.sourceforge.net>
 * Copyright (C) 2005-2012  Regis Houssin           <regis.houssin@inodbox.com>
 * Copyright (C) 2015       Jean-François Ferry     <jfefe@aternatik.fr>
 * Copyright (C) 2024       Frédéric France         <frederic.france@free.fr>
 * Copyright (C) 2026		SuperAdmin
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 *	\file       clockify/clockifyindex.php
 *	\ingroup    clockify
 *	\brief      Home page of clockify top menu
 */

// Load Dolibarr environment
$res = 0;
// Try main.inc.php into web root known defined into CONTEXT_DOCUMENT_ROOT (not always defined)
if (!$res && !empty($_SERVER["CONTEXT_DOCUMENT_ROOT"])) {
	$res = @include str_replace("..", "", $_SERVER["CONTEXT_DOCUMENT_ROOT"])."/main.inc.php";
}
// Try main.inc.php into web root detected using web root calculated from SCRIPT_FILENAME
$tmp = empty($_SERVER['SCRIPT_FILENAME']) ? '' : $_SERVER['SCRIPT_FILENAME'];
$tmp2 = realpath(__FILE__);
$i = strlen($tmp) - 1;
$j = strlen($tmp2) - 1;
while ($i > 0 && $j > 0 && isset($tmp[$i]) && isset($tmp2[$j]) && $tmp[$i] == $tmp2[$j]) {
	$i--;
	$j--;
}
if (!$res && $i > 0 && file_exists(substr($tmp, 0, ($i + 1))."/main.inc.php")) {
	$res = @include substr($tmp, 0, ($i + 1))."/main.inc.php";
}
if (!$res && $i > 0 && file_exists(dirname(substr($tmp, 0, ($i + 1)))."/main.inc.php")) {
	$res = @include dirname(substr($tmp, 0, ($i + 1)))."/main.inc.php";
}
// Try main.inc.php using relative path
if (!$res && file_exists("../main.inc.php")) {
	$res = @include "../main.inc.php";
}
if (!$res && file_exists("../../main.inc.php")) {
	$res = @include "../../main.inc.php";
}
if (!$res && file_exists("../../../main.inc.php")) {
	$res = @include "../../../main.inc.php";
}
if (!$res) {
	die("Include of main fails");
}
/**
 * The main.inc.php has been included so the following variable are now defined:
 * @var Conf $conf
 * @var DoliDB $db
 * @var HookManager $hookmanager
 * @var Translate $langs
 * @var User $user
 */
include_once DOL_DOCUMENT_ROOT.'/core/class/html.formfile.class.php';

// Load translation files required by the page
$langs->loadLangs(array("clockify@clockify"));

$action = GETPOST('action', 'aZ09');

$now = dol_now();
$max = getDolGlobalInt('MAIN_SIZE_SHORTLIST_LIMIT', 5);

// Security check - Protection if external user
$socid = GETPOSTINT('socid');
if (!empty($user->socid) && $user->socid > 0) {
	$action = '';
	$socid = $user->socid;
}

// Initialize a technical object to manage hooks. Note that conf->hooks_modules contains array
//$hookmanager->initHooks(array($object->element.'index'));

// Security check (enable the most restrictive one)
//if ($user->socid > 0) accessforbidden();
//if ($user->socid > 0) $socid = $user->socid;
//if (!isModEnabled('clockify')) {
//	accessforbidden('Module not enabled');
//}
//if (! $user->hasRight('clockify', 'myobject', 'read')) {
//	accessforbidden();
//}
//restrictedArea($user, 'clockify', 0, 'clockify_myobject', 'myobject', '', 'rowid');
//if (empty($user->admin)) {
//	accessforbidden('Must be admin');
//}


/*
 * Actions
 */

// None

/*
 * View
 */

$form = new Form($db);
$formfile = new FormFile($db);

$distDir = __DIR__.'/frontend/dist';
$distIndex = $distDir.'/index.html';
$cssUrl = '';
$jsUrl = '';
if (file_exists($distIndex)) {
	$distHtml = file_get_contents($distIndex);
	if (preg_match('/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/i', $distHtml, $matches) || preg_match('/<link[^>]+href="([^"]+)"[^>]*rel="stylesheet"/i', $distHtml, $matches)) {
		$cssPath = $matches[1];
		$cssPath = preg_replace('/^\.\//', '', $cssPath);
		$cssUrl = DOL_URL_ROOT.'/custom/clockify/frontend/dist/'.$cssPath;
	}
	if (preg_match('/<script[^>]+src="([^"]+)"/i', $distHtml, $matches)) {
		$jsPath = $matches[1];
		$jsPath = preg_replace('/^\.\//', '', $jsPath);
		$jsUrl = dol_buildpath('/custom/clockify/frontend/dist/'.$jsPath, 1);
	}
}

$headHtml = '';
if ($cssUrl) {
	$headHtml = '<link rel="stylesheet" href="'.$cssUrl.'">';
}

llxHeader($headHtml, $langs->trans("ClockifyArea"), '', '', 0, 0, '', '', '', 'mod-clockify page-index');

print load_fiche_titre($langs->trans("ClockifyArea"), '', 'clockify.png@clockify');
print '<div class="fichecenter">';
print '<div id="root" style="min-height:600px;"></div>';
print '<script>window.DOL_URL_ROOT = "'.addslashes(DOL_URL_ROOT).'";</script>';
if ($jsUrl) {
	print '<script type="module" crossorigin src="'.$jsUrl.'" defer></script>';
}
print '</div>';
llxFooter();
$db->close();
