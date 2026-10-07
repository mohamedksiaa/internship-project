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
- Statuts (mis à jour après correctifs) : ✅ 7 (SCAL-01, 02, 03, 05, 06, 07, 12) · ⚠️ 1 (SCAL-11) · ❌ 1 (SCAL-04)
- Anomalies : 2 (ANO-SCAL-01 Élevé — export global tronqué silencieusement, **✅ corrigée** — voir §4 ; ANO-SCAL-02 Moyen — conséquence directe de l'index manquant sur `import_key`, **✅ corrigée** — voir I1) · 2 corrigées sur 2
- **Conclusion (mise à jour).** Les temps de lecture (tableau de bord, listes paginées) restent rapides même à 100 000 lignes — tous sous les seuils du plan, et les jobs planifiés (alertes, fermeture de minuit) comme les bornes de pagination passent sans anomalie aux volumes testés. **ANO-SCAL-01 (export CSV global tronqué) est corrigée** : pagination par curseur, plus de plafond arbitraire, re-mesurée à 100 562 lignes sans écart (voir §4). **Le tableau de bord (SCAL-02) est également corrigé (F2)** : totaux/graphique/croisements calculés par agrégation SQL exacte, p95 sous 2 s à 100 562 lignes, exactitude vérifiée contre du SQL brut indépendant. **I1+I2 appliqués** : la recherche `import_key` passe de `type: ALL` (99 871 lignes examinées) à `type: const` (1 ligne), ce qui referme aussi le risque de doublon d'import déjà documenté en phase 2 (vérifié par un test de concurrence réel, 0 doublon). **Le point restant** : l'import total reste au-dessus du seuil (313 s contre 384 s avant, −18 %, toujours > 120 s) — la requête `import_key` n'était pas le seul coût ; chaque ligne importée exécute plusieurs autres requêtes séquentielles (vérification de chevauchement, audit) dont le coût cumulé domine maintenant, une piste distincte non traitée dans cette session.

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
| SCAL-02 | Tableau de bord : temps et exactitude | **Corrigé (F2)** : les totaux/graphique/croisements sont désormais calculés par une agrégation SQL exacte sur la période entière (plus d'échantillon plafonné à 1 000 lignes). Le fetch plafonné restant (conservé uniquement pour `by_group`/`by_tag`, non lus par l'interface) a ensuite été retiré — confirmé par recherche dans tout le frontend — ce qui a fait chuter le p95 à 100 562 lignes de **973 ms à 196 ms (mois)** et de **1 083 ms à 277 ms (année)**, sous le seuil de 2 s avec une marge confortable. Total exact confirmé par SQL brut indépendant (**0 écart**). Test d'équivalence PHPUnit (4 combinaisons de filtres) confirme l'ancien et le nouveau calcul identiques champ par champ, y compris chronos actifs, saisies supprimées et saisies à cheval sur les bornes de période. Test de droits dédié : deux employés non-readall avec de vraies saisies distinctes reçoivent chacun exactement leur propre somme. | Écart de total = 0 **(✅, vérifié contre SQL brut)** ; p95 ≤ 2 s **(✅ 196/277 ms)** | ✅ | `preuves/SCAL/SCAL-02/dashboard_truncation_warning_10k.png` (avant), `preuves/SCAL/SCAL-02-fix/resultat.json` (après) |
| SCAL-07 | Analyse des index et plans d'exécution | **Corrigé (I1+I2)**. `EXPLAIN` avait confirmé 2 requêtes non indexées à 10 510 puis 99 871 lignes (balayage complet croissant linéairement). Après activation des deux index : `import_key` passe à **`type: const`, 1 ligne examinée** ; la file de validation par `status` passe à **`type: ref`** sur le nouvel index composite `(status, date_start)`. | 0 balayage complet > 10 000 lignes pour les requêtes fréquentes **(✅, les deux corrigées)** | ✅ | `preuves/SCAL/SCAL-07/` (avant), `preuves/SCAL/I1-I2/` (après) |
| SCAL-03 | Rapports, listes paginées et exports | À 100 000+ saisies éligibles : toutes les listes paginées (page 20) restent **p95 ≤ 621 ms**, largement sous le seuil. **Export CSV global corrigé (ANO-SCAL-01)** : pagination par curseur, plus de plafond arbitraire — re-mesuré à 100 562 lignes éligibles : **100 562/100 562 reçues, 11 lots, 4,6 s au total**, 0 doublon, aucun fichier partiel possible (un lot en échec interrompt tout). | p95 ≤ 2 s par page de 20 **(✅)** ; export ≤ 30 s **(✅ 4,6 s)** ; export complet à 100 000+ lignes **(✅, corrigé)** | ✅ | `preuves/SCAL/SCAL-03/`, `preuves/SCAL/ANO-SCAL-01-fix/` |
| SCAL-04 | Import Clockify | **Re-mesuré après I1** : 5 000 lignes importées avec ~100 562 lignes déjà en base : **313 s** (contre 384 s avant, −18 %) — toujours au-dessus du seuil de 120 s. `EXPLAIN` confirme que la requête ciblée par I1 est corrigée (`type: ALL` → `type: const`, 1 ligne examinée au lieu de 99 871), mais ce n'était pas le seul coût : chaque ligne exécute aussi une vérification de chevauchement, un `fetch()`, un `update()` et 2 écritures d'audit — plusieurs requêtes séquentielles par ligne, indépendantes de tout index, qui dominent maintenant le temps total. I1 corrige la **dégradation avec le volume**, pas le coût plancher ligne par ligne (piste distincte, non traitée ici). 5 000/5 000 créées, 0 doublon (`import_key`). Le client a de nouveau cessé d'attendre après ~300 s alors que le serveur continuait (même comportement qu'avant, ANO-SCAL-02 non ré-ouverte : déjà documentée, pas aggravée). | ≤ 120 s, ≤ 256 Mo **(❌ 313 s, amélioré mais toujours au-dessus)** ; cause SCAL-07 corrigée **(✅, voir EXPLAIN)** | ❌ | `preuves/SCAL/SCAL-04/` (avant), `preuves/SCAL/I1-I2/` (après) |
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
- **Correctif de suivi** : la pagination par curseur fait arriver les lots dans l'ordre du `rowid`, pas celui de `date_start` attendu par l'utilisateur (comportement de l'export avant ANO-SCAL-01). Le frontend re-trie désormais toutes les lignes par date/heure de début une fois tous les lots reçus (tri stable, `rowid` comme critère de départage implicite). Vérifié dans un vrai navigateur sur les 562 lignes de référence : 0 inversion, ordre strictement croissant du 07/01/2026 au 25/09/2026. Nouveau test frontend dédié.
- **Preuve** : `preuves/SCAL/SCAL-03/resultat.json` (avant), `preuves/SCAL/ANO-SCAL-01-fix/resultat.json` (après).
- **Correctif** : appliqué, PR dédiée (+ PR de suivi pour le tri) · **Re-test** : fait, voir ci-dessus

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

### I1 — Index **UNIQUE** sur `import_key` (SCAL-07, sévérité la plus élevée — corrige aussi un risque de doublon) — ✅ IMPLÉMENTÉ
**Constat** : `SELECT 1 FROM llx_timeflow_timeentry WHERE import_key = ?` fait un balayage complet de table (`EXPLAIN` : `type=ALL`, confirmé à 10 510 lignes). Cette requête tourne une fois **par ligne importée** (`TimeImport::timeEntryAlreadyImported()`) — à 100 000 lignes existantes, un import de 5 000 lignes impliquerait jusqu'à 500 millions d'examens de ligne cumulés.

**Index unique plutôt qu'un index simple** : `import_key` n'a aujourd'hui **aucune contrainte d'unicité** en base — la protection anti-doublon repose entièrement sur une lecture applicative suivie d'une écriture séparée, un cycle qui n'est pas atomique. C'est exactement le risque documenté dans `RAPPORT_PANNES.md` (§6, phase 2) : deux imports simultanés du même fichier pourraient tous les deux passer la vérification avant qu'aucun des deux n'écrive, et créer un vrai doublon. Un index **unique** règle les deux problèmes en un seul changement : il accélère la recherche (même gain qu'un index simple) **et** il transforme ce risque de course en une erreur de clé dupliquée détectable à l'écriture, au lieu d'un doublon silencieux.

