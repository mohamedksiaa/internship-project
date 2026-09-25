<?php
/* Copyright (C) 2026 SuperAdmin
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * \file    class/timeflowlatecheck.class.php
 * \ingroup timeflow
 * \brief   Morning late-arrival detection (a Dolibarr cron job).
 */

dol_include_once('/timeflow/lib/timeflow.lib.php');

/**
 * Detects, once a day, the employees who had not started any timer by the
 * configured cut-off time, and hands the result to the managers.
 *
 * Dolibarr's cron has no "every day at 09:10": a job runs at a fixed interval
 * from its first run. So the job is registered every 5 minutes (like
 * closeStaleActiveTimersAtMidnight) and THIS class decides whether it is the
 * moment: it does nothing until the cut-off has passed, then does the day's
 * work exactly once (see claimDay()) and every later tick finds it done.
 *
 * The rule is deterministic: "late" means "no entry with date_start <= cut-off
 * today", so running at 09:14 or at 11:00 (after an outage) gives the same
 * answer. The one moment of truth is the cut-off; nobody is flagged for
 * starting later, and nobody is un-flagged for starting later.
 *
 * Every time is in the server's time zone, like the date_start values it is
 * compared with.
 */
class TimeFlowLateCheck
{
	const STATUS_RUNNING = 'running';
	const STATUS_DONE = 'done';
	const STATUS_SKIPPED_NO_ACTIVITY = 'skipped_no_activity';
	const STATUS_MISSED = 'missed';

	/** A 'running' claim older than this many seconds is considered abandoned (a crashed run) and taken over. */
	const STALE_CLAIM_SECONDS = 900;

	/** In-app notification type written by this job. */
	const NOTIF_TYPE = 'late_arrivals';

	/** Per-user preference (llx_user_param): '0' = "do not email me"; absent = emails on. */
	const PARAM_EMAIL = 'TIMEFLOW_LATE_ALERT_EMAIL';

	/** An email is attempted at most this many times per notification. */
	const EMAIL_MAX_ATTEMPTS = 3;

	/** A failed email is retried no sooner than this many seconds later (so one attempt per cron tick). */
	const EMAIL_RETRY_SECONDS = 240;

	/** An email left 'sending' longer than this (crashed mid-send) becomes eligible for another attempt. */
	const EMAIL_STALE_SENDING_SECONDS = 900;

	/** Notifications older than this many days are purged. */
	const NOTIF_RETENTION_DAYS = 90;

	/** @var DoliDB */
	public $db;

	/** @var int Entity the job runs for; Dolibarr's cron sets it. */
	public $entity;

	/** @var string Text shown as the job's "last output" in the cron list. */
	public $output = '';

	/** @var string */
	public $error = '';

	/** @var string[] */
	public $errors = array();

	/**
	 * @var array What the last run did, for tests and diagnostics:
	 * status, day, cutoff, expected/late/on_time user ids, manager ids, recipients.
	 */
	public $result = array();

	/**
	 * @param DoliDB $db
	 */
	public function __construct($db)
	{
		$this->db = $db;
	}

	/**
	 * The module's settings, validated: an invalid value falls back to its default.
	 *
	 * @return array{enabled:bool,threshold:string,grace:int,workdays:int[],max_delay_hours:int,active_window_days:int}
	 */
	public static function getSettings()
	{
		$threshold = trim(getDolGlobalString('TIMEFLOW_LATE_THRESHOLD_TIME', '09:00'));
		if (!preg_match('/^([01]?\d|2[0-3]):([0-5]\d)$/', $threshold)) {
			dol_syslog('TimeFlow late check: invalid TIMEFLOW_LATE_THRESHOLD_TIME "'.$threshold.'", using 09:00', LOG_WARNING);
			$threshold = '09:00';
		}

		$workdays = array();
		foreach (explode(',', getDolGlobalString('TIMEFLOW_LATE_WORKDAYS', '1,2,3,4,5')) as $day) {
			$day = (int) trim($day);
			if ($day >= 1 && $day <= 7) {
				$workdays[$day] = $day;
			}
		}
		if (empty($workdays)) {
			// Nothing selected would silently switch the feature off: use Monday to Friday.
			$workdays = array(1 => 1, 2 => 2, 3 => 3, 4 => 4, 5 => 5);
		}

		return array(
			'enabled' => getDolGlobalInt('TIMEFLOW_LATE_ALERT_ENABLED', 0) > 0,
			'threshold' => $threshold,
			'grace' => max(0, min(120, getDolGlobalInt('TIMEFLOW_LATE_GRACE_MINUTES', 10))),
			'workdays' => array_values($workdays),
			'max_delay_hours' => max(1, min(12, getDolGlobalInt('TIMEFLOW_LATE_MAX_DELAY_HOURS', 3))),
			'active_window_days' => max(1, min(365, getDolGlobalInt('TIMEFLOW_LATE_ACTIVE_WINDOW_DAYS', 30))),
		);
	}

