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
- Statuts : ✅ 3 (DISP-01, 08, 09) · ⚠️ 3 (DISP-03, 04, 05 — testés avec une réserve) · ❌ 1 (DISP-02) · ℹ️ informatif 1 (DISP-11)
- Anomalies : 3 trouvées (ANO-DISP-01 Élevé, ANO-DISP-02 Faible, ANO-DISP-03 Moyen) · 0 corrigée (consigne : documentées, pas corrigées en phase de disponibilité)
- **Conclusion.** Le redémarrage propre (DISP-01), la pile complète (DISP-03) et la désactivation/réactivation du module (DISP-08) sont fiables, sans perte de donnée. La sauvegarde fonctionne réellement et couvre 100 % des tables du module (DISP-05), avec deux réserves mineures côté cœur Dolibarr. **La découverte la plus significative** : la politique `restart: unless-stopped` ne relance aucun des 4 conteneurs après un plantage brutal (`kill -9`) sur cette installation — 4 cas sur 4, reproductible — ce qui veut dire qu'un vrai plantage (OOM, bug du moteur) laisserait le service indisponible jusqu'à une intervention manuelle, malgré la configuration déclarée. Aucune perte ni corruption de données constatée dans aucun des cas destructifs exécutés.

## 2. Tableau récapitulatif

