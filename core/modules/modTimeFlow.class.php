<?php
/* Copyright (C) 2004-2018	Laurent Destailleur			<eldy@users.sourceforge.net>
 * Copyright (C) 2018-2019	Nicolas ZABOURI				<info@inovea-conseil.com>
 * Copyright (C) 2019-2024	Frédéric France				<frederic.france@free.fr>
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
 * 	\defgroup   timeflow     Module TimeFlow
 *  \brief      TimeFlow module descriptor.
 *
 *  \file       htdocs/timeflow/core/modules/modTimeFlow.class.php
 *  \ingroup    timeflow
 *  \brief      Description and activation file for module TimeFlow
 */
include_once DOL_DOCUMENT_ROOT.'/core/modules/DolibarrModules.class.php';


/**
 *  Description and activation class for module TimeFlow
 */
class modTimeFlow extends DolibarrModules
{
	/**
	 * Constructor. Define names, constants, directories, boxes, permissions
	 *
	 * @param DoliDB $db Database handler
	 */
	public function __construct($db)
	{
		global $conf, $langs;

		$this->db = $db;

		// Id for module (must be unique).
		// Use here a free id (See in Home -> System information -> Dolibarr for list of used modules id).
		$this->numero = 500000; // TODO Go on page https://wiki.dolibarr.org/index.php/List_of_modules_id to reserve an id number for your module

		// Key text used to identify module (for permissions, menus, etc...)
		$this->rights_class = 'timeflow';

		// Family can be 'base' (core modules),'crm','financial','hr','projects','products','ecm','technic' (transverse modules),'interface' (link with external tools),'other','...'
		// It is used to group modules by family in module setup page
		$this->family = "other";

		// Module position in the family on 2 digits ('01', '10', '20', ...)
		$this->module_position = '90';

		// Gives the possibility for the module, to provide his own family info and position of this family (Overwrite $this->family and $this->module_position. Avoid this)
		//$this->familyinfo = array('myownfamily' => array('position' => '01', 'label' => $langs->trans("MyOwnFamily")));
		// Module label (no space allowed), used if translation string 'ModuleTimeFlowName' not found (TimeFlow is name of module).
		$this->name = preg_replace('/^mod/i', '', get_class($this));

		// DESCRIPTION_FLAG
		// Module description, used if translation string 'ModuleTimeFlowDesc' not found (TimeFlow is name of module).
		$this->description = "TimeFlowDescription";
		// Used only if file README.md and README-LL.md not found.
		$this->descriptionlong = "TimeFlowDescription";

		// Author
		$this->editor_name = '';
		$this->editor_url = '';		// Must be an external online web site
		$this->editor_squarred_logo = '';					// Must be image filename into the module/img directory followed with @modulename. Example: 'myimage.png@timeflow'

		// Possible values for version are: 'development', 'experimental', 'dolibarr', 'dolibarr_deprecated', 'experimental_deprecated' or a version string like 'x.y.z'
		// Bump version so Dolibarr will run migrations when the module is updated.
		$this->version = '1.1';
		// Url to the file with your last numberversion of this module
		//$this->url_last_version = 'http://www.example.com/versionmodule.txt';

		// Key used in llx_const table to save module status enabled/disabled (where TIMEFLOW is value of property name of module in uppercase)
		$this->const_name = 'MAIN_MODULE_'.strtoupper($this->name);

		// Name of image file used for this module.
		// If file is in theme/yourtheme/img directory under name object_pictovalue.png, use this->picto='pictovalue'
		// If file is in module/img directory under name object_pictovalue.png, use this->picto='pictovalue@module'
		// To use a supported fa-xxx css style of font awesome, use this->picto='xxx'
		// A "xxx@module" (PNG-file) picto cannot work for a module under
		// htdocs/custom/: img_picto()'s "@module" resolution (and the
		// equivalent lookup theme/{eldy,md}/style.css.php does for the
		// top-menu icon) builds the file's URL as DOL_URL_ROOT.'/'.$module.'/img/...'
		// — never prepending "custom/" — so the PNG 404s.
		// This also explains why the top-menu bar rendered an empty
		// <span class="tmenuimageforpng">: core/menus/standard/eldy.lib.php
		// (print_text_menu_entry) only prints this $this->menu[]['prefix']
		// HTML verbatim when it starts with "<span" (or is a bare "fa-xxx"
		// string) — an <img> tag (what img_picto() returns for an "@module"
		// picto) matches neither case, so it falls back to an empty span that
		// depends on theme-generated CSS to fill in a background-image, which
		// has the exact same "custom/" bug independently.
		// A fa-xxx keyword sidesteps all of this: img_picto() returns a ready
		// '<span class="fas fa-xxx ...">' for it, which eldy.lib.php detects
		// and prints as-is — no file path, no theme CSS involved. Same
		// mechanism core modules use (see modHRM.class.php: $this->picto = 'hrm';).
		$this->picto = 'fa-clock';

		// Define some features supported by module (triggers, login, substitutions, menus, css, etc...)
		$this->module_parts = array(
			// Set this to 1 if module has its own trigger directory (core/triggers)
			'triggers' => 1,
			// Set this to 1 if module has its own login method file (core/login)
			'login' => 0,
			// Set this to 1 if module has its own substitution function file (core/substitutions)
			'substitutions' => 0,
			// Set this to 1 if module has its own menus handler directory (core/menus)
			'menus' => 0,
			// Set this to 1 if module overwrite template dir (core/tpl)
			'tpl' => 0,
			// Set this to 1 if module has its own barcode directory (core/modules/barcode)
			'barcode' => 0,
			// Set this to 1 if module has its own models directory (core/modules/xxx)
			'models' => 0,
			// Set this to 1 if module has its own printing directory (core/modules/printing)
			'printing' => 0,
			// Set this to 1 if module has its own theme directory (theme)
			'theme' => 0,
			'api' => 0,
			// Set this to relative path of css file if module has its own css file
			'css' => array(
				//    '/timeflow/css/timeflow.css.php',
			),
			// Set this to relative path of js file if module must load a js on all pages
			'js' => array(
				//   '/timeflow/js/timeflow.js.php',
			),
			// Set here all hooks context managed by module. To find available hook context, make a "grep -r '>initHooks(' *" on source code. You can also set hook context to 'all'
			/* BEGIN MODULEBUILDER HOOKSCONTEXTS */
			'hooks' => array(
				//   'data' => array(
				//       'hookcontext1',
				//       'hookcontext2',
				//   ),
				//   'entity' => '0',
			),
			/* END MODULEBUILDER HOOKSCONTEXTS */
			// Set this to 1 if features of module are opened to external users
			'moduleforexternal' => 0,
			// Set this to 1 if the module provides a website template into doctemplates/websites/website_template-mytemplate
			'websitetemplates' => 0,
			// Set this to 1 if the module provides a captcha driver
			'captcha' => 0
		);

		// Data directories to create when module is enabled.
		// Example: this->dirs = array("/timeflow/temp","/timeflow/subdir");
		$this->dirs = array("/timeflow/temp");

		// Config pages. Put here list of php page, stored into timeflow/admin directory, to use to setup module.
		$this->config_page_url = array("setup.php@timeflow");

		// Dependencies
		// A condition to hide module
		$this->hidden = getDolGlobalInt('MODULE_TIMEFLOW_DISABLED'); // A condition to disable module;
		// List of module class names that must be enabled if this module is enabled. Example: array('always'=>array('modModuleToEnable1','modModuleToEnable2'), 'FR'=>array('modModuleToEnableFR')...)
		$this->depends = array();
		// List of module class names to disable if this one is disabled. Example: array('modModuleToDisable1', ...)
		$this->requiredby = array();
		// List of module class names this module is in conflict with. Example: array('modModuleToDisable1', ...)
		$this->conflictwith = array();

		// The language file dedicated to your module
		$this->langfiles = array("timeflow@timeflow");

		// Prerequisites
		$this->phpmin = array(7, 2); // Minimum version of PHP required by module
		// $this->phpmax = array(8, 0); // Maximum version of PHP required by module
		// Actually validated in real use: Dolibarr 22.0.4 (Windows/WAMP) and
		// 23.0.3 (Linux). The 19+ floor below is inherited from the
		// ModuleBuilder template and never independently confirmed on
		// anything before 22.0.4 — treat versions outside 22.x-23.x as
		// untested, not guaranteed, regardless of what this declares.
		$this->need_dolibarr_version = array(19, -3); // Minimum version of Dolibarr required by module
		// $this->max_dolibarr_version = array(19, -3); // Maximum version of Dolibarr required by module
		$this->need_javascript_ajax = 0;

		// Messages at activation
		$this->warnings_activation = array(); 		// Warning to show when we activate a module. Example: array('always'='text') or array('FR'='textfr','MX'='textmx'...)
		$this->warnings_activation_ext = array(); 	// Warning to show when we activate a module if another module is on. Example: array('modOtherModule' => array('always'=>'text')) or array('always' => array('FR'=>'textfr','MX'=>'textmx'...))
		//$this->automatic_activation = array('FR'=>'TimeFlowWasAutomaticallyActivatedBecauseOfYourCountryChoice');
		//$this->always_enabled = false;			// If true, can't be disabled. Value true is reserved for core modules. Not allowed for external modules.

		// Constants
		// List of particular constants to add when module is enabled (key, 'chaine', value, desc, visible, 'current' or 'allentities', deleteonunactive)
		// Example: $this->const=array(1 => array('TIMEFLOW_MYNEWCONST1', 'chaine', 'myvalue', 'This is a constant to add', 1),
		//                             2 => array('TIMEFLOW_MYNEWCONST2', 'chaine', 'myvalue', 'This is another constant to add', 0, 'current', 1)
		// );
		$this->const = array();

		// Some keys to add into the overwriting translation tables
		/*$this->overwrite_translation = array(
			'en_US:ParentCompany'=>'Parent company or reseller',
			'fr_FR:ParentCompany'=>'Maison mère ou revendeur'
		)*/

		if (!isModEnabled("timeflow")) {
			$conf->timeflow = new stdClass();
			$conf->timeflow->enabled = 0;
		}

		// Array to add new pages in new tabs
		/* BEGIN MODULEBUILDER TABS */
		// Don't forget to deactivate/reactivate your module to test your changes
		$this->tabs = array();
		/* END MODULEBUILDER TABS */
		// Example:
		// To add a new tab identified by code tabname1
		// $this->tabs[] = array('data' => 'objecttype:+tabname1:Title1:mylangfile@timeflow:$user->hasRight('timeflow', 'timeentry', 'read'):/timeflow/mynewtab1.php?id=__ID__');
		// To add another new tab identified by code tabname2. Label will be result of calling all substitution functions on 'Title2' key.
		// $this->tabs[] = array('data' => 'objecttype:+tabname2:SUBSTITUTION_Title2:mylangfile@timeflow:$user->hasRight('othermodule', 'otherobject', 'read'):/timeflow/mynewtab2.php?id=__ID__',
		// To remove an existing tab identified by code tabname
		// $this->tabs[] = array('data' => 'objecttype:-tabname:NU:conditiontoremove');
		//
		// Where objecttype can be
		// 'categories_x'	  to add a tab in category view (replace 'x' by type of category (0=product, 1=supplier, 2=customer, 3=member)
		// 'contact'          to add a tab in contact view
		// 'contract'         to add a tab in contract view
		// 'delivery'         to add a tab in delivery view
		// 'group'            to add a tab in group view
		// 'intervention'     to add a tab in intervention view
		// 'invoice'          to add a tab in customer invoice view
		// 'supplier_invoice' to add a tab in supplier invoice view
		// 'member'           to add a tab in foundation member view
		// 'opensurveypoll'	  to add a tab in opensurvey poll view
		// 'order'            to add a tab in sale order view
		// 'supplier_order'   to add a tab in supplier order view
		// 'payment'		  to add a tab in payment view
		// 'supplier_payment' to add a tab in supplier payment view
		// 'product'          to add a tab in product view
		// 'propal'           to add a tab in propal view
		// 'project'          to add a tab in project view
		// 'stock'            to add a tab in stock view
		// 'thirdparty'       to add a tab in third party view
		// 'user'             to add a tab in user view


		// Dictionaries
		/* Example:
		 $this->dictionaries=array(
		 'langs' => 'timeflow@timeflow',
		 // List of tables we want to see into dictionary editor
		 'tabname' => array("table1", "table2", "table3"),
		 // Label of tables
		 'tablib' => array("Table1", "Table2", "Table3"),
		 // Request to select fields
		 'tabsql' => array('SELECT f.rowid as rowid, f.code, f.label, f.active FROM '.$this->db->prefix().'table1 as f', 'SELECT f.rowid as rowid, f.code, f.label, f.active FROM '.$this->db->prefix().'table2 as f', 'SELECT f.rowid as rowid, f.code, f.label, f.active FROM '.$this->db->prefix().'table3 as f'),
		 // Sort order
		 'tabsqlsort' => array("label ASC", "label ASC", "label ASC"),
		 // List of fields (result of select to show dictionary)
		 'tabfield' => array("code,label", "code,label", "code,label"),
		 // List of fields (list of fields to edit a record)
		 'tabfieldvalue' => array("code,label", "code,label", "code,label"),
		 // List of fields (list of fields for insert)
		 'tabfieldinsert' => array("code,label", "code,label", "code,label"),
		 // Name of columns with primary key (try to always name it 'rowid')
		 'tabrowid' => array("rowid", "rowid", "rowid"),
		 // Condition to show each dictionary
		 'tabcond' => array(isModEnabled('timeflow'), isModEnabled('timeflow'), isModEnabled('timeflow')),
		 // Tooltip for every fields of dictionaries: DO NOT PUT AN EMPTY ARRAY
		 'tabhelp' => array(array('code' => $langs->trans('CodeTooltipHelp'), 'field2' => 'field2tooltip'), array('code' => $langs->trans('CodeTooltipHelp'), 'field2' => 'field2tooltip'), ...),
		 );
		 */
		/* BEGIN MODULEBUILDER DICTIONARIES */
		$this->dictionaries = array();
		/* END MODULEBUILDER DICTIONARIES */

		// Boxes/Widgets
		// Add here list of php file(s) stored in timeflow/core/boxes that contains a class to show a widget.
		/* BEGIN MODULEBUILDER WIDGETS */
		$this->boxes = array(
			//  0 => array(
			//      'file' => 'timeflowwidget1.php@timeflow',
			//      'note' => 'Widget provided by TimeFlow',
			//      'enabledbydefaulton' => 'Home',
			//  ),
			//  ...
		);
		/* END MODULEBUILDER WIDGETS */

		// Cronjobs (List of cron jobs entries to add when module is enabled)
		// unit_frequency must be 60 for minute, 3600 for hour, 86400 for day, 604800 for week
		/* BEGIN MODULEBUILDER CRON */
		$this->cronjobs = array(
			0 => array(
				'label' => 'TimeFlow: close timers left active past midnight',
				'jobtype' => 'method',
				'class' => '/timeflow/class/timeentry.class.php',
				'objectname' => 'TimeEntry',
				'method' => 'closeStaleActiveTimersAtMidnight',
				'parameters' => '',
				'comment' => 'Closes any timer still active from a previous calendar day at that day’s midnight and continues it in a brand-new entry starting today — same midnight-split mechanism as stopTimer(), independent of the max-duration cap.',
				// Every 5 minutes rather than exactly at midnight, so a late or
				// skipped cron tick near 00:00 does not leave a timer straddling
				// two calendar days for the rest of the day.
				'frequency' => 5,
				'unitfrequency' => 60,
				'status' => 1,
				'test' => 'isModEnabled("timeflow")',
				'priority' => 50,
			),
		);
		/* END MODULEBUILDER CRON */
		// Example: $this->cronjobs=array(
		//    0=>array('label'=>'My label', 'jobtype'=>'method', 'class'=>'/dir/class/file.class.php', 'objectname'=>'MyClass', 'method'=>'myMethod', 'parameters'=>'param1, param2', 'comment'=>'Comment', 'frequency'=>2, 'unitfrequency'=>3600, 'status'=>0, 'test'=>'isModEnabled("timeflow")', 'priority'=>50),
		//    1=>array('label'=>'My label', 'jobtype'=>'command', 'command'=>'', 'parameters'=>'param1, param2', 'comment'=>'Comment', 'frequency'=>1, 'unitfrequency'=>3600*24, 'status'=>0, 'test'=>'isModEnabled("timeflow")', 'priority'=>50)
		// );

		// Permissions provided by this module
		$this->rights = array();
		$r = 0;
		// Add here entries to declare new permissions
		/* BEGIN MODULEBUILDER PERMISSIONS */
		$this->rights[$r][0] = $this->numero . sprintf('%02d', 1);
		$this->rights[$r][1] = 'Read TimeEntry object of TimeFlow';
		$this->rights[$r][4] = 'timeentry';
		$this->rights[$r][5] = 'read';
		$r++;
		$this->rights[$r][0] = $this->numero . sprintf('%02d', 2);
		$this->rights[$r][1] = 'Read all TimeEntry objects (all users) of TimeFlow';
		$this->rights[$r][4] = 'timeentry';
		$this->rights[$r][5] = 'readall';
		$r++;
		$this->rights[$r][0] = $this->numero . sprintf('%02d', 3);
		$this->rights[$r][1] = 'Create/Update TimeEntry object of TimeFlow';
		$this->rights[$r][4] = 'timeentry';
		$this->rights[$r][5] = 'write';
		$r++;
		$this->rights[$r][0] = $this->numero . sprintf('%02d', 4);
		$this->rights[$r][1] = 'Validate TimeEntry of TimeFlow';
		$this->rights[$r][4] = 'timeentry';
		$this->rights[$r][5] = 'validate';
		$r++;
		$this->rights[$r][0] = $this->numero . sprintf('%02d', 5);
		$this->rights[$r][1] = 'Delete TimeEntry object of TimeFlow';
		$this->rights[$r][4] = 'timeentry';
		$this->rights[$r][5] = 'delete';
		$r++;
		$this->rights[$r][0] = $this->numero . sprintf('%02d', 7);
		$this->rights[$r][1] = 'Delete submitted, validated or refused TimeEntry objects of TimeFlow';
		$this->rights[$r][4] = 'timeentry';
		$this->rights[$r][5] = 'deletevalidated';
		$r++;
		// entry 50000006 removed: 'Valider les entrées de temps' (perms 'valider')

		/* END MODULEBUILDER PERMISSIONS */


		// Main menu entries to add
		$this->menu = array();
        $r = 0;
        // Add here entries to declare new menus
		/* BEGIN MODULEBUILDER TOPMENU */
        $this->menu[$r++] = array(
            'fk_menu' => '',
            'type' => 'top',
            'titre' => 'ModuleTimeFlowName',
            'prefix' => img_picto('', $this->picto, 'class="pictofixedwidth valignmiddle"'),
            'mainmenu' => 'timeflow',
            'leftmenu' => '',
            'url' => '/timeflow/timeflowindex.php',
            'langs' => 'timeflow@timeflow',
            'position' => 1000 + $r,
            'enabled' => "isModEnabled('timeflow')",
            'perms' => '1',
            'target' => '',
            'user' => 2,
        );
        /* END MODULEBUILDER TOPMENU */

        /* BEGIN MODULEBUILDER LEFTMENU TIMEENTRY */
        // Removed: TimeEntry left menu entry. The React frontend (timeflowindex.php) handles all navigation.
        /* END MODULEBUILDER LEFTMENU TIMEENTRY */

        /* BEGIN MODULEBUILDER LEFTMENU LIST TIMEENTRY */
        // Removed duplicate menu entry. TimeEntry list is already defined by the parent left menu.
        /* END MODULEBUILDER LEFTMENU LIST TIMEENTRY */

        /* BEGIN MODULEBUILDER LEFTMENU NEW TIMEENTRY */
        // Removed: New TimeEntry menu entry. Creation is handled via the React frontend (TimerWidget).
        /* END MODULEBUILDER LEFTMENU NEW TIMEENTRY */

		/* BEGIN MODULEBUILDER LEFTMENU MYOBJECT */
		// Removed: unmodified ModuleBuilder scaffold for a "MyObject" left
		// menu (three entries: root/new/list), never adapted to TimeEntry —
		// it duplicated the real TimeEntry navigation already removed above
		// (see "LEFTMENU TIMEENTRY"/"LEFTMENU LIST TIMEENTRY"/"LEFTMENU NEW
		// TIMEENTRY") in favor of the React frontend, and even contained a
		// syntax error (missing comma after 'perms' in two of the three
		// array literals) that would have been a fatal parse error had this
		// ever been uncommented as-is.
		/* END MODULEBUILDER LEFTMENU MYOBJECT */


		// Exports profiles provided by this module
		$r = 0;
		/* BEGIN MODULEBUILDER EXPORT MYOBJECT */
		// Removed: unmodified ModuleBuilder scaffold for a "MyObject" export
		// profile, never adapted to TimeEntry (still references a
		// nonexistent 'timeflow_timeentry_line' companion table and the
		// placeholder class name 'MyObject' nowhere used in this module).
		// $this->export_code/export_label/export_icon/etc. all stay unset,
		// so no export profile is registered — exporting TimeEntry data is
		// not a feature this module offers today.
		/* END MODULEBUILDER EXPORT MYOBJECT */

		// Imports profiles provided by this module
		$r = 0;
		/* BEGIN MODULEBUILDER IMPORT MYOBJECT */
		// Removed: unmodified ModuleBuilder scaffold for a "MyObject" import
		// profile, never adapted to TimeEntry (references a never-defined
		// TIMEFLOW_MYOBJECT_ADDON constant and a mod_timeentry_standard ref
		// generator class that does not exist in this module, plus a
		// 'cpayment'/fk_mode_reglement mapping that has no TimeEntry
		// column to match). $this->import_code/import_label/etc. all stay
		// unset, so no import profile is registered here — the module's
		// real import feature is the separate Clockify CSV importer
		// (class/timeimport.class.php), unrelated to this ModuleBuilder
		// mechanism.
		/* END MODULEBUILDER IMPORT MYOBJECT */
	}