	/**
	 * The cut-off of the day of $now: threshold + grace, in server time.
	 *
	 * @param int   $now      Unix timestamp.
	 * @param array $settings From getSettings().
	 * @return int Unix timestamp.
	 */
	public static function cutoffTimestamp($now, array $settings)
	{
		list($hour, $minute) = array_map('intval', explode(':', $settings['threshold']));
		$threshold = mktime($hour, $minute, 0, (int) date('n', $now), (int) date('j', $now), (int) date('Y', $now));

		return $threshold + ((int) $settings['grace']) * 60;
	}

	/**
	 * Cron entry point (jobtype 'method'; called with no argument in production).
	 *
	 * @param string   $param Unused; kept for Dolibarr's cron 'method' call signature.
	 * @param int|null $now   Unix timestamp to treat as "now"; defaults to dol_now().
	 *                        Exposed so tests can run the job on a chosen date and time.
	 * @return int 0 on success (including "nothing to do"), -1 on a technical error, matching Dolibarr's cron convention.
	 */
	public function runMorningLateCheck($param = '', $now = null)
	{
		global $conf;

		$now = $now !== null ? (int) $now : dol_now();
		$entity = !empty($this->entity) ? (int) $this->entity : (int) $conf->entity;
		$this->output = '';
		$this->error = '';
		$this->errors = array();
		$this->result = array('status' => null, 'entity' => $entity);

		$settings = self::getSettings();
		if (!$settings['enabled']) {
			return $this->finishWithoutWork('disabled', 'Late-arrival alerts are disabled (TIMEFLOW_LATE_ALERT_ENABLED).');
		}

		$day = date('Y-m-d', $now);
		$this->result['day'] = $day;
		if (!in_array((int) date('N', $now), $settings['workdays'], true)) {
			return $this->finishWithoutWork('not_workday', $day.' is not a working day.');
		}

		$cutoff = self::cutoffTimestamp($now, $settings);
		$this->result['cutoff'] = $cutoff;
		if ($now < $cutoff) {
			return $this->finishWithoutWork('too_early', 'Too early: the cut-off is '.date('H:i', $cutoff).'.');
		}

		if (!$this->tablesAvailable()) {
			$this->error = 'Table '.$this->db->prefix().'timeflow_late_check is missing: disable then re-enable the TimeFlow module.';
			$this->output = $this->error;
			$this->result['status'] = 'error';

			return -1;
		}

		try {
			return $this->runForDay($entity, $day, $now, $cutoff, $settings);
		} catch (TimeflowSqlException $e) {
			// The claim stays 'running': a later tick takes it over once it is stale.
			$this->error = 'SQL error ('.$e->getMessage().'): '.(string) ($e->dbError ?? '');
			$this->errors[] = $this->error;
			$this->output = $this->error;
			$this->result['status'] = 'error';
			dol_syslog('TimeFlow late check failed: '.$this->error, LOG_ERR);

			return -1;
		}
	}

	/**
	 * @param string $status
	 * @param string $message
	 * @return int 0
	 */
	private function finishWithoutWork($status, $message)
	{
		$this->result['status'] = $status;
		$this->output = $message;

		return 0;
	}

	/**
	 * The part of a tick that happens once the cut-off has passed on a working day.
	 *
	 * @return int
	 */
	private function runForDay($entity, $day, $now, $cutoff, array $settings)
	{
		$existing = $this->getMarker($entity, $day);
		if ($existing && $existing['status'] !== self::STATUS_RUNNING) {
			$note = '';
			if ($existing['status'] === self::STATUS_DONE) {
				// The detection is never redone, but an email that failed earlier is retried.
				$retry = $this->sendPendingEmails($entity, $day, $now);
				if ($retry['attempted'] > 0) {
					$this->updateEmailCount($existing['rowid'], $this->countEmailsSent($entity, $day));
					$note = ' '.$retry['attempted'].' pending email(s) retried, '.$retry['sent'].' sent.';
				}
				$this->result['retried_emails'] = $retry;
			}

			return $this->finishWithoutWork('already_processed', $day.' already processed ('.$existing['status'].').'.$note);
		}
		if ($existing && strtotime($existing['date_run']) > $now - self::STALE_CLAIM_SECONDS) {
			return $this->finishWithoutWork('in_progress', $day.' is being processed by another run.');
		}

		if (!$existing && $now > $cutoff + $settings['max_delay_hours'] * 3600) {
			// First run of the day long after the cut-off (outage): a "you are late"
			// alert hours later would be noise, so the day is recorded and skipped.
			$this->claimDay($entity, $day, $now, $cutoff, self::STATUS_MISSED);

			return $this->finishWithoutWork(self::STATUS_MISSED, $day.': first run more than '.$settings['max_delay_hours'].'h after the cut-off, no alert.');
		}

		if ($existing) {
			// A claim left 'running' by a run that died: take it over, atomically.
			if (!$this->takeOverClaim($existing, $now)) {
				return $this->finishWithoutWork('in_progress', $day.' was taken over by another run.');
			}
			$markerId = (int) $existing['rowid'];
		} else {
			$markerId = $this->claimDay($entity, $day, $now, $cutoff, self::STATUS_RUNNING);
			if ($markerId === 0) {
				return $this->finishWithoutWork('in_progress', $day.' was claimed by another run.');
			}
		}

		$detection = $this->detect($entity, $day, $now, $cutoff, $settings);
		$this->result = array_merge($this->result, $detection);

		if ($detection['skipped'] !== null) {
			$this->closeDay($markerId, self::STATUS_SKIPPED_NO_ACTIVITY, $now, $detection, 0, 0);

			return $this->finishWithoutWork(self::STATUS_SKIPPED_NO_ACTIVITY, $day.': nobody expected started a timer before '.date('H:i', $cutoff).' — treated as a non-working day, no alert.');
		}

		$delivery = $this->deliver($entity, $day, $now, $detection, $settings);
		$this->result = array_merge($this->result, $delivery);

		$this->closeDay($markerId, self::STATUS_DONE, $now, $detection, $delivery['recipients'], $delivery['emails']);
		$this->result['status'] = self::STATUS_DONE;
		$this->output = $day.': '.count($detection['expected']).' expected, '.count($detection['late']).' late, '
			.$delivery['recipients'].' manager(s) notified, '.$delivery['emails'].' email(s) sent'
			.($delivery['emails_skipped'] > 0 ? ', '.$delivery['emails_skipped'].' skipped' : '')
			.($delivery['emails_failed'] > 0 ? ', '.$delivery['emails_failed'].' failed' : '').'.';

		return 0;
	}

