<?php
/**
 * Data-correction script for the idate() double-conversion bug (createManualEntry() /
 * closeSegmentAndOpenNext() pre-formatting date_start/date_end before create()'s own conversion — see
 * class/timeentry.class.php and docs/tests/RAPPORT_SECURITE.md for the full root-cause writeup).
 *
 * SIMULATION ONLY. This script never writes to the database. It lists every row it believes is affected,
 * the correction it would make, and why — nothing more. An --apply mode is intentionally not implemented
 * yet: do not add one and run it without explicit sign-off from the module owner, on any database.
 *
 * Usage (run from within the Dolibarr instance whose database you want to inspect — the "target database"
 * is therefore whichever instance's own master.inc.php/conf.php this script is run under, same as every
 * other CLI script in this module):
 *   php scripts/correct-idate-double-conversion.php [--database=<name>] [--before=<Y-m-d H:i:s>]
 *
 *   --database   Optional override of $dolibarr_main_db_name, if this instance's conf.php is shared by
 *                several Dolibarr databases and the one you want is not the default. Rarely needed.
 *   --before     Optional upper bound on date_creation (default: now) — mostly for reproducible test runs.
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

$options = getopt('', array('database::', 'before::'));
if (!empty($options['database'])) {
    // Deliberately late, explicit override — the instance this script runs under decides the connection
    // otherwise, exactly like every other CLI script in this module.
    $db->database_name = $options['database'];
}
$before = !empty($options['before']) ? $options['before'] : date('Y-m-d H:i:s');

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

echo "=== idate() double-conversion — data correction, SIMULATION ONLY (no write) ===\n";
echo "Database: " . ($options['database'] ?? '(default of this instance\'s conf.php)') . "\n";
echo "Cutoff considered: rows created before $before\n\n";

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

$results = array('clean' => 0, 'review' => 0, 'excluded_corrected_since' => 0);
echo "--- Simulation détaillée ---\n";
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
    } else {
        $results['review']++;
        echo "rowid=$rowid [{$info['origin']}] A REVOIR MANUELLEMENT — proche d'une transition d'heure d'été, pas de correction fiable calculée automatiquement.\n";
    }
}

echo "\n=== Résumé ===\n";
echo "Corrections propres (prêtes pour un futur mode application) : {$results['clean']}\n";
echo "A revoir manuellement (transition heure d'été) : {$results['review']}\n";
echo "Exclues (déjà corrigées manuellement depuis) : {$results['excluded_corrected_since']}\n";
echo "Zone non classifiable (hors périmètre de ce script) : $unclassifiable\n";
echo "\nAucune écriture effectuée. Mode application non implémenté — ne pas l'ajouter ni l'exécuter sans accord explicite du responsable du module.\n";
