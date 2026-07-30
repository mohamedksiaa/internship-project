<?php
/* Copyright (C) 2015		Jean-François Ferry		<jfefe@aternatik.fr>
 * Copyright (C) 2024-2025  Frédéric France			<frederic.france@free.fr>
 * Copyright (C) ---Replace with your own copyright and developer email---
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

use Luracast\Restler\RestException;

dol_include_once('/clockify/class/timeentry.class.php');



/**
 * \file    htdocs/modulebuilder/template/class/api_mymodule.class.php
 * \ingroup mymodule
 * \brief   File for API management of myobject.
 */

/**
 * API class for mymodule myobject
 *
 * @access protected
 * @class  DolibarrApiAccess {@requires user,external}
 */
class MyModuleApi extends DolibarrApi
{
	/**
	 * @var MyObject {@type MyObject}
	 */
	/*
	 * @var mixed TODO: set type
	 */
	public $timeentry;

	/**
	 * Constructor
	 *
	 * @url     GET /
	 */
	public function __construct()
	{
		global $db;
		$this->db = $db;
		$this->timeentry = new TimeEntry($this->db);
	}


	/* BEGIN MODULEBUILDER API TIMEENTRY */
	/**
	 * Get properties of a timeentry object
	 *
	 * Return an array with timeentry information
	 *
	 * @param	int		$id				ID of timeentry
	 * @return  Object					Object with cleaned properties
	 * @phan-return	TimeEntry			Object with cleaned properties
	 * @phpstan-return	TimeEntry			Object with cleaned properties
	 *
	 * @phan-return  TimeEntry
	 *
	 * @url	GET timeentrys/{id}
	 *
	 * @throws RestException 403 Not allowed
	 * @throws RestException 404 Not found
	 */
	public function get($id)
	{
		if (!DolibarrApiAccess::$user->hasRight('clockify', 'timeentry', 'read')) {
			throw new RestException(403);
		}
		if (!DolibarrApi::_checkAccessToResource('timeentry', $id, 'clockify_timeentry')) {
			throw new RestException(403, 'Access to instance id='.$id.' of object not allowed for login '.DolibarrApiAccess::$user->login);
		}

		$result = $this->timeentry->fetch($id);
		if (!$result) {
			throw new RestException(404, 'TimeEntry not found');
		}

		return $this->_cleanObjectDatas($this->timeentry);
	}


