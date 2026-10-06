# Rapport de tests — Disponibilité

| | |
|---|---|
| **Date d'exécution** | 2026-10-06 (début → en cours) |
| **Environnement** | Docker de test `docker-timeflow-test`, Dolibarr 19.0.2, commit du module au démarrage de cette phase `11f96cf3` (PR #51 fusionnée) |
| **Exécutant** | Claude Code, sous la supervision du responsable |
| **Clone Docker remis sur `main`** | en cours — confirmé en fin de phase |

Règles spécifiques à cette phase (rappel) : seuls les conteneurs `timeflow-dolibarr`, `timeflow-dolibarr-cron`, `timeflow-mariadb`, `timeflow-mailpit` peuvent être arrêtés/redémarrés/tués — jamais un autre conteneur, jamais `docker compose down -v`, jamais de suppression de volume ou d'image. Chaque cas destructif (⚠) est annoncé avant exécution, avec vérification des 4 conteneurs "Up" + HTTP 200 après. `docker-compose.yml` et la configuration Apache/PHP ne sont **pas modifiés** — toute recommandation (healthcheck, politique de redémarrage, version d'image figée) est documentée avec le changement exact proposé, jamais appliquée. La base de données n'est **jamais restaurée par l'exécutant** — seule la procédure est préparée. La désactivation/réactivation du module est annoncée avant, avec comptages avant/après. L'essai de 24h (DISP-10) reste optionnel, non lancé sans accord explicite. Anomalies documentées, pas corrigées.

## 1. Résumé

- Cas prévus : 12 · exécutés : 8 (DISP-01, 02, 03, 04, 05, 08, 09, 11) · préparés sans exécution (procédure seule) : 2 (DISP-06, 07) · non exécutés : 2 (DISP-10 optionnel, DISP-12 sans objet — un seul environnement 19.0.2 disponible)
- Statuts : ✅ 4 (DISP-01, 02, 08, 09) · ⚠️ 3 (DISP-03, 04, 05 — testés avec une réserve) · ℹ️ informatif 1 (DISP-11)
- Anomalies : 2 réelles (ANO-DISP-02 Faible, ANO-DISP-03 Moyen) · 1 **invalidée après vérification** (ANO-DISP-01 — erreur de méthode de test, voir §3, gardée pour mémoire) · 0 corrigée (consigne : documentées, pas corrigées en phase de disponibilité)
- **Conclusion.** Le redémarrage propre (DISP-01), la politique de redémarrage pour un vrai plantage (DISP-02, rejoué avec un OOM-kill réel après correction de méthode), la pile complète (DISP-03) et la désactivation/réactivation du module (DISP-08) sont tous fiables, sans perte de donnée. La sauvegarde fonctionne réellement et couvre 100 % des tables du module (DISP-05), avec deux réserves mineures côté cœur Dolibarr. Aucune perte ni corruption de données constatée dans aucun des cas destructifs exécutés.

## 2. Tableau récapitulatif

