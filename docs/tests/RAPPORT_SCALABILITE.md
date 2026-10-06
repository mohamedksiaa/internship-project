# Rapport de tests — Scalabilité

| | |
|---|---|
| **Date d'exécution** | 2026-10-06 (tests) · 2026-10-06 (correctif ANO-SCAL-01) |
| **Environnement** | Docker de test `docker-timeflow-test`, Dolibarr 19.0.2 — tests sur PR #55 fusionnée, correctif ANO-SCAL-01 sur PR #56 fusionnée |
| **Jeu de données initial** | 563 saisies (état restauré par le responsable), 13 utilisateurs |
| **Exécutant** | Claude Code, sous la supervision du responsable |
| **Données générées** | **non supprimées à la fin de cette phase ni du correctif ANO-SCAL-01** — le responsable restaure la base de référence lui-même (consigne) |

Règles spécifiques à cette phase (rappel) : mesure de référence (563 saisies) avant toute génération. Générateur déterministe (graine fixe), marqueur reconnaissable sur chaque ligne générée, pour une suppression exacte. Paliers 10 000 puis 100 000 ; 500 000 optionnel, accord requis avant. Aucune modification de code ni de schéma pendant les mesures — un index manquant est mesuré (`EXPLAIN`) et proposé, jamais créé. Tests de charge contre `localhost:8080` uniquement, montée progressive, arrêt immédiat si un conteneur devient instable. **Aucune limite mémoire (`docker update`) imposée aux conteneurs pendant cette phase.** Les données générées ne sont pas supprimées par l'exécutant — le responsable restaure la base de référence à la fin.

## 1. Résumé

