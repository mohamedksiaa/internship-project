<?php
/**
 * Data-correction script for the idate() double-conversion bug (createManualEntry() /
 * closeSegmentAndOpenNext() pre-formatting date_start/date_end before create()'s own conversion — see
 * class/timeentry.class.php and docs/tests/RAPPORT_SECURITE.md for the full root-cause writeup).
 *
 * Simulation by default, writes only with --apply. Every --apply run requires --user-id and
 * --export-dir — there is no way to apply without producing a before/after export.
 *
 * Usage (run from within the Dolibarr instance whose database you want to inspect/correct — the "target
 * database" is therefore whichever instance's own master.inc.php/conf.php this script is run under, same
 * as every other CLI script in this module):
 *
 *   Simulation (default, never writes):
 *     php scripts/correct-idate-double-conversion.php [--database=<name>] [--before=<Y-m-d H:i:s>]
 *
 *   Application (writes — only run this after reviewing a simulation run on the same database):
 *     php scripts/correct-idate-double-conversion.php --apply --user-id=<id> --export-dir=<path> [--database=<name>] [--before=<Y-m-d H:i:s>]
 *
 *   --database    Optional override of $dolibarr_main_db_name, if this instance's conf.php is shared by
 *                 several Dolibarr databases and the one you want is not the default. Rarely needed.
 *   --before      Optional upper bound on date_creation (default: now) — mostly for reproducible test runs.
 *   --apply       Writes the "clean" corrections (see below) instead of only listing them. Everything
 *                 else below this line only matters when --apply is passed.
 *   --user-id     Required with --apply. A real, active Dolibarr user id, recorded as the author of every
 *                 correction (TimeEntry::update()'s $user, fk_user_modif, the audit row's fk_user_creat).
 *   --export-dir  Required with --apply. Directory (created if missing) where the before/after export is
 *                 written as idate-correction-<timestamp>.json, one entry per corrected row, before this
 *                 script writes anything else.
 *
 * Identification (three buckets, each explained in its own report section):
 *   (A) import_key IS NOT NULL                        -> Clockify import, 100% reliable regardless of the
 *                                                         audit log (see "Couverture de l'audit" below).
 *   (B) a 'manual_create' audit row exists, no import_key -> added via the "add manual entry" UI.
 *   (C) fk_split_previous IS NOT NULL                  -> a midnight-split continuation segment
 *                                                         (closeSegmentAndOpenNext()); these never log
 *                                                         'manual_create' (they come from a chrono, not
 *                                                         createManualEntry()), so they are NOT in (A)/(B)
 *                                                         and need this separate, dedicated identification.
 *
 * Exclusion: a row in (A)/(B)/(C) is EXCLUDED (reported, not corrected) if llx_timeflow_timeentry_modification
 * has a LATER row for it with field_name IN ('date_start','date_end') AND action <> 'manual_create' — i.e. a
 * real subsequent correction (correctTimeEntry(), action 'manual_employee'/'manual_manager') touched that
 * exact field. logModifications() only ever writes a field-level row when the value actually changed, so a
 * correction that only touched note/billable/etc. never produces such a row and never triggers this
 * exclusion — exactly the distinction asked for, nothing broader.
 *
 * Audit coverage gap (why bucket (B) alone is not reliable for old data): llx_timeflow_timeentry_modification's
 * raw INSERT had its own pre-existing bug (uncast $this->entity -> invalid SQL -> every insert silently
 * failed) fixed in commit b085898a (2026-09-09 12:29:15). Any row created before that timestamp with no
 * import_key and no fk_split_previous cannot be reliably classified as "manual entry" vs "chrono-started,
 * no audit needed" from data alone — this script does NOT guess; it reports the count explicitly under
 * "zone non classifiable" so a human can decide (0 rows on the Docker test database as of 2026-10-05,
 * confirmed by the counting query this script itself runs).
 *
 * Offset computation, DST-safe: for a candidate true epoch E, the bug (confirmed empirically) produces
 * idate(idate(E)) for storage. Rather than hand-deriving the server's historical UTC offset for every row's
 * date (error-prone across a DST transition), this script computes a candidate correction and then REPLAYS
 * the exact same idate(idate()) computation forward with Dolibarr's own loaded idate() function, confirming
 * it reproduces the stored string byte for byte before trusting the candidate. Any row where that replay
 * does not match after the obvious +/-1h adjustment search is flagged "a verifier manuellement" rather than
 * corrected automatically — expected only exactly at a DST transition hour, if ever.
 *
 * Application mechanics: a "clean" row is corrected through TimeEntry::update() (not raw SQL) — the exact
 * same generic, now-single-conversion path this bug's own fix (PR n° 43) put in place, so a corrected row
 * is written exactly the same way a fresh, correct entry would be. update() is called with
 * TimeEntry::MOD_ACTION_DATA_FIX (not MOD_ACTION_MANUAL_EMPLOYEE/MANAGER — this is a script retroactively
 * fixing a known bug, not a human correcting a timesheet, so it deliberately does not flip
 * is_manually_edited or write to llx_timeflow_time_edit_log) and a fixed, greppable $reason, which makes
 * logModifications() write one audit row per field that actually changed (date_start, and date_end when
 * applicable) — "une ligne d'audit par correction" in the sense the module already uses everywhere else:
 * one row per changed field, attributing who/when/old/new, not one single opaque "something changed" line.
 * Everything runs inside one transaction: if any row fails unexpectedly, nothing is kept.
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
    if ($parent === $bootstrapDir) {
        break;
    }
    $bootstrapDir = $parent;
}
if (!$foundBootstrap) {
    fwrite(STDERR, "master.inc.php not found above " . __DIR__ . " — run this script from inside a Dolibarr instance.\n");
    exit(1);
}
$moduleRoot = dirname(__DIR__);
require_once $moduleRoot . '/class/timeentry.class.php';

$options = getopt('', array('database::', 'before::', 'apply', 'user-id::', 'export-dir::'));
if (!empty($options['database'])) {
    // Deliberately late, explicit override — the instance this script runs under decides the connection
    // otherwise, exactly like every other CLI script in this module.
    $db->database_name = $options['database'];
}
$before = !empty($options['before']) ? $options['before'] : date('Y-m-d H:i:s');
$applyMode = isset($options['apply']);

$actingUser = null;
$exportDir = null;
if ($applyMode) {
    if (empty($options['user-id'])) {
        fwrite(STDERR, "--apply requires --user-id=<id> (a real, active Dolibarr user, recorded as the author of every correction).\n");
        exit(1);
    }
    if (empty($options['export-dir'])) {
        fwrite(STDERR, "--apply requires --export-dir=<path> — a before/after export is written there before anything else.\n");
        exit(1);
    }
    $actingUser = new User($db);
    if ($actingUser->fetch((int) $options['user-id']) <= 0 || (int) $actingUser->statut !== 1) {
        fwrite(STDERR, "--user-id=" . $options['user-id'] . " is not a real, active Dolibarr user.\n");
        exit(1);
    }
    $exportDir = rtrim($options['export-dir'], '/\\');
    if (!is_dir($exportDir) && !mkdir($exportDir, 0775, true) && !is_dir($exportDir)) {
        fwrite(STDERR, "Could not create --export-dir=$exportDir\n");
        exit(1);
    }
}

$prefix = $db->prefix();
$auditFixCommitTimestamp = '2026-09-09 12:29:15';

function q($db, $sql)
{
    $res = $db->query($sql);
    if (!$res) {
        fwrite(STDERR, "SQL error: " . $db->lasterror() . "\nQuery: $sql\n");
        exit(1);
    }
    $rows = array();
    while ($obj = $db->fetch_object($res)) {
        $rows[] = $obj;
    }
    return $rows;
}

echo "=== idate() double-conversion — data correction " . ($applyMode ? "— APPLY MODE (writes to the database)" : "— SIMULATION ONLY (no write)") . " ===\n";
echo "Database: " . ($options['database'] ?? '(default of this instance\'s conf.php)') . "\n";
echo "Cutoff considered: rows created before $before\n";
if ($applyMode) {
    echo "Acting user: " . $actingUser->login . " (id " . $actingUser->id . ")\n";
    echo "Export directory: $exportDir\n";
}
echo "\n";

// --- Audit coverage check (requested verification: compare the two counts, explain any gap) ---
$importCount = q($db, "SELECT COUNT(*) n FROM {$prefix}timeflow_timeentry WHERE import_key IS NOT NULL AND import_key <> '' AND date_creation <= '$before'")[0]->n;
$importWithAudit = q($db, "SELECT COUNT(DISTINCT t.rowid) n FROM {$prefix}timeflow_timeentry t
    INNER JOIN {$prefix}timeflow_timeentry_modification m ON m.fk_timeentry = t.rowid AND m.action = 'manual_create'
    WHERE t.import_key IS NOT NULL AND t.import_key <> '' AND t.date_creation <= '$before'")[0]->n;
echo "Audit coverage check: $importCount lignes avec import_key, $importWithAudit ont une ligne d'audit 'manual_create'.\n";
if ($importCount !== (int) $importWithAudit) {
    echo "  ECART : " . ($importCount - $importWithAudit) . " ligne(s) avec import_key SANS ligne d'audit.\n";
    echo "  Cause probable : créées avant $auditFixCommitTimestamp (commit b085898a, insertion d'audit cassée avant ça).\n";
    echo "  Ces lignes restent identifiées via import_key seul (bucket A ci-dessous) — l'écart n'affecte pas leur correction, seulement le comptage d'audit.\n";
} else {
    echo "  Aucun écart.\n";
}
echo "\n";

// --- Bucket A: Clockify import rows — import_key alone, independent of audit coverage ---
$bucketA = q($db, "SELECT rowid, date_start, date_end, date_creation FROM {$prefix}timeflow_timeentry
    WHERE import_key IS NOT NULL AND import_key <> '' AND date_creation <= '$before'");

// --- Bucket B: manual "add entry" rows — audit-log-identified, excluding anything already in bucket A ---
$bucketB = q($db, "SELECT t.rowid, t.date_start, t.date_end, t.date_creation FROM {$prefix}timeflow_timeentry t
    INNER JOIN {$prefix}timeflow_timeentry_modification m ON m.fk_timeentry = t.rowid AND m.action = 'manual_create'
    WHERE (t.import_key IS NULL OR t.import_key = '') AND t.date_creation <= '$before'
    GROUP BY t.rowid");

// --- Bucket C: midnight-split continuation segments — never go through createManualEntry(), so never
// logged as 'manual_create'; identified structurally via fk_split_previous instead. ---
$bucketC = array();
// Checked via information_schema (not TimeEntry::hasDatabaseColumn(), a protected method) so this script
// still runs cleanly against an instance where the fk_split_previous migration was never applied.
$hasSplitColumn = q($db, "SELECT COUNT(*) n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '{$prefix}timeflow_timeentry' AND column_name = 'fk_split_previous'")[0]->n > 0;
if ($hasSplitColumn) {
    $bucketC = q($db, "SELECT rowid, date_start, date_end, date_creation FROM {$prefix}timeflow_timeentry
        WHERE fk_split_previous IS NOT NULL AND date_creation <= '$before'");
}

// --- Unclassifiable zone (pre-audit-fix, no import_key, no split marker): reported, never corrected. ---
$unclassifiable = q($db, "SELECT COUNT(*) n FROM {$prefix}timeflow_timeentry t
    WHERE t.date_creation < '$auditFixCommitTimestamp'
    AND (t.import_key IS NULL OR t.import_key = '')
    AND t.rowid NOT IN (SELECT fk_timeentry FROM {$prefix}timeflow_timeentry_modification WHERE action = 'manual_create')"
    . ($hasSplitColumn ? " AND t.fk_split_previous IS NULL" : ''))[0]->n;

echo "Bucket A (import Clockify) : " . count($bucketA) . " ligne(s)\n";
echo "Bucket B (saisie manuelle UI) : " . count($bucketB) . " ligne(s)\n";
echo "Bucket C (segments de minuit) : " . count($bucketC) . " ligne(s)\n";
echo "Zone non classifiable (pre-correctif d'audit, origine indéterminable) : $unclassifiable ligne(s)\n";
if ($unclassifiable > 0) {
    echo "  -> à vérifier manuellement avant toute correction automatique ; ce script ne les touchera jamais.\n";
}
echo "\n";

$allCandidates = array();
foreach ($bucketA as $row) {
    $allCandidates[(int) $row->rowid] = array('row' => $row, 'origin' => 'import');
}
foreach ($bucketB as $row) {
    $allCandidates[(int) $row->rowid] = array('row' => $row, 'origin' => 'manuel');
}
foreach ($bucketC as $row) {
    $allCandidates[(int) $row->rowid] = array('row' => $row, 'origin' => 'segment_minuit');
}

/** Replays the exact bug forward (idate() applied twice) and checks it reproduces $storedString. */
function verifyCandidate($db, $candidateEpoch, $storedString)
{
    $onceRendered = $db->idate($candidateEpoch);
    $replayed = $db->idate($onceRendered); // same double-call the bug itself performed
    return $replayed === $storedString;
}