	/**
	 * Who is late on $day at the cut-off.
	 *
	 * Expected = active accounts that started at least one timer in the last
	 * N days (so a dormant or ex-employee account is not "late" every morning),
	 * minus those with an expected absence that day and, when Dolibarr's Holiday
	 * module is on, those on an approved leave. Late = expected and with no entry
	 * started between midnight and the cut-off.
	 *
	 * @return array{expected:int[],on_time:int[],late:int[],skipped:?string}
	 */
	public function detect($entity, $day, $now, $cutoff, array $settings)
	{
		$dayStart = mktime(0, 0, 0, (int) date('n', $now), (int) date('j', $now), (int) date('Y', $now));
		$windowStart = mktime(0, 0, 0, (int) date('n', $now), (int) date('j', $now) - $settings['active_window_days'], (int) date('Y', $now));
		$cutoffStr = date('Y-m-d H:i:s', $cutoff);

		$recentlyActive = array_keys(timeflowUserIdsWithEntryStartedBetween($this->db, date('Y-m-d H:i:s', $windowStart), $cutoffStr, true, null, $entity));
		$activeAccounts = $this->filterActiveAccounts($recentlyActive, $entity);

		$excluded = timeflowExpectedAbsenceUserIdsForDate($this->db, $day, $entity) + $this->fetchUserIdsOnApprovedLeave($day, $entity);
		$expected = array();
		foreach ($activeAccounts as $userId) {
			if (!isset($excluded[$userId])) {
				$expected[] = $userId;
			}
		}
		sort($expected);

		$onTimeSet = timeflowUserIdsWithEntryStartedBetween($this->db, date('Y-m-d H:i:s', $dayStart), $cutoffStr, true, $expected, $entity);
		$onTime = array();
		$late = array();
		foreach ($expected as $userId) {
			if (isset($onTimeSet[$userId])) {
				$onTime[] = $userId;
			} else {
				$late[] = $userId;
			}
		}

		// Nobody at all started: a public holiday or a closure, not a team of late people.
		$skipped = (count($expected) >= 2 && count($onTime) === 0) ? self::STATUS_SKIPPED_NO_ACTIVITY : null;

		return array('expected' => $expected, 'on_time' => $onTime, 'late' => $late, 'skipped' => $skipped);
	}

	/**
	 * Tells the managers. For each manager who has at least one OTHER late
	 * person to hear about (a late manager is not told about themselves) one
	 * in-app notification (a digest of the day) is inserted, then the emails
	 * are sent to those who want them.
	 *
	 * The notification row is inserted BEFORE any email: its unique key
	 * (entity, manager, type, day) is what makes a second run, or a run resumed
	 * after a crash, unable to alert twice.
	 *
	 * @return array{recipients:int,emails:int,emails_skipped:int,emails_failed:int,notifications:int,manager_ids:int[],recipient_ids:int[]}
	 */
	protected function deliver($entity, $day, $now, array $detection, array $settings)
	{
		$managerIds = array();
		$recipientIds = array();
		$created = 0;

		if (!empty($detection['late'])) {
			$labels = $this->fetchUserLabels($detection['late']);
			$cutoffTime = date('H:i', self::cutoffTimestamp($now, $settings));
			foreach ($this->findManagers($entity) as $manager) {
				$managerIds[] = (int) $manager->id;
				$others = array_values(array_diff($detection['late'], array((int) $manager->id)));
				if (empty($others)) {
					continue;
				}
				$recipientIds[] = (int) $manager->id;

				$late = array();
				foreach ($others as $userId) {
					$late[] = array('id' => $userId, 'label' => isset($labels[$userId]) ? $labels[$userId] : ('#'.$userId));
				}
				$payload = json_encode(array(
					'day' => $day,
					'threshold' => $settings['threshold'],
					'grace' => $settings['grace'],
					'cutoff' => $cutoffTime,
					'late' => $late,
				), JSON_UNESCAPED_UNICODE);
				if ($this->insertNotification($entity, (int) $manager->id, $day, $payload, $now)) {
					$created++;
				}
			}
		}
		$this->purgeOldNotifications($entity, $now);

		// Sends what is pending for the day: this run's new notifications and, when
		// this run resumes a crashed one, whatever the crashed run had not sent yet.
		$mail = $this->sendPendingEmails($entity, $day, $now);

		return array(
			'recipients' => count($recipientIds),
			'emails' => $this->countEmailsSent($entity, $day),
			'emails_skipped' => $mail['skipped'],
			'emails_failed' => $mail['failed'],
			'notifications' => $created,
			'manager_ids' => $managerIds,
			'recipient_ids' => $recipientIds,
		);
	}