	/**
	 *  Function called when module is enabled.
	 *  The init function add constants, boxes, permissions and menus (defined in constructor) into Dolibarr database.
	 *  It also creates data directories
	 *
	 *  @param      string  $options    Options when enabling module ('', 'noboxes')
	 *  @return     int<-1,1>          	1 if OK, <=0 if KO
	 */
	public function init($options = '')
	{
		global $conf, $langs;

		// Create tables of module at module activation
		//$result = $this->_load_tables('/install/mysql/', 'timeflow');
$result = $this->_load_tables('/timeflow/sql/');
        if ($result < 0) {
            return -1;
        }

        // Create extrafields during init
		//include_once DOL_DOCUMENT_ROOT.'/core/class/extrafields.class.php';
		//$extrafields = new ExtraFields($this->db);
		//$result0=$extrafields->addExtraField('timeflow_separator1', "Separator 1", 'separator', 1,  0, 'thirdparty',   0, 0, '', array('options'=>array(1=>1)), 1, '', 1, 0, '', '', 'timeflow@timeflow', 'isModEnabled("timeflow")');
		//$result1=$extrafields->addExtraField('timeflow_myattr1', "New Attr 1 label", 'boolean', 1,  3, 'thirdparty',   0, 0, '', '', 1, '', -1, 0, '', '', 'timeflow@timeflow', 'isModEnabled("timeflow")');
		//$result2=$extrafields->addExtraField('timeflow_myattr2', "New Attr 2 label", 'varchar', 1, 10, 'project',      0, 0, '', '', 1, '', -1, 0, '', '', 'timeflow@timeflow', 'isModEnabled("timeflow")');
		//$result3=$extrafields->addExtraField('timeflow_myattr3', "New Attr 3 label", 'varchar', 1, 10, 'bank_account', 0, 0, '', '', 1, '', -1, 0, '', '', 'timeflow@timeflow', 'isModEnabled("timeflow")');
		//$result4=$extrafields->addExtraField('timeflow_myattr4', "New Attr 4 label", 'select',  1,  3, 'thirdparty',   0, 1, '', array('options'=>array('code1'=>'Val1','code2'=>'Val2','code3'=>'Val3')), 1,'', -1, 0, '', '', 'timeflow@timeflow', 'isModEnabled("timeflow")');
		//$result5=$extrafields->addExtraField('timeflow_myattr5', "New Attr 5 label", 'text',    1, 10, 'user',         0, 0, '', '', 1, '', -1, 0, '', '', 'timeflow@timeflow', 'isModEnabled("timeflow")');

		// Permissions
		$this->remove($options);

		$sql = array();

		// Document templates
		$moduledir = dol_sanitizeFileName('timeflow');
		$myTmpObjects = array();
		$myTmpObjects['TimeEntry'] = array('includerefgeneration' => 0, 'includedocgeneration' => 0);

		foreach ($myTmpObjects as $myTmpObjectKey => $myTmpObjectArray) {
			if ($myTmpObjectArray['includerefgeneration']) {
				$src = DOL_DOCUMENT_ROOT.'/install/doctemplates/'.$moduledir.'/template_timeentrys.odt';
				$dirodt = DOL_DATA_ROOT.($conf->entity > 1 ? '/'.$conf->entity : '').'/doctemplates/'.$moduledir;
				$dest = $dirodt.'/template_timeentrys.odt';

				if (file_exists($src) && !file_exists($dest)) {
					require_once DOL_DOCUMENT_ROOT.'/core/lib/files.lib.php';
					dol_mkdir($dirodt);
					$result = dol_copy($src, $dest, '0', 0);
					if ($result < 0) {
						$langs->load("errors");
						$this->error = $langs->trans('ErrorFailToCopyFile', $src, $dest);
						return 0;
					}
				}

				$sql = array_merge($sql, array(
					"DELETE FROM ".$this->db->prefix()."document_model WHERE nom = 'standard_".strtolower($myTmpObjectKey)."' AND type = '".$this->db->escape(strtolower($myTmpObjectKey))."' AND entity = ".((int) $conf->entity),
					"INSERT INTO ".$this->db->prefix()."document_model (nom, type, entity) VALUES('standard_".strtolower($myTmpObjectKey)."', '".$this->db->escape(strtolower($myTmpObjectKey))."', ".((int) $conf->entity).")",
					"DELETE FROM ".$this->db->prefix()."document_model WHERE nom = 'generic_".strtolower($myTmpObjectKey)."_odt' AND type = '".$this->db->escape(strtolower($myTmpObjectKey))."' AND entity = ".((int) $conf->entity),
					"INSERT INTO ".$this->db->prefix()."document_model (nom, type, entity) VALUES('generic_".strtolower($myTmpObjectKey)."_odt', '".$this->db->escape(strtolower($myTmpObjectKey))."', ".((int) $conf->entity).")"
				));
			}
		}

		return $this->_init($sql, $options);
	}

	/**
	 *	Function called when module is disabled.
	 *	Remove from database constants, boxes and permissions from Dolibarr database.
	 *	Data directories are not deleted
	 *
	 *	@param	string		$options	Options when enabling module ('', 'noboxes')
	 *	@return	int<-1,1>				1 if OK, <=0 if KO
	 */
	public function remove($options = '')
	{
		$sql = array();
		return $this->_remove($sql, $options);
	}
}