/** Inverts the bug for one stored DATETIME string, trying the stored epoch's own offset first, then +/-1h. */
function computeTrueEpoch($db, $storedString)
{
    $storedEpoch = $db->jdate($storedString);
    $onceRendered = $db->idate($storedEpoch);
    $appliedOffset = $db->jdate($onceRendered) - $storedEpoch; // the offset idate() just applied to $storedEpoch itself, as a first guess at the bug's own magnitude at this point in time
    foreach (array($appliedOffset, $appliedOffset - 3600, $appliedOffset + 3600, 0) as $guess) {
        $candidate = $storedEpoch - $guess;
        if (verifyCandidate($db, $candidate, $storedString)) {
            return array('epoch' => $candidate, 'clean' => true);
        }
    }
    return array('epoch' => null, 'clean' => false);
}

$results = array('clean' => 0, 'review' => 0, 'excluded_corrected_since' => 0, 'applied' => 0, 'apply_failed' => 0);
$toApply = array(); // rowid => array('start' => epoch, 'end' => epoch|null)
echo "--- " . ($applyMode ? "Plan (vérifié avant toute écriture)" : "Simulation détaillée") . " ---\n";
foreach ($allCandidates as $rowid => $info) {
    $row = $info['row'];

    // Exclusion: a later, real correction (action <> 'manual_create') touched date_start or date_end.
    $correctedSince = q($db, "SELECT 1 FROM {$prefix}timeflow_timeentry_modification
        WHERE fk_timeentry = $rowid AND field_name IN ('date_start','date_end') AND action <> 'manual_create' LIMIT 1");
    if (!empty($correctedSince)) {
        $results['excluded_corrected_since']++;
        echo "rowid=$rowid [{$info['origin']}] EXCLU — date corrigée manuellement depuis (correctTimeEntry).\n";
        continue;
    }

    $startFix = computeTrueEpoch($db, $row->date_start);
    $endFix = $row->date_end !== null ? computeTrueEpoch($db, $row->date_end) : array('epoch' => null, 'clean' => true);

    if ($startFix['clean'] && $endFix['clean']) {
        $results['clean']++;
        $newStart = $db->idate($startFix['epoch']);
        $newEnd = $endFix['epoch'] !== null ? $db->idate($endFix['epoch']) : null;
        echo "rowid=$rowid [{$info['origin']}] date_start: {$row->date_start} -> $newStart"
            . ($newEnd !== null ? " | date_end: {$row->date_end} -> $newEnd" : '') . "\n";
        $toApply[$rowid] = array('start' => $startFix['epoch'], 'end' => $endFix['epoch']);
    } else {
        $results['review']++;
        echo "rowid=$rowid [{$info['origin']}] A REVOIR MANUELLEMENT — proche d'une transition d'heure d'été, pas de correction fiable calculée automatiquement.\n";
    }
}

echo "\n=== Résumé du plan ===\n";
echo "Corrections propres (" . ($applyMode ? "à appliquer" : "prêtes pour un futur mode application") . ") : {$results['clean']}\n";
echo "A revoir manuellement (transition heure d'été) : {$results['review']}\n";
echo "Exclues (déjà corrigées manuellement depuis) : {$results['excluded_corrected_since']}\n";
echo "Zone non classifiable (hors périmètre de ce script) : $unclassifiable\n";

if (!$applyMode) {
    echo "\nAucune écriture effectuée. Relancer avec --apply --user-id=<id> --export-dir=<path> pour appliquer les {$results['clean']} corrections propres listées ci-dessus.\n";
    exit(0);
}

if (empty($toApply)) {
    echo "\nRien à appliquer (0 correction propre). Aucune écriture effectuée.\n";
    exit(0);
}

// --- Application: export BEFORE state, then write, then export AFTER state, before touching anything
// else — if this export fails, nothing below it runs. ---
$exportBefore = array();
foreach ($toApply as $rowid => $fix) {
    $before_row = q($db, "SELECT * FROM {$prefix}timeflow_timeentry WHERE rowid = $rowid")[0];
    $exportBefore[$rowid] = $before_row;
}
$exportPath = $exportDir . '/idate-correction-' . date('Ymd-His') . '.json';
$exportPayload = array(
    'started_at' => date('c'),
    'acting_user' => array('id' => $actingUser->id, 'login' => $actingUser->login),
    'before' => $exportBefore,
    'after' => null, // filled in and rewritten once every row has been processed
);
if (file_put_contents($exportPath, json_encode($exportPayload, JSON_PRETTY_PRINT)) === false) {
    fwrite(STDERR, "Could not write the before-export to $exportPath — aborting, nothing applied.\n");
    exit(1);
}
echo "\nBefore-state exported to $exportPath\n";

echo "Applying {$results['clean']} corrections...\n";
$db->begin();
$reason = 'Correction du décalage idate() (RAPPORT_SECURITE.md §5.5, correctif PR n° 43) — '
    . 'script scripts/correct-idate-double-conversion.php, execution le ' . date('Y-m-d H:i:s');
$appliedIds = array();
foreach ($toApply as $rowid => $fix) {
    $entry = new TimeEntry($db);
    if ($entry->fetch($rowid) <= 0) {
        $results['apply_failed']++;
        fwrite(STDERR, "rowid=$rowid: fetch() a échoué, abandon.\n");
        $db->rollback();
        exit(1);
    }
    $entry->date_start = $fix['start'];
    $entry->date_end = $fix['end'];
    $updateResult = $entry->update($actingUser, 0, $reason, TimeEntry::MOD_ACTION_DATA_FIX);
    if ($updateResult <= 0) {
        $results['apply_failed']++;
        fwrite(STDERR, "rowid=$rowid: update() a échoué (" . ($entry->error ?: implode(', ', (array) $entry->errors)) . "), abandon — rien n'est conservé.\n");
        $db->rollback();
        exit(1);
    }
    $results['applied']++;
    $appliedIds[] = $rowid;
}
$db->commit();
echo "Appliqué : {$results['applied']} ligne(s), 0 échec (un échec aurait annulé l'ensemble).\n";

// --- AFTER export, same file, now that the transaction is committed. ---
$exportAfter = array();
foreach ($appliedIds as $rowid) {
    $exportAfter[$rowid] = q($db, "SELECT * FROM {$prefix}timeflow_timeentry WHERE rowid = $rowid")[0];
}
$exportPayload['after'] = $exportAfter;
$exportPayload['finished_at'] = date('c');
file_put_contents($exportPath, json_encode($exportPayload, JSON_PRETTY_PRINT));
echo "Before/after export complete: $exportPath\n";
echo "Une ligne d'audit par champ corrigé (date_start, et date_end le cas échéant) a été écrite dans llx_timeflow_timeentry_modification, action='" . TimeEntry::MOD_ACTION_DATA_FIX . "'.\n";