	/**
	 * @return bool True when inserted, false when the manager already has this day's digest.
	 */
	private function insertNotification($entity, $userId, $day, $payload, $now)
	{
		$sql = 'INSERT INTO '.$this->db->prefix().'timeflow_notification (entity, fk_user, notif_type, date_ref, payload, date_creation)';
		$sql .= ' VALUES ('.((int) $entity).', '.((int) $userId).", '".$this->db->escape(self::NOTIF_TYPE)."', '".$this->db->escape($day)."', '".$this->db->escape($payload)."', '".date('Y-m-d H:i:s', $now)."')";
		if ($this->db->query($sql)) {
			return true;
		}
		if ($this->db->lasterrno() === 'DB_ERROR_RECORD_ALREADY_EXISTS') {
			return false;
		}
		$exception = new TimeflowSqlException('TimeFlowLateCheck::insertNotification');
		$exception->dbError = (string) $this->db->lasterror();
		throw $exception;
	}

	/**
	 * @return void
	 */
	private function purgeOldNotifications($entity, $now)
	{
		$limit = date('Y-m-d', $now - self::NOTIF_RETENTION_DAYS * 86400);
		$sql = 'DELETE FROM '.$this->db->prefix().'timeflow_notification WHERE entity = '.((int) $entity)." AND date_ref < '".$this->db->escape($limit)."'";
		timeflowQuery($this->db, $sql, 'TimeFlowLateCheck::purgeOldNotifications');
	}

	/**
	 * @param int[] $userIds
	 * @return array<int,string> Display names, "Firstname Lastname" (login when both are empty).
	 */
	private function fetchUserLabels(array $userIds)
	{
		$labels = array();
		if (empty($userIds)) {
			return $labels;
		}
		$sql = 'SELECT rowid, firstname, lastname, login FROM '.$this->db->prefix().'user WHERE rowid IN ('.implode(',', array_map('intval', $userIds)).')';
		$resql = timeflowQuery($this->db, $sql, 'TimeFlowLateCheck::fetchUserLabels');
		while ($obj = $this->db->fetch_object($resql)) {
			$name = trim(trim((string) $obj->firstname).' '.trim((string) $obj->lastname));
			$labels[(int) $obj->rowid] = $name !== '' ? $name : (string) $obj->login;
		}
		$this->db->free($resql);

		return $labels;
	}

	/**
	 * @return int How many of the day's notifications had their email sent.
	 */
	private function countEmailsSent($entity, $day)
	{
		$sql = 'SELECT COUNT(*) AS nb FROM '.$this->db->prefix().'timeflow_notification WHERE entity = '.((int) $entity);
		$sql .= " AND notif_type = '".$this->db->escape(self::NOTIF_TYPE)."' AND date_ref = '".$this->db->escape($day)."' AND email_status = 'sent'";
		$resql = timeflowQuery($this->db, $sql, 'TimeFlowLateCheck::countEmailsSent');
		$obj = $this->db->fetch_object($resql);
		$this->db->free($resql);

		return $obj ? (int) $obj->nb : 0;
	}

	/**
	 * @return void
	 */
	private function updateEmailCount($markerId, $count)
	{
		timeflowQuery($this->db, 'UPDATE '.$this->db->prefix().'timeflow_late_check SET nb_emails = '.((int) $count).' WHERE rowid = '.((int) $markerId), 'TimeFlowLateCheck::updateEmailCount');
	}

	/**
	 * Whether a user wants the late-arrival emails: yes, unless their preference
	 * is exactly '0'. Only the refusal is stored, so nobody needs a row to be on.
	 *
	 * @param DoliDB $db
	 * @param int    $userId
	 * @param int    $entity
	 * @return bool
	 */
	public static function getEmailPreference($db, $userId, $entity)
	{
		$sql = 'SELECT value FROM '.$db->prefix().'user_param WHERE fk_user = '.((int) $userId).' AND entity = '.((int) $entity)." AND param = '".$db->escape(self::PARAM_EMAIL)."'";
		$resql = timeflowQuery($db, $sql, 'TimeFlowLateCheck::getEmailPreference');
		$obj = $db->fetch_object($resql);
		$db->free($resql);

		return !($obj && (string) $obj->value === '0');
	}

