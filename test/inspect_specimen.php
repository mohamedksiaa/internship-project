<?php
$bootstrapDir = __DIR__;
$foundBootstrap = false;
while (true) {
    if (is_file($bootstrapDir . '/master.inc.php')) { require_once $bootstrapDir . '/master.inc.php'; $foundBootstrap = true; break; }
    $parent = dirname($bootstrapDir);
    if ($parent === $bootstrapDir) break;
    $bootstrapDir = $parent;
}
if (! $foundBootstrap) { echo "master.inc.php not found\n"; exit(1); }
require_once dirname(__DIR__) . '/class/timeentry.class.php';

global $db, $user;
if (empty($user->id)) { echo "Load permissions for admin user nb 1\n"; $user->fetch(1); $user->loadRights(); }
$te = new TimeEntry($db);
$te->initAsSpecimen();
$keys = ['fk_user','fk_project','fk_task','date_start','date_end','duration','status','date_creation','fk_user_creat','is_manually_edited','occurrence_count','note'];
foreach ($keys as $k) {
    $val = property_exists($te, $k) ? $te->$k : '(no property)';
    echo "$k => ".(is_null($val)?'NULL':(is_bool($val)?($val? 'true':'false'):(string)$val))."\n";
}
