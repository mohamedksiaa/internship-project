<?php
// Quick CLI helper to fetch raw fk_statut and fk_opp_status for project refs
// Usage: php debug_get_raw_status.php REF1 REF2 ...

if (php_sapi_name() !== 'cli') {
    echo "This script is CLI-only.\n";
    exit(1);
}

$refs = array_slice($argv, 1);
if (empty($refs)) {
    echo json_encode(array('error' => 'No refs provided'), JSON_PRETTY_PRINT) . "\n";
    exit(1);
}

$res = 0;
if (!$res && file_exists("../../main.inc.php")) {
    $res = @include "../../main.inc.php";
}
if (!$res && file_exists("../../../main.inc.php")) {
    $res = @include "../../../main.inc.php";
}
if (!$res) {
    fwrite(STDERR, "Include of main.inc.php failed\n");
    exit(1);
}

// Now we have $db available from Dolibarr
$out = array();
foreach ($refs as $ref) {
    $r = trim((string) $ref);
    $escaped = $db->escape($r);
    $sql = 'SELECT rowid, fk_statut, fk_opp_status FROM '.$db->prefix().'projet';
    $sql .= " WHERE entity IN (".getEntity('project').")";
    $sql .= " AND ref = '".$escaped."'";
    $sql .= ' LIMIT 1';
    $resql = $db->query($sql);
    if ($resql && $db->num_rows($resql) > 0) {
        $obj = $db->fetch_object($resql);
        $out[$r] = array(
            'found' => true,
            'rowid' => (int) $obj->rowid,
            'raw_fk_statut' => $obj->fk_statut,
            'raw_fk_opp_status' => $obj->fk_opp_status,
        );
    } else {
        $out[$r] = array('found' => false);
    }
}

echo json_encode($out, JSON_PRETTY_PRINT) . "\n";

?>