	/**
	 * Stores the preference: on = no row, off = a row with '0'.
	 *
	 * Written with plain SQL on purpose. Dolibarr's own dol_set_user_param() tests
	 * "if ($value)" before inserting, and '0' is false in PHP: through it the
	 * refusal would silently never be stored (checked on 19.0.2, where its
	 * "forcevalue" form does not exist either and stores the text "Array").
	 *
	 * @param DoliDB $db
	 * @param int    $userId
	 * @param int    $entity
	 * @param bool   $enabled
	 * @return void
	 */
	public static function setEmailPreference($db, $userId, $entity, $enabled)
	{
		$prefix = $db->prefix();
		$where = ' WHERE fk_user = '.((int) $userId).' AND entity = '.((int) $entity)." AND param = '".$db->escape(self::PARAM_EMAIL)."'";
		$db->begin();
		try {
			timeflowQuery($db, 'DELETE FROM '.$prefix.'user_param'.$where, 'TimeFlowLateCheck::setEmailPreference:delete');
			if (!$enabled) {
				timeflowQuery($db, 'INSERT INTO '.$prefix.'user_param (fk_user, entity, param, value) VALUES ('.((int) $userId).', '.((int) $entity).", '".$db->escape(self::PARAM_EMAIL)."', '0')", 'TimeFlowLateCheck::setEmailPreference:insert');
			}
			$db->commit();
		} catch (TimeflowSqlException $e) {
			$db->rollback();
			throw $e;
		}
	}

	/**
	 * Managers who opted out of the emails (preference '0' in llx_user_param).
	 *
	 * @return array<int,bool>
	 */
	private function fetchEmailOptOut($entity)
	{
		$set = array();
		$sql = 'SELECT fk_user FROM '.$this->db->prefix().'user_param WHERE entity = '.((int) $entity)." AND param = '".$this->db->escape(self::PARAM_EMAIL)."' AND value = '0'";
		$resql = timeflowQuery($this->db, $sql, 'TimeFlowLateCheck::fetchEmailOptOut');
		while ($obj = $this->db->fetch_object($resql)) {
			$set[(int) $obj->fk_user] = true;
		}
		$this->db->free($resql);

		return $set;
	}

	/**
	 * Decides and sends the emails of the day's notifications that are not
	 * settled yet. A notification is settled when its email was sent, or when it
	 * will never be sent: the manager opted out ('skipped_pref'), has no valid
	 * address ('skipped_no_address') or mail sending is off on this instance
	 * ('skipped_disabled'). A failure is retried (one attempt per cron tick,
	 * EMAIL_MAX_ATTEMPTS in all).
	 *
	 * Each email is CLAIMED by an UPDATE that only matches while it is still
	 * pending, so two processes can never both send the same one.
	 *
	 * @return array{attempted:int,sent:int,failed:int,skipped:int}
	 */
	protected function sendPendingEmails($entity, $day, $now)
	{
		$out = array('attempted' => 0, 'sent' => 0, 'failed' => 0, 'skipped' => 0);
		$prefix = $this->db->prefix();

		$sql = 'SELECT n.rowid, n.fk_user, n.payload, n.email_attempts, n.email_status, n.email_date, u.email, u.lang FROM '.$prefix.'timeflow_notification AS n';
		$sql .= ' INNER JOIN '.$prefix.'user AS u ON u.rowid = n.fk_user';
		$sql .= ' WHERE n.entity = '.((int) $entity)." AND n.notif_type = '".$this->db->escape(self::NOTIF_TYPE)."' AND n.date_ref = '".$this->db->escape($day)."'";
		$sql .= ' AND n.email_attempts < '.self::EMAIL_MAX_ATTEMPTS;
		$sql .= " AND (n.email_status IS NULL OR n.email_status = 'failed' OR n.email_status = 'sending')";
		$sql .= ' ORDER BY n.rowid';
		$resql = timeflowQuery($this->db, $sql, 'TimeFlowLateCheck::sendPendingEmails');
		$rows = array();
		while ($obj = $this->db->fetch_object($resql)) {
			$rows[] = $obj;
		}
		$this->db->free($resql);
		if (empty($rows)) {
			return $out;
		}

		$optOut = $this->fetchEmailOptOut($entity);
		foreach ($rows as $row) {
			$notificationId = (int) $row->rowid;
			$attempts = (int) $row->email_attempts;
			$status = $row->email_status;

			// Not yet due for another attempt (a failure earlier this same tick or minutes ago, or a send still in progress).
			if ($status === 'failed' && $row->email_date !== null && strtotime($row->email_date) > $now - self::EMAIL_RETRY_SECONDS) {
				continue;
			}
			if ($status === 'sending' && $row->email_date !== null && strtotime($row->email_date) > $now - self::EMAIL_STALE_SENDING_SECONDS) {
				continue;
			}

			$skip = null;
			if (getDolGlobalString('MAIN_DISABLE_ALL_MAILS')) {
				$skip = 'skipped_disabled';
			} elseif (isset($optOut[(int) $row->fk_user])) {
				$skip = 'skipped_pref';
			} elseif (empty($row->email) || !isValidEmail((string) $row->email)) {
				$skip = 'skipped_no_address';
			}
			if ($skip !== null) {
				$this->setEmailStatus($notificationId, $skip, $attempts, null, $now, $status);
				$out['skipped']++;
				continue;
			}

			// Claim: only one process gets to send this one.
			if (!$this->claimEmail($notificationId, $attempts, $status, $now)) {
				continue;
			}
			$out['attempted']++;

			$payload = json_decode((string) $row->payload, true);
			list($subject, $html) = $this->buildEmail((string) $row->lang, $day, is_array($payload) ? $payload : array());
			list($ok, $error) = $this->sendEmail((string) $row->email, $subject, $html, self::NOTIF_TYPE.'-'.str_replace('-', '', $day));
			if ($ok) {
				$this->setEmailStatus($notificationId, 'sent', $attempts + 1, null, $now, 'sending');
				$out['sent']++;
			} else {
				$this->setEmailStatus($notificationId, 'failed', $attempts + 1, $error, $now, 'sending');
				$this->errors[] = 'Email to user '.(int) $row->fk_user.' failed: '.$error;
				dol_syslog('TimeFlow late email failed for user '.(int) $row->fk_user.': '.$error, LOG_WARNING);
				$out['failed']++;
			}
		}

		return $out;
	}