	/**
	 * List timeentrys
	 *
	 * Get a list of timeentrys
	 *
	 * @param 	string		   $sortfield			Sort field
	 * @param 	string		   $sortorder			Sort order
	 * @param 	int			   $limit				Limit for list
	 * @param 	int			   $page				Page number
	 * @param 	string         $sqlfilters          Other criteria to filter answers separated by a comma. Syntax example "(t.ref:like:'SO-%') and (t.date_creation:<:'20160101')"
	 * @param 	string		   $properties			Restrict the data returned to these properties. Ignored if empty. Comma separated list of properties names
	 * @return  array                               Array of TimeEntry objects
	 * @phan-return array<int,TimeEntry>
	 * @phpstan-return array<int,TimeEntry>
	 *
	 * @throws RestException 403 Not allowed
	 * @throws RestException 503 System error
	 *
	 * @url	GET /timeentrys/
	 */
	public function index($sortfield = "t.rowid", $sortorder = 'ASC', $limit = 100, $page = 0, $sqlfilters = '', $properties = '')
	{
		global $hookmanager;

		$obj_ret = array();
		$tmpobject = new TimeEntry($this->db);

		if (!DolibarrApiAccess::$user->hasRight('clockify', 'timeentry', 'read')) {
			throw new RestException(403);
		}

		$socid = DolibarrApiAccess::$user->socid ?: 0;

		$restrictonsocid = 0; // Set to 1 if there is a field socid in table of object

		// If the internal user must only see his customers, force searching by him
		$search_sale = 0;
		if ($restrictonsocid && !DolibarrApiAccess::$user->hasRight('societe', 'client', 'voir') && !$socid) {
			$search_sale = DolibarrApiAccess::$user->id;
		}
		if (!isModEnabled('societe')) {
			$search_sale = 0; // If module thirdparty not enabled, sale representative is something that does not exists
		}

		$sql = "SELECT t.rowid";
		$sql .= " FROM ".$this->db->prefix().$tmpobject->table_element." AS t";
		if (!empty($tmpobject->isextrafieldmanaged) && (int) $tmpobject->isextrafieldmanaged == 1) {
			$sql .= " LEFT JOIN ".$this->db->prefix().$tmpobject->table_element."_extrafields AS ef ON (ef.fk_object = t.rowid)"; // Modification VMR Global Solutions to include extrafields as search parameters in the API GET call, so we will be able to filter on extrafields
		}
		if (!empty($tmpobject->ismultientitymanaged) && (int) $tmpobject->ismultientitymanaged == 1) {
			$sql .= " WHERE t.entity IN (".getEntity($tmpobject->element).")";
		} elseif (preg_match('/^\w+@\w+$/', (string) $tmpobject->ismultientitymanaged)) {
			$tmparray = explode('@', (string) $tmpobject->ismultientitymanaged);
			$sql .= " LEFT JOIN ".$this->db->prefix().$tmparray[1]." as pt ON t.".$tmparray[0]." = pt.rowid";
			$sql .= " WHERE pt.entity IN (".getEntity($tmpobject->element).")";
		} else {
			$sql .= " WHERE 1 = 1";
		}
		if ($restrictonsocid && $socid) {
			$sql .= " AND t.fk_soc = ".((int) $socid);
		}
		// Search on sale representative
		if ($search_sale && $search_sale != '-1') {
			if ($search_sale == -2) {
				$sql .= " AND NOT EXISTS (SELECT sc.fk_soc FROM ".$this->db->prefix()."societe_commerciaux as sc WHERE sc.fk_soc = t.fk_soc)";
			} elseif ($search_sale > 0) {
				$sql .= " AND EXISTS (SELECT sc.fk_soc FROM ".$this->db->prefix()."societe_commerciaux as sc WHERE sc.fk_soc = t.fk_soc AND sc.fk_user = ".((int) $search_sale).")";
			}
		}
		// Add where from hooks and sqlfilters
		$parameters = array('sqlfilters' => $sqlfilters, 'apiroute' => 'timeentry', 'apimethod' => __METHOD__);
		$action = 'list';
		$reshook = $hookmanager->executeHooks('printFieldListWhere', $parameters, $tmpobject, $action); // Note that $action and $object may have been modified by hook
		if ($reshook > 0) {
			$sql = $hookmanager->resPrint;
		} elseif ($reshook == 0) {
			$sql .= $hookmanager->resPrint;
		}

		if ($sqlfilters) {
			$errormessage = '';
			$sql .= forgeSQLFromUniversalSearchCriteria($sqlfilters, $errormessage);
			if ($errormessage) {
				throw new RestException(400, 'Error when validating parameter sqlfilters -> '.$errormessage);
			}
		}

		$sql .= $this->db->order($sortfield, $sortorder);
		if ($limit) {
			if ($page < 0) {
				$page = 0;
			}
			$offset = $limit * $page;

			$sql .= $this->db->plimit($limit + 1, $offset);
		}

		$result = $this->db->query($sql);
		$i = 0;
		if ($result) {
			$num = $this->db->num_rows($result);
			$min = min($num, ($limit <= 0 ? $num : $limit));
			while ($i < $min) {
				$obj = $this->db->fetch_object($result);
				$tmp_object = new TimeEntry($this->db);
				if ($tmp_object->fetch($obj->rowid)) {
					$obj_ret[] = $this->_filterObjectProperties($this->_cleanObjectDatas($tmp_object), $properties);
				}
				$i++;
			}
		} else {
			throw new RestException(503, 'Error when retrieving timeentry list: '.$this->db->lasterror());
		}

		return $obj_ret;
	}