**Vérifié en lecture seule sur les données de référence (563 saisies réelles, pas les données générées pour cette phase)**, comme demandé avant de proposer un index unique :
- **(a) 0 doublon** de `import_key` parmi les valeurs non vides.
- **(b) les saisies non importées ont `import_key = NULL`** (9 lignes sur 563), **jamais une chaîne vide** (0 ligne à `''`). C'est la condition qui rend un index unique sûr sans aucune migration de données : MySQL/MariaDB traitent plusieurs `NULL` comme **distincts** dans un index unique (ils ne se bloquent jamais entre eux) — seules les vraies valeurs dupliquées seraient rejetées, et il n'y en a aucune.

**Changement exact proposé**, dans le fichier de montée de version déjà utilisé par le module pour ses index (`sql/llx_timeflow_timeentry.key.sql` — un gabarit pour un index unique y est même déjà présent en commentaire) :
```sql
ALTER TABLE llx_timeflow_timeentry ADD UNIQUE INDEX uk_timeflow_timeentry_import_key (import_key);
```
**Comment ça s'applique sur une installation existante** : aucun script de migration séparé — le module charge déjà ses fichiers `.sql`/`.key.sql` via `modTimeFlow::_load_tables('/timeflow/sql/')` (le mécanisme standard Dolibarr ModuleBuilder, déjà vérifié en DISP-08). Appliqué sur le Docker de test via désactivation puis réactivation (`core/lib/admin.lib.php::unActivateModule()`/`activateModule()`, les mêmes fonctions que la page `admin/modules.php`) : **0 erreur, index confirmé présent par `SHOW INDEX`** (`Non_unique=0`).