	/**
	 * @return bool True when this process got the email.
	 */
	private function claimEmail($notificationId, $attempts, $status, $now)
	{
		$sql = 'UPDATE '.$this->db->prefix()."timeflow_notification SET email_status = 'sending', email_attempts = ".($attempts + 1).", email_date = '".date('Y-m-d H:i:s', $now)."'";
		$sql .= ' WHERE rowid = '.((int) $notificationId).' AND email_attempts = '.((int) $attempts);
		$sql .= $status === null ? ' AND email_status IS NULL' : " AND email_status = '".$this->db->escape($status)."'";
		$resql = timeflowQuery($this->db, $sql, 'TimeFlowLateCheck::claimEmail');

		return (int) $this->db->affected_rows($resql) === 1;
	}

	/**
	 * @return void
	 */
	private function setEmailStatus($notificationId, $status, $attempts, $error, $now, $expectedCurrent)
	{
		$sql = 'UPDATE '.$this->db->prefix()."timeflow_notification SET email_status = '".$this->db->escape($status)."', email_attempts = ".((int) $attempts);
		$sql .= ', email_error = '.($error === null ? 'NULL' : "'".$this->db->escape(dol_substr((string) $error, 0, 250, 'UTF-8', 1))."'");
		$sql .= ", email_date = '".date('Y-m-d H:i:s', $now)."' WHERE rowid = ".((int) $notificationId);
		timeflowQuery($this->db, $sql, 'TimeFlowLateCheck::setEmailStatus');
	}

	/**
	 * The subject and HTML body, in the manager's language (the module has
	 * fr, en, de and ar; anything else gets English).
	 *
	 * @param string $lang    users.lang, e.g. 'fr_FR'.
	 * @param string $day     'YYYY-MM-DD'.
	 * @param array  $payload The notification payload.
	 * @return array{0:string,1:string} [subject, html]
	 */
	protected function buildEmail($lang, $day, array $payload)
	{
		global $conf;

		$lang = self::supportedLang($lang);
		$outputlangs = new Translate('', $conf);
		$outputlangs->setDefaultLang($lang);
		$outputlangs->loadLangs(array('main', 'timeflow@timeflow'));

		$late = isset($payload['late']) && is_array($payload['late']) ? $payload['late'] : array();
		$dayLabel = dol_print_date(strtotime($day.' 12:00:00'), 'day', 'tzserver', $outputlangs);
		$cutoff = isset($payload['cutoff']) ? (string) $payload['cutoff'] : '';

		// The values go to the translation call itself: Translate applies its own sprintf()
		// (with empty arguments when none are given), so a %s left in the returned text
		// would already have been blanked.
		$subject = $outputlangs->transnoentitiesnoconv('TimeFlowLateMailSubject', count($late), $dayLabel);

		$items = '';
		foreach ($late as $person) {
			$items .= '<li>'.dol_escape_htmltag(isset($person['label']) ? (string) $person['label'] : '').'</li>';
		}
		$url = dol_buildpath('/timeflow/timeflowindex.php', 2).'#/reports?tab=users&presenceDate='.$day;

		$html = '<div'.($lang === 'ar_SA' ? ' dir="rtl"' : '').'>';
		$html .= '<p>'.dol_escape_htmltag($outputlangs->transnoentitiesnoconv('TimeFlowLateMailIntro', $cutoff, $dayLabel)).'</p>';
		$html .= '<ul>'.$items.'</ul>';
		$html .= '<p><a href="'.dol_escape_htmltag($url).'">'.dol_escape_htmltag($outputlangs->transnoentitiesnoconv('TimeFlowLateMailOpen')).'</a></p>';
		$html .= '<p style="color:#666;font-size:12px">'.dol_escape_htmltag($outputlangs->transnoentitiesnoconv('TimeFlowLateMailFooter')).'</p>';
		$html .= '</div>';

		return array($subject, $html);
	}