	/**
	 * Create timeentry object
	 *
	 * @param array $request_data   Request data
	 * @phan-param ?array<string,mixed> $request_data
	 * @phpstan-param ?array<string,mixed> $request_data
	 * @return int  				ID of timeentry
	 *
	 * @throws RestException 403 Not allowed
	 * @throws RestException 500 System error
	 *
	 * @url	POST timeentrys/
	 */
	public function post($request_data = null)
	{
		if (!DolibarrApiAccess::$user->hasRight('clockify', 'timeentry', 'write')) {
			throw new RestException(403);
		}

		// Check mandatory fields
		$result = $this->_validateTimeEntry($request_data);

		foreach ($request_data as $field => $value) {
			if ($field === 'caller') {
				// Add a mention of caller so on trigger called after action, we can filter to avoid a loop if we try to sync back again with the caller @phan-suppress-next-line PhanTypeInvalidDimOffset
				$this->timeentry->context['caller'] = sanitizeVal((string) $request_data['caller'], 'aZ09');
				continue;
			}

			if ($field == 'array_options' && is_array($value)) {
				foreach ($value as $index => $val) {
					$this->timeentry->array_options[$index] = $this->_checkValForAPI('extrafields', $val, $this->timeentry);
				}
				continue;
			}

			$this->timeentry->$field = $this->_checkValForAPI((string) $field, $value, $this->timeentry);
		}

		// Clean data
		// $this->timeentry->abc = sanitizeVal($this->timeentry->abc, 'alphanohtml');

		if ($this->timeentry->create(DolibarrApiAccess::$user) < 0) {
			throw new RestException(500, "Error creating TimeEntry", array_merge(array($this->timeentry->error), $this->timeentry->errors));
		}
		return $this->timeentry->id;
	}

	/**
	 * Update timeentry
	 *
	 * @param 	int   		$id             Id of timeentry to update
	 * @param 	array 		$request_data   Data
	 * @phan-param ?array<string,mixed>	$request_data
	 * @phpstan-param ?array<string,mixed>	$request_data
	 * @return 	Object						Object after update
	 * @phan-return TimeEntry
	 * @phpstan-return TimeEntry
	 *
	 * @throws RestException 403 Not allowed
	 * @throws RestException 404 Not found
	 * @throws RestException 500 System error
	 *
	 * @url	PUT timeentrys/{id}
	 */
	public function put($id, $request_data = null)
	{
		if (!DolibarrApiAccess::$user->hasRight('clockify', 'timeentry', 'write')) {
			throw new RestException(403);
		}
		if (!DolibarrApi::_checkAccessToResource('timeentry', $id, 'clockify_timeentry')) {
			throw new RestException(403, 'Access to instance id='.$this->timeentry->id.' of object not allowed for login '.DolibarrApiAccess::$user->login);
		}

		$result = $this->timeentry->fetch($id);
		if (!$result) {
			throw new RestException(404, 'TimeEntry not found');
		}

		foreach ($request_data as $field => $value) {
			if ($field == 'id') {
				continue;
			}
			if ($field === 'caller') {
				// Add a mention of caller so on trigger called after action, we can filter to avoid a loop if we try to sync back again with the caller
				$this->timeentry->context['caller'] = sanitizeVal($request_data['caller'], 'aZ09');
				continue;
			}

			if ($field == 'array_options' && is_array($value)) {
				foreach ($value as $index => $val) {
					$this->timeentry->array_options[$index] = $this->_checkValForAPI('extrafields', $val, $this->timeentry);
				}
				continue;
			}

			if ($field == 'array_options' && is_array($value)) {
				foreach ($value as $index => $val) {
					$this->timeentry->array_options[$index] = $this->_checkValForAPI($field, $val, $this->timeentry);
				}
				continue;
			}

			$this->timeentry->$field = $this->_checkValForAPI($field, $value, $this->timeentry);
		}

		// Clean data
		// $this->timeentry->abc = sanitizeVal($this->timeentry->abc, 'alphanohtml');

		if ($this->timeentry->update(DolibarrApiAccess::$user, 0) > 0) {
			return $this->get($id);
		} else {
			throw new RestException(500, $this->timeentry->error);
		}
	}

