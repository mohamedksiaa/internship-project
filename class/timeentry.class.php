<?php
/* Copyright (C) 2026 SuperAdmin - Clockify Module */

require_once DOL_DOCUMENT_ROOT.'/core/class/commonobject.class.php';

/**
 * Class for TimeEntry
 */
class TimeEntry extends CommonObject
{
	/**
	 * @var string 		ID of module.
	 */
	public $module = 'clockify';

	/**
	 * @var string 		ID to identify managed object.
	 */
	public $element = 'timeentry';

	/**
	 * @var string		Prefix to check for any trigger code of any business class to prevent bad value for trigger code.
	 * @see CommonTrigger::call_trigger()
	 */
	public $TRIGGER_PREFIX = 'CLOCKIFY_MYOBJECT';	// Will be used to build trgiger keys 'CLOCKIFY_MYOBJECT_MODIFY', ...

	/**
	 * @var string 		Name of table without prefix where object is stored. This is also the key used for extrafields management (so extrafields know the link to the parent table).
	 */
	public $table_element = 'clockify_timeentry';

	/**
	 * @var string 		If permission must be checked with hasRight('clockify', 'read') and not hasright('clockify', 'timeentry', 'read'), you can uncomment this line
	 */
	//public $element_for_permission = 'clockify';

	/**
	 * @var string 		String with name of icon for timeentry. Must be a 'fa-xxx' fontawesome code (or 'fa-xxx_fa_color_size') or 'timeentry@clockify' if picto is file 'img/object_timeentry.png'.
	 */
	public $picto = 'fa-file';

	/**
	 * @var int<0,1>	Does object support extrafields ? 0=No, 1=Yes
	 */
	public $isextrafieldmanaged = 0;

	/**
	 * @var int<0,1>|string		Does this object support multicompany module ?
	 * 							0=No test on entity, 1=Test with field entity in local table, 'field@table'=Test entity into the field@table (example 'fk_soc@societe')
	 */
	public $ismultientitymanaged = 0;


	const STATUS_DRAFT = 0;
	const STATUS_SUBMITTED = 1;
	const STATUS_VALIDATED = 2;
	const STATUS_CANCELED = 9;

	/**
	 *  'type' field format:
	 *  	'integer', 'integer:ObjectClass:PathToClass[:AddCreateButtonOrNot[:Filter[:Sortfield]]]',
	 *  	'select' (list of values are in 'options'. for integer list of values are in 'arrayofkeyval'),
	 *  	'sellist:TableName:LabelFieldName[:KeyFieldName[:KeyFieldParent[:Filter[:CategoryIdType[:CategoryIdList[:SortField]]]]]]',
	 *  	'chkbxlst:...',
	 *  	'varchar(x)',
	 *  	'text', 'text:none', 'html',
	 *   	'double(24,8)', 'real', 'price', 'stock',
	 *  	'date', 'datetime', 'timestamp', 'duration',
	 *  	'boolean', 'checkbox', 'radio', 'array',
	 *  	'email', 'phone', 'url', 'password', 'ip'
	 *		Note: Filter must be a Dolibarr Universal Filter syntax string. Example: "(t.ref:like:'SO-%') or (t.date_creation:<:'20160101') or (t.status:!=:0) or (t.nature:is:NULL)"
	 *  'length' the length of field. Example: 255, '24,8'
	 *  'label' the translation key.
	 *  'langfile' the key of the language file for translation.
	 *  'alias' the alias used into some old hard coded SQL requests
	 *  'picto' is code of a picto to show before value in forms
	 *  'enabled' is a condition when the field must be managed (Example: 1 or 'getDolGlobalInt("MY_SETUP_PARAM")' or 'isModEnabled("multicurrency")' ...)
	 *  'position' is the sort order of field.
	 *  'notnull' is set to 1 if not null in database. Set to -1 if we must set data to null if empty ('' or 0).
	 *  'visible' says if field is visible in list (Examples: 0=Not visible, 1=Visible on list and create/update/view forms, 2=Visible on list only, 3=Visible on create/update/view form only (not list), 4=Visible on list and update/view form (not create). 5=Visible on list and view form (not create/not update). 6=visible on list and update/view form (not update). Using a negative value means field is not shown by default on list but can be selected for viewing)
	 *  'noteditable' says if field is not editable (1 or 0)
	 *  'alwayseditable' says if field can be modified also when status is not draft ('1' or '0')
	 *  'default' is a default value for creation (can still be overwritten by the Setup of Default Values if the field is editable in creation form). Note: If default is set to '(PROV)' and field is 'ref', the default value will be set to '(PROVid)' where id is rowid when a new record is created.
	 *  'index' if we want an index in database.
	 *  'foreignkey'=>'tablename.field' if the field is a foreign key (it is recommended to name the field fk_...).
	 *  'searchall' is 1 if we want to search in this field when making a search from the quick search button.
	 *  'isameasure' must be set to 1 or 2 if field can be used for measure. Field type must be summable like integer or double(24,8). Use 1 in most cases, or 2 if you don't want to see the column total into list (for example for percentage)
	 *  'css' and 'cssview' and 'csslist' is the CSS style to use on field. 'css' is used in creation and update. 'cssview' is used in view mode. 'csslist' is used for columns in lists. For example: 'css'=>'minwidth300 maxwidth500 widthcentpercentminusx', 'cssview'=>'wordbreak', 'csslist'=>'tdoverflowmax200'
	 *  'placeholder' to set the placeholder of a varchar field.
	 *  'help' and 'helplist' is a 'TranslationString' to use to show a tooltip on field. You can also use 'TranslationString:keyfortooltiponlick' for a tooltip on click.
	 *  'showoncombobox' if value of the field must be visible into the label of the combobox that list record
	 *  'disabled' is 1 if we want to have the field locked by a 'disabled' attribute. In most cases, this is never set into the definition of $fields into class, but is set dynamically by some part of code like the constructor of the class.
	 *  'arrayofkeyval' to set a list of values if type is a list of predefined values. For example: array("0"=>"Draft","1"=>"Active","-1"=>"Cancel"). Note that type can be 'integer' or 'varchar'
	 *  'autofocusoncreate' to have field having the focus on a create form. Only 1 field should have this property set to 1.
	 *  'comment' is not used. You can store here any text of your choice. It is not used by application.
	 *	'validate' is 1 if you need to validate the field with $this->validateField(). Need MAIN_ACTIVATE_VALIDATION_RESULT.
	 *  'copytoclipboard' is 1 or 2 to allow to add a picto to copy value into clipboard (1=picto after label, 2=picto after value)
	 *
	 *  Note: To have value dynamic, you can set value to 0 in definition and edit the value on the fly into the constructor.
	 */

	// BEGIN MODULEBUILDER PROPERTIES
	/**
	 * @inheritdoc
	 * Array with all fields and their property. Do not use it as a static var. It may be modified by constructor.
	 */
	public $fields = array(
		"rowid" => array("type" => "integer", "label" => "TechnicalID", "enabled" => "1", 'position' => 1, 'notnull' => 1, "visible" => "-2", "index" => "1", "comment" => "Id"),
		"fk_user" => array("type" => "integer:User:user/class/user.class.php", "label" => "User", "enabled" => "1", 'position' => 10, 'notnull' => 1, "visible" => "1", "index" => "1",),
		"fk_project" => array("type" => "integer:Project:projet/class/project.class.php", "label" => "Project", "enabled" => "1", 'position' => 15, 'notnull' => 0, "visible" => "1", "index" => "1",),
		"fk_task" => array("type" => "integer:Task:projet/class/task.class.php", "label" => "Task", "enabled" => "1", 'position' => 20, 'notnull' => 0, "visible" => "1",),
		"date_start" => array("type" => "datetime", "label" => "DateStart", "enabled" => "1", 'position' => 25, 'notnull' => 1, "visible" => "1",),
		"date_end" => array("type" => "datetime", "label" => "DateEnd", "enabled" => "1", 'position' => 30, 'notnull' => 0, "visible" => "1",),
		"duration" => array("type" => "integer", "label" => "Duration", "enabled" => "1", 'position' => 35, 'notnull' => 0, "visible" => "1",),
		"is_manually_edited" => array("type" => "boolean", "label" => "ManuallyEdited", "enabled" => "1", 'position' => 35, 'notnull' => 1, "visible" => "-2",),
		"occurrence_count" => array("type" => "integer", "label" => "OccurrenceCount", "enabled" => "1", 'position' => 36, 'notnull' => 1, "visible" => "-2",),
		"date_reprise" => array("type" => "datetime", "label" => "DateResume", "enabled" => "1", 'position' => 37, 'notnull' => 0, "visible" => "-2",),
		"note" => array("type" => "text", "label" => "Note", "enabled" => "1", 'position' => 40, 'notnull' => 0, "visible" => "1",),
		"tags" => array("type" => "text", "label" => "Tags", "enabled" => "1", 'position' => 42, 'notnull' => 0, "visible" => "1",),
		"billable" => array("type" => "boolean", "label" => "Billable", "enabled" => "1", 'position' => 45, 'notnull' => 0, "visible" => "1",),
		"thm" => array("type" => "double(24,8)", "label" => "HourlyRate", "enabled" => "1", 'position' => 46, 'notnull' => 0, "visible" => "1", "isameasure" => 0, "help" => "HourlyRateCapturedAtEntryTime"),
		"amount" => array("type" => "price", "label" => "Amount", "enabled" => "1", 'position' => 47, 'notnull' => 0, "visible" => "1", "isameasure" => 1, "help" => "ComputedFromDurationAndHourlyRate"),
		"fk_facture" => array("type" => "integer:Facture:compta/facture/class/facture.class.php", "label" => "Invoice", "enabled" => "1", 'position' => 48, 'notnull' => 0, "visible" => "1",),
		"date_invoice" => array("type" => "datetime", "label" => "DateInvoiced", "enabled" => "1", 'position' => 49, 'notnull' => 0, "visible" => "1",),
		"status" => array("type" => "integer", "label" => "Status", "enabled" => "1", 'position' => 50, 'notnull' => 1, "visible" => "1", "arrayofkeyval" => array("0" => "Draft", "1" => "Submitted", "2" => "Validated", "9" => "Refused"),),
		"date_submit" => array("type" => "datetime", "label" => "DateSubmit", "enabled" => "1", 'position' => 52, 'notnull' => 0, "visible" => "1",),
		"fk_user_submit" => array("type" => "integer:User:user/class/user.class.php", "label" => "SubmittedBy", "enabled" => "1", 'position' => 54, 'notnull' => 0, "visible" => "1",),
		"fk_user_valid" => array("type" => "integer:User:user/class/user.class.php", "label" => "ValidatedBy", "enabled" => "1", 'position' => 55, 'notnull' => 0, "visible" => "1",),
		"date_creation" => array("type" => "datetime", "label" => "DateCreation", "enabled" => "1", 'position' => 500, 'notnull' => 1, "visible" => "-2",),
		"tms" => array("type" => "timestamp", "label" => "DateModification", "enabled" => "1", 'position' => 501, 'notnull' => 1, "visible" => "-2",),
		"fk_user_creat" => array("type" => "integer:User:user/class/user.class.php", "label" => "UserAuthor", "enabled" => "1", 'position' => 510, 'notnull' => 1, "visible" => "-2",),
		"fk_user_modif" => array("type" => "integer:User:user/class/user.class.php", "label" => "UserModif", "enabled" => "1", 'position' => 511, 'notnull' => 0, "visible" => "-2",),
		"import_key" => array("type" => "varchar(14)", "label" => "ImportId", "enabled" => "1", 'position' => 1000, 'notnull' => 0, "visible" => "-2",),
	);
	public $rowid;
	public $fk_user;
	public $fk_project;
	public $fk_task;
	public $date_start;
	public $date_end;
	public $duration;
	public $is_manually_edited;
	public $occurrence_count;
	public $date_reprise;
	public $note;
	public $tags;
	public $billable;
	public $thm;
	public $amount;
	public $fk_facture;
	public $date_invoice;
	public $status;
	public $date_submit;
	public $fk_user_submit;
	public $fk_user_valid;
	public $date_creation;
	public $tms;
	public $fk_user_creat;
public $fk_user_modif;
    public $import_key;
    // END MODULEBUILDER PROPERTIES

