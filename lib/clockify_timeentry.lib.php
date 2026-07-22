<?php
/* Copyright (C) 2026		SuperAdmin
 * Copyright (C) 2025       Frédéric France         <frederic.france@free.fr>
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
 * \file    lib/clockify_timeentry.lib.php
 * \ingroup clockify
 * \brief   Library files with common functions for TimeEntry
 */

/**
 * Prepare array of tabs for TimeEntry
 *
 * @param	TimeEntry	$object					TimeEntry
 * @return 	array<array{string,string,string}>	Array of tabs
 */
function timeentryPrepareHead($object)
{
	global $db, $langs, $conf;

	$langs->load("clockify@clockify");

	$showtabofpagecontact = getDolGlobalInt('MAIN_CLOCKIFY_SHOW_PAGE_OF_CONTACT');
	$showtabofpagenote = getDolGlobalInt('MAIN_CLOCKIFY_SHOW_PAGE_OF_NOTE');
	$showtabofpagedocument = getDolGlobalInt('MAIN_CLOCKIFY_SHOW_PAGE_OF_DOCUMENT');
	$showtabofpageagenda = getDolGlobalInt('MAIN_CLOCKIFY_SHOW_PAGE_OF_AGENDA');

	$h = 0;
	$head = array();

	$head[$h][0] = dolBuildUrl(dol_buildpath("/clockify/timeentry_card.php", 1), ['id' => $object->id]);
	$head[$h][1] = $langs->trans("TimeEntry");
	$head[$h][2] = 'card';
	$h++;

	if ($showtabofpagecontact) {
		$head[$h][0] = dolBuildUrl(dol_buildpath("/clockify/timeentry_contact.php", 1), ['id' => $object->id]);
		$head[$h][1] = $langs->trans("Contacts");
		$head[$h][2] = 'contact';
		$h++;
	}

	if ($showtabofpagenote) {
		if (isset($object->fields['note_public']) || isset($object->fields['note_private'])) {
			$nbNote = 0;
			if (!empty($object->note_private)) {
				$nbNote++;
			}
			if (!empty($object->note_public)) {
				$nbNote++;
			}
			$head[$h][0] = dolBuildUrl(dol_buildpath('/clockify/timeentry_note.php', 1), ['id' => $object->id]);
			$head[$h][1] = $langs->trans('Notes');
			if ($nbNote > 0) {
				$head[$h][1] .= (!getDolGlobalInt('MAIN_OPTIMIZEFORTEXTBROWSER') ? '<span class="badge marginleftonlyshort">'.$nbNote.'</span>' : '');
			}
			$head[$h][2] = 'note';
			$h++;
		}
	}

	if ($showtabofpagedocument) {
		require_once DOL_DOCUMENT_ROOT.'/core/lib/files.lib.php';
		require_once DOL_DOCUMENT_ROOT.'/core/class/link.class.php';
		$ref = !empty($object->ref) ? $object->ref : $object->id;
		$upload_dir = $conf->clockify->dir_output."/timeentry/".dol_sanitizeFileName($ref);
		$nbFiles = count(dol_dir_list($upload_dir, 'files', 0, '', '(\.meta|_preview.*\.png)$'));
		$nbLinks = Link::count($db, $object->element, $object->id);
		$head[$h][0] = dolBuildUrl(dol_buildpath("/clockify/timeentry_document.php", 1), ['id' => $object->id]);
		$head[$h][1] = $langs->trans('Documents');
		if (($nbFiles + $nbLinks) > 0) {
			$head[$h][1] .= '<span class="badge marginleftonlyshort">'.($nbFiles + $nbLinks).'</span>';
		}
		$head[$h][2] = 'document';
		$h++;
	}

	if ($showtabofpageagenda) {
		$head[$h][0] = dolBuildUrl(dol_buildpath("/clockify/timeentry_agenda.php", 1), ['id' => $object->id]);
		$head[$h][1] = $langs->trans("Events");
		$head[$h][2] = 'agenda';
		$h++;
	}

	// Show more tabs from modules
	complete_head_from_modules($conf, $langs, $object, $head, $h, 'timeentry@clockify');

	complete_head_from_modules($conf, $langs, $object, $head, $h, 'timeentry@clockify', 'remove');

	return $head;
}