	/**
	 * Delete timeentry
	 *
	 * @param   int     $id   TimeEntry ID
	 * @return  array
	 * @phan-return array<string,array{code:int,message:string}>
	 * @phpstan-return array<string,array{code:int,message:string}>
	 *
	 * @throws RestException 403 Not allowed
	 * @throws RestException 404 Not found
	 * @throws RestException 409 Nothing to do
	 * @throws RestException 500 System error
	 *
	 * @url	DELETE timeentrys/{id}
	 */
	public function delete($id)
	{
		if (!DolibarrApiAccess::$user->hasRight('clockify', 'timeentry', 'delete')) {
			throw new RestException(403);
		}
		if (!DolibarrApi::_checkAccessToResource('timeentry', $id, 'clockify_timeentry')) {
			throw new RestException(403, 'Access to instance id='.$this->timeentry->id.' of object not allowed for login '.DolibarrApiAccess::$user->login);
		}

		$result = $this->timeentry->fetch($id);
		if (!$result) {
			throw new RestException(404, 'TimeEntry not found');
		}

		if ($this->timeentry->delete(DolibarrApiAccess::$user) == 0) {
			throw new RestException(409, 'Error when deleting TimeEntry : '.$this->timeentry->error);
		} elseif ($this->timeentry->delete(DolibarrApiAccess::$user) < 0) {
			throw new RestException(500, 'Error when deleting TimeEntry : '.$this->timeentry->error);
		}

		return array(
			'success' => array(
				'code' => 200,
				'message' => 'TimeEntry deleted'
			)
		);
	}


	/**
	 * Validate fields before creating or updating object
	 *
	 * @param	array		$data   Array of data to validate
	 * @phan-param		?array<string,null|int|float|string> $data
	 * @phpstan-param	?array<string,null|int|float|string> $data
	 * @return	array
	 * @phan-return		array<string,null|int|float|string>|array{}
	 * @phpstan-return	array<string,null|int|float|string>|array{}
	 *
	 * @throws	RestException
	 */
	private function _validateTimeEntry($data)
	{
		if (!is_array($data)) {
			$data = array();
		}
		$timeentry = array();
		foreach ($this->timeentry->fields as $field => $propfield) {
			if (in_array($field, array('rowid', 'entity', 'date_creation', 'tms', 'fk_user_creat')) || $propfield['notnull'] != 1) {
				continue; // Not a mandatory field
			}
			if (!isset($data[$field])) {
				throw new RestException(400, "$field field missing");
			}
			$timeentry[$field] = $data[$field];
		}
		return $timeentry;
	}

	/* END MODULEBUILDER API TIMEENTRY */


	/* BEGIN MODULEBUILDER API MYOBJECT */
	/* END MODULEBUILDER API MYOBJECT */



	// phpcs:disable PEAR.NamingConventions.ValidFunctionName.PublicUnderscore
	/**
	 * Clean sensitive object data fields
	 * @phpstan-template T
	 *
	 * @param   Object  $object     Object to clean
	 * @return  Object              Object with cleaned properties
	 *
	 * @phpstan-param T $object
	 * @phpstan-return T
	 */
	protected function _cleanObjectDatas($object)
	{
		// phpcs:enable
		$object = parent::_cleanObjectDatas($object);

		unset($object->rowid);
		unset($object->canvas);

		// If object has lines, remove $db property
		if (isset($object->lines) && is_array($object->lines) && count($object->lines) > 0) {
			$nboflines = count($object->lines);
			for ($i = 0; $i < $nboflines; $i++) {
				$this->_cleanObjectDatas($object->lines[$i]);

				unset($object->lines[$i]->lines);
				unset($object->lines[$i]->note);
			}
		}

		return $object;
	}
}