- Cas prévus : 13 · exécutés (au moins partiellement) : 9 (SCAL-01, 02, 03, 04, 05, 06, 07, 11, 12) · non exécutés cette session : 4 (SCAL-08, 09, 10, 13 — voir §5)
- Statuts (mis à jour après correctifs) : ✅ 5 (SCAL-01, 03, 05, 06, 12) · ⚠️ 2 (SCAL-02, 11) · ❌ 2 (SCAL-04, 07)
- Anomalies : 2 (ANO-SCAL-01 Élevé — export global tronqué silencieusement, **✅ corrigée** — voir §4 ; ANO-SCAL-02 Moyen — conséquence directe de l'index manquant sur `import_key`, voir I1, pas encore corrigée) · 1 corrigée sur 2
- **Conclusion (mise à jour).** Les temps de lecture (tableau de bord, listes paginées) restent rapides même à 100 000 lignes — tous sous les seuils du plan, et les jobs planifiés (alertes, fermeture de minuit) comme les bornes de pagination passent sans anomalie aux volumes testés. **ANO-SCAL-01 (export CSV global tronqué) est corrigée** : pagination par curseur, plus de plafond arbitraire, re-mesurée à 100 562 lignes sans écart (voir §4). **Le point restant le plus sévère** : la recherche `import_key` (balayage complet, confirmé par `EXPLAIN` à 10 000 et 100 000 lignes) fait exploser le temps d'import (384 s mesurés pour 5 000 lignes contre un seuil de 120 s, soit +220 %) — correctif I1 proposé mais pas encore appliqué. Le plafond de 1 000 lignes du tableau de bord (priorité demandée) est bien atteint dès 10 000 saisies, avec **un mécanisme d'avertissement qui fonctionne correctement et visiblement** — vérifié dans un vrai navigateur, pas seulement par lecture de code — **mais le total lui-même reste faux à un volume réaliste pour une PME** (8 810 saisies/mois pour 50 employés), d'où le ⚠️ plutôt que ✅ (voir F2, pas encore implémenté). I1 est proposé en index **unique**, ce qui referme aussi le risque de doublon d'import déjà documenté en phase 2.

## 2. Tableau des seuils du plan

| Mesure | Seuil (plan, p95 @ 100 000) | Mesuré (563) | Mesuré (10 000) | Mesuré (100 000) | Statut |
|---|---|---|---|---|---|
| Tableau de bord, un mois | ≤ 2 s | p95 176 ms | p95 706 ms | p95 652 ms | ✅ |
| Tableau de bord, un trimestre | ≤ 2 s (extrapolé du plan) | p95 659 ms | p95 814 ms | p95 635 ms | ✅ |
| Tableau de bord, un an | ≤ 5 s | p95 494 ms | p95 801 ms | p95 625 ms | ✅ |
| `getTimeFlowProjects` (page 20) | ≤ 2 s | p95 162 ms | p95 172 ms | p95 273 ms | ✅ |
| `getTimeFlowUsers` (page 20) | ≤ 2 s | p95 273 ms | p95 250 ms | p95 407 ms | ✅ |
| `getProcessedHistory` (page 20) | ≤ 2 s | p95 208 ms | p95 454 ms | p95 621 ms | ✅ |
| `getTimeEntries` (page 20) | ≤ 2 s | p95 180 ms | p95 115 ms | p95 302 ms | ✅ |
| `getValidationEntries` (page 20) | ≤ 2 s | p95 167 ms | p95 180 ms | p95 207 ms | ✅ |
| `getWeeklyTimesheet` | ≤ 2 s | p95 148 ms | p95 186 ms | p95 194 ms | ✅ |
| Démarrage/arrêt chrono | ≤ 500 ms | non mesuré séparément — voir §5, reste indépendant du volume de `llx_timeflow_timeentry` par construction | — | — | ⏭ |
| Import Clockify 5 000 lignes | ≤ 120 s, ≤ 256 Mo | — | — | **384 s mesuré (dépassement 220 %)** | ❌ |
| Export CSV global | ≤ 30 s, ≤ 256 Mo | — | — | **corrigé : 100 562/100 562 lignes, 11 lots, 4,6 s** (voir ANO-SCAL-01) | ✅ |
| Job d'alertes (50/200/1 000 employés) | ≤ 30 s | — | — | **61 empl. : 0,21 s · 211 empl. : 0,24 s · 1 011 empl. : 0,789 s** — croissance quasi linéaire | ✅ |
| Fermeture des chronos de minuit (50/500 actifs) | ≤ 60 s pour 500 | — | — | **50 : 1,35 s · 500 : 6,01 s mesuré directement** — croissance linéaire confirmée | ✅ |
| Bornes de pagination abusives (3 actions × 5 cas) | plafond raisonnable, jamais la valeur demandée | — | — | **143-794 ms, toujours plafonné côté serveur** | ✅ |
| Charge concurrente 50 VU | erreurs < 1 %, p95 ≤ 3 s | — | — | non exécuté cette session (k6 absent) | ⏭ |
| Requêtes fréquentes | 0 balayage complet > 10 000 lignes | — | `import_key` : 10 510 lignes examinées | `import_key` : 99 871 lignes examinées | ❌ |

Note sur le tableau de bord : les colonnes « Mesuré » ci-dessus sont les p95 réels obtenus à chaque palier (563 / 10 000 / 100 000 lignes en base), pas une interpolation — le seuil du plan cible spécifiquement le palier 100 000, atteint ici pour les temps bruts. **Le seuil d'exactitude (troncature) est, lui, en échec** dès 10 000 lignes — voir SCAL-02.

## 3. Tableau récapitulatif des cas

| Cas | Titre | Résultat mesuré | Critère | Statut | Preuve |
|---|---|---|---|---|---|
| — | Mesure de référence (563 saisies) | Avant toute génération : tableau de bord mois **p95 176 ms**, trimestre **p95 659 ms**, an **p95 494 ms** ; `entries_returned == entries_total_in_period` partout (aucune troncature, volume sous 1 000). Actions de liste (page 20) toutes **p95 150-275 ms**. | — (référence) | ✅ | `preuves/SCAL/perf_baseline_563.json` |
| SCAL-01 | Génération et vérification du jeu de données | Générateur déterministe et incrémental (`gen_perf_data.php`), marqueur double (`note`/`import_key` préfixés). Palier 10 000 généré en **0,34 s** (hors mise en place ponctuelle de 50 comptes/200 projets/30 clients/15 groupes). **0 chevauchement**, **0 durée négative/nulle**, répartition exacte (200 lignes/employé). Premier essai invalidé (dates ancrées sur une date fixe passée, hors des fenêtres mois/trimestre/an calculées depuis aujourd'hui) — corrigé (ancrage sur aujourd'hui, en remontant en arrière), rejoué après une suppression exacte par préfixe (retour à 563 confirmé, 0 ligne hors préfixe touchée). | Comptages = spec ± 1 % **(✅)** ; 0 ligne hors préfixe supprimée **(✅, démontré)** ; retour au comptage initial **(✅)** | ✅ | `preuves/SCAL/SCAL-01/` |
| SCAL-02 | Tableau de bord : temps et exactitude | **Priorité confirmée dès le palier 10 000** : le plafond de 1 000 lignes (annexe C3) est déjà atteint pour « ce mois » (`entries_returned: 1000` / `entries_total_in_period: 8810`). Vérifié **visuellement dans un vrai navigateur** (Puppeteer) : le bandeau d'avertissement *« Les données affichées sont limitées aux 1000 premières entrées de la période… »* s'affiche bien, juste au-dessus du total — pas de total faux affiché sans avertissement. Temps : mois p95 706 ms, trimestre p95 814 ms, an p95 801 ms — tous sous les seuils à ce palier. **Réserve** : le critère formel (avertissement affiché) est rempli, mais 8 810 saisies/mois pour seulement 50 employés est un **volume normal** pour une PME de cette taille — le total du mois serait donc **faux en permanence** en usage réel, pas seulement dans un cas extrême. Voir recommandation F2 (§6) : calculer les totaux en SQL plutôt que de les dériver d'un échantillon plafonné. | Écart de total = 0 ou avertissement affiché à 100 % des cas de troncature **(✅, vérifié visuellement)** ; p95 conformes **(✅ à 10 000)** ; mais total exact à un volume réaliste **(❌, voir F2)** | ⚠️ | `preuves/SCAL/SCAL-02/dashboard_truncation_warning_10k.png` |
| SCAL-07 | Analyse des index et plans d'exécution | `EXPLAIN` sur 5 requêtes chaudes à 10 510 lignes. **2 confirmées non indexées**, exactement les candidats de l'annexe C4 : la recherche par `import_key` (`type: ALL`, 10 510 lignes examinées — **balayage complet**, invoquée une fois par ligne importée) et la file de validation par `status` (`type: index`, balayage de l'index `date_start` en filtrant `status` à la volée). Les 3 autres (plage de dates du tableau de bord, recherche de chevauchement, notifications) utilisent déjà un index adapté. **Reconfirmé à 100 000** : la recherche `import_key` passe à 99 871 lignes examinées, croissance linéaire comme attendu d'un balayage complet. | 0 balayage complet > 10 000 lignes pour les requêtes fréquentes **(❌, `import_key`)** ; lignes examinées ≤ 10× lignes retournées **(❌ pour `import_key` et `status`)** | ❌ | `preuves/SCAL/SCAL-07/` |
| SCAL-03 | Rapports, listes paginées et exports | À 100 000+ saisies éligibles : toutes les listes paginées (page 20) restent **p95 ≤ 621 ms**, largement sous le seuil. **Export CSV global corrigé (ANO-SCAL-01)** : pagination par curseur, plus de plafond arbitraire — re-mesuré à 100 562 lignes éligibles : **100 562/100 562 reçues, 11 lots, 4,6 s au total**, 0 doublon, aucun fichier partiel possible (un lot en échec interrompt tout). | p95 ≤ 2 s par page de 20 **(✅)** ; export ≤ 30 s **(✅ 4,6 s)** ; export complet à 100 000+ lignes **(✅, corrigé)** | ✅ | `preuves/SCAL/SCAL-03/`, `preuves/SCAL/ANO-SCAL-01-fix/` |
| SCAL-04 | Import Clockify | 5 000 lignes importées avec ~100 000 lignes déjà en base : **384 s mesurés** (dépassement de 220 % du seuil de 120 s), cause confirmée par SCAL-07 (balayage complet par ligne importée, de plus en plus coûteux au fil de l'import). **Le navigateur/client a cessé d'attendre une réponse après ~300 s** (délai réseau standard) alors que le serveur a continué et terminé l'import 84 s plus tard, sans qu'aucune confirmation ne parvienne à l'utilisateur. 5 000/5 000 créées, 0 doublon (`import_key`). | ≤ 120 s, ≤ 256 Mo **(❌ 384 s)** ; croissance ~linéaire **(voir SCAL-10)** | ❌ | `preuves/SCAL/SCAL-04/` |
| SCAL-11 | Interface : poids, chargement, rendu | Build de production mesuré : paquet principal **1 257 ko** (confirme l'ordre de grandeur signalé). Le module d'export PDF (601 ko) est **déjà correctement différé** (`import()` dynamique au clic, vérifié dans le code) — critère déjà satisfait, aucune action nécessaire. Chargement mesuré sous Puppeteer/CDP (réseau « Fast 3G » + CPU ralenti 4×, profils Lighthouse standard, Lighthouse lui-même non installé dans cet environnement) : **5 462 ms** jusqu'au contenu interactif. | Score Lighthouse ≥ 70 **(non mesuré, Lighthouse absent)** ; temps d'interactivité ≤ 5 s **(⚠️ 5,46 s, dépassement de 9 %)** ; module PDF différé **(✅)** | ⚠️ | `preuves/SCAL/SCAL-11/` |
| SCAL-05 | Job d'alertes | **3 paliers mesurés** : 61 employés/4 managers (**0,21 s, 45 req.**), 211 employés/5 managers (**0,24 s, 50 req.**), 1 011 employés/44 managers (**0,789 s, 245 req.**) — croissance quasi linéaire du temps et des requêtes avec le volume, pas de dégradation quadratique. `findManagers()`/`filterActiveAccounts()` confirmés ensemblistes (pas de boucle par compte) ; chemin complet exercé à chaque palier (notifications + emails). | 50/200/1 000 employés ≤ 30 s **(✅ aux 3 paliers, 0,79 s au pire)** | ✅ | `preuves/SCAL/SCAL-05/` |
| SCAL-06 | Fermeture des chronomètres de minuit | **2 paliers mesurés** : 50 chronos actifs (**1,35 s, 554 req.**) et 500 chronos actifs (**6,01 s, 5 504 req.**) — ratio requêtes/ligne stable (~11) aux deux paliers, confirmant une croissance linéaire (traitement par ligne : `fetch()`+`User::fetch()`+`closeSegmentAndOpenNext()` dans une boucle `foreach`, pas un traitement par lot). **100 % corrects aux deux paliers** : tous fermés, tous les nouveaux segments ouverts et liés (`fk_split_previous`). | 100 % des chronomètres fermés correctement **(✅ aux 2 paliers)** ; durée ≤ 60 s pour 500 **(✅ 6,01 s, mesuré directement)** | ✅ | `preuves/SCAL/SCAL-06/` |
| SCAL-12 | Bornes des paramètres de pagination | `per_page`/`page` envoyés à 1 000 000, négatifs, non numériques, page très grande, sur 3 actions paginées (15 combinaisons). **Tous ramenés à un plafond raisonnable** (ex. `per_page` ramené à 100 max, jamais la valeur demandée) ; `page` très grande renvoie simplement une page vide, sans charge excessive. Temps 143-794 ms sur l'ensemble. | Réponse jamais au-dessus du plafond documenté **(✅)** ; temps ≤ 5 s **(✅)** | ✅ | `preuves/SCAL/SCAL-12/` |

## 4. Détail des anomalies

### ANO-SCAL-01 — L'export CSV global tronque silencieusement au-delà de 50 000 lignes — ✅ CORRIGÉE
- **Cas concerné** : SCAL-03
- **Gravité** : Élevé (aucune perte en base, mais un fichier d'export incomplet peut être utilisé tel quel pour une décision — paie, facturation — sans que personne ne s'en aperçoive)
- **Description** : `timeflowBuildGlobalCsvRows()` (`ajax/timeentry.php`) avait une clause `LIMIT 50000` codée en dur, commentée dans le code comme un « filet de sécurité contre une requête non bornée, pas un plafond attendu en usage réel ». À 108 539 lignes éligibles (`date_end IS NOT NULL AND duration > 0`), l'export n'en renvoyait que 50 000 — **58 539 lignes manquantes (54 %)** — sans renvoyer le total réel ni un indicateur de troncature. Le frontend (`ReportsPage.jsx::handleExportGlobalCsv()`) téléchargeait directement ce qu'il recevait, sans jamais vérifier un total ni afficher d'avertissement.
- **Impact (avant correctif)** : un export présenté comme « global » pouvait être silencieusement partiel dès que le volume dépassait 50 000 saisies — risque réel pour toute entreprise de taille moyenne après quelques années d'usage.
- **Cause** : `ajax/timeentry.php`, fonction `timeflowBuildGlobalCsvRows()`, clause `LIMIT 50000` sans comptage total renvoyé au frontend.
- **Correctif appliqué** : `timeflowBuildGlobalCsvRows()` déplacée dans `lib/timeflow.lib.php` (pour être testable), `LIMIT` codée en dur supprimée. Pagination **par curseur** (`WHERE rowid > :afterId ORDER BY rowid LIMIT :lot`, pas par `OFFSET` — immunisé contre une ligne ajoutée/supprimée pendant l'export), lot plafonné à 10 000 côté serveur même si le client en demande plus (cohérent avec SCAL-12). Le frontend boucle jusqu'à épuisement, n'accumule qu'en mémoire et ne déclenche le téléchargement qu'une fois tout reçu ; un lot en échec (réseau, session expirée, 500) interrompt tout, **aucun fichier partiel n'est jamais téléchargé**. Le total annoncé par le premier lot est comparé au nombre de lignes reçues à la fin ; un écart (données modifiées pendant l'export) déclenche un avertissement visible mais ne bloque pas le téléchargement.
- **Test unitaire** : `test/phpunit/timeentryTest.php::testGlobalCsvExportCursorSkipsNothingAndDuplicatesNothingAcrossInsertAndDelete` — crée 4 lignes connues, supprime l'une d'elles et en insère une nouvelle entre deux appels de lot, vérifie que l'export final est exactement {r1, r2, r4, r5}. 26/26 tests de la suite passent.
- **Re-test à l'échelle** (100 562 lignes éligibles, régénérées avec le même marqueur `zz_perf_*`/`import_key zzpf` que la phase 4) : **100 562/100 562 lignes reçues (0 écart), 11 lots, 4,6 s au total**, 0 doublon parmi les 100 000 lignes synthétiques (vérifiées par marqueur unique). Non-régression confirmée sur les 562 lignes de référence (hors données générées) : reçues en un seul lot, total_count exact.
- **Preuve** : `preuves/SCAL/SCAL-03/resultat.json` (avant), `preuves/SCAL/ANO-SCAL-01-fix/resultat.json` (après).
- **Correctif** : appliqué, PR dédiée · **Re-test** : fait, voir ci-dessus

### ANO-SCAL-02 — Import Clockify : le client abandonne avant que le serveur ne termine réellement, sans confirmation visible
- **Cas concerné** : SCAL-04
- **Gravité** : Moyen (pas de perte ni de doublon constaté — `import_key` protège bien — mais expérience utilisateur trompeuse à ce volume)
- **Description** : à ~100 000 lignes déjà en base, un import de 5 000 lignes prend réellement **384 s** côté serveur (cause : SCAL-07/ANO liée à `import_key` non indexé). Le délai réseau du navigateur/client expire après ~300 s sans réponse, alors que le serveur **continue et termine avec succès** 84 s plus tard. L'utilisateur voit une erreur ou un chargement qui semble bloqué, sans savoir que l'import a en réalité réussi.
- **Reproduction** : avec ~100 000 lignes déjà en base, importer un fichier de 5 000 lignes et observer le temps de réponse réel (horodatages des lignes créées) contre le délai d'abandon du client.
- **Impact** : pas de perte de données (confirmé : 5 000/5 000 créées, 0 doublon), mais un administrateur verrait probablement une erreur et pourrait relancer l'import par précaution — sans risque de doublon grâce à `import_key`, mais avec une attente supplémentaire inutile et une confusion évitable.
- **Preuve** : `preuves/SCAL/SCAL-04/resultat.json`.
- **Cause probable** : conséquence directe du défaut mesuré en SCAL-07 (index manquant sur `import_key`) — pas une anomalie indépendante à corriger séparément, elle disparaît si I1 (§6) est appliqué.
- **Recommandation** : corriger d'abord I1 (index `import_key`, §6) ; si le délai reste long à très grand volume, envisager un import asynchrone avec suivi de progression plutôt qu'une requête HTTP synchrone unique.
- **Correctif** : dépend de I1, à planifier après votre relecture · **Re-test** : non encore fait

## 5. Cas non exécutés ou non concluants

- **SCAL-08** (charge concurrente k6) : non exécuté — **k6 n'est pas installé dans cet environnement** ; outil à mettre en place dans une session dédiée.
- **SCAL-09** (intégrité sous écritures concurrentes) : non exécuté, même raison (dépend du même outil de charge pour générer 50 utilisateurs virtuels simultanés).
- **SCAL-13** (ressources conteneurs sous charge) : dépend de SCAL-08 (`docker stats` échantillonné pendant l'essai de charge), non exécuté pour la même raison.
- **SCAL-10** (courbe de croissance, palier 500 000) : **décision confirmée — pas de palier 500 000 cette phase.** Les 3 points déjà mesurés (563/10 000/100 000) montrent une croissance quasi plate pour les lectures indexées et une dégradation marquée pour `import_key` (non indexé) — cohérent avec ce qu'`EXPLAIN` prédit.

## 6. Recommandations non implémentées (index, découpage du paquet, etc.)

### I1 — Index **UNIQUE** sur `import_key` (SCAL-07, sévérité la plus élevée — corrige aussi un risque de doublon)
**Constat** : `SELECT 1 FROM llx_timeflow_timeentry WHERE import_key = ?` fait un balayage complet de table (`EXPLAIN` : `type=ALL`, confirmé à 10 510 lignes). Cette requête tourne une fois **par ligne importée** (`TimeImport::timeEntryAlreadyImported()`) — à 100 000 lignes existantes, un import de 5 000 lignes impliquerait jusqu'à 500 millions d'examens de ligne cumulés.

**Index unique plutôt qu'un index simple** : `import_key` n'a aujourd'hui **aucune contrainte d'unicité** en base — la protection anti-doublon repose entièrement sur une lecture applicative suivie d'une écriture séparée, un cycle qui n'est pas atomique. C'est exactement le risque documenté dans `RAPPORT_PANNES.md` (§6, phase 2) : deux imports simultanés du même fichier pourraient tous les deux passer la vérification avant qu'aucun des deux n'écrive, et créer un vrai doublon. Un index **unique** règle les deux problèmes en un seul changement : il accélère la recherche (même gain qu'un index simple) **et** il transforme ce risque de course en une erreur de clé dupliquée détectable à l'écriture, au lieu d'un doublon silencieux.

**Vérifié en lecture seule sur les données de référence (563 saisies réelles, pas les données générées pour cette phase)**, comme demandé avant de proposer un index unique :
- **(a) 0 doublon** de `import_key` parmi les valeurs non vides.
- **(b) les saisies non importées ont `import_key = NULL`** (9 lignes sur 563), **jamais une chaîne vide** (0 ligne à `''`). C'est la condition qui rend un index unique sûr sans aucune migration de données : MySQL/MariaDB traitent plusieurs `NULL` comme **distincts** dans un index unique (ils ne se bloquent jamais entre eux) — seules les vraies valeurs dupliquées seraient rejetées, et il n'y en a aucune.

**Changement exact proposé**, dans le fichier de montée de version déjà utilisé par le module pour ses index (`sql/llx_timeflow_timeentry.key.sql` — un gabarit pour un index unique y est même déjà présent en commentaire) :
```sql
ALTER TABLE llx_timeflow_timeentry ADD UNIQUE INDEX uk_timeflow_timeentry_import_key (import_key);
```
**Comment ça s'appliquerait sur une installation existante** : aucun script de migration séparé à écrire. Le module charge déjà ses fichiers `.sql`/`.key.sql` via `modTimeFlow::_load_tables('/timeflow/sql/')` (le mécanisme standard Dolibarr ModuleBuilder, déjà vérifié en DISP-08) — il suffit d'ajouter cette ligne au fichier existant ; la prochaine désactivation/réactivation du module (ou une simple réinitialisation de sa structure si Dolibarr l'expose sans désactivation complète) crée l'index. Si des doublons existaient sur une installation réelle (ce qui n'est pas le cas ici), la création échouerait proprement avec une erreur de clé dupliquée au lieu de s'appliquer silencieusement — à vérifier avant d'appliquer en production avec la même requête que ci-dessus.

À tester avant/après (gain de temps mesuré, et test qu'un import concurrent déclenche bien une erreur de clé plutôt qu'un doublon) dans une PR séparée, après votre relecture — non créé ici.

### I2 — Index sur `(status, date_start)` (SCAL-07)
**Constat** : la file de validation (`status = SUBMITTED`) parcourt l'index `date_start` en filtrant `status` à la volée plutôt que d'utiliser un index couvrant directement les deux colonnes.

**Changement exact proposé** :
```sql
CREATE INDEX idx_timeflow_timeentry_status_date ON llx_timeflow_timeentry (status, date_start);
```
Non créé — même procédure que I1.

### F2 — Calculer les totaux du tableau de bord en SQL plutôt que sur un échantillon plafonné (SCAL-02)
**Constat** : `getSummaryReports` charge au plus `$limit` (1 000) lignes puis calcule totaux, répartitions et graphique **en PHP** à partir de cet échantillon (`timeflowBuildSummary($rows, $db)`). Le compteur `entries_total_in_period` existe déjà et déclenche l'avertissement de troncature, mais **le total lui-même reste calculé sur les 1 000 premières lignes seulement** — à 8 810 saisies/mois pour 50 employés (volume réaliste pour une PME de cette taille), le total affiché est donc **structurellement faux**, pas seulement dans un cas extrême.

**Changement proposé** : remplacer le calcul PHP sur l'échantillon par des requêtes d'agrégation SQL (`SUM(duration) ... GROUP BY`) portant sur la période entière, indépendamment du nombre de lignes :
```sql
-- Total de la période (remplace la somme PHP sur $rows)
SELECT SUM(duration) FROM llx_timeflow_timeentry WHERE <mêmes filtres date/projet/client/employé>;
-- Une requête du même type par dimension du graphique (by_project, by_client, by_employee, by_tag, by_status, billable…)
SELECT fk_project, SUM(duration) FROM llx_timeflow_timeentry WHERE <mêmes filtres> GROUP BY fk_project;
```

**Ce que ça impliquerait** :
- **Le total et chaque répartition simple** (par projet, client, employé, facturable, statut) deviennent une requête `GROUP BY` indexée au lieu d'un calcul PHP — exact quel que soit le volume, et rapide (un `GROUP BY` sur une colonne indexée scale bien mieux qu'un `fetchAll` de milliers de lignes).
- **Le graphique « Croiser avec »** (deux dimensions combinées, ex. projet × employé) demande un `GROUP BY` à deux colonnes par combinaison actuellement proposée dans l'interface — plus de requêtes qu'aujourd'hui (une par dimension/croisement affiché plutôt qu'un seul `fetchAll`), mais chacune reste simple et indexée.
- **Les exports PDF et CSV du tableau de bord** (`dashboardPdfExport.js`) ne font **aucun appel réseau propre** — ils reçoivent en paramètre les totaux déjà calculés par la page. Ils deviendraient donc automatiquement exacts dès que `getSummaryReports` lui-même l'est, sans changement séparé à leur faire.
- **La liste de lignes détaillées** (si une vue du tableau de bord en montre une, au-delà des totaux et du graphique) resterait un problème séparé, de la même nature que l'export global tronqué (ANO-SCAL-01) — à vérifier au cas par cas, pas couvert par ce changement.

Non implémenté — à chiffrer et tester (temps de réponse avec plusieurs requêtes d'agrégation contre un seul `fetchAll`) dans une PR séparée, après votre relecture.

### F1 — Découpage du paquet principal par page (SCAL-11)
**Constat** : le paquet principal (1 257 ko) charge d'un bloc les 6 pages de l'application (`frontend/src/App.jsx`) — `DashboardPage`, `TimerPage`, `HistoryPage`, `ReportsPage`, `ValidationPage`, `DailyReportPage` — toutes importées de façon statique, même pour un utilisateur qui n'ouvre jamais « Rapports » ou « Validations ». Le module d'export PDF, lui, est déjà correctement différé (voir SCAL-11) : c'est le même principe à appliquer une page plus haut. Temps de chargement mesuré : 5,46 s sous réseau lent + CPU ralenti, 9 % au-dessus du seuil de 5 s du plan.

**Changement exact proposé**, dans `frontend/src/App.jsx` :
```jsx
// Avant
import DashboardPage from './pages/DashboardPage';
import TimerPage from './pages/TimerPage';
import HistoryPage from './pages/HistoryPage';
import ReportsPage from './pages/ReportsPage';
import ValidationPage from './pages/ValidationPage';
import DailyReportPage from './pages/DailyReportPage';

// Après
import { lazy, Suspense } from 'react';
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const TimerPage = lazy(() => import('./pages/TimerPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const ValidationPage = lazy(() => import('./pages/ValidationPage'));
const DailyReportPage = lazy(() => import('./pages/DailyReportPage'));
// ... puis envelopper les <Route> dans <Suspense fallback={...}>
```
Non implémenté — à tester avant/après (gain de poids du paquet principal et de temps de chargement mesuré) dans une PR séparée, après votre relecture.

*(d'autres recommandations seront ajoutées au fil des cas suivants)*

## 7. Perspectives

- **ANO-SCAL-01 corrigée** (export global tronqué) — était le risque le plus préoccupant trouvé cette phase sur des données réelles d'entreprise à l'échelle.
- Appliquer I1 (index `import_key`) en priorité — corrige directement SCAL-04/ANO-SCAL-02, mesurable avant/après.
- Implémenter F2 (totaux du tableau de bord en SQL) pour lever la réserve ⚠️ sur SCAL-02.
- Exécuter SCAL-08/09/13 dans une session dédiée avec k6 installé (seuls cas encore non couverts, avec SCAL-10/500 000 resté un choix délibéré).
- Rejouer SCAL-02/04/07 après application de I1/I2/F2 pour mesurer le gain réel.