	/**
	 * @param string $lang users.lang
	 * @return string One of the module's languages.
	 */
	public static function supportedLang($lang)
	{
		$lang = (string) $lang;
		foreach (array('fr_FR', 'en_US', 'de_DE', 'ar_SA') as $supported) {
			if ($lang === $supported) {
				return $supported;
			}
		}
		$prefix = strtolower(substr($lang, 0, 2));
		foreach (array('fr' => 'fr_FR', 'de' => 'de_DE', 'ar' => 'ar_SA') as $p => $supported) {
			if ($prefix === $p) {
				return $supported;
			}
		}

		return 'en_US';
	}

	/**
	 * Sends one email through Dolibarr's CMailFile (which itself honours
	 * MAIN_DISABLE_ALL_MAILS and MAIN_MAIL_FORCE_SENDTO). A method of its own so
	 * a test can capture, or fail, the sending.
	 *
	 * @return array{0:bool,1:string} [sent, error]
	 */
	protected function sendEmail($to, $subject, $html, $trackid)
	{
		require_once DOL_DOCUMENT_ROOT.'/core/class/CMailFile.class.php';

		$from = getDolGlobalString('MAIN_MAIL_EMAIL_FROM');
		if ($from === '') {
			return array(false, 'No sender address (MAIN_MAIL_EMAIL_FROM is empty).');
		}
		$mail = new CMailFile($subject, $to, $from, $html, array(), array(), array(), '', '', 0, 1, '', '', $trackid);
		if (!empty($mail->error)) {
			return array(false, (string) $mail->error);
		}
		if (!$mail->sendfile()) {
			return array(false, (string) ($mail->error ?: 'Unknown error while sending.'));
		}

		return array(true, '');
	}

	/**
	 * Active accounts with the TimeFlow "readall" right: the managers to notify.
	 * A SQL pre-filter (administrator, or the right directly or through a group)
	 * followed by the module's own rule, timeflowCanReadAllTimeEntries(), which is
	 * what "manager" means everywhere else in TimeFlow.
	 *
	 * @return User[]
	 */
	public function findManagers($entity)
	{
		require_once DOL_DOCUMENT_ROOT.'/user/class/user.class.php';
		$prefix = $this->db->prefix();

		$rightIds = array();
		$sql = 'SELECT id FROM '.$prefix."rights_def WHERE module = 'timeflow' AND perms = 'timeentry' AND subperms = 'readall' AND entity = ".((int) $entity);
		$resql = timeflowQuery($this->db, $sql, 'TimeFlowLateCheck::findManagers:right');
		while ($obj = $this->db->fetch_object($resql)) {
			$rightIds[] = (int) $obj->id;
		}
		$this->db->free($resql);
		$rightList = !empty($rightIds) ? implode(',', $rightIds) : '0';

		$sql = 'SELECT u.rowid FROM '.$prefix.'user AS u WHERE u.statut = 1 AND u.entity IN (0, '.((int) $entity).')';
		$sql .= ' AND (u.admin = 1';
		$sql .= ' OR u.rowid IN (SELECT ur.fk_user FROM '.$prefix.'user_rights AS ur WHERE ur.fk_id IN ('.$rightList.') AND ur.entity = '.((int) $entity).')';
		$sql .= ' OR u.rowid IN (SELECT ugu.fk_user FROM '.$prefix.'usergroup_user AS ugu INNER JOIN '.$prefix.'usergroup_rights AS ugr ON ugr.fk_usergroup = ugu.fk_usergroup WHERE ugr.fk_id IN ('.$rightList.') AND ugr.entity = '.((int) $entity).'))';
		$sql .= ' ORDER BY u.rowid';
		$resql = timeflowQuery($this->db, $sql, 'TimeFlowLateCheck::findManagers:candidates');
		$candidateIds = array();
		while ($obj = $this->db->fetch_object($resql)) {
			$candidateIds[] = (int) $obj->rowid;
		}
		$this->db->free($resql);

		$managers = array();
		foreach ($candidateIds as $userId) {
			$candidate = new User($this->db);
			if ($candidate->fetch($userId) <= 0) {
				continue;
			}
			if (method_exists($candidate, 'loadRights')) {
				$candidate->loadRights();
			} else {
				$candidate->getrights();
			}
			if (timeflowCanReadAllTimeEntries($candidate)) {
				$managers[] = $candidate;
			}
		}

		return $managers;
	}

	/**
	 * Keeps the ids of enabled accounts of the entity.
	 *
	 * @param int[] $userIds
	 * @return int[]
	 */
	private function filterActiveAccounts(array $userIds, $entity)
	{
		if (empty($userIds)) {
			return array();
		}
		$sql = 'SELECT u.rowid FROM '.$this->db->prefix().'user AS u WHERE u.statut = 1 AND u.entity IN (0, '.((int) $entity).')';
		$sql .= ' AND u.rowid IN ('.implode(',', array_map('intval', $userIds)).')';
		$resql = timeflowQuery($this->db, $sql, 'TimeFlowLateCheck::filterActiveAccounts');
		$active = array();
		while ($obj = $this->db->fetch_object($resql)) {
			$active[] = (int) $obj->rowid;
		}
		$this->db->free($resql);

		return $active;
	}

	/**
	 * Whether Dolibarr's native Holiday module is on. A method of its own so a
	 * test can force it without enabling the module on the instance.
	 *
	 * @return bool
	 */
	protected function isHolidayModuleEnabled()
	{
		return isModEnabled('holiday');
	}