| Cas | Titre | Résultat mesuré | Critère | Statut | Preuve |
|---|---|---|---|---|---|
| DISP-04 | Sondes de santé | Lecture de `docker-compose.yml` + `docker inspect` : seul `mariadb` a une sonde déclarée (compose) ; `mailpit` en a une **intégrée à l'image** (`/mailpit readyz`), pas déclarée dans compose ; `dolibarr` et `dolibarr-cron` n'en ont **aucune**. Simulation réelle : fichier PHP en erreur fatale déposé sur le clone (`disp04_broken_test.php`, supprimé après test) → la requête renvoie **HTTP 500** (vraie panne applicative), mais `docker ps`/`docker inspect` affichent `dolibarr` comme `Up`/`running`, **sans aucun signal d'anomalie** — Docker ne peut pas voir une panne applicative sur ce service. | Tableau sonde/service complété **(✅)** ; recommandation chiffrée **(✅, voir §5)** | ℹ️ informatif | — |
| DISP-01 | Redémarrage propre de chaque conteneur | `docker restart` sur les 4 conteneurs, un par un, sonde 1 s : **dolibarr 1,85 s**, **mailpit 1,0 s**, **dolibarr-cron 1,75 s** (process actif), **mariadb 13,2 s** (jusqu'à `healthy`). Comptages sur 9 tables `llx_timeflow_*` identiques avant/après (ex. `timeentry` 567/567, `timeentry_modification` 6012/6012). Journaux post-retour : 0 nouvelle erreur attribuable à ce test (une ligne d'erreur HTTP 500 dans les logs dolibarr vient du test DISP-04 qui précède, une ligne de panne base dans les logs cron est horodatée avant le début de cette séquence — résidu d'un test antérieur dans la session). | RTO ≤ 60 s web/cron/mail **(✅)** ; RTO ≤ 120 s base **(✅ 13,2 s)** ; comptages identiques **(✅)** ; 0 erreur attribuable **(✅)** | ✅ | — |
| DISP-02 | Plantage brutal et politique de redémarrage | **Premier essai invalidé** : `docker kill` sur les 4 conteneurs séparément → aucun n'a redémarré seul — mais `docker kill` est compté par Docker comme un arrêt volontaire, que `unless-stopped` ignore par conception (voir ANO-DISP-01, requalifiée). **Rejoué avec un vrai plantage** (`docker update --memory=<sous l'empreinte réelle>`, OOM-kill déclenché par le noyau, jamais de `docker kill`/`stop`) : `mailpit` `RestartCount` 0→7, `dolibarr` 0→1, `mariadb` 0→6 (`CHECK TABLE` OK après), tous revenus seuls, sans aucune action manuelle. `dolibarr-cron` non concluant (empreinte trop légère pour forcer un OOM même à la limite minimale Docker). | Relance sans intervention **(✅ 3/4 confirmés, 1/4 non concluant)** ; `CHECK TABLE` sans erreur **(✅)** | ✅ | — |
| DISP-03 | Redémarrage complet de la pile et ordre de démarrage | `docker compose stop` (note : `dolibarr-cron` a mis plus que le délai de grâce et est sorti en 137, les 3 autres en 0) puis `docker compose start` — `mariadb` et `dolibarr` démarrent **simultanément** (`depends_on` sans condition de santé, confirmé par lecture de `docker-compose.yml`). Sonde HTTP à 1 Hz pendant 60 s après le démarrage : **200 dès la première seconde, aucune fenêtre d'erreur mesurée** — l'image `dolibarr` semble gérer elle-même l'attente de la base avant de servir Apache. `docker logs` cron sur cette fenêtre : aucune exécution de job (aucun tic de 5 min ne tombait dans la fenêtre observée, donc non concluant sur « tâche cron à vide »). Comptage `timeentry` inchangé (567). | Service nominal en ≤ 5 min **(✅, immédiat)** ; 0 donnée altérée **(✅)** ; fenêtre d'erreur mesurée et rapportée **(✅, 0 s mesurée — voir réserve)** | ⚠️ | — |
| DISP-05 | Sauvegarde : activation, exécution, contenu | Job « Sauvegarde locale de base » (rowid 3, `MakeLocalDatabaseDumpShort`) **activé via le vrai mécanisme admin** (`cron/card.php?action=activate`), exécuté via `cron_run_jobs.php` (identique au mécanisme réel du conteneur cron). Fichier produit sur `/var/www/documents/admin/backup/` — **volume nommé persistant** `dolibarr_documents`, pas l'intérieur éphémère du conteneur. 1,86 Mo, marqueur de fin propre (pas de troncature). **15/15 tables `llx_timeflow_*` présentes**, 566 séparateurs de lignes pour `timeentry` = 567 lignes réelles. Relancé 7 fois au total en < 2 min : **seulement 2 fichiers distincts** — le nom de fichier a une granularité **par minute**, donc plusieurs exécutions dans la même minute s'écrasent silencieusement (limite du test : ne reproduit pas un espacement réaliste). Lecture du code cœur (`Utils::dumpDatabase()`) : le mot de passe **est bien passé en ligne de commande** à `mysqldump` (confirmé par le filtrage explicite de l'avertissement mysqldump correspondant) — comportement du cœur, non modifiable. | Fichier produit à chaque exécution **(✅, hors collision de nom)** ; 100 % des tables du module présentes **(✅)** ; taille cohérente **(✅)** ; stocké sur volume persistant **(✅)** | ⚠️ | `preuves/DISP/DISP-05/` |
| DISP-08 | Désactivation puis réactivation du module | Comptages sur 9 tables + 2 tâches planifiées + 13 constantes `TIMEFLOW_*` relevés avant ; désactivation puis réactivation via le **vrai mécanisme admin** (`admin/modules.php?action=reset\|set&value=modTimeFlow`, compte superadmin réel, pas une manipulation directe de la base). Après réactivation : **2 tâches planifiées exactement (pas 4)**, mêmes rowid (1, 6) ; **13/13 constantes identiques** ; **9/9 comptages de tables identiques** (ex. `timeentry` 567/567) ; application de nouveau accessible (200). Observation (non bloquante) : pendant la désactivation, `timeflowindex.php` pour un utilisateur connecté renvoie une page Dolibarr standard **vide** (menu seul, aucun message explicite "module désactivé") plutôt qu'un message clair — à rapprocher de DISP-11. | Comptages identiques **(✅)** ; 2 tâches planifiées exactement **(✅)** ; réglages inchangés **(✅)** | ✅ | — |
| DISP-09 | Mode dégradé | Scénario type (démarrer/arrêter un chrono, tableau de bord, soumettre) rejoué pour chaque dépendance coupée séparément. **Mailpit arrêté** (déjà PAN-04, phase 2) : application utilisable, notification créée, email en `failed` puis retenté avec succès au retour. **Cron arrêté** (nouveau) : démarrer/arrêter un chrono, consulter le tableau de bord, soumettre — **tout fonctionne (200/success)** ; seules les tâches planifiées (détection de retard, découpage de minuit) ne tournent pas pendant l'arrêt. **Base arrêtée** (déjà PAN-01, phase 2) : application indisponible (HTTP 202, page du cœur, pas de message TimeFlow) — voir ANO-PANNES-01, déjà corrigé côté frontend (message traduit) en PR n° 50. | Matrice conforme à l'attendu **(✅)** ; 0 perte de donnée **(✅)** | ✅ | `preuves/PANNES/PAN-01/`, `preuves/PANNES/PAN-04/` |
| DISP-11 | Observabilité | Synthèse des pannes provoquées en phases 2 et 3 (tableau ci-dessous). Les pannes applicatives (import, chrono) sont **désormais visibles** dans la réponse HTTP elle-même (503 + code + détail, PR n° 49/50/52) — diagnostic immédiat, pas d'enquête. Les pannes **infrastructure** (conteneur arrêté/planté) sont visibles uniquement via `docker ps`/`docker inspect` — **aucune alerte ne pousse l'information**, il faut aller la chercher. Le cœur Dolibarr (page 202) est visible à l'écran mais sans code machine exploitable. Voir le tableau et la recommandation en §5. | 100 % des pannes identifiables en < 5 min **(✅, en sachant où chercher)** ; manques listés **(✅, voir §5)** | ℹ️ informatif | — |

## 3. Détail des anomalies

### ANO-DISP-01 — requalifiée : erreur de méthode de test, pas une anomalie du produit (gardée ici, instructive)
- **Cas concerné** : DISP-02
- **Statut** : ❌ **invalidée** — ce n'est pas une anomalie du module ni de l'environnement, signalé et vérifié par le responsable.
- **Description initiale (gardée pour mémoire)** : `docker kill` (SIGKILL) sur chacun des 4 conteneurs séparément, sans action manuelle, montrait dans les 4 cas `Exited (137)`, `RestartCount=0` — aucun n'était revenu seul.
- **Explication réelle** : `docker kill`/`docker stop` sont enregistrés par Docker comme un **arrêt intentionnel de l'utilisateur**. La politique `unless-stopped` est documentée pour **ignorer précisément ce cas** : elle ne relance jamais un conteneur que l'utilisateur a explicitement arrêté/tué via l'API Docker — c'est le sens même de « unless stopped ». Le test initial simulait donc un arrêt volontaire, pas un plantage.
- **Re-test avec un vrai plantage (sans `docker kill`)** : tuer le PID 1 *depuis l'intérieur* du conteneur s'est révélé sans effet (`docker exec <conteneur> kill -9 1` : sortie 0, aucun changement) — le noyau Linux ignore tout signal, y compris SIGKILL, envoyé à l'« init » d'un espace de noms PID tant qu'il n'a pas de gestionnaire installé pour ce signal. Utilisé à la place une **vraie cause de plantage initiée par le noyau** : `docker update --memory=<valeur sous l'empreinte réelle>` pour forcer un **OOM-kill**, sans jamais appeler `docker kill`/`stop` moi-même.
  - `timeflow-mailpit` (empreinte ~12 Mo) → limite 8 Mo : **`RestartCount` 0→7 en quelques secondes**, `OOMKilled=true` confirmé, revenu `running`, HTTP 200 après restauration de la limite.
  - `timeflow-dolibarr` (empreinte ~21 Mo) → limite 16 Mo : **`RestartCount` 0→1**, revenu `Up`, HTTP 200.
  - `timeflow-mariadb` (empreinte ~211 Mo) → limite 120 Mo : **`RestartCount` 0→6**, revenu `healthy`, `CHECK TABLE` OK sur les tables du module, 0 corruption.
  - `timeflow-dolibarr-cron` : empreinte trop légère (~2 Mo) pour déclencher un OOM même à la limite minimale autorisée par Docker (6 Mo) au repos — **non concluant pour ce conteneur spécifiquement**, faute d'une charge active au moment du test ; les 3 autres suffisent à confirmer le mécanisme.
- **Conclusion confirmée** : la politique `restart: unless-stopped` **fonctionne correctement** pour un vrai plantage (initié par le noyau, pas par une commande Docker explicite), sur 3 conteneurs sur 4 testés avec succès (le 4ᵉ non concluant par manque de charge, pas par échec du mécanisme).
- **Leçon de méthode** : pour simuler un plantage dans un futur test, ne jamais utiliser `docker kill`/`docker stop` (comptés comme arrêt volontaire) ; utiliser une cause réelle (OOM via `docker update --memory`, erreur fatale du processus lui-même, etc.).

### ANO-DISP-02 — Le nom de fichier de sauvegarde a une granularité à la minute : des exécutions rapprochées s'écrasent
- **Cas concerné** : DISP-05
- **Gravité** : Faible (perte de rétention uniquement si le job est planifié à moins d'une minute d'intervalle, ce qui n'est pas un usage réaliste)
- **Description** : `Utils::dumpDatabase()` nomme le fichier `mysqldump_<version>_<AAMMJJHHMM>.sql` — deux exécutions dans la même minute produisent le même nom et la seconde écrase la première, sans avertissement. Observé : 7 exécutions en moins de 2 minutes → seulement 2 fichiers distincts conservés.
- **Reproduction** : relancer le job (`cron_run_jobs.php ... 3 --force`) plusieurs fois en moins d'une minute ; comparer `ls` avant/après.
- **Impact** : aucune perte constatée dans un usage normal (planification réaliste : quotidienne) ; la rotation `keeplastnfiles=10` ne protège pas contre ce cas puisque le fichier est remplacé avant même d'atteindre la limite de rétention.
- **Cause** : comportement du cœur Dolibarr (`core/class/utils.class.php`), granularité du format de date utilisé pour le nom de fichier.
- **Recommandation** : si des exécutions manuelles rapprochées sont attendues (tests, diagnostics), le signaler aux opérateurs ; sinon, aucune action nécessaire pour une planification quotidienne normale.
- **Correctif** : non applicable (cœur Dolibarr, hors périmètre du module).

### ANO-DISP-03 — Le mot de passe de connexion à la base est passé en clair sur la ligne de commande `mysqldump`
- **Cas concerné** : DISP-05
- **Gravité** : Moyen (fenêtre d'exposition brève, mais réelle, à tout utilisateur pouvant lister les processus du conteneur pendant l'exécution)
- **Description** : `Utils::dumpDatabase()` construit la commande `mysqldump` avec le mot de passe en paramètre de ligne de commande, confirmé par le filtrage explicite, dans le code, de l'avertissement que `mysqldump` émet précisément dans ce cas (*"Warning: Using a password on the command line interface can be insecure."*). Le mot de passe est donc visible via `ps aux` (ou équivalent) pendant la brève durée de l'exécution.
- **Reproduction** : lecture du code source (`core/class/utils.class.php`, fonction `dumpDatabase()`) ; non vérifié en direct via `ps aux` dans cette session (fenêtre d'exécution trop courte pour l'observer de façon fiable).
- **Impact** : nécessite un accès déjà présent à l'intérieur du conteneur ou à son espace de noms de processus pour être exploité — pas une exposition externe.
- **Cause** : comportement du cœur Dolibarr, pas du module TimeFlow — **non modifiable sans toucher au cœur**, exclu par consigne.
- **Recommandation** : si le niveau de risque est jugé significatif pour l'environnement de production réel, envisager un fichier d'options MySQL temporaire (`--defaults-extra-file`) plutôt que `-p<mot de passe>` — changement à faire remonter à l'éditeur du cœur Dolibarr, pas dans ce module.
- **Correctif** : non applicable (cœur Dolibarr).

## 4. Cas non exécutés ou non concluants

- **DISP-03** (fenêtre d'erreur cron) : aucune exécution de job ne tombait dans la fenêtre d'observation de 60 s après le démarrage simultané — « 0 tâche à vide » n'a donc pas pu être vérifié positivement, seulement l'absence d'exécution observée. À rejouer avec une fenêtre d'observation couvrant un vrai cycle de 5 min si une confirmation plus solide est souhaitée.
- **DISP-06** (restauration complète) : procédure préparée avec les sommes de contrôle de référence (§6), **non exécutée** — consigne explicite, le responsable l'exécute lui-même.
- **DISP-07** (restauration partielle + volume documents) : procédure préparée (§6), **non exécutée** pour la même raison.
- **DISP-10** (essai de disponibilité continue 24 h) : optionnel par consigne, **non lancé** sans accord explicite.
- **DISP-12** (compatibilité 19.0.2 / 22.0.4) : **sans objet** dans cet environnement — un seul `docker-compose.yml` existe, pointant sur Dolibarr 19.0.2 ; aucune pile 22.0.4 n'est configurée pour rejouer la comparaison.

## 5. Recommandations non implémentées (décision du responsable)

### R1 — Sonde de santé applicative pour `dolibarr` (et `dolibarr-cron`)
**Constat (DISP-04)** : aucune sonde ne couvre le service web ; un PHP cassé renvoie une vraie erreur HTTP 500 sans que Docker ne le signale (`docker ps` reste à `Up`).

**Changement exact proposé** dans `docker-compose.yml`, service `dolibarr` :
```yaml
  dolibarr:
    # ...
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/custom/timeflow/timeflowindex.php"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s
```
`curl` est déjà présent dans l'image (`tuxgasy/dolibarr`), aucune dépendance à ajouter. `-f` fait échouer `curl` sur un code ≥ 400, donc sur les 500 observés pendant DISP-04 — sans bloquer sur une simple redirection de connexion. Le même bloc peut être dupliqué sur `dolibarr-cron` pour que `docker ps` reflète aussi son état, bien qu'il n'expose pas de port HTTP (adapter l'URL à `http://localhost/` suffit pour vérifier qu'Apache/PHP répond).

### R2 — Version d'image figée
**Constat** : `dolibarr`/`dolibarr-cron` utilisent `tuxgasy/dolibarr:latest` — un redémarrage après un nouveau `docker pull` peut changer de version sans avertissement (annexe C5 du plan).

**Changement exact proposé** : remplacer `image: tuxgasy/dolibarr:latest` par le tag de version exacte actuellement utilisée (à déterminer avec `docker inspect timeflow-dolibarr --format '{{.Config.Image}}'` puis en consultant les tags disponibles sur le registre tuxgasy, ou en épinglant par digest `tuxgasy/dolibarr@sha256:...` pour une reproductibilité totale).

### R3 — retirée
**ANO-DISP-01 a été invalidée après vérification** (erreur de méthode de test : `docker kill` est un arrêt volontaire pour Docker, `unless-stopped` l'ignore par conception). Le re-test avec un vrai plantage (OOM-kill) confirme que la politique fonctionne correctement — aucun changement de configuration n'est recommandé sur ce point.

### R4 — Observabilité des pannes (DISP-11)

| Panne | Où elle apparaît aujourd'hui | Temps de diagnostic | Manque identifié |
|---|---|---|---|
| Base indisponible (page 202 du cœur) | À l'écran (page HTML), `docker ps` reste `Up` sans info | Immédiat à l'écran, mais aucun code machine ni alerte | Pas de sonde applicative (voir R1) ; pas de notification automatique |
| Perte de connexion pendant l'import / le chrono | Réponse HTTP 503 + `code: "sql_error"` + détail (PR n° 49/50/52) | Immédiat (dans la réponse elle-même) | — (déjà corrigé) |
| Conteneur planté (`kill -9`, OOM) | `docker ps`/`docker inspect` (`Exited`, `RestartCount`) | Immédiat **si on pense à vérifier** `docker ps` | Rien ne pousse l'information — pas d'alerte, pas de notification |
| Panne applicative sans crash (PHP cassé, DISP-04) | Code HTTP de la requête concernée uniquement | Immédiat **si on teste la bonne URL** | Aucune sonde ne le détecte en continu (voir R1) |
| Mailpit/SMTP indisponible | `email_status = failed` en base, visible dans l'historique de traitement | Quelques minutes (consulter l'historique) | Pas d'alerte proactive, découverte seulement en consultant |
| Cron arrêté | Absence de nouvelles notifications/exécutions — **silencieux**, rien ne le signale explicitement | Long si non recherché activement (pas de symptôme direct) | Aucun signal direct ; seul un healthcheck dédié (R1 étendu à `dolibarr-cron`) ou une supervision de la dernière exécution de job le révélerait |

**Recommandation générale** : au-delà de R1 (sonde HTTP), une vérification périodique de `llx_cronjob.dateexecution` par rapport à la fréquence attendue (alerte si un job actif n'a pas tourné depuis N× sa fréquence) détecterait le cas « cron arrêté » qu'aucune sonde HTTP ne couvre. Hors périmètre d'implémentation de cette session (supervision externe, cf. plan §3.2).

### R5 — Activer le job de sauvegarde quotidien en production, et prévoir une copie hors site

**Constat (DISP-05)** : le job « Sauvegarde locale de base » est **désactivé par défaut** — il ne tourne pas tout seul tant que personne ne l'active. La restauration de référence que vous effectuez entre chaque phase de test **le désactive à nouveau** (le dump restauré ne contenait pas l'activation faite pendant cette session), donc l'état « activé » ne survit pas à une restauration sans action explicite.

**Recommandation** :
1. En production, activer le job et vérifier sa fréquence (actuellement configuré pour tourner selon la planification cron native de Dolibarr — à régler explicitement, ex. quotidienne, via `cron/card.php` du job rowid correspondant à `MakeLocalDatabaseDumpShort`).
2. Après toute restauration de base (y compris de référence pour les tests), **revérifier et réactiver ce job** s'il doit rester actif — il ne se réactive pas de lui-même.
3. **La sauvegarde reste sur la même machine** (`dolibarr_documents`, le même volume Docker que l'application) : si le disque, la VM ou l'hôte est perdu, la sauvegarde l'est aussi avec le reste. Ce n'est pas un vrai plan de reprise d'activité tant qu'une **copie hors de cette machine** (stockage externe, autre serveur, service de sauvegarde cloud) n'est pas mise en place — hors périmètre technique du module, mais nécessaire pour tout objectif de RPO/RTO réel au-delà d'une panne locale.

**Correctif** : non applicable (changement opérationnel/infrastructure, pas de code) — à votre décision.

## 6. Procédures préparées (à exécuter par le responsable)

### Procédure DISP-06 — Restauration complète testée (RPO/RTO)

**Pourquoi vous l'exécutez vous-même** : consigne explicite, aucune restauration n'est faite par l'exécutant, y compris sur une base de vérification jetable.

**Corrections apportées à la version précédente** (signalées par le responsable) :
- Le fichier de sauvegarde est sur le volume `dolibarr_documents`, monté dans `timeflow-dolibarr`/`timeflow-dolibarr-cron`, **pas dans `timeflow-mariadb`** — la restauration doit d'abord faire sortir le fichier, puis l'amener dans `timeflow-mariadb`, pas le lire directement depuis ce dernier.
- Les sommes de contrôle doivent être prises **immédiatement après** la sauvegarde fraîche (même instant), pas après coup sur un état qui a pu changer depuis.

**Script PowerShell complet** (à exécuter vous-même, dans l'ordre ; copier-coller le bloc entier ou étape par étape) :

```powershell
# Dossier de travail sur votre disque — adapter si besoin
$hostDir = "C:\Users\GIGABYTE\docker-timeflow-test\restore-test"
New-Item -ItemType Directory -Force -Path $hostDir | Out-Null

# Les 15 tables du module
$tableNames = @(
  "llx_timeflow_daily_report","llx_timeflow_expected_absence","llx_timeflow_import_mapping",
  "llx_timeflow_import_project_client_link","llx_timeflow_import_project_user_link",
  "llx_timeflow_import_user_group_link","llx_timeflow_late_check","llx_timeflow_notification",
  "llx_timeflow_project","llx_timeflow_project_text","llx_timeflow_task","llx_timeflow_timeentry",
  "llx_timeflow_timeentry_extrafields","llx_timeflow_timeentry_modification","llx_timeflow_time_edit_log"
)

# --- (a) Lancer une sauvegarde fraîche ---
docker exec timeflow-dolibarr-cron php /var/www/scripts/cron/cron_run_jobs.php testcronkey admin 3 --force

# Nom exact (avec chemin) du fichier qui vient d'être produit (le plus récent du dossier)
$backupFile = (docker exec timeflow-dolibarr-cron sh -c "ls -t /var/www/documents/admin/backup/*.sql | head -1").Trim()
Write-Host "Fichier de sauvegarde : $backupFile"

# --- (b) Prendre immédiatement les sommes de contrôle de référence (même instant que la sauvegarde) ---
$refList = ($tableNames | ForEach-Object { "dolibarr.$_" }) -join ", "
docker exec timeflow-mariadb mariadb -udolibarr -pdolibarrpass -e "CHECKSUM TABLE $refList;" |
  Out-File "$hostDir\disp06_reference_checksums.txt"
Write-Host "Sommes de contrôle de référence enregistrées dans $hostDir\disp06_reference_checksums.txt"

# --- (c) Copier le fichier vers votre disque, puis dans timeflow-mariadb ---
$fileName = Split-Path $backupFile -Leaf
docker cp "timeflow-dolibarr-cron:${backupFile}" "$hostDir\$fileName"
docker cp "$hostDir\$fileName" "timeflow-mariadb:/tmp/$fileName"
Write-Host "Copié sur le disque ($hostDir\$fileName) puis dans timeflow-mariadb (/tmp/$fileName)"

# --- (d) Restaurer dans une base de test, jamais dans "dolibarr" ---
docker exec timeflow-mariadb mariadb -uroot -prootpass -e "DROP DATABASE IF EXISTS dolibarr_restore_test; CREATE DATABASE dolibarr_restore_test;"

$t0 = Get-Date
docker exec timeflow-mariadb sh -c "mariadb -uroot -prootpass dolibarr_restore_test < /tmp/$fileName"
$t1 = Get-Date

# --- (f) Mesurer le temps (RTO de restauration) ---
$rto = $t1 - $t0
Write-Host "RTO de restauration : $($rto.TotalSeconds) secondes"

# --- (e) Comparer les sommes de contrôle ---
$testList = ($tableNames | ForEach-Object { "dolibarr_restore_test.$_" }) -join ", "
docker exec timeflow-mariadb mariadb -uroot -prootpass -e "CHECKSUM TABLE $testList;" |
  Out-File "$hostDir\disp06_restored_checksums.txt"
Write-Host "Comparaison (rien affiché = identique) :"
Compare-Object (Get-Content "$hostDir\disp06_reference_checksums.txt") (Get-Content "$hostDir\disp06_restored_checksums.txt")

# --- (g) Supprimer la base de test ---
docker exec timeflow-mariadb mariadb -uroot -prootpass -e "DROP DATABASE dolibarr_restore_test;"
Write-Host "Base de test supprimée."
```

**Notes** :
- Les deux fichiers `disp06_reference_checksums.txt` et `disp06_restored_checksums.txt` ont les tables dans le même ordre (`$tableNames` sert aux deux), donc `Compare-Object` ligne à ligne est valide tel quel — seul le nom de la base (`dolibarr.` vs `dolibarr_restore_test.`) diffère dans la colonne "Table", ce qui est normal et attendu.
- `Compare-Object` ne doit rien afficher si les sommes `Checksum` sont identiques — toute ligne affichée au-delà du nom de base attendu signale une divergence réelle.
- (Optionnel, plus représentatif mais plus lourd) Pointer une instance Dolibarr de test séparée sur `dolibarr_restore_test` pour comparer visuellement le tableau de bord — nécessite un second conteneur `dolibarr`, non mis en place dans cette session.

**Critère de réussite** : sommes de contrôle égales à 100 % ; RTO ≤ 15 min.

### Procédure DISP-07 — Restauration partielle (une table) et volume de documents

**Table** : restaurer une seule table depuis le même dump, sans toucher aux autres — extraire son bloc `CREATE TABLE`/`INSERT INTO` avec `sed`/`awk` avant de l'exécuter dans `dolibarr_restore_test` (jamais dans `dolibarr`), puis comparer uniquement cette table.

**Volume documents** : `docker run --rm -v dolibarr_documents:/data -v <dossier_hôte>:/backup alpine tar czf /backup/documents.tar.gz -C /data .` pour sauvegarder le volume `dolibarr_documents` complet (fichiers joints, pas la base) ; restauration par la commande inverse (`tar xzf`) dans un volume de test, jamais dans `dolibarr_documents` lui-même sans votre accord explicite.

## 7. Perspectives

- Exécuter la procédure DISP-06 préparée (§6) pour mesurer un vrai RTO/RPO de restauration, et DISP-07 pour la restauration partielle.
- Confirmer ou infirmer ANO-DISP-01 (politique de redémarrage) sur un autre hôte Docker, pour isoler environnement vs projet.
- Décider des recommandations R1-R4 (§5) : sonde applicative, version d'image figée, supervision externe du redémarrage, détection d'un cron arrêté.
- Rejouer DISP-03 avec une fenêtre d'observation couvrant un vrai cycle cron (≥ 5 min) pour conclure sur « 0 tâche à vide ».
- DISP-10 (24 h) et DISP-12 (22.0.4) restent à planifier séparément si souhaités.