**Piège découvert et documenté** : Dolibarr tolère **silencieusement** l'échec d'un `ADD UNIQUE INDEX` si des doublons existent déjà — l'erreur MySQL 1062 est mappée en `DB_ERROR_RECORD_ALREADY_EXISTS`, qui fait partie de la liste par défaut d'erreurs que `run_sql()` traite comme sans conséquence (ni message à l'écran, ni ligne de log, confirmé identique sur Dolibarr 19.0.2 et 22.0.4). `admin/setup.php` ajoute désormais un contrôle visible (`SHOW INDEX`) qui avertit si l'index est absent, avec la requête de détection des doublons à exécuter — seul signal qu'un administrateur aurait jamais eu autrement.

**Comportement de l'import après l'index** : si deux imports simultanés du même fichier se font concurrence, le second reçoit l'erreur 1062 sur l'INSERT. Détecté via `$timeentry->errors` contenant `'ErrorRefAlreadyExists'` (la chaîne que `CommonObject::createCommon()` y pousse spécifiquement pour ce cas — pas le texte de l'erreur, que `createCommon()` a déjà remplacé par cette chaîne générique à ce stade) **plutôt que `$db->lasterrno()` seul** : ce dernier est partagé par toute la connexion et reste figé sur le dernier VRAI échec SQL, même sans rapport, si l'appel en cours échoue sans jamais toucher la base (dates invalides, projet fermé...) — un cas réel trouvé par le test PHPUnit lui-même. La ligne est comptée « déjà importée », **sans interrompre l'import**.

**Mesure avant/après (SCAL-04)** : réimport de 5 000 lignes contre ~100 562 lignes existantes : **313 s** (contre 384 s avant I1, −18 %). `EXPLAIN` confirme le changement structurel : `SELECT 1 FROM llx_timeflow_timeentry WHERE import_key = ?` passe de `type=ALL` (99 871 lignes examinées) à **`type=const`, 1 ligne examinée**. Le gain sur le temps total reste modeste parce que **l'essentiel du temps n'était pas cette seule requête** — chaque ligne importée exécute aussi `hasTimeOverlap()`, un `fetch()`, un `update()` et 2 écritures d'audit, dont le coût cumulé (plusieurs requêtes séquentielles par ligne, indépendant de tout index) domine désormais. I1 corrige le risque de **dégradation avec le volume** (confirmé par `EXPLAIN`), pas le coût plancher de l'import ligne par ligne — une piste d'amélioration distincte, hors périmètre de cette PR.

**Test de concurrence réel** (Docker, deux imports simultanés du même fichier de 20 lignes) : **0 doublon en base** (20 lignes, 20 `import_key` distincts), compteurs cohérents entre les deux rapports — 10+10 créées = 20 (chaque ligne créée une seule fois), 8+9 déjà importées, **2+1 rejetées par chevauchement horaire** (`hasTimeOverlap()`, qui s'exécute *avant* l'insertion protégée par l'index — un chemin de course différent et préexistant, hors périmètre d'I1) : dans les deux cas, **0 doublon créé, import non interrompu**. Détail : `preuves/SCAL/I1-I2/resultat.json`.

**Test PHPUnit** (`test/phpunit/timeimportTest.php`) : reproduit la course en un seul thread (insertion du « gagnant » dans l'intervalle exact entre la vérification `timeEntryAlreadyImported()` et l'insertion du « perdant ») — échec confirmé, code d'erreur structuré, exactement 1 ligne en base, aucune trace orpheline (audit/modification). Un second test confirme l'absence de faux positif sur un échec sans rapport. 81/81 tests de la suite passent (1 skip préexistant).

**Non-régression** : 563 lignes de référence toujours 0 doublon après activation de l'index.

### I2 — Index sur `(status, date_start)` (SCAL-07) — ✅ IMPLÉMENTÉ
**Constat** : la file de validation (`status = SUBMITTED`) parcourait l'index `date_start` en filtrant `status` à la volée plutôt que d'utiliser un index couvrant directement les deux colonnes.

**Changement appliqué** :
```sql
ALTER TABLE llx_timeflow_timeentry ADD INDEX idx_timeflow_timeentry_status_date_start (status, date_start);
```
**EXPLAIN après** : `SELECT rowid FROM llx_timeflow_timeentry WHERE status = ? ORDER BY date_start DESC LIMIT 20` passe de `type=index` (balayage complet de l'index `date_start`) à **`type=ref`**, utilisant directement le nouvel index composite.

### F2 — Calculer les totaux du tableau de bord en SQL plutôt que sur un échantillon plafonné (SCAL-02) — ✅ IMPLÉMENTÉ
**Constat (avant correctif)** : `getSummaryReports` chargeait au plus `$limit` (1 000) lignes puis calculait totaux, répartitions et graphique **en PHP** à partir de cet échantillon. À 8 810 saisies/mois pour 50 employés (volume réaliste pour une PME de cette taille), le total affiché était **structurellement faux**, pas seulement dans un cas extrême.

**Changement appliqué** : une seule requête SQL au grain le plus fin utile au graphique — `GROUP BY fk_project, fk_user, billable, status` avec `SUM(duration)`/`COUNT(*)` — d'où toutes les dimensions simples et les 6 croisements proposés par l'interface (`project`/`employee`/`client`/`billable`, `crossDimensions.js`) sont dérivés en PHP par un simple repli, sans recalculer de requête par dimension. Choix validé par mesure contre l'alternative à 8-11 requêtes séparées (une par dimension/croisement) : sur 100 562 lignes filtrées, **61,5 ms / 419 lignes** pour la requête unique contre **492,9 ms** pour 8 requêtes séparées qui rebalaient chacune les mêmes lignes — 5 à 8× plus lent selon le palier. Détail dans `lib/timeflow.lib.php::timeflowBuildSummaryFromAggregates()`.

**Ce qui a changé** :
- Total, `by_project`, `by_client`, `by_user`, les 6 croisements et `by_status` : agrégats SQL exacts, indépendants du volume.
- `by_group`/`by_tag` : **inchangés**, toujours calculés sur l'ancien chemin à échantillon plafonné — ni l'un ni l'autre n'est une dimension du sélecteur "Dimension"/"Croiser avec" de l'interface aujourd'hui, et la multi-appartenance aux groupes / le format texte libre des tags ne se prêtent pas à un simple `GROUP BY`.
- Plafond de 1 000 lignes et bandeau d'avertissement de troncature (`DashboardPage.jsx`) : **retirés** — plus aucun total/graphique affiché ne peut être partiel.
- Exports PDF/CSV du tableau de bord (`dashboardExport.js`/`dashboardPdfExport.js`) : aucun changement nécessaire, ils consomment le même objet `summary` que l'écran, devenu exact automatiquement.

**Suivi (après relecture)** : `getSummaryReports` gardait encore un `fetchAll()` plafonné à 1 000 lignes + un appel à `timeflowBuildSummary()`, uniquement pour calculer `by_group`/`by_tag`. Recherche dans tout le frontend (`DashboardPage.jsx`, `CustomChartWidget.jsx`, `dashboardExport.js`, `dashboardPdfExport.js`, `ReportsPage.jsx`) : **aucun écran ni export ne lit `by_group`, `by_tag`, `group_labels`, `entries_returned` ni `entries_total_in_period`** (`'group'` a déjà été retiré des dimensions sélectionnables de `crossDimensions.js`, `'tag'` n'y a jamais figuré). Ce fetch représentait à lui seul **~300 ms** du p95 mesuré à 100 562 lignes. Supprimé : ces 5 champs sont désormais renvoyés vides/`null`, documentés comme non calculés. `timeflowBuildSummary()` n'est pas supprimée — elle ne sert plus que de référence « ancien calcul » pour le test d'équivalence.

**Test d'équivalence** : `test/phpunit/timeentryTest.php::testDashboardSummaryAggregateMatchesLegacyComputation` — compare champ par champ l'ancien calcul et le nouveau sur un projet de test dédié, sur **4 combinaisons de filtres** (un projet + un mois ; aucun filtre, période seule ; filtre par employé ; `only_validated`), couvrant un chrono actif (`date_end NULL`), une saisie validée puis soft-supprimée, une saisie avant la période, une saisie à cheval sur la fin de période (incluse avec sa durée complète, non tronquée) et un second employé pour que le filtre employé ait réellement quelque chose à exclure.

**Test de droits dédié** : `testDashboardSummaryAggregateRestrictsNonReadallUserToTheirOwnEntriesOnly` — deux employés non-readall, chacun avec de **vraies saisies distinctes** (6 300 s et 3 600 s), vérifie que chacun reçoit exactement sa propre somme — contrairement à un test avec un compte sans aucune saisie, celui-ci détecterait un bug renvoyant toujours 0, ou mélangeant les deux employés. 28/28 tests passent.

**Re-test à l'échelle** (100 562 lignes éligibles) : p95 **196 ms (mois)**, **277 ms (année)** après suppression du fetch inutile (contre 973 ms/1 083 ms juste après le premier correctif, et 652 ms/801 ms avant tout correctif — le résultat final est donc plus rapide qu'avant F2, pas seulement exact). Exactitude vérifiée contre du SQL brut indépendant : total annuel (363 756 202 s), `by_project[92]` (3 083 195 s) et `by_user[1]` (16 252 s) — **0 écart** sur les trois.

**Preuve** : `preuves/SCAL/SCAL-02-fix/resultat.json`.

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
- **F2 implémenté** (totaux du tableau de bord en SQL) — SCAL-02 repasse à ✅.
- **I1+I2 implémentés** — SCAL-07 repasse à ✅, ANO-SCAL-02 corrigée. SCAL-04 reste ❌ (313 s, toujours > 120 s) : la cause restante (plusieurs requêtes séquentielles par ligne importée, hors index) est une piste distincte à chiffrer dans une session dédiée — ex. regrouper les écritures d'audit, ou traiter l'import par lots plutôt que ligne par ligne.
- Exécuter SCAL-08/09/13 dans une session dédiée avec k6 installé (seuls cas encore non couverts, avec SCAL-10/500 000 resté un choix délibéré).