    const MOD_ACTION_EDIT = 'edit';
    const MOD_ACTION_SUBMIT = 'submit';
    const MOD_ACTION_VALIDATE = 'validate';
    const MOD_ACTION_REJECT = 'reject';
    const MOD_ACTION_REOPEN = 'reopen';
    const MOD_ACTION_MANUAL_EMPLOYEE = 'manual_employee';
    const MOD_ACTION_MANUAL_MANAGER = 'manual_manager';
    const MOD_ACTION_MANUAL_CREATE = 'manual_create';


	// If this object has a subtable with lines

	// /**
	//  * @var string    Name of subtable line
	//  */
	// public $table_element_line = 'clockify_timeentryline';

	// /**
	//  * @var string    Field name with ID of parent key if this object has a parent, Or Field name of in child tables to link to this record.
	//  */
	// public $fk_element = 'fk_timeentry';

	// /**
	//  * @var string    Name of subtable class that manage subtable lines
	//  */
	// public $class_element_line = 'TimeEntryline';

	// /**
	//  * @var array	List of child tables. To test if we can delete object.
	//  */
	// protected $childtables = array('mychildtable' => array('name'=>'TimeEntry', 'fk_element'=>'fk_timeentry'));

	// /**
	//  * @var array    List of child tables. To know object to delete on cascade.
	//  *               If name matches '@ClassName:FilePathClass:ParentFkFieldName' (the recommended mode) it will
	//  *               call method ClassName->deleteByParentField(parentId, 'ParentFkFieldName') to fetch and delete child object.
	//  *               Using an array like childtables should not be implemented because a child may have other child, so we must only use the method that call deleteByParentField().
	//  */
	// protected $childtablesoncascade = array('clockify_timeentrydet');

	// /**
	//  * @var TimeEntryLine[]     Array of subtable lines
	//  */
	// public $lines = array();



	/**
	 * Constructor
	 *
	 * @param	DoliDB $db Database handler
	 */
	public function __construct(DoliDB $db)
	{
		global $langs;

		$this->db = $db;

		if (!getDolGlobalInt('MAIN_SHOW_TECHNICAL_ID') && isset($this->fields['rowid']) && !empty($this->fields['ref'])) {
			$this->fields['rowid']['visible'] = 0;
		}
		if (!isModEnabled('multicompany') && isset($this->fields['entity'])) {
			$this->fields['entity']['enabled'] = 0;
		}

		// Example to show how to set values of fields definition dynamically
		/*if ($user->hasRight('clockify', 'timeentry', 'read')) {
			$this->fields['myfield']['visible'] = 1;
			$this->fields['myfield']['noteditable'] = 0;
		}*/

		// Unset fields that are disabled
		foreach ($this->fields as $key => $val) {
			if (isset($val['enabled']) && empty($val['enabled'])) {
				unset($this->fields[$key]);
			}
		}

		$optionalDbFields = array('tags', 'date_submit', 'fk_user_submit', 'occurrence_count', 'date_reprise');
		foreach ($optionalDbFields as $fieldName) {
			if (!$this->hasDatabaseColumn($this->table_element, $fieldName)) {
				unset($this->fields[$fieldName]);
			}
		}

		// Translate some data of arrayofkeyval
		if (is_object($langs)) {
			foreach ($this->fields as $key => $val) {
				if (!empty($val['arrayofkeyval']) && is_array($val['arrayofkeyval'])) {
					foreach ($val['arrayofkeyval'] as $key2 => $val2) {
						$this->fields[$key]['arrayofkeyval'][$key2] = $langs->trans($val2);
					}
				}
			}
		}
	}

	/**
	 * Check whether a column exists on the live table.
	 */
	private function hasDatabaseColumn($table, $column)
	{
		$sql = "SELECT 1 FROM information_schema.columns WHERE table_name = '".$this->db->escape($this->db->prefix().$table)."' AND column_name = '".$this->db->escape($column)."'";
		$resql = $this->db->query($sql);
		return ($resql && $this->db->num_rows($resql) > 0);
	}

	/**
	 * Create object into database
	 *
	 * @param	User		$user		User that creates
	 * @param	int<0,1> 	$notrigger	0=launch triggers after, 1=disable triggers
	 * @return	int<-1,max>				Return integer <0 if KO, Id of created object if OK
	 */
	public function create(User $user, $notrigger = 0)
	{
		$this->recalculateAmount();

		$result = $this->createCommon($user, $notrigger);

		// This object has no dedicated 'ref' column/field (see $fields above), but core Dolibarr
		// templates (dol_banner_tab, getNomUrl, linked-object blocks, ...) all read $this->ref to
		// build the record title and links. Without this, those areas render blank.
		// We fall back to the numeric id so the record always has a visible, unique identifier.
		if ($result > 0) {
			$this->ref = (string) $this->id;
		}

		// uncomment lines below if you want to validate object after creation
		// if ($result > 0) {
		// $this->fetch($this->id); // needed to retrieve some fields (ie date_creation for masked ref)
		// $resultupdate = $this->validate($user, $notrigger);
		// if ($resultupdate < 0) { return $resultupdate; }
		// }

		return $result;
	}

	/**
	 * Clone an object into another one
	 *
	 * @param	User 	$user		User that creates
	 * @param	int 	$fromid		Id of object to clone
	 * @return	self|int<-1,-1>		New object created, <0 if KO
	 */
	public function createFromClone(User $user, $fromid)
	{
		global $langs, $extrafields;
		$error = 0;

		dol_syslog(__METHOD__, LOG_DEBUG);

		$object = new self($this->db);

		$this->db->begin();

		// Load source object
		$result = $object->fetchCommon($fromid);
		if ($result > 0 && !empty($object->table_element_line)) {
			$object->fetchLines();
		}

		// get lines so they will be clone
		//foreach($this->lines as $line)
		//	$line->fetch_optionals();

		// Reset some properties
		unset($object->id);
		unset($object->fk_user_creat);
		unset($object->import_key);

		// Clear fields
		if (property_exists($object, 'ref')) {
			$object->ref = empty($this->fields['ref']['default']) ? "Copy_Of_".$object->ref : $this->fields['ref']['default'];
		}
		if (property_exists($object, 'label')) {
			$object->label = empty($this->fields['label']['default']) ? $langs->trans("CopyOf")." ".$object->label : $this->fields['label']['default'];
		}
		if (property_exists($object, 'status')) {
			$object->status = self::STATUS_DRAFT;
		}
		if (property_exists($object, 'date_creation')) {
			$object->date_creation = dol_now();
		}
		if (property_exists($object, 'date_modification')) {
			$object->date_modification = null;
		}
		// ...
		// Clear extrafields that are unique
		if (is_array($object->array_options) && count($object->array_options) > 0) {
			$extrafields->fetch_name_optionals_label($this->table_element);
			foreach ($object->array_options as $key => $option) {
				$shortkey = preg_replace('/options_/', '', $key);
				if (!empty($extrafields->attributes[$this->table_element]['unique'][$shortkey])) {
					//var_dump($key);
					//var_dump($clonedObj->array_options[$key]); exit;
					unset($object->array_options[$key]);
				}
			}
		}

		// Create clone
		$object->context['createfromclone'] = 'createfromclone';
		$result = $object->createCommon($user);
		if ($result < 0) {
			$error++;
			$this->setErrorsFromObject($object);
		}

		if (!$error) {
			// copy internal contacts
			if ($this->copy_linked_contact($object, 'internal') < 0) {
				$error++;
			}
		}

		if (!$error) {
			// copy external contacts if same company
			if (!empty($object->socid) && ((property_exists($this, 'fk_soc') && ($this->fk_soc == $object->socid)) || (property_exists($this, 'socid') && ($this->socid == $object->socid)))) {	// @phpstan-ignore-line
				if ($this->copy_linked_contact($object, 'external') < 0) {
					$error++;
				}
			}
		}

		unset($object->context['createfromclone']);

		// End
		if (!$error) {
			$this->db->commit();
			return $object;
		} else {
			$this->db->rollback();
			return -1;
		}
	}