| Cas | Titre | Résultat mesuré | Critère | Statut | Preuve |
|---|---|---|---|---|---|
| DISP-04 | Sondes de santé | Lecture de `docker-compose.yml` + `docker inspect` : seul `mariadb` a une sonde déclarée (compose) ; `mailpit` en a une **intégrée à l'image** (`/mailpit readyz`), pas déclarée dans compose ; `dolibarr` et `dolibarr-cron` n'en ont **aucune**. Simulation réelle : fichier PHP en erreur fatale déposé sur le clone (`disp04_broken_test.php`, supprimé après test) → la requête renvoie **HTTP 500** (vraie panne applicative), mais `docker ps`/`docker inspect` affichent `dolibarr` comme `Up`/`running`, **sans aucun signal d'anomalie** — Docker ne peut pas voir une panne applicative sur ce service. | Tableau sonde/service complété **(✅)** ; recommandation chiffrée **(✅, voir §5)** | ℹ️ informatif | — |
| DISP-01 | Redémarrage propre de chaque conteneur | `docker restart` sur les 4 conteneurs, un par un, sonde 1 s : **dolibarr 1,85 s**, **mailpit 1,0 s**, **dolibarr-cron 1,75 s** (process actif), **mariadb 13,2 s** (jusqu'à `healthy`). Comptages sur 9 tables `llx_timeflow_*` identiques avant/après (ex. `timeentry` 567/567, `timeentry_modification` 6012/6012). Journaux post-retour : 0 nouvelle erreur attribuable à ce test (une ligne d'erreur HTTP 500 dans les logs dolibarr vient du test DISP-04 qui précède, une ligne de panne base dans les logs cron est horodatée avant le début de cette séquence — résidu d'un test antérieur dans la session). | RTO ≤ 60 s web/cron/mail **(✅)** ; RTO ≤ 120 s base **(✅ 13,2 s)** ; comptages identiques **(✅)** ; 0 erreur attribuable **(✅)** | ✅ | — |
| DISP-02 | Plantage brutal (`kill -9`) et politique de redémarrage | `docker kill` sur les 4 conteneurs **séparément**, sans aucune action manuelle, attente ≥ 15-20 s chacun. **Les 4 sur 4 sont restés `Exited (137)`, `RestartCount=0` — aucun n'a redémarré seul**, malgré `restart: unless-stopped` déclaré pour les 4 dans `docker-compose.yml`. Relancés manuellement (`docker start`) entre chaque test et à la fin. `CHECK TABLE` sur 4 tables clés après la reprise de la base : **OK** (récupération InnoDB propre). Comptage `timeentry` identique (567) après toute la séquence. `docker version` : Client/Server 29.5.3. | Relance sans intervention pour 4 conteneurs sur 4 **(❌ 0/4)** ; RTO ≤ 5 min **(sans objet, jamais relancé seul)** ; `CHECK TABLE` sans erreur **(✅)** | ❌ | — |
| DISP-03 | Redémarrage complet de la pile et ordre de démarrage | `docker compose stop` (note : `dolibarr-cron` a mis plus que le délai de grâce et est sorti en 137, les 3 autres en 0) puis `docker compose start` — `mariadb` et `dolibarr` démarrent **simultanément** (`depends_on` sans condition de santé, confirmé par lecture de `docker-compose.yml`). Sonde HTTP à 1 Hz pendant 60 s après le démarrage : **200 dès la première seconde, aucune fenêtre d'erreur mesurée** — l'image `dolibarr` semble gérer elle-même l'attente de la base avant de servir Apache. `docker logs` cron sur cette fenêtre : aucune exécution de job (aucun tic de 5 min ne tombait dans la fenêtre observée, donc non concluant sur « tâche cron à vide »). Comptage `timeentry` inchangé (567). | Service nominal en ≤ 5 min **(✅, immédiat)** ; 0 donnée altérée **(✅)** ; fenêtre d'erreur mesurée et rapportée **(✅, 0 s mesurée — voir réserve)** | ⚠️ | — |
| DISP-05 | Sauvegarde : activation, exécution, contenu | Job « Sauvegarde locale de base » (rowid 3, `MakeLocalDatabaseDumpShort`) **activé via le vrai mécanisme admin** (`cron/card.php?action=activate`), exécuté via `cron_run_jobs.php` (identique au mécanisme réel du conteneur cron). Fichier produit sur `/var/www/documents/admin/backup/` — **volume nommé persistant** `dolibarr_documents`, pas l'intérieur éphémère du conteneur. 1,86 Mo, marqueur de fin propre (pas de troncature). **15/15 tables `llx_timeflow_*` présentes**, 566 séparateurs de lignes pour `timeentry` = 567 lignes réelles. Relancé 7 fois au total en < 2 min : **seulement 2 fichiers distincts** — le nom de fichier a une granularité **par minute**, donc plusieurs exécutions dans la même minute s'écrasent silencieusement (limite du test : ne reproduit pas un espacement réaliste). Lecture du code cœur (`Utils::dumpDatabase()`) : le mot de passe **est bien passé en ligne de commande** à `mysqldump` (confirmé par le filtrage explicite de l'avertissement mysqldump correspondant) — comportement du cœur, non modifiable. | Fichier produit à chaque exécution **(✅, hors collision de nom)** ; 100 % des tables du module présentes **(✅)** ; taille cohérente **(✅)** ; stocké sur volume persistant **(✅)** | ⚠️ | `preuves/DISP/DISP-05/` |
| DISP-08 | Désactivation puis réactivation du module | Comptages sur 9 tables + 2 tâches planifiées + 13 constantes `TIMEFLOW_*` relevés avant ; désactivation puis réactivation via le **vrai mécanisme admin** (`admin/modules.php?action=reset\|set&value=modTimeFlow`, compte superadmin réel, pas une manipulation directe de la base). Après réactivation : **2 tâches planifiées exactement (pas 4)**, mêmes rowid (1, 6) ; **13/13 constantes identiques** ; **9/9 comptages de tables identiques** (ex. `timeentry` 567/567) ; application de nouveau accessible (200). Observation (non bloquante) : pendant la désactivation, `timeflowindex.php` pour un utilisateur connecté renvoie une page Dolibarr standard **vide** (menu seul, aucun message explicite "module désactivé") plutôt qu'un message clair — à rapprocher de DISP-11. | Comptages identiques **(✅)** ; 2 tâches planifiées exactement **(✅)** ; réglages inchangés **(✅)** | ✅ | — |
| DISP-09 | Mode dégradé | Scénario type (démarrer/arrêter un chrono, tableau de bord, soumettre) rejoué pour chaque dépendance coupée séparément. **Mailpit arrêté** (déjà PAN-04, phase 2) : application utilisable, notification créée, email en `failed` puis retenté avec succès au retour. **Cron arrêté** (nouveau) : démarrer/arrêter un chrono, consulter le tableau de bord, soumettre — **tout fonctionne (200/success)** ; seules les tâches planifiées (détection de retard, découpage de minuit) ne tournent pas pendant l'arrêt. **Base arrêtée** (déjà PAN-01, phase 2) : application indisponible (HTTP 202, page du cœur, pas de message TimeFlow) — voir ANO-PANNES-01, déjà corrigé côté frontend (message traduit) en PR n° 50. | Matrice conforme à l'attendu **(✅)** ; 0 perte de donnée **(✅)** | ✅ | `preuves/PANNES/PAN-01/`, `preuves/PANNES/PAN-04/` |
| DISP-11 | Observabilité | Synthèse des pannes provoquées en phases 2 et 3 (tableau ci-dessous). Les pannes applicatives (import, chrono) sont **désormais visibles** dans la réponse HTTP elle-même (503 + code + détail, PR n° 49/50/52) — diagnostic immédiat, pas d'enquête. Les pannes **infrastructure** (conteneur arrêté/planté) sont visibles uniquement via `docker ps`/`docker inspect` — **aucune alerte ne pousse l'information**, il faut aller la chercher. Le cœur Dolibarr (page 202) est visible à l'écran mais sans code machine exploitable. Voir le tableau et la recommandation en §5. | 100 % des pannes identifiables en < 5 min **(✅, en sachant où chercher)** ; manques listés **(✅, voir §5)** | ℹ️ informatif | — |

## 3. Détail des anomalies

### ANO-DISP-01 — `restart: unless-stopped` ne relance aucun des 4 conteneurs après un `kill -9`
- **Cas concerné** : DISP-02
- **Gravité** : Élevé (opérationnel — un plantage brutal de n'importe quel conteneur reste indéfiniment arrêté sans intervention manuelle, pas de perte de données constatée)
- **Description** : les 4 services ont `restart: unless-stopped` dans `docker-compose.yml`. Un `docker kill` (SIGKILL) sur chacun, testé séparément sans aucune action manuelle entre le kill et la vérification, montre dans les 4 cas : conteneur `Exited (137)`, `RestartCount=0`, toujours arrêté après 15-20 s d'attente. Aucun des 4 n'est revenu seul.
- **Reproduction** : `docker kill <conteneur>` puis `docker ps -a` / `docker inspect --format '{{.RestartCount}}'` après ≥ 15 s, sans `docker start`. Reproduit pour `timeflow-mailpit`, `timeflow-dolibarr`, `timeflow-dolibarr-cron`, `timeflow-mariadb`, un par un.
- **Impact** : pas de perte ni de corruption de données constatée (reprise InnoDB propre après relance manuelle de la base, `CHECK TABLE` OK, comptages identiques) — mais la **disponibilité réelle dépend entièrement d'une relance manuelle** après tout plantage brutal (OOM, erreur du moteur, `kill -9` externe), ce qui contredit l'hypothèse de départ du plan (RTO ≤ 5 min *sans intervention*).
- **Cause probable** : non élucidée avec certitude depuis l'intérieur des conteneurs — `docker version` (Client/Server 29.5.3), `docker info` (`CgroupDriver=cgroupfs`, `LiveRestoreEnabled=false`, backend WSL2, noyau `6.18.33.1-microsoft-standard-WSL2`) ne montrent rien d'anormal par rapport à une configuration par défaut. La configuration `restart: unless-stopped` est conforme à ce qui devrait fonctionner nativement. Piste la plus probable : particularité du moteur Docker Desktop (backend WSL2) sur cette machine vis-à-vis de l'application des politiques de redémarrage après un SIGKILL — **non confirmée**, seulement l'observation empirique reproductible 4 fois sur 4.
- **Recommandation** : vérifier `docker info` (pilote cgroup, `Live Restore Enabled`) et la configuration de Docker Desktop ; en test rapide, confirmer avec un conteneur hors de ce projet si le même phénomène se produit (isolerait un problème d'environnement plutôt que de configuration du projet). Si confirmé comme une limite de l'environnement Docker Desktop plutôt que du projet, documenter que la surveillance externe (ex. un service qui relance les conteneurs arrêtés) reste nécessaire en attendant, puisque la politique native ne suffit pas sur cette plateforme.
- **Correctif** : non applicable ici — `docker-compose.yml` n'est pas modifié (consigne) ; recommandation ci-dessus à votre décision.
- **Re-test** : non refait sur un autre moteur Docker (hors de portée de cette session).

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

### R3 — Politique de redémarrage : `restart: unless-stopped` ne suffit pas sur cet hôte
**Constat (ANO-DISP-01, DISP-02)** : vérifié 4 fois sur 4 — aucun conteneur ne redémarre seul après un `kill -9`, malgré la politique déclarée.

**Recommandation** (pas un changement de fichier à proposer tant que la cause n'est pas confirmée) : avant de modifier quoi que ce soit, confirmer si le phénomène est propre à cette installation de Docker Desktop (tester avec un conteneur hors de ce projet) ou au projet. Si confirmé comme une limite de la plateforme, une supervision externe (ex. un service qui vérifie et relance les conteneurs arrêtés) devient nécessaire en attendant une correction de l'environnement — ne concerne pas `docker-compose.yml`.

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

## 6. Procédures préparées (à exécuter par le responsable)

### Procédure DISP-06 — Restauration complète testée (RPO/RTO)

**Pourquoi vous l'exécutez vous-même** : consigne explicite, aucune restauration n'est faite par l'exécutant, y compris sur une base de vérification jetable.

**Fichier de référence** : `/var/www/documents/admin/backup/mysqldump_dolibarr_19.0.2_2610060934.sql` (produit en DISP-05, sur le volume persistant `dolibarr_documents` — toujours là après un redémarrage des conteneurs). RPO au moment de l'écriture de cette procédure : **0** (sauvegarde fraîche, produite dans cette même session).

**Sommes de contrôle de référence** (base actuelle, avant toute restauration — à comparer après) :

| Table | CHECKSUM |
|---|---|
| `llx_timeflow_daily_report` | 521365803 |
| `llx_timeflow_expected_absence` | 0 |
| `llx_timeflow_import_mapping` | 933732900 |
| `llx_timeflow_late_check` | 1763371351 |
| `llx_timeflow_notification` | 3069046961 |
| `llx_timeflow_timeentry` | 2229791062 |
| `llx_timeflow_timeentry_modification` | 2187528318 |
| `llx_timeflow_time_edit_log` | 1298025706 |
| `llx_timeflow_task` | 2384024763 |

**Étapes** :
1. Chronométrer le départ (RTO).
2. Créer un schéma vierge dans le **même** conteneur `timeflow-mariadb` (n'affecte pas `dolibarr`) :
   ```
   docker exec timeflow-mariadb mariadb -uroot -prootpass -e "CREATE DATABASE dolibarr_restore_test;"
   ```
3. Restaurer le dump dedans (jamais dans `dolibarr`) :
   ```
   docker exec -i timeflow-mariadb mariadb -uroot -prootpass dolibarr_restore_test < "C:\Users\GIGABYTE\docker-timeflow-test\timeflow\..\..." 
   ```
   (adapter le chemin pour pointer vers le fichier copié hors du conteneur, ou utiliser `docker exec timeflow-mariadb sh -c "mariadb -uroot -prootpass dolibarr_restore_test < /var/www/documents/admin/backup/mysqldump_dolibarr_19.0.2_2610060934.sql"` directement depuis l'intérieur du conteneur cron/dolibarr où le volume est monté, sans sortir le fichier).
4. Comparer les sommes de contrôle avec la table ci-dessus :
   ```
   docker exec timeflow-mariadb mariadb -uroot -prootpass -e "CHECKSUM TABLE dolibarr_restore_test.llx_timeflow_timeentry, dolibarr_restore_test.llx_timeflow_notification, ...;"
   ```
5. Arrêter le chronomètre (RTO de restauration).
6. Nettoyer :
   ```
   docker exec timeflow-mariadb mariadb -uroot -prootpass -e "DROP DATABASE dolibarr_restore_test;"
   ```
7. (Optionnel, plus représentatif mais plus lourd) Pointer une instance Dolibarr de test séparée sur `dolibarr_restore_test` pour comparer visuellement le tableau de bord — nécessite un second conteneur `dolibarr`, non mis en place dans cette session.

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
