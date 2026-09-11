<?php
// ARCHIVÉ : déplacé de test/ vers scripts/archive/, avec diagnose_failures.php.
// Raison : ce n'est PAS un test automatisé -- confirmé par grep exhaustif sur
// tout le dépôt (composer.json, package.json/frontend/package.json, aucun
// CI n'existe dans ce dépôt, aucun README) : aucun script, hook ou pipeline
// n'invoque ce fichier. C'est un outil de diagnostic ad hoc, écrit pendant
// une session d'audit/débogage antérieure pour inspecter, contre une vraie
// installation Dolibarr, les valeurs par défaut que TimeEntry::initAsSpecimen()
// pose sur un objet fraîchement instancié (utile pour comprendre pourquoi un
// test PHPUnit basé sur un spécimen échouait, sans relancer toute la suite).
//
// La vraie suite de tests reste test/phpunit/ (jamais touchée par cet
// archivage). Ce script nécessite lui-même un vrai master.inc.php
// Dolibarr pour s'exécuter (voir le bootstrap ci-dessous) -- il n'a donc
// jamais pu tourner dans ce bac à sable, seulement sur une installation
// réelle, en CLI : `php scripts/archive/inspect_specimen.php`.

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