	/**
	 * Load object in memory from the database
	 *
	 * @param	int    		$id   			Id object
	 * @param	string 		$ref  			Ref
	 * @param	int<0,1>	$noextrafields	0=Default to load extrafields, 1=No extrafields
	 * @param	int<0,1>	$nolines		0=Default to load lines, 1=No lines
	 * @return	int<-1,1>					Return integer <0 if KO, 0 if not found, >0 if OK
	 */
	public function fetch($id, $ref = null, $noextrafields = 0, $nolines = 0)
	{
		$result = $this->fetchCommon($id, $ref, '', $noextrafields);
		if ($result > 0) {
			// See comment in create(): no real 'ref' column, fall back to the numeric id.
			$this->ref = (string) $this->id;
		}
		if ($result > 0 && !empty($this->table_element_line) && empty($nolines)) {
			$this->fetchLines($noextrafields);
		}
		return $result;
	}

	/**
	 * Load object lines in memory from the database
	 *
	 * @param	int<0,1>	$noextrafields	0=Default to load extrafields, 1=No extrafields
	 * @return 	int<-1,1>					Return integer <0 if KO, 0 if not found, >0 if OK
	 */
	public function fetchLines($noextrafields = 0)
	{
		$this->lines = array();

		$result = $this->fetchLinesCommon('', $noextrafields);
		return $result;
	}


	/**
	 * Load list of objects in memory from the database.
	 * Using a fetchAll() with limit = 0 is a very bad practice. Instead try to forge yourself an optimized SQL request with
	 * your own loop with start and stop pagination.
	 *
	 * @param	string		$sortorder	Sort Order
	 * @param	string		$sortfield	Sort field
	 * @param	int<0,max>	$limit		Limit the number of lines returned
	 * @param	int<0,max>	$offset		Offset
	 * @param	string		$filter		Filter as an Universal Search string.
	 *                                  Example: '((client:=:1) OR ((client:>=:2) AND (client:<=:3))) AND (client:!=:8) AND (nom:like:'a%')'
	 * @param	string		$filtermode	No longer used
	 * @return	array<int,self>|int<-1,-1>	 <0 if KO, array of pages if OK
	 */
	public function fetchAll($sortorder = '', $sortfield = '', $limit = 1000, $offset = 0, string $filter = '', $filtermode = 'AND')
	{
		dol_syslog(__METHOD__, LOG_DEBUG);

		$records = array();

		$sql = "SELECT ";
		$sql .= $this->getFieldList('t');
		$sql .= " FROM ".$this->db->prefix().$this->table_element." as t";
		if (!empty($this->isextrafieldmanaged) && $this->isextrafieldmanaged == 1) {
			$sql .= " LEFT JOIN ".$this->db->prefix().$this->table_element."_extrafields as te ON te.fk_object = t.rowid";
		}
		if (!empty($this->ismultientitymanaged) && (int) $this->ismultientitymanaged == 1) {
			$sql .= " WHERE t.entity IN (".getEntity($this->element).")";
		} elseif (preg_match('/^\w+@\w+$/', (string) $this->ismultientitymanaged)) {
			$tmparray = explode('@', (string) $this->ismultientitymanaged);
			$sql .= " LEFT JOIN ".$this->db->prefix().$tmparray[1]." as pt ON t.".$this->db->sanitize($tmparray[0])." = pt.rowid";
			$sql .= " WHERE pt.entity IN (".getEntity($this->element).")";
		} else {
			$sql .= " WHERE 1 = 1";
		}

		// Manage filter
		$errormessage = '';
		$sql .= forgeSQLFromUniversalSearchCriteria($filter, $errormessage);
		if ($errormessage) {
			$this->errors[] = $errormessage;
			dol_syslog(__METHOD__.' '.implode(',', $this->errors), LOG_ERR);
			return -1;
		}

		if (!empty($sortfield)) {
			$sql .= $this->db->order($sortfield, $sortorder);
		}
		if (!empty($limit)) {
			$sql .= $this->db->plimit($limit, $offset);
		}

		$resql = $this->db->query($sql);
		if ($resql) {
			$num = $this->db->num_rows($resql);
			$i = 0;
			while ($i < ($limit ? min($limit, $num) : $num)) {
				$obj = $this->db->fetch_object($resql);

				$record = new self($this->db);
				$record->setVarsFromFetchObj($obj);
				$record->ref = (string) $record->id; // See comment in create()/fetch(): no real 'ref' column

				if (!empty($record->isextrafieldmanaged)) {
					$record->fetch_optionals();
				}

				$records[$record->id] = $record;

				$i++;
			}
			$this->db->free($resql);

			return $records;
		} else {
			$this->errors[] = 'Error '.$this->db->lasterror();
			dol_syslog(__METHOD__.' '.implode(',', $this->errors), LOG_ERR);

			return -1;
		}
	}

	/**
	 * Update object into database
	 *
	 * @param	User		$user		User that modifies
	 * @param	int<0,1>	$notrigger	0=launch triggers after, 1=disable triggers
	 * @return	int<-1,1>				Return integer <0 if KO, >0 if OK
	 */
	public function update(User $user, $notrigger = 0, $reason = '', $auditAction = self::MOD_ACTION_EDIT)
    {
		$isManualCorrection = in_array($auditAction, array(self::MOD_ACTION_MANUAL_EMPLOYEE, self::MOD_ACTION_MANUAL_MANAGER), true);
		$manualNewValues = array('date_start' => $this->date_start, 'date_end' => $this->date_end);
        $this->recalculateAmount();

        $oldValues = array();
        $fieldsToAudit = array('fk_project', 'fk_task', 'date_start', 'date_end', 'duration', 'note', 'tags', 'billable', 'thm', 'status');
        foreach ($fieldsToAudit as $field) {
            if (isset($this->fields[$field])) {
                $oldValues[$field] = null;
            }
        }

        if ($this->id > 0) {
            $existing = new self($this->db);
            if ($existing->fetch($this->id) > 0) {
                foreach ($fieldsToAudit as $field) {
                    $oldValues[$field] = isset($existing->$field) ? $existing->$field : null;
                }

                // fetch() converts date fields to timestamps using Dolibarr's
                // timezone rules.  Audit values must preserve the exact SQL
                // wall-clock time that existed before this update, otherwise
                // old_start/old_end can gain an hour during a round trip.
                $oldDateSql = 'SELECT date_start, date_end FROM '.$this->db->prefix().$this->table_element.' WHERE rowid = '.((int) $this->id);
                $oldDateRes = $this->db->query($oldDateSql);
                if ($oldDateRes && ($oldDate = $this->db->fetch_object($oldDateRes))) {
                    $oldValues['date_start'] = $oldDate->date_start;
                    $oldValues['date_end'] = $oldDate->date_end;
                }
            }
        }

		if ($isManualCorrection) {
			dol_syslog('clockify.correctTimeEntry updateCommon_transaction_begin rowid='.(int) $this->id, LOG_INFO);
		}
		$result = $this->updateCommon($user, $notrigger);
		if ($isManualCorrection) {
			dol_syslog('clockify.correctTimeEntry updateCommon_transaction_'.($result > 0 ? 'commit' : 'rollback').' rowid='.(int) $this->id.' result='.(int) $result, LOG_INFO);
		}

		if ($result > 0 && !empty($reason) && $this->id > 0) {
			if ($isManualCorrection) {
				dol_syslog('clockify.correctTimeEntry audit_insert_started rowid='.(int) $this->id, LOG_INFO);
			}
			$this->logModifications($user, $oldValues, $reason, $auditAction);
			if ($isManualCorrection) {
				if (!$this->recordManualTimeEdit($user, $oldValues, $manualNewValues, $reason)) {
					return -1;
				}
			}
			if ($isManualCorrection) {
				dol_syslog('clockify.correctTimeEntry audit_insert_finished rowid='.(int) $this->id, LOG_INFO);
			}
        }

        return $result;
    }

    /**
     * Persist the manual-edit marker and the legacy correction record together.
     *
     * The manager list uses is_manually_edited as the authoritative badge flag;
     * llx_clockify_time_edit_log remains the one-row correction summary used by
     * the popup and by installations upgraded from the original audit feature.
     */
    protected function recordManualTimeEdit(User $user, array $oldValues, array $newValues, string $reason)
    {
        $now = dol_now();
        $oldStart = $oldValues['date_start'] ?? null;
        $oldEnd = $oldValues['date_end'] ?? null;
        $toDatabaseDate = function ($value) {
            if ($value === null || $value === '') {
                return null;
            }
            // Preserve a raw SQL datetime captured before updateCommon.
            if (is_string($value) && preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $value)) {
                return $value;
            }
            return $this->db->idate((int) $value);
        };

