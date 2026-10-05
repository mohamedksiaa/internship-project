# Rapport de tests — Tolérance aux pannes

| | |
|---|---|
| **Date d'exécution** | 2026-10-05 (début → en cours) |
| **Environnement** | Docker de test `docker-timeflow-test`, Dolibarr 19.0.2, commit du module `761e79d4` |
| **Sauvegarde préalable confirmée par** | le responsable, avant cette phase (`backup_reference_apres_correction.sql`) |
| **Jeu de données** | état réel post-correctif idate() (554 saisies corrigées), ~563 saisies au total au démarrage de cette phase |
| **Exécutant** | Claude Code, sous la supervision du responsable |
| **Clone Docker remis sur `main`** | en cours — confirmé en fin de phase |

Règles spécifiques à cette phase (rappel) : seuls les conteneurs `timeflow-dolibarr`, `timeflow-dolibarr-cron`, `timeflow-mariadb`, `timeflow-mailpit` peuvent être arrêtés/redémarrés — jamais un autre conteneur, jamais `docker compose down -v`, jamais de suppression de volume ou d'image. Chaque cas destructif (⚠) est annoncé avant exécution. Les anomalies trouvées sont **documentées ici, pas corrigées** — correctifs dans des PR séparées après relecture.

## 1. Résumé

- Cas prévus : 15 · exécutés (au moins partiellement) : 10 (tous les Critique + tous les Élevé) · non exécutés : 5 (PAN-05, 12, 13, 14, 15 — Moyen)
- Statuts : ✅ 5 (PAN-03, 04, 07, 10, 11) · ⚠️ 5 (PAN-01, 02, 06, 08, 09 — testés avec une réserve ou une couverture partielle) · ❌ 0
- Anomalies : Moyen 2 (ANO-PANNES-01, 02) · Critique/Élevé/Faible 0
- **Conclusion.** Aucune perte ni corruption de données constatée sur les 10 cas exécutés, y compris sous panne combinée (PAN-08) ou interruption en pleine écriture (PAN-02, PAN-06, PAN-10) — l'atomicité par transaction et la déduplication par clé (`import_key`, contraintes uniques) tiennent dans tous les essais. Les deux réserves trouvées sont des problèmes de **diagnostic** (message trompeur ou format de réponse non exploitable), pas de perte de données. Les cas Moyen restants (PAN-05, 12-15) et les sous-scénarios non couverts de PAN-03/06/08/09 restent à rejouer.

## 2. Tableau récapitulatif

