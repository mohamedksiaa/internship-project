<?php
// TEMPORARY diagnostic script — no Dolibarr bootstrap, reachable directly via
// Apache to inspect the WEB SAPI's own OPcache state for timeentry.php,
// independent of any login/session. To be deleted once the investigation is done.
header('Content-Type: application/json');

// A sandbox clock jump left OPcache holding a cached compile timestamp that
// is in the FUTURE relative to the real current time, which defeats
// validate_timestamps (a file edited "now" always looks OLDER than that
// future-dated cache entry). ?force_invalidate=1 bypasses the timestamp
// check entirely via opcache_invalidate($file, true).
if (isset($_GET['force_invalidate']) && function_exists('opcache_invalidate')) {
    $invalidated = opcache_invalidate(__DIR__.'/ajax/timeentry.php', true);
    $resetAll = isset($_GET['reset_all']) && function_exists('opcache_reset') ? opcache_reset() : null;
    echo json_encode(array('invalidated' => $invalidated, 'reset_all' => $resetAll));
    exit;
}

$target = __DIR__ . '/ajax/timeentry.php';
$result = array(
    'ini_validate_timestamps' => ini_get('opcache.validate_timestamps'),
    'ini_revalidate_freq' => ini_get('opcache.revalidate_freq'),
    'ini_enable' => ini_get('opcache.enable'),
    'ini_max_file_size' => ini_get('opcache.max_file_size'),
    'ini_file_cache' => ini_get('opcache.file_cache'),
    'now' => date('Y-m-d H:i:s'),
    'now_ts' => time(),
    'target_file' => $target,
    'target_realpath' => realpath($target),
    'target_exists' => file_exists($target),
    'target_mtime' => file_exists($target) ? filemtime($target) : null,
    'target_mtime_human' => file_exists($target) ? date('Y-m-d H:i:s', filemtime($target)) : null,
    'target_md5' => file_exists($target) ? md5_file($target) : null,
    'php_sapi' => php_sapi_name(),
    'opcache_enabled' => function_exists('opcache_get_status') ? (opcache_get_status(false) !== false) : false,
);

if (function_exists('opcache_get_status')) {
    $status = opcache_get_status(true);
    if ($status && !empty($status['scripts'])) {
        $rp = realpath($target);
        $found = null;
        foreach ($status['scripts'] as $path => $info) {
            if ($path === $rp || $path === $target) {
                $found = $info;
                break;
            }
        }
        $result['opcache_has_this_file_cached'] = $found !== null;
        if ($found) {
            $result['opcache_cached_timestamp'] = $found['timestamp'] ?? null;
            $result['opcache_cached_timestamp_human'] = isset($found['timestamp']) ? date('Y-m-d H:i:s', $found['timestamp']) : null;
            $result['opcache_hits'] = $found['hits'] ?? null;
            $result['opcache_last_used'] = isset($found['last_used_timestamp']) ? date('Y-m-d H:i:s', $found['last_used_timestamp']) : null;
        }
        $result['opcache_total_cached_scripts'] = count($status['scripts']);
    } else {
        $result['opcache_status_raw'] = $status;
    }
}

// Also grep the currently-loaded source for a fingerprint string that only
// exists in the NEW version, to prove which version this SAPI would compile
// if it (re)compiled the file right now.
$result['source_contains_fk_opp_status'] = file_exists($target) && strpos(file_get_contents($target), 'fk_opp_status') !== false;
$result['source_contains_etat_html'] = file_exists($target) && strpos(file_get_contents($target), 'etat_html') !== false;

echo json_encode($result, JSON_PRETTY_PRINT);