        $flagSql = 'UPDATE '.$this->db->prefix().'clockify_timeentry SET is_manually_edited = 1';
        $flagSql .= ' WHERE rowid = '.((int) $this->id);
        if (!$this->db->query($flagSql)) {
            $this->error = 'Impossible de marquer la correction manuelle : '.$this->db->lasterror();
            dol_syslog(__METHOD__.' '.$this->error, LOG_ERR);
            return false;
        }

        $sql = 'INSERT INTO '.$this->db->prefix().'clockify_time_edit_log';
        $sql .= ' (entity, fk_time_entry, fk_user_editor, date_modification, old_start, new_start, old_end, new_end, reason, ip, user_agent) VALUES (';
        $sql .= ((int) $this->entity).',' . ((int) $this->id).',' . ((int) $user->id).',';
        $sql .= "'".$this->db->idate($now)."',";
        $sql .= "'".$this->db->escape($toDatabaseDate($oldStart))."',";
        $sql .= "'".$this->db->escape($toDatabaseDate($newValues['date_start'] ?? null))."',";
        $sql .= empty($oldEnd) ? 'NULL,' : "'".$this->db->escape($toDatabaseDate($oldEnd))."',";
        $sql .= empty($newValues['date_end']) ? 'NULL,' : "'".$this->db->escape($toDatabaseDate($newValues['date_end']))."',";
        $sql .= "'".$this->db->escape($reason)."',";
        $sql .= "'".$this->db->escape($_SERVER['REMOTE_ADDR'] ?? '')."',";
        $sql .= "'".$this->db->escape($_SERVER['HTTP_USER_AGENT'] ?? '')."')";
        if (!$this->db->query($sql)) {
            $this->error = 'Impossible d’enregistrer le journal de correction : '.$this->db->lasterror();
            dol_syslog(__METHOD__.' '.$this->error, LOG_ERR);
            return false;
        }