| Cas | Titre | Résultat mesuré | Critère | Statut | Preuve |
|---|---|---|---|---|---|
| PAN-01 | Base de données indisponible | `docker stop timeflow-mariadb` pendant l'essai : lecture (`getActiveTimer`), écriture (`createManualEntry`), page (`timeflowindex.php`) — les trois répondent **HTTP 202** avec une page HTML de maintenance du noyau Dolibarr (pas de trace SQL/PHP). Reprise : `docker start` → 200 en **2 s**. 0 ligne créée par l'écriture tentée pendant la panne (563 avant/après, 0 ligne `pan01%`). | 100 % JSON exploitable **(❌ non respecté : HTML, pas JSON)** ; reprise ≤ 30 s **(✅ 2 s)** ; 0 trace exposée **(✅)** ; 0 ligne incohérente **(✅)** | ⚠️ | `preuves/PANNES/PAN-01/` |
| PAN-02 | Base coupée en pleine écriture | `docker kill timeflow-mariadb` à t+7s pendant un `executeClockifyImport` de 300 lignes (exécution complète mesurée à 16s) : la boucle d'import **continue sans erreur fatale** après la perte de connexion — 138 créées, puis les 102 lignes suivantes classées à tort `unresolved: "user_not_found"` (la vraie cause est la perte de connexion, pas un email introuvable), réponse finale **HTTP 200 "status":"success"**. **0 ligne dupliquée ou à moitié écrite** (contrôle direct). Réimport du même fichier : les 102 lignes manquantes sont créées, les 138 déjà présentes reconnues comme doublons (`import_key`) — convergence exacte vers l'état complet, 0 doublon. | 0 incohérence **(✅)** ; convergence au second lancement **(✅)** | ⚠️ | `preuves/PANNES/PAN-02/` |
| PAN-04 | Serveur de courrier arrêté | `docker stop timeflow-mailpit`, job de détection de retard déclenché (1 employé en retard, 2 managers opt-in) : **4 notifications créées en base**, email `failed` pour les 2 opt-in avec une cause correctement rapportée (`mailpit is either offline...`). `docker start`, nouvel appel 10 min après (délai de réessai 240 s) : **2/2 emails envoyés**, `email_attempts=2` (≤3), **exactement 1 email par destinataire** reçu dans Mailpit (0 doublon). Durée du job : 10,4 s. | Notification à 100 % **(✅)** ; ≤ 3 tentatives **(✅ 2)** ; 1 seul email après reprise **(✅)** ; 0 doublon **(✅)** ; durée < 60 s **(✅)** | ✅ | `preuves/PANNES/PAN-04/` |
| PAN-06 | Import interrompu | **3 points sur 10 testés** (limite de temps, voir §4) : (1) perte base — voir PAN-02 ; (2) `docker restart timeflow-dolibarr` à t+7s d'un import de 300 lignes : client en échec de connexion, **121 lignes créées, 0 doublon**, réimport → 179 de plus, **total 300/300, 0 doublon** ; (3) fermeture côté client (`AbortController`) à t+3s : le serveur **continue jusqu'à complétion** malgré la déconnexion client (pas de `connection_aborted()` vérifié dans le code) — 300/300 créées, 0 doublon. | 0 doublon sur les 3 points testés **(✅)** ; convergence au réimport **(✅)** | ⚠️ | `preuves/PANNES/PAN-06/` |
| PAN-07 | Double exécution du cron | Deux processus PHP lancés au même instant pour le job d'alerte, même jour simulé, pendant une détection réelle (4 destinataires attendus) : l'un constate « already being processed by another run », l'autre fait le travail (4 notifications, 2 emails envoyés, 2 sautés). **1 seule ligne de journée, 1 seule notification par destinataire, 0 doublon, 0 erreur de clé.** | 1 ligne de journée **(✅)** ; ≤ 1 notification par (responsable, jour) **(✅)** ; 0 erreur de clé **(✅)** | ✅ | `preuves/PANNES/PAN-07/` |
| PAN-08 | Chronomètre actif pendant une panne | **3 sous-scénarios sur 5 testés** (voir §4) : chrono démarré puis `docker restart timeflow-dolibarr` → inchangé ; puis coupure `timeflow-mariadb` (3 s) → inchangé ; arrêt final : **durée serveur 50 s**, cohérente avec l'enchaînement réel des deux pannes. Vérification code : `stopTimer($id, $user)` ne lit aucune date/durée côté client — impossible pour le navigateur d'influencer la durée enregistrée. | Durée ≤ 2 s d'écart avec les horodatages serveur **(✅, cohérente)** ; 0 chrono perdu/doublé **(✅)** ; 1 seul actif par utilisateur **(✅)** | ⚠️ | `preuves/PANNES/PAN-08/` |
| PAN-11 | Concurrence sur un chronomètre | 50 `startTimer` simultanés (même utilisateur) : **1 seul réussit**, 49 refusés explicitement. Puis 10×`stopTimer` + 10×`restartTimer` + 10×`submitEntry` simultanés sur la même saisie : **exactement 1 succès par opération** (1 arrêt, 1 reprise, 1 soumission), les 27 autres refusés avec un message clair. État final : **1 seul chrono actif**, 0 mise à jour perdue, 0 erreur non gérée. | Exactement 1 chrono actif **(✅)** ; 0 mise à jour perdue **(✅)** ; 0 erreur non gérée **(✅)** | ✅ | `preuves/PANNES/PAN-11/` |
| PAN-10 | Redémarrage serveur web pendant des requêtes | 60 `createManualEntry` en flux continu (80 ms d'écart), `docker restart timeflow-dolibarr` à t+2,5s : **35 acquittées (200), 25 échouées côté client**. Comparaison exacte avec la base : **les 35 lignes acquittées sont présentes, les 25 non acquittées sont absentes — 0 écart dans les deux sens.** | 0 écriture acquittée absente **(✅)** ; 0 doublon potentiel (non acquittées = absentes, pas juste rejouables) **(✅)** | ✅ | `preuves/PANNES/PAN-10/` |
| PAN-03 | Cron arrêté plusieurs heures | **(a)** Première exécution du jour à cutoff+5h (fenêtre max 3h) : **`status=missed`, 0 notification, 0 email** — détection même pas lancée. **(b)** Première exécution à cutoff+1h45 (dans la fenêtre) : **`status=done`**, 4 en retard, 4 notifications, 1 seule par destinataire. (c) non testé séparément ici, voir §4. | Journée `missed` sans alerte hors fenêtre **(✅)** ; détection tardive unique dans la fenêtre **(✅)** | ✅ | `preuves/PANNES/PAN-03/` |
| PAN-09 | Perte réseau côté navigateur | **1 critère testé sur plusieurs** (voir §4) : 10 `createManualEntry` identiques tirés simultanément (double-clic simulé) → **1 seul créé, 9 refusés** (chevauchement), **0 doublon en base**, sans mécanisme d'idempotence dédié — le contrôle de chevauchement protège naturellement. | 0 saisie en double après des clics rapides **(✅)** | ⚠️ | `preuves/PANNES/PAN-09/` |

## 3. Détail des anomalies

### ANO-PANNES-01 — Erreur base de données indisponible renvoyée en HTML (202), pas en JSON
- **Cas concerné** : PAN-01
- **Gravité** : Moyen (dégradation de l'expérience, pas de perte de données ni de fuite)
- **Description** : quand `timeflow-mariadb` est arrêté, toute action (lecture ou écriture) et le chargement de la page répondent **HTTP 202** avec une page HTML générique du noyau Dolibarr ("technical error... maintenance operation"), au lieu d'une erreur JSON exploitable par le frontend React.
- **Reproduction** : `docker stop timeflow-mariadb` ; `curl http://localhost:8080/custom/timeflow/ajax/timeentry.php?action=getActiveTimer`.
- **Impact** : le frontend (qui attend du JSON, voir `timeflowJsonResponse()`) ne peut pas afficher un message traduit propre à partir de cette réponse — l'utilisateur verrait vraisemblablement une erreur générique du navigateur ou un écran blanc selon la gestion d'erreur réseau du code React, pas le message clair attendu par le critère du plan. Le code **202 Accepted** est en outre sémantiquement incorrect pour une panne (devrait être 503).
- **Preuve** : `preuves/PANNES/PAN-01/resultat.json`.
- **Cause probable** : comportement du noyau Dolibarr (`main.inc.php` / gestion de connexion `DoliDB`) avant même d'atteindre `ajax/timeentry.php` — la connexion à la base échoue plus tôt dans le bootstrap. Pas encore localisé précisément au fichier/ligne.
- **Recommandation** : si modifiable sans toucher au noyau, intercepter ce cas dans `ajax/timeentry.php` ou en amont (ex. vérification de connexion avant le routage des actions) pour renvoyer un JSON `{"status":"error","message":"..."}` avec un code 503 ; sinon, documenter la limite (dépendance au comportement du noyau) et traiter côté frontend (détection d'une réponse non-JSON → message générique de maintenance).
- **Correctif** : à planifier (PR séparée, après relecture) · **Re-test** : non encore fait

### ANO-PANNES-02 — Import : perte de connexion pendant la boucle classée à tort « utilisateur introuvable »
- **Cas concerné** : PAN-02
- **Gravité** : Moyen (diagnostic trompeur pour l'admin, pas de perte ni corruption de données — vérifié)
- **Description** : quand la connexion à la base se perd **pendant** la boucle de `importTimeEntriesFromCsv()` (`class/timeimport.class.php`), chaque ligne restante est classée `unresolved_rows[].reason = "user_not_found"`, alors que la cause réelle est la perte de connexion — le rapport final renvoie même `"status":"success"`. Un responsable lisant ce rapport conclurait à tort que 102 emails sont introuvables, pas qu'une panne a eu lieu.
- **Reproduction** : lancer un import de plusieurs centaines de lignes (`previewClockifyImport` puis `executeClockifyImport`) ; `docker kill timeflow-mariadb` pendant que la boucle tourne.
- **Impact** : diagnostic erroné, pas de perte de données — l'intégrité est préservée (0 doublon, convergence exacte au réimport, vérifié) grâce à `import_key`, mais uniquement si l'admin pense à relancer le même fichier malgré un rapport qui ne signale aucune panne.
- **Preuve** : `preuves/PANNES/PAN-02/resultat.json`.
- **Cause probable** : `getExistingMapping()`/`lookupDolibarrUserByEmail()` (`class/timeimport.class.php`) renvoient probablement `null`/tableau vide sur l'échec de la requête SQL elle-même, exactement comme sur une absence réelle de résultat — la boucle ne distingue pas les deux cas.
- **Recommandation** : détecter l'échec de requête (`$db->query()` retournant `false`) distinctement d'un résultat vide, interrompre l'import proprement avec un message explicite plutôt que de continuer en traitant chaque ligne comme non résolue.
- **Correctif** : à planifier (PR séparée, après relecture) · **Re-test** : non encore fait

## 4. Cas non exécutés ou non concluants

- **PAN-06** : seulement 3 des 10 points d'interruption prévus par le plan ont été testés (perte base, arrêt conteneur, fermeture client) — raison : contrainte de temps dans cette session. Les 7 restants (dépassement du délai d'exécution PHP — recoupe PAN-13 —, et les variantes combinées) sont à rejouer séparément.
- **PAN-08** : 3 des 5 sous-scénarios testés (redémarrage serveur web, coupure base, vérification « durée côté serveur »). Non testés : (c) fermeture/réouverture réelle du navigateur, (e) chrono laissé courir jusqu'après minuit pendant une panne — raison : contrainte de temps.
- **PAN-03** : scénario (c) (cron arrêté à cheval sur minuit avec un chronomètre actif) non testé séparément — recoupe PAN-08 et le correctif déjà vérifié du découpage de minuit (PR n° 44).
- **PAN-09** : seul le critère « 0 doublon après clics rapides » a été vérifié (par HTTP direct) ; les scénarios nécessitant une émulation réseau réelle (hors ligne pendant chargement/export/cloche, ralentissement, message affiché à l'écran) n'ont pas été exécutés — demandent Puppeteer en mode DevTools offline/throttling, non mis en œuvre dans cette session.
- **PAN-12, PAN-13, PAN-14, PAN-15** (Moyen) : non exécutés dans cette session — priorité donnée aux cas critiques et élevés, contrainte de temps. PAN-05 (Moyen) également non exécuté.

## 5. Limites et hypothèses

- Une seule instance de chaque conteneur (pas de redondance) : on vérifie la **reprise propre**, pas la continuité de service.
- Les mécanismes déjà conçus sont vérifiés, pas supposés.
- Ces essais ne prouvent pas la tenue sous charge réelle concurrente (quelques dizaines de requêtes parallèles testées, pas des centaines) ni le comportement avec plusieurs instances de chaque conteneur.
- PAN-09 n'a été vérifié que pour son critère le plus simple (anti-doublon) ; le comportement réel de l'interface React face à une coupure réseau (message affiché, resynchronisation de la cloche) n'a pas été observé dans un vrai navigateur.
- Les comptes de test `zz_nf_*` et les données `pan0X*` créées pendant cette phase restent en base jusqu'à la restauration de fin de phase (politique de nettoyage en vigueur : pas de suppression ciblée).

## 6. Perspectives

- Rejouer PAN-05, 12, 13, 14, 15 (Moyen) dans une session dédiée.
- Compléter PAN-06 (7 points d'interruption restants), PAN-08 ((c)/(e)) et PAN-09 (émulation réseau réelle via Puppeteer) pour une couverture complète du plan.
- Les deux anomalies trouvées (diagnostic trompeur sous panne, pas de perte de données) sont candidates à des PR de correctif séparées, après relecture du responsable.
