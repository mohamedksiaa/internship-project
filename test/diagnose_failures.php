<?php
// Diagnostic script to reproduce failing test calls and show object error details
$bootstrapDir = __DIR__;
$foundBootstrap = false;
while (true) {
    if (is_file($bootstrapDir . '/master.inc.php')) {
        require_once $bootstrapDir . '/master.inc.php';
        $foundBootstrap = true;
        break;
    }
    $parent = dirname($bootstrapDir);
    if ($parent === $bootstrapDir) break;
    $bootstrapDir = $parent;
}
if (! $foundBootstrap) {
    echo "master.inc.php not found\n";
    exit(1);
}
require_once dirname(__DIR__) . '/class/timeentry.class.php';

global $db, $user;
if (empty($user->id)) {
    echo "Load permissions for admin user nb 1\n";
    $user->fetch(1);
    $user->loadRights();
}

echo "-- testTimeEntryCreate reproduction --\n";
$te = new TimeEntry($db);
$te->initAsSpecimen();
$res = $te->create($user);
echo "create() returned: ".var_export($res, true)."\n";
echo "error: ".($te->error ?: '(empty)')."\n";
echo "errors[]: ".(empty($te->errors) ? '(none)' : implode(' | ', $te->errors))."\n";

echo "\n-- testStartTimerValidation reproduction --\n";
$te2 = new TimeEntry($db);
$res1 = $te2->startTimer($user->id, 0, 0, '');
echo "startTimer(empty project/note) returned: ".var_export($res1, true)."\n";
echo "error: ".($te2->error ?: '(empty)')."\n";
echo "errors[]: ".(empty($te2->errors) ? '(none)' : implode(' | ', $te2->errors))."\n";

$res2 = $te2->startTimer($user->id, 0, 0, 'Analyse');
echo "startTimer(empty project, valid note) returned: ".var_export($res2, true)."\n";
echo "error: ".($te2->error ?: '(empty)')."\n";
echo "errors[]: ".(empty($te2->errors) ? '(none)' : implode(' | ', $te2->errors))."\n";

$res3 = $te2->startTimer($user->id, 1, 0, 'ab');
echo "startTimer(project 1, short note) returned: ".var_export($res3, true)."\n";
echo "error: ".($te2->error ?: '(empty)')."\n";
echo "errors[]: ".(empty($te2->errors) ? '(none)' : implode(' | ', $te2->errors))."\n";

$res4 = $te2->startTimer($user->id, 1, 0, '   ');
echo "startTimer(project 1, whitespace note) returned: ".var_export($res4, true)."\n";
echo "error: ".($te2->error ?: '(empty)')."\n";
echo "errors[]: ".(empty($te2->errors) ? '(none)' : implode(' | ', $te2->errors))."\n";