        return true;
    }

    protected function logModifications(User $user, array $oldValues, string $reason, string $action = self::MOD_ACTION_EDIT)
    {
        $now = dol_now();
        $fieldsToAudit = array('fk_project', 'fk_task', 'date_start', 'date_end', 'duration', 'note', 'tags', 'billable', 'thm', 'status');
        $normalizeDateForAudit = function ($value) {
            if ($value === null || $value === '') {
                return '';
            }

            if (is_string($value) && preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $value)) {
                return $value;
            }
            $timestamp = is_numeric($value) ? (int) $value : $this->db->jdate($value);
            return $timestamp > 0 ? $this->db->idate($timestamp) : (string) $value;
        };

        foreach ($fieldsToAudit as $field) {
            $oldVal = isset($oldValues[$field]) ? $oldValues[$field] : null;
            $newVal = isset($this->$field) ? $this->$field : null;

            // updateCommon receives dates as timestamps while fetch() returns
            // database datetime strings. Compare their canonical DB values so
            // an unchanged start is never recorded as a fake correction.
            if ($field === 'date_start' || $field === 'date_end') {
                $oldStr = $normalizeDateForAudit($oldVal);
                $newStr = $normalizeDateForAudit($newVal);
            } else {
                $oldStr = is_array($oldVal) ? json_encode($oldVal) : (string) $oldVal;
                $newStr = is_array($newVal) ? json_encode($newVal) : (string) $newVal;
            }

            if ($oldStr !== $newStr) {
                $sql = 'INSERT INTO '.$this->db->prefix().'clockify_timeentry_modification';
                $sql .= ' (entity, fk_timeentry, fk_user, action, field_name, old_value, new_value, reason, date_creation, fk_user_creat)';
                $sql .= ' VALUES ('.$this->entity.',';
                $sql .= ' '.((int) $this->id).',';
                $sql .= ' '.((int) $user->id).',';
                $sql .= " '".$this->db->escape($action)."',";
                $sql .= " '".$this->db->escape($field)."',";
                $sql .= " '".$this->db->escape($oldStr)."',";
                $sql .= " '".$this->db->escape($newStr)."',";
                $sql .= " '".$this->db->escape($reason)."',";
                $sql .= " '".$this->db->idate($now)."',";
                $sql .= ' '.((int) $user->id);
                $sql .= ')';
                $isManualCorrection = in_array($action, array(self::MOD_ACTION_MANUAL_EMPLOYEE, self::MOD_ACTION_MANUAL_MANAGER), true);
                if ($isManualCorrection) {
                    dol_syslog('clockify.correctTimeEntry audit_insert_query rowid='.(int) $this->id.' field='.$field, LOG_INFO);
                }
                $insertResult = $this->db->query($sql);
                if ($isManualCorrection) {
                    dol_syslog('clockify.correctTimeEntry audit_insert_result rowid='.(int) $this->id.' field='.$field.' result='.($insertResult ? 'success' : 'failure'), LOG_INFO);
                }
            }
        }
    }

    /** Record the initial values of a manually created time entry. */
    public function logManualCreation(User $user, string $reason, string $action = self::MOD_ACTION_MANUAL_CREATE)
    {
        $oldValues = array('date_start' => '', 'date_end' => '', 'duration' => '');
        $this->logModifications($user, $oldValues, $reason, $action);
    }

	/** Return true when the requested time range overlaps another user entry. */
	public function hasTimeOverlap($fkUser, $dateStart, $dateEnd, $excludeId = 0)
	{
		$overlaps = $this->getTimeOverlaps($fkUser, $dateStart, $dateEnd, $excludeId);
		return $overlaps === false || !empty($overlaps);
	}

	/**
	 * Return the existing entries that overlap a requested time range.
	 *
	 * @return array<int,array{rowid:int,date_start:string,date_end:string|null,note:string,project_label:string}>|false
	 */
	public function getTimeOverlaps($fkUser, $dateStart, $dateEnd, $excludeId = 0)
	{
		$start = is_numeric($dateStart) ? (int) $dateStart : strtotime((string) $dateStart);
		$end = is_numeric($dateEnd) ? (int) $dateEnd : strtotime((string) $dateEnd);
		if ($start <= 0 || $end <= $start) {
			return false;
		}

		$sql = 'SELECT t.rowid, t.date_start, t.date_end, t.note, p.title AS project_label';
		$sql .= ' FROM '.$this->db->prefix().$this->table_element.' AS t';
		$sql .= ' LEFT JOIN '.$this->db->prefix().'clockify_project AS p ON p.rowid = t.fk_project';
		$sql .= ' WHERE t.entity IN ('.getEntity($this->element).')';
		$sql .= ' AND t.fk_user = '.((int) $fkUser);
		// Overlap logic: new.start < existing.end AND (existing.start < new.end)
		// Implemented as: existing.date_start < new_end AND (date_end IS NULL OR date_end > new_start)
		$sql .= " AND t.date_start < '".$this->db->idate($end)."'";
		$sql .= " AND (t.date_end IS NULL OR t.date_end > '".$this->db->idate($start)."')";
		if ((int) $excludeId > 0) {
			// Exclude the entry currently being edited to avoid self-conflict
			$sql .= ' AND t.rowid <> '.((int) $excludeId);
		}
		$sql .= ' ORDER BY t.date_start ASC, t.rowid ASC';

		$resql = $this->db->query($sql);
		if (!$resql) {
			$this->error = $this->db->lasterror();
			return false;
		}

		$overlaps = array();
		while ($obj = $this->db->fetch_object($resql)) {
			$overlaps[] = array(
				'rowid' => (int) $obj->rowid,
				'date_start' => (string) $obj->date_start,
				'date_end' => $obj->date_end !== null ? (string) $obj->date_end : null,
				'note' => trim((string) $obj->note),
				'project_label' => trim((string) $obj->project_label),
			);
		}
		$this->db->free($resql);

		// Defensive filter: some DB/driver combinations may return the edited row despite the
		// WHERE rowid <> ... clause (type casting, collation, or view misalignment). Ensure the
		// currently edited entry is never reported as an overlap.
		if ((int) $excludeId > 0 && !empty($overlaps)) {
			$filtered = array();
			foreach ($overlaps as $ov) {
				if ((int) $ov['rowid'] !== (int) $excludeId) {
					$filtered[] = $ov;
				}
			}
			$overlaps = $filtered;
		}

		return $overlaps;
	}

	/**
	 * Recompute the billable amount from duration and hourly rate.
	 * Called before create/update so amount always reflects the current
	 * billable flag, duration, and captured hourly rate (thm).
	 * The rate is captured on the entry at billing time rather than looked
	 * up live, so past entries keep their historical amount even if a
	 * user's rate changes later.
	 *
	 * @return void
	 */
	protected function recalculateAmount()
	{
		if (!empty($this->billable) && !empty($this->thm) && !empty($this->duration)) {
			$this->amount = round(((float) $this->duration / 3600) * (float) $this->thm, 2);
		} else {
			$this->amount = 0;
		}
	}

	/**
	 * Delete object in database
	 *
	 * @param	User		$user		User that deletes
	 * @param	int<0,1> 	$notrigger	0=launch triggers, 1=disable triggers
	 * @return	int<-1,1>				Return integer <0 if KO, >0 if OK
	 */
	public function delete(User $user, $notrigger = 0)
	{
		return $this->deleteCommon($user, $notrigger);
		//return $this->deleteCommon($user, $notrigger, 1);
	}

	/**
	 *  Delete a line of object in database
	 *
	 *	@param	User		$user		User that delete
	 *  @param	int			$idline		Id of line to delete
	 *  @param	int<0,1>	$notrigger	0=launch triggers after, 1=disable triggers
	 *  @return	int<-2,1>				>0 if OK, <0 if KO
	 */
	public function deleteLine(User $user, $idline, $notrigger = 0)
	{
		if ($this->status < 0) {
			$this->error = 'ErrorDeleteLineNotAllowedByObjectStatus';
			return -2;
		}

		return $this->deleteLineCommon($user, $idline, $notrigger);
	}


	/**
	 *	Validate object
	 *
	 *	@param	User		$user		User making status change
	 *  @param	int<0,1>	$notrigger	1=Does not execute triggers, 0= execute triggers
	 *	@return	int<-1,1>				Return integer <=0 if OK, 0=Nothing done, >0 if KO
	 */
	public function validate($user, $notrigger = 0)
	{
		global $conf;

		require_once DOL_DOCUMENT_ROOT.'/core/lib/files.lib.php';

		$error = 0;

		// Protection
		if ($this->status == self::STATUS_VALIDATED) {
			dol_syslog(get_class($this)."::validate action abandoned: already validated", LOG_WARNING);
			return 0;
		}

		/* if (! ((!getDolGlobalInt('MAIN_USE_ADVANCED_PERMS') && $user->hasRight('clockify', 'timeentry', 'write'))
		 || (getDolGlobalInt('MAIN_USE_ADVANCED_PERMS') && $user->hasRight('clockify', 'timeentry_advance', 'validate')))
		 {
		 $this->error='NotEnoughPermissions';
		 dol_syslog(get_class($this)."::valid ".$this->error, LOG_ERR);
		 return -1;
		 }*/

		$now = dol_now();

		$this->db->begin();

		// Define new ref
		if (preg_match('/^[\(]?PROV/i', $this->ref) || empty($this->ref)) { // empty should not happened, but when it occurs, the test save life
			$num = $this->getNextNumRef();
		} else {
			$num = (string) $this->ref;
		}
		$this->newref = $num;

		if (!empty($num)) {
			// Validate
			$sql = "UPDATE ".$this->db->prefix().$this->table_element;
			$sql .= " SET ";
			if (!empty($this->fields['ref'])) {
				$sql .= " ref = '".$this->db->escape($num)."',";
			}
			$sql .= " status = ".self::STATUS_VALIDATED;
			if (!empty($this->fields['date_validation'])) {
				$sql .= ", date_validation = '".$this->db->idate($now)."'";
			}
			if (!empty($this->fields['fk_user_valid'])) {
				$sql .= ", fk_user_valid = ".((int) $user->id);
			}
			$sql .= " WHERE rowid = ".((int) $this->id);

			dol_syslog(get_class($this)."::validate()", LOG_DEBUG);
			$resql = $this->db->query($sql);
			if (!$resql) {
				dol_print_error($this->db);
				$this->error = $this->db->lasterror();
				$error++;
			}

			if (!$error && !$notrigger) {
				// Call trigger
				$result = $this->call_trigger('MYOBJECT_VALIDATE', $user);
				if ($result < 0) {
					$error++;
				}
				// End call triggers
			}
		}

		if (!$error) {
			$this->oldref = $this->ref;

			// Rename directory if dir was a temporary ref
			if (preg_match('/^[\(]?PROV/i', $this->ref)) {
				// Now we rename also files into index
				$sql = 'UPDATE '.$this->db->prefix()."ecm_files set filename = CONCAT('".$this->db->escape($this->newref)."', SUBSTR(filename, ".(strlen($this->ref) + 1).")), filepath = 'timeentry/".$this->db->escape($this->newref)."'";
				$sql .= " WHERE filename LIKE '".$this->db->escape($this->ref)."%' AND filepath = 'timeentry/".$this->db->escape($this->ref)."' and entity = ".$conf->entity;
				$resql = $this->db->query($sql);
				if (!$resql) {
					$error++;
					$this->error = $this->db->lasterror();
				}
				$sql = 'UPDATE '.$this->db->prefix()."ecm_files set filepath = 'timeentry/".$this->db->escape($this->newref)."'";
				$sql .= " WHERE filepath = 'timeentry/".$this->db->escape($this->ref)."' and entity = ".$conf->entity;
				$resql = $this->db->query($sql);
				if (!$resql) {
					$error++;
					$this->error = $this->db->lasterror();
				}

				// We rename directory ($this->ref = old ref, $num = new ref) in order not to lose the attachments
				$oldref = dol_sanitizeFileName($this->ref);
				$newref = dol_sanitizeFileName($num);
				$dirsource = $conf->clockify->dir_output.'/timeentry/'.$oldref;
				$dirdest = $conf->clockify->dir_output.'/timeentry/'.$newref;
				if (!$error && file_exists($dirsource)) {
					dol_syslog(get_class($this)."::validate() rename dir ".$dirsource." into ".$dirdest);

					if (@rename($dirsource, $dirdest)) {
						dol_syslog("Rename ok");
						// Rename docs starting with $oldref with $newref
						$listoffiles = dol_dir_list($conf->clockify->dir_output.'/timeentry/'.$newref, 'files', 1, '^'.preg_quote($oldref, '/'));
						foreach ($listoffiles as $fileentry) {
							$dirsource = $fileentry['name'];
							$dirdest = preg_replace('/^'.preg_quote($oldref, '/').'/', $newref, $dirsource);
							$dirsource = $fileentry['path'].'/'.$dirsource;
							$dirdest = $fileentry['path'].'/'.$dirdest;
							@rename($dirsource, $dirdest);
						}
					}
				}
			}
		}

		// Set new ref and current status
		if (!$error) {
			$this->ref = $num;
			$this->status = self::STATUS_VALIDATED;
		}

		if (!$error) {
			$this->db->commit();
			return 1;
		} else {
			$this->db->rollback();
			return -1;
		}
	}


	/**
	 *	Set draft status
	 *
	 *	@param	User		$user		Object user that modify
	 *  @param	int<0,1>	$notrigger	1=Does not execute triggers, 0=Execute triggers
	 *	@return	int<0,1>				Return integer <0 if KO, >0 if OK
	 */
	public function setDraft($user, $notrigger = 0)
	{
		// Protection
		if ($this->status <= self::STATUS_DRAFT) {
			return 0;
		}

		/* if (! ((!getDolGlobalInt('MAIN_USE_ADVANCED_PERMS') && $user->hasRight('clockify','write'))
		 || (getDolGlobalInt('MAIN_USE_ADVANCED_PERMS') && $user->hasRight('clockify','clockify_advance','validate'))))
		 {
		 $this->error='Permission denied';
		 return -1;
		 }*/

		return $this->setStatusCommon($user, self::STATUS_DRAFT, $notrigger, 'CLOCKIFY_MYOBJECT_UNVALIDATE');
	}

	/**
	 *	Set cancel status
	 *
	 *	@param	User		$user		Object user that modify
	 *  @param	int<0,1>	$notrigger	1=Does not execute triggers, 0=Execute triggers
	 *	@return	int<-1,1>				Return integer <0 if KO, 0=Nothing done, >0 if OK
	 */
	public function cancel($user, $notrigger = 0)
	{
		// Protection
		if ($this->status != self::STATUS_VALIDATED) {
			return 0;
		}

		/* if (! ((!getDolGlobalInt('MAIN_USE_ADVANCED_PERMS') && $user->hasRight('clockify','write'))
		 || (getDolGlobalInt('MAIN_USE_ADVANCED_PERMS') && $user->hasRight('clockify','clockify_advance','validate'))))
		 {
		 $this->error='Permission denied';
		 return -1;
		 }*/

		return $this->setStatusCommon($user, self::STATUS_CANCELED, $notrigger, 'CLOCKIFY_MYOBJECT_CANCEL');
	}

	/**
	 *	Set back to validated status
	 *
	 *	@param	User		$user			Object user that modify
	 *  @param	int<0,1>	$notrigger		1=Does not execute triggers, 0=Execute triggers
	 *	@return	int<-1,1>					Return integer <0 if KO, 0=Nothing done, >0 if OK
	 */
	public function reopen($user, $notrigger = 0)
	{
		// Protection
		if ($this->status == self::STATUS_VALIDATED) {
			return 0;
		}

		/*if (! ((!getDolGlobalInt('MAIN_USE_ADVANCED_PERMS') && $user->hasRight('clockify','write'))
		 || (getDolGlobalInt('MAIN_USE_ADVANCED_PERMS') && $user->hasRight('clockify','clockify_advance','validate'))))
		 {
		 $this->error='Permission denied';
		 return -1;
		 }*/

		return $this->setStatusCommon($user, self::STATUS_VALIDATED, $notrigger, 'CLOCKIFY_MYOBJECT_REOPEN');
	}

	/**
	 * getTooltipContentArray
	 *
	 * @param	array<string,string> 	$params 	Params to construct tooltip data
	 * @since 	v18
	 * @return	array{optimize?:string,picto?:string,ref?:string}
	 */
	public function getTooltipContentArray($params)
	{
		global $langs;

		$datas = [];

		if (getDolGlobalInt('MAIN_OPTIMIZEFORTEXTBROWSER')) {
			return ['optimize' => $langs->trans("ShowTimeEntry")];
		}
		$datas['picto'] = img_picto('', $this->picto).' <u>'.$langs->trans("TimeEntry").'</u>';
		if (isset($this->status)) {
			$datas['picto'] .= ' '.$this->getLibStatut(5);
		}
		if (property_exists($this, 'ref')) {
			$datas['ref'] = '<br><b>'.$langs->trans('Ref').':</b> '.$this->ref;
		}
		if (property_exists($this, 'label')) {
			$datas['label'] = '<br>'.$langs->trans('Label').':</b> '.$this->label;
		}

		return $datas;
	}

	/**
	 *  Return a link to the object card (with optionally the picto)
	 *
	 *  @param	int     $withpicto                  Include picto in link (0=No picto, 1=Include picto into link, 2=Only picto)
	 *  @param	string  $option                     On what the link point to ('nolink', ...)
	 *  @param	int     $notooltip                  1=Disable tooltip
	 *  @param	string  $morecss                    Add more css on link
	 *  @param	int     $save_lastsearch_value      -1=Auto, 0=No save of lastsearch_values when clicking, 1=Save lastsearch_values whenclicking
	 *  @return	string                              String with URL
	 */
	public function getNomUrl($withpicto = 0, $option = '', $notooltip = 0, $morecss = '', $save_lastsearch_value = -1)
	{
		global $conf, $langs, $hookmanager;

		if (!empty($conf->dol_no_mouse_hover)) {
			$notooltip = 1; // Force disable tooltips
		}

		$result = '';
		$params = [
			'id' => (string) $this->id,
			'objecttype' => $this->element.($this->module ? '@'.$this->module : ''),
			'option' => $option,
		];
		$classfortooltip = 'classfortooltip';
		$dataparams = '';
		if (getDolGlobalInt('MAIN_ENABLE_AJAX_TOOLTIP')) {
			$classfortooltip = 'classforajaxtooltip';
			$dataparams = ' data-params="'.dol_escape_htmltag(json_encode($params)).'"';
			$label = '';
		} else {
			$label = implode($this->getTooltipContentArray($params));
		}

		$baseurl = dol_buildpath('/clockify/timeentry_card.php', 1);
		$query = ['id' => $this->id];
		if ($option !== 'nolink') {
			// Add param to save lastsearch_values or not
			$add_save_lastsearch_values = ($save_lastsearch_value == 1 ? 1 : 0);
			if ($save_lastsearch_value == -1 && isset($_SERVER["PHP_SELF"]) && preg_match('/list\.php/', $_SERVER["PHP_SELF"])) {
				$add_save_lastsearch_values = 1;
			}
			if ($add_save_lastsearch_values) {
				$query = array_merge($query, ['save_lastsearch_values' => 1]);
			}
		}
		$url = dolBuildUrl($baseurl, $query);

		$linkclose = '';
		if (empty($notooltip)) {
			if (getDolGlobalInt('MAIN_OPTIMIZEFORTEXTBROWSER')) {
				$label = $langs->trans("ShowTimeEntry");
				$linkclose .= ' alt="'.dolPrintHTMLForAttribute($label).'"';
			}
			$linkclose .= ($label ? ' title="'.dolPrintHTMLForAttribute($label).'"' : ' title="tocomplete"');
			$linkclose .= $dataparams.' class="'.$classfortooltip.($morecss ? ' '.$morecss : '').'"';
		} else {
			$linkclose = ($morecss ? ' class="'.$morecss.'"' : '');
		}

		if ($option == 'nolink') {
			$linkstart = '<span';
		} else {
			$linkstart = '<a href="'.$url.'"';
		}
		$linkstart .= $linkclose.'>';
		if ($option == 'nolink') {
			$linkend = '</span>';
		} else {
			$linkend = '</a>';
		}

		$result .= $linkstart;

		if (empty($this->showphoto_on_popup)) {
			if ($withpicto) {
				$result .= img_object(($notooltip ? '' : $label), ($this->picto ? $this->picto : 'generic'), (($withpicto != 2) ? 'class="paddingright"' : ''), 0, 0, $notooltip ? 0 : 1);
			}
		} else {
			if ($withpicto) {
				require_once DOL_DOCUMENT_ROOT.'/core/lib/files.lib.php';

				list($class, $module) = explode('@', $this->picto);
				$upload_dir = $conf->$module->multidir_output[$conf->entity]."/$class/".dol_sanitizeFileName($this->ref);
				$filearray = dol_dir_list($upload_dir, "files");
				$filename = $filearray[0]['name'];
				if (!empty($filename)) {
					$pospoint = strpos($filearray[0]['name'], '.');

					$pathtophoto = $class.'/'.$this->ref.'/thumbs/'.substr($filename, 0, $pospoint).'_mini'.substr($filename, $pospoint);
					if (!getDolGlobalString(strtoupper($module.'_'.$class).'_FORMATLISTPHOTOSASUSERS')) {
						$result .= '<div class="floatleft inline-block valignmiddle divphotoref"><div class="photoref"><img class="photo'.$module.'" alt="No photo" border="0" src="'.DOL_URL_ROOT.'/viewimage.php?modulepart='.$module.'&entity='.$conf->entity.'&file='.urlencode($pathtophoto).'"></div></div>';
					} else {
						$result .= '<div class="floatleft inline-block valignmiddle divphotoref"><img class="photouserphoto userphoto" alt="No photo" border="0" src="'.DOL_URL_ROOT.'/viewimage.php?modulepart='.$module.'&entity='.$conf->entity.'&file='.urlencode($pathtophoto).'"></div>';
					}

					$result .= '</div>';
				} else {
					$result .= img_object(($notooltip ? '' : $label), ($this->picto ? $this->picto : 'generic'), ($notooltip ? (($withpicto != 2) ? 'class="paddingright"' : '') : 'class="'.(($withpicto != 2) ? 'paddingright ' : '').'"'), 0, 0, $notooltip ? 0 : 1);
				}
			}
		}

		if ($withpicto != 2) {
			$result .= $this->ref;
		}

		$result .= $linkend;
		//if ($withpicto != 2) $result.=(($addlabel && $this->label) ? $sep . dol_trunc($this->label, ($addlabel > 1 ? $addlabel : 0)) : '');

		global $action, $hookmanager;
		$hookmanager->initHooks(array($this->element.'dao'));
		$parameters = array('id' => $this->id, 'getnomurl' => &$result);
		$reshook = $hookmanager->executeHooks('getNomUrl', $parameters, $this, $action); // Note that $action and $object may have been modified by some hooks
		if ($reshook > 0) {
			$result = $hookmanager->resPrint;
		} else {
			$result .= $hookmanager->resPrint;
		}

		return $result;
	}

	/**
	 *	Return a thumb for kanban views
	 *
	 *	@param	string	    			$option		Where point the link (0=> main card, 1,2 => shipment, 'nolink'=>No link)
	 *  @param	?array<string,mixed>	$arraydata	Array of data
	 *  @return	string								HTML Code for Kanban thumb.
	 */
	public function getKanbanView($option = '', $arraydata = null)
	{
		global $conf, $langs;

		$selected = (empty($arraydata['selected']) ? 0 : $arraydata['selected']);

		$return = '<div class="box-flex-item box-flex-grow-zero">';
		$return .= '<div class="info-box info-box-sm">';
		$return .= '<span class="info-box-icon bg-infobox-action">';
		$return .= img_picto('', $this->picto);
		$return .= '</span>';
		$return .= '<div class="info-box-content">';
		$return .= '<span class="info-box-ref inline-block tdoverflowmax150 valignmiddle">'.(method_exists($this, 'getNomUrl') ? $this->getNomUrl() : $this->ref).'</span>';
		if ($selected >= 0) {
			$return .= '<input id="cb'.$this->id.'" class="flat checkforselect fright" type="checkbox" name="toselect[]" value="'.$this->id.'"'.($selected ? ' checked="checked"' : '').'>';
		}
		if (property_exists($this, 'label')) {
			$return .= ' <div class="inline-block opacitymedium valignmiddle tdoverflowmax100">'.$this->label.'</div>';
		}
		if (property_exists($this, 'thirdparty') && is_object($this->thirdparty)) {
			$return .= '<br><div class="info-box-ref tdoverflowmax150">'.$this->thirdparty->getNomUrl(1).'</div>';
		}
		if (property_exists($this, 'amount')) {
			$return .= '<br>';
			$return .= '<span class="info-box-label amount">'.price($this->amount, 0, $langs, 1, -1, -1, $conf->currency).'</span>';
		}
		if (method_exists($this, 'getLibStatut')) {
			$return .= '<br><div class="info-box-status">'.$this->getLibStatut(3).'</div>';
		}
		$return .= '</div>';
		$return .= '</div>';
		$return .= '</div>';

		return $return;
	}

	/**
	 *  Return the label of the status
	 *
	 *  @param	int<0,6>	$mode          0=long label, 1=short label, 2=Picto + short label, 3=Picto, 4=Picto + long label, 5=Short label + Picto, 6=Long label + Picto
	 *  @return	string 			       Label of status
	 */
	public function getLabelStatus($mode = 0)
	{
		return $this->LibStatut($this->status, $mode);
	}

	/**
	 *  Return the label of the status
	 *
	 *  @param	int<0,6>	$mode	0=long label, 1=short label, 2=Picto + short label, 3=Picto, 4=Picto + long label, 5=Short label + Picto, 6=Long label + Picto
	 *  @return	string				Label of status
	 */
	public function getLibStatut($mode = 0)
	{
		return $this->LibStatut($this->status, $mode);
	}

	// phpcs:disable PEAR.NamingConventions.ValidFunctionName.ScopeNotCamelCaps
	/**
	 *  Return the label of a given status
	 *
	 *  @param	int			$status		Id status
	 *  @param	int<0,6>	$mode		0=long label, 1=short label, 2=Picto + short label, 3=Picto, 4=Picto + long label, 5=Short label + Picto, 6=Long label + Picto
	 *  @return	string					Label of status
	 */
	public function LibStatut($status, $mode = 0)
	{
		// phpcs:enable
		if (is_null($status)) {
			return '';
		}

		$paramsBadge = array('badgeParams' => array('attr' => array(
			'data-status-element' => $this->element,
			'data-status' => (int) $status
		)));


		if (empty($this->labelStatus) || empty($this->labelStatusShort)) {
			global $langs;
			//$langs->load("clockify@clockify");
			$this->labelStatus[self::STATUS_DRAFT] = $langs->transnoentitiesnoconv('Draft');
			$this->labelStatus[self::STATUS_VALIDATED] = $langs->transnoentitiesnoconv('Enabled');
			$this->labelStatus[self::STATUS_CANCELED] = $langs->transnoentitiesnoconv('Refused');
			$this->labelStatusShort[self::STATUS_DRAFT] = $langs->transnoentitiesnoconv('Draft');
			$this->labelStatusShort[self::STATUS_VALIDATED] = $langs->transnoentitiesnoconv('Enabled');
			$this->labelStatusShort[self::STATUS_CANCELED] = $langs->transnoentitiesnoconv('Refused');
		}

		$statusType = 'status'.$status;
		//if ($status == self::STATUS_VALIDATED) $statusType = 'status1';
		if ($status == self::STATUS_CANCELED) {
			$statusType = 'status6';
		}

		return dolGetStatus($this->labelStatus[$status], $this->labelStatusShort[$status], '', $statusType, $mode, '', $paramsBadge);
	}

	/**
	 *	Load the info information in the object
	 *
	 *	@param	int		$id       Id of object
	 *	@return	void
	 */
	public function info($id)
	{
		$sql = "SELECT t.rowid, t.date_creation as datec";
		if (!empty($this->isextrafieldmanaged) && $this->isextrafieldmanaged == 1) {
			$sql .= ", GREATEST(t.tms, te.tms) as datem";
		} else {
			$sql .= ", t.tms as datem";
		}
		if (!empty($this->fields['date_validation'])) {
			$sql .= ", t.date_validation as datev";
		}
		if (!empty($this->fields['fk_user_creat'])) {
			$sql .= ", t.fk_user_creat";
		}
		if (!empty($this->fields['fk_user_modif'])) {
			$sql .= ", t.fk_user_modif";
		}
		if (!empty($this->fields['fk_user_valid'])) {
			$sql .= ", t.fk_user_valid";
		}
		$sql .= " FROM ".$this->db->prefix().$this->table_element." as t";
		if (!empty($this->isextrafieldmanaged) && $this->isextrafieldmanaged == 1) {
			$sql .= " LEFT JOIN ".$this->db->prefix().$this->table_element."_extrafields as te ON te.fk_object = t.rowid";
		}
		$sql .= " WHERE t.rowid = ".((int) $id);

		$result = $this->db->query($sql);
		if ($result) {
			if ($this->db->num_rows($result)) {
				$obj = $this->db->fetch_object($result);

				$this->id = $obj->rowid;

				if (!empty($this->fields['fk_user_creat'])) {
					$this->user_creation_id = $obj->fk_user_creat;
				}
				if (!empty($this->fields['fk_user_modif'])) {
					$this->user_modification_id = $obj->fk_user_modif;
				}
				if (!empty($this->fields['fk_user_valid'])) {
					$this->user_validation_id = $obj->fk_user_valid;
				}
				$this->date_creation = $this->db->jdate($obj->datec);
				$this->date_modification = empty($obj->datem) ? '' : $this->db->jdate($obj->datem);
				if (!empty($obj->datev)) {
					$this->date_validation = empty($obj->datev) ? '' : $this->db->jdate($obj->datev);
				}
			}

			$this->db->free($result);
		} else {
			dol_print_error($this->db);
		}
	}

	/**
	 * Initialize object with example values
	 * Id must be 0 if object instance is a specimen
	 *
	 * @return	int
	 */
	public function initAsSpecimen()
	{
		// Set here init that are not commonf fields
		// $this->property1 = ...
		// $this->property2 = ...

		return $this->initAsSpecimenCommon();
	}

	/**
	 * 	Create an array of lines
	 *
	 * 	@return	CommonObjectLine[]|int		array of lines if OK, <0 if KO
	 */
	public function getLinesArray()
	{
		$this->lines = array();

		$objectline = new TimeEntryLine($this->db);
		$result = $objectline->fetchAll('ASC', 'position', 0, 0, '(fk_timeentry:=:'.((int) $this->id).')');

		if (is_numeric($result)) {
			$this->setErrorsFromObject($objectline);
			return $result;
		} else {
			$this->lines = $result;
			return $this->lines;
		}
	}

	/**
	 *  Returns the reference to the following non used object depending on the active numbering module.
	 *
	 *  @return	string      		Object free reference
	 */
	public function getNextNumRef()
	{
		global $langs, $conf;
		$langs->load("clockify@clockify");

		if (!getDolGlobalString('CLOCKIFY_MYOBJECT_ADDON')) {
			$conf->global->CLOCKIFY_MYOBJECT_ADDON = 'mod_timeentry_standard';
		}

		if (getDolGlobalString('CLOCKIFY_MYOBJECT_ADDON')) {
			$mybool = false;

			$file = getDolGlobalString('CLOCKIFY_MYOBJECT_ADDON').".php";
			$classname = getDolGlobalString('CLOCKIFY_MYOBJECT_ADDON');

			// Include file with class
			$dirmodels = array_merge(array('/'), (array) $conf->modules_parts['models']);
			foreach ($dirmodels as $reldir) {
				$dir = dol_buildpath($reldir."core/modules/clockify/");

				// Load file with numbering class (if found)
				$mybool = $mybool || @include_once $dir.$file;
			}

			if (!$mybool) {
				dol_print_error(null, "Failed to include file ".$file);
				return '';
			}

			if (class_exists($classname)) {
				$obj = new $classname();
				'@phan-var-force ModeleNumRefTimeEntry $obj';
				$numref = $obj->getNextValue($this);

				if ($numref != '' && $numref != '-1') {
					return $numref;
				} else {
					$this->error = $obj->error;
					//dol_print_error($this->db,get_class($this)."::getNextNumRef ".$obj->error);
					return "";
				}
			} else {
				print $langs->trans("Error")." ".$langs->trans("ClassNotFound").' '.$classname;
				return "";
			}
		} else {
			print $langs->trans("ErrorNumberingModuleNotSetup", $this->element);
			return "";
		}
	}

	/**
	 *  Create a document onto disk according to template module.
	 *
	 *  @param	string		$modele			Force template to use ('' to not force)
	 *  @param	Translate	$outputlangs	object lang a utiliser pour traduction
	 *  @param	int<0,1>	$hidedetails    Hide details of lines
	 *  @param	int<0,1>	$hidedesc       Hide description
	 *  @param	int<0,1>	$hideref        Hide ref
	 *  @param	?array<string,string>  $moreparams     Array to provide more information
	 *  @return	int         				0 if KO, 1 if OK
	 */
	public function generateDocument($modele, $outputlangs, $hidedetails = 0, $hidedesc = 0, $hideref = 0, $moreparams = null)
	{
		global $langs;

		$result = 0;
		$includedocgeneration = 0;

		$langs->load("clockify@clockify");

		if (!dol_strlen($modele)) {
			if (!empty($this->model_pdf)) {
				$modele = $this->model_pdf;
			} else {
				$modele = getDolGlobalString('MYOBJECT_ADDON_PDF', 'standard_timeentry');
			}
		}

		$modelpath = "core/modules/clockify/doc/";

		if ($includedocgeneration && !empty($modele)) {
			$result = $this->commonGenerateDocument($modelpath, $modele, $outputlangs, $hidedetails, $hidedesc, $hideref, $moreparams);
		}

		return $result;
	}

	/**
	 * Return validation test result for a field.
	 * Need MAIN_ACTIVATE_VALIDATION_RESULT to be called.
	 *
	 * @param   array<string,array{type:string,label:string,enabled:int<0,2>|string,position:int,notnull?:int,visible:int<-2,5>|string,noteditable?:int<0,1>,default?:int<0,1>|string,index?:int,foreignkey?:string,searchall?:int<0,1>,isameasure?:int<0,1>,css?:string,csslist?:string,help?:string,showoncombobox?:int<0,2>,disabled?:int<0,1>,arrayofkeyval?:array<int|string,string>,comment?:string,validate?:int<0,1>}>  $fields Array of properties of field to show
	 * @param	string  $fieldKey            Key of attribute
	 * @param	string  $fieldValue          value of attribute
	 * @return	bool 						Return false if fail, true on success, set $this->error for error message
	 */
	public function validateField($fields, $fieldKey, $fieldValue)
	{
		// Add your own validation rules here.
		// ...

		return parent::validateField($fields, $fieldKey, $fieldValue);
	}

	/**
	 * Action executed by scheduler
	 * CAN BE A CRON TASK. In such a case, parameters come from the schedule job setup field 'Parameters'
	 * Use public function doScheduledJob($param1, $param2, ...) to get parameters
	 *
	 * @return	int			0 if OK, <>0 if KO (this function is used also by cron so only 0 is OK)
	 */
	public function doScheduledJob()
	{
		//global $conf, $langs;

		//$conf->global->SYSLOG_FILE = 'DOL_DATA_ROOT/dolibarr_mydedicatedlogfile.log';

		$error = 0;
		$this->output = '';
		$this->error = '';

		dol_syslog(__METHOD__." start", LOG_INFO);

		$now = dol_now();

		$this->db->begin();

		// ...

		$this->db->commit();

		dol_syslog(__METHOD__." end", LOG_INFO);

		return $error;
	}

	/**
	 * Return the active entry for a user, if any.
	 *
	 * @param int $fk_user User id
	 * @return int Entry id, or 0
	 */
	public function hasActiveTimer($fk_user)
	{
		$sql = 'SELECT rowid FROM '.$this->db->prefix().$this->table_element;
		$sql .= ' WHERE fk_user = '.((int) $fk_user).' AND date_end IS NULL';
		$sql .= ' ORDER BY date_start DESC';
		$sql .= $this->db->plimit(1);
		$resql = $this->db->query($sql);
		if ($resql && $this->db->num_rows($resql)) {
			return (int) $this->db->fetch_object($resql)->rowid;
		}
		return 0;
	}

	/**
	 * Start a timer. Project and task are optional Clockify metadata.
	 *
	 * @param int    $fk_user User id
	 * @param int    $fk_project Project id (0 for no project)
	 * @param int    $fk_task Task id (0 for no task)
	 * @param string $note Free-text description
	 * @param User   $user User executing the action
	 * @return int New entry id, or a negative value on failure
	 */
	public function startTimer($fk_user, $fk_project = 0, $fk_task = 0, $note = '', ?User $user = null, $tags = '', $billable = 0)
	{
		// Défense en profondeur : un projet et une description (3 caractères minimum)
		// sont obligatoires pour démarrer un chrono, quel que soit l'appelant.
		if ((int) $fk_project <= 0) {
			$this->error = 'Veuillez sélectionner un projet avant de démarrer.';
			return -1;
		}
		if (mb_strlen(trim((string) $note)) < 3) {
			$this->error = 'Veuillez décrire votre tâche (3 caractères minimum) avant de démarrer.';
			return -1;
		}

		if ($this->hasActiveTimer($fk_user) > 0) {
			$this->error = 'Un chrono est déjà actif pour cet utilisateur';
			return -1;
		}

		$this->fk_user = (int) $fk_user;
		$this->fk_project = ((int) $fk_project > 0) ? (int) $fk_project : null;
		$this->fk_task = ((int) $fk_task > 0) ? (int) $fk_task : null;
		$this->note = trim((string) $note);
		$this->tags = trim((string) $tags);
		$this->date_start = dol_now();
		$this->date_end = null;
		$this->duration = 0;
		// Explicitly set the non-null database flag.  CommonObject includes
		// declared fields in its INSERT, so relying on the SQL DEFAULT would
		// otherwise send NULL and reject a valid timer start.
		$this->is_manually_edited = 0;
		$this->occurrence_count = 1;
		$this->date_reprise = null;
		$this->billable = (int) !empty($billable);
		$this->thm = ($user && !empty($user->thm)) ? (float) $user->thm : 0;
		$this->amount = 0;
		$this->status = self::STATUS_DRAFT;

		return $this->create($user);
	}

	/** Create a manual time block with explicit start/end values. */
	public function createManualEntry($fk_user, $fk_project = 0, $fk_task = 0, $dateStart = null, $dateEnd = null, $note = '', $tags = '', $billable = 0, ?User $user = null, $thm = null, $status = self::STATUS_VALIDATED)
	{
		$dateStart = !empty($dateStart) ? (is_numeric($dateStart) ? (int) $dateStart : strtotime($dateStart)) : 0;
		$dateEnd = !empty($dateEnd) ? (is_numeric($dateEnd) ? (int) $dateEnd : strtotime($dateEnd)) : 0;
		if ($dateStart <= 0 || $dateEnd <= 0 || $dateEnd <= $dateStart) {
			$this->error = 'Les dates de début et de fin sont invalides';
			return -1;
		}

		$this->fk_user = (int) $fk_user;
		$this->fk_project = ((int) $fk_project > 0) ? (int) $fk_project : null;
		$this->fk_task = ((int) $fk_task > 0) ? (int) $fk_task : null;
		$this->date_start = dol_print_date($dateStart, 'dayhour');
		$this->date_end = dol_print_date($dateEnd, 'dayhour');
		$this->duration = max(0, (int) ($dateEnd - $dateStart));
		$this->is_manually_edited = 0;
		$this->occurrence_count = 1;
		$this->date_reprise = null;
		$this->note = trim((string) $note);
		$this->tags = trim((string) $tags);
		$this->billable = (int) !empty($billable);
		if ($thm !== null && (float) $thm > 0) {
			$this->thm = (float) $thm;
		} else {
			$this->thm = ($user && !empty($user->thm)) ? (float) $user->thm : 0;
		}
		$this->status = (int) $status;
		if ($this->status >= self::STATUS_SUBMITTED) {
			$this->fk_user_submit = (int) $fk_user;
			$this->date_submit = dol_now();
		}
		if ($this->status >= self::STATUS_VALIDATED) {
			$this->fk_user_valid = (int) $fk_user;
		}

		return $this->create($user);
	}

	/** Stop an active timer and calculate its duration. */
	public function stopTimer($id, User $user)
	{
		if ($this->fetch((int) $id) <= 0) {
			$this->error = 'Entrée introuvable';
			return -1;
		}
			if ((int) $this->fk_user !== (int) $user->id) {
			$this->error = 'Accès refusé';
			return -1;
		}
		if (!empty($this->date_end)) {
			$this->error = 'Ce chrono est déjà arrêté';
			return -1;
		}
		$this->date_end = dol_now();
		$this->duration = max(0, (int) $this->duration) + max(0, (int) $this->date_end - (int) $this->date_start);
		return $this->update($user);
	}

	/** Resume an existing stopped entry without creating a second row. */
	public function restartTimer($id, User $user)
	{
		if ($this->fetch((int) $id) <= 0) {
			$this->error = 'Entrée introuvable';
			return -1;
		}
			if ((int) $this->fk_user !== (int) $user->id) {
			$this->error = 'Accès refusé';
			return -1;
		}
		if ($this->hasActiveTimer($user->id) > 0) {
			$this->error = 'Un chrono est déjà actif pour cet utilisateur';
			return -1;
		}

		// Keep the accumulated duration and start a new active segment on this same row.
		// The primary key passed by the client is the only record selector: a resume never creates a row.
		$now = dol_now();
		$sql = 'UPDATE '.$this->db->prefix().$this->table_element;
		$sql .= " SET date_start = '".$this->db->idate($now)."'";
		$sql .= ', date_end = NULL';
		$sql .= ', status = '.self::STATUS_DRAFT;
		$sql .= ", date_reprise = '".$this->db->idate($now)."'";
		$sql .= ', occurrence_count = GREATEST(1, COALESCE(occurrence_count, 1)) + 1';
		$sql .= ', fk_user_modif = '.((int) $user->id);
		$sql .= ' WHERE rowid = '.((int) $id);
		$sql .= ' AND fk_user = '.((int) $this->fk_user);
		$sql .= ' AND date_end IS NOT NULL';

		$resql = $this->db->query($sql);
		if (!$resql) {
			$this->error = $this->db->lasterror();
			return -1;
		}
		if ($this->db->affected_rows($resql) < 1) {
			$this->error = 'Ce chrono ne peut pas être repris';
			return -1;
		}

		return $this->fetch((int) $id) > 0 ? 1 : -1;
	}

	/** Mark an entry as submitted for approval. */
	public function submitEntry($id, User $user)
	{
		if ($this->fetch((int) $id) <= 0) {
			$this->error = 'Entrée introuvable';
			return -1;
		}
		$this->status = self::STATUS_SUBMITTED;
		$this->date_submit = dol_now();
		$this->fk_user_submit = $user->id;
		return $this->update($user);
	}

	/** Update the validation status of an entry. */
	public function validateEntry($id, User $user, $status)
	{
		if ($this->fetch((int) $id) <= 0) {
			$this->error = 'Entrée introuvable';
			return -1;
		}
		$this->status = (int) $status;
		$this->fk_user_valid = $user->id;
		return $this->update($user);
	}
}


require_once DOL_DOCUMENT_ROOT.'/core/class/commonobjectline.class.php';

/**
 * Class TimeEntryLine. You can also remove this and generate a CRUD class for lines objects.
 */
class TimeEntryLine extends CommonObjectLine
{
	// To complete with content of an object TimeEntryLine
	// We should have a field rowid, fk_timeentry and position

	/**
	 * To overload
	 * @see CommonObjectLine
	 */
	public $parent_element = '';		// Example: '' or 'timeentry'

	/**
	 * To overload
	 * @see CommonObjectLine
	 */
	public $fk_parent_attribute = '';	// Example: '' or 'fk_timeentry'

	/**
	 * @var int<0,1>	Does object support extrafields ? 0=No, 1=Yes
	 */
	public $isextrafieldmanaged = 0;

	/**
	 * @var int<0,1>|string|null  	Does this object support multicompany module ?
	 * 								0=No test on entity, 1=Test with field entity in local table, 'field@table'=Test entity into the field@table (example 'fk_soc@societe')
	 */
	public $ismultientitymanaged = 0;


	/**
	 * Constructor
	 *
	 * @param	DoliDB $db Database handler
	 */
	public function __construct(DoliDB $db)
	{
		$this->db = $db;
        }
}