	/**
	 * Users on an approved leave that covers the MORNING of $day, as a set.
	 * A leave that starts in the afternoon of its first day (halfday -1 or 2)
	 * does not cover that morning. Empty when the Holiday module is off.
	 *
	 * @return array<int,bool>
	 */
	private function fetchUserIdsOnApprovedLeave($day, $entity)
	{
		$set = array();
		if (!$this->isHolidayModuleEnabled()) {
			return $set;
		}
		$sql = 'SELECT h.fk_user, h.date_debut, h.halfday FROM '.$this->db->prefix().'holiday AS h';
		$sql .= ' WHERE h.statut = 3 AND h.entity = '.((int) $entity);
		$sql .= " AND h.date_debut <= '".$this->db->escape($day)."' AND h.date_fin >= '".$this->db->escape($day)."'";
		$resql = timeflowQuery($this->db, $sql, 'TimeFlowLateCheck::fetchUserIdsOnApprovedLeave');
		while ($obj = $this->db->fetch_object($resql)) {
			$startsInAfternoon = in_array((int) $obj->halfday, array(-1, 2), true);
			$firstDay = (substr((string) $obj->date_debut, 0, 10) === $day);
			if ($firstDay && $startsInAfternoon) {
				continue;
			}
			$set[(int) $obj->fk_user] = true;
		}
		$this->db->free($resql);

		return $set;
	}

	/**
	 * @return bool Whether the day-lock table exists (it is created when the module is activated).
	 */
	private function tablesAvailable()
	{
		$tableName = $this->db->escape($this->db->prefix().'timeflow_late_check');
		$res = $this->db->query("SELECT 1 FROM information_schema.tables WHERE table_name = '".$tableName."' LIMIT 1");

		return (bool) ($res && $this->db->num_rows($res) > 0);
	}

	/**
	 * @return array|null The day's row (rowid, status, date_run) or null.
	 */
	private function getMarker($entity, $day)
	{
		$sql = 'SELECT rowid, status, date_run FROM '.$this->db->prefix().'timeflow_late_check';
		$sql .= ' WHERE entity = '.((int) $entity)." AND date_check = '".$this->db->escape($day)."'";
		$resql = timeflowQuery($this->db, $sql, 'TimeFlowLateCheck::getMarker');
		$obj = $this->db->fetch_object($resql);
		$this->db->free($resql);

		return $obj ? array('rowid' => (int) $obj->rowid, 'status' => (string) $obj->status, 'date_run' => (string) $obj->date_run) : null;
	}

	/**
	 * Claims the day by inserting its row FIRST. The unique (entity, day) key
	 * makes this atomic: of two runs racing for the same day only one insert
	 * succeeds.
	 *
	 * @return int The new row id, or 0 when the day was already claimed.
	 */
	private function claimDay($entity, $day, $now, $cutoff, $status)
	{
		$sql = 'INSERT INTO '.$this->db->prefix().'timeflow_late_check (entity, date_check, cutoff, status, date_run)';
		$sql .= ' VALUES ('.((int) $entity).", '".$this->db->escape($day)."', '".date('Y-m-d H:i:s', $cutoff)."', '".$this->db->escape($status)."', '".date('Y-m-d H:i:s', $now)."')";
		if ($this->db->query($sql)) {
			return (int) $this->db->last_insert_id($this->db->prefix().'timeflow_late_check');
		}
		if ($this->db->lasterrno() === 'DB_ERROR_RECORD_ALREADY_EXISTS') {
			return 0;
		}
		$exception = new TimeflowSqlException('TimeFlowLateCheck::claimDay');
		$exception->dbError = (string) $this->db->lasterror();
		throw $exception;
	}

	/**
	 * Takes over a stale 'running' claim. The UPDATE only matches if nobody
	 * else refreshed it in the meantime, so of two runs taking over at once
	 * only one gets the row.
	 *
	 * @return bool
	 */
	private function takeOverClaim(array $existing, $now)
	{
		$sql = 'UPDATE '.$this->db->prefix()."timeflow_late_check SET date_run = '".date('Y-m-d H:i:s', $now)."'";
		$sql .= ' WHERE rowid = '.((int) $existing['rowid'])." AND status = 'running' AND date_run = '".$this->db->escape($existing['date_run'])."'";
		$resql = timeflowQuery($this->db, $sql, 'TimeFlowLateCheck::takeOverClaim');

		return (int) $this->db->affected_rows($resql) === 1;
	}

	/**
	 * @return void
	 */
	private function closeDay($markerId, $status, $now, array $detection, $recipients, $emails)
	{
		$sql = 'UPDATE '.$this->db->prefix().'timeflow_late_check SET status = \''.$this->db->escape($status)."', date_end = '".date('Y-m-d H:i:s', $now)."'";
		$sql .= ', nb_expected = '.count($detection['expected']).', nb_late = '.count($detection['late']);
		$sql .= ', nb_recipients = '.((int) $recipients).', nb_emails = '.((int) $emails);
		$sql .= ' WHERE rowid = '.((int) $markerId);
		timeflowQuery($this->db, $sql, 'TimeFlowLateCheck::closeDay');
	}
}
