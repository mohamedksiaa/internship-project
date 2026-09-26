# Rapport de validation non fonctionnelle — Axe 1 : Sécurité

| | |
|---|---|
| **Module** | TimeFlow (Dolibarr) — version testée : branche `main` au commit `10ea93f3` |
| **Environnement** | Docker de test `docker-timeflow-test` : Dolibarr 19.0.2, PHP 8.2.7, MariaDB 10.11, Apache ; **jamais le développement local** |
| **Date des essais** | 26 septembre 2026 |
| **Plan de référence** | `docs/tests/PLAN_DE_TESTS.md` (PR n° 34), §1 « Axe Sécurité » |
| **Sauvegarde préalable** | `backup_avant_tests.sql` (1,55 Mo), réalisée par le responsable, hors du dépôt |
| **Nature du document** | **Constats uniquement.** Aucune anomalie n'est corrigée ici : les correctifs feront l'objet de PR séparées après relecture |

---

## 1. Synthèse

Sur les **20 cas** de l'axe, **19 ont été exécutés** ; `SEC-06` (matrice des droits) attend la validation de la matrice par le responsable (proposition en annexe A). Les 42 cas « critique » et « élevé » de l'ensemble du plan passent en priorité, conformément à l'arbitrage du 25 septembre.

| Résultat | Nombre | Cas |
|---|---|---|
| ✅ Conforme | 6 | SEC-04, 05, 14, 17, 18, 19 (SEC-04, 17 et 19 avec couverture partielle signalée) |
| ⚠️ Conforme avec réserves | 8 | SEC-01, 02, 03, 09, 11, 13, 16, 20 |
| ❌ Anomalie confirmée | 5 | SEC-07, 08, 10, 12, 15 |
| ⏸ En attente | 1 | SEC-06 (validation de la matrice) |

**Ce que les essais établissent (avec preuves) :**

1. **Aucune injection SQL exploitable** n'a été trouvée : 34 440 requêtes hostiles en tant qu'employé et 34 440 en tant qu'administrateur, 496 requêtes différentielles sur les filtres, relecture de 276 concaténations SQL, second ordre par l'import : **0 erreur SQL, 0 ligne en trop, 0 délai attribuable à une charge**. Seule réserve : 18 réponses HTTP 500 par profil quand un paramètre texte reçoit un tableau (A-10).
2. **La protection CSRF est effective** (20 combinaisons de jetons absents, faux, d'un autre utilisateur ou d'une autre session : toutes refusées) ; aucune ouverture CORS ; aucun script exécuté dans le navigateur sur 12 vues et 20 combinaisons de paramètres d'URL (avec témoin positif).
3. **Onze anomalies** (A-01 à A-11), dont cinq majeures : deux d'intégrité des données qui touchent directement le métier (saisies d'autrui modifiées ou fabriquées par un utilisateur ordinaire) et une d'exposition de secrets (voir §4) :
   - **A-01 (critique)** — un fichier `conf.php` réel figure dans l'historique Git d'un dépôt **public** (1 fork) ;
   - **A-02 (élevée)** — `submitEntry` ne vérifie ni le propriétaire ni l'état : n'importe quel utilisateur connecté soumet la saisie d'un autre et peut faire **régresser** une saisie validée ;
   - **A-03 (élevée)** — l'import Clockify, accessible avec le seul droit `write`, crée des saisies **déjà validées au nom d'un autre utilisateur** et modifie les contributeurs de projets ;
   - **A-04 (élevée)** — les exports CSV ne neutralisent aucune formule (8 charges sur 8 restent actives) ;
   - **A-05 (élevée)** — le dossier `.git` du module est téléchargeable par HTTP dans l'environnement de test, ainsi que `sql/`, `composer.phar`, etc.

---

## 2. Conditions d'exécution

### 2.1 Comptes de test (session Dolibarr normale)

Quatre comptes dédiés, préfixe `zz_nf_`, mots de passe **aléatoires, générés en mémoire, jamais écrits** (ni fichier, ni rapport, ni journal) et renouvelés à chaque série d'essais.

| Compte | Droits | Rôle dans les essais |
|---|---|---|
| `zz_nf_admin` | Administrateur Dolibarr + les 6 droits TimeFlow (comme l'administrateur réel de l'instance) | Référence « tout autorisé » |
| `zz_nf_manager` | TimeFlow `read`, `write`, `readall` (sans `validate`) | Victime des essais d'IDOR |
| `zz_nf_employee` | TimeFlow `read`, `write` | Attaquant |
| `zz_nf_norights` | Aucun droit TimeFlow | Utilisateur connecté sans le module |

Le profil « anonyme » est une requête sans session. **Création puis suppression des comptes et des données de test : voir §7.**

### 2.2 Écarts par rapport au plan

| Prévu au plan | Réalisé | Justification |
|---|---|---|
| gitleaks, trufflehog | Analyseur maison en lecture seule (12 familles de motifs, 7,2 millions de lignes d'historique, toutes branches) | Outils non installés sur le poste ; valeurs masquées dans les sorties |
| semgrep | Revue statique scriptée des 276 lignes qui concatènent une variable dans du SQL + traçage de la définition de chaque variable | Idem |
| sqlmap, OWASP ZAP | **Non lancés** | Outils absents et autorisation écrite pour un scan actif non donnée ; remplacés par le corpus de charges (69 376 requêtes) et les contrôles différentiels. **À rejouer sur autorisation.** |
| LibreOffice en ligne de commande | Non disponible | SEC-10 démontré au niveau du **fichier produit** par le vrai code d'export (`csvExport.js`) ; l'évaluation par un tableur reste à vérifier à la main |
| `composer audit` | Exécuté dans le conteneur (composer 2.10.2) | `composer.json` ne déclare que `phpunit` en dépendance de développement : **0 avis de sécurité** |
| Import de plus de 2 Mo | Impossible | Le serveur refuse les envois > 2 Mo (voir A-09) ; la limite documentée de 10 Mo n'est donc pas atteignable |

### 2.3 Méthode

> **Contrôle de validité.** Une première série d'injection a été **écartée** : un changement de mot de passe d'un compte de test (lancé en parallèle par un autre script) invalide ses sessions, et la série s'est poursuivie sur la page de connexion. La série retenue tourne seule, avec un garde-fou (toute réponse HTML est comptée et provoque une reconnexion) : **0 reconnexion, 0 réponse non JSON**.

Chaque cas a été rejoué par script (Node 24) contre `http://localhost:8080` avec une vraie session (formulaire de connexion Dolibarr, jeton lu dans `timeflowindex.php`). Les écritures ciblaient exclusivement des objets créés pour l'essai. Les sommes de contrôle des tables (`CHECKSUM TABLE`) et des lignes visées ont été comparées avant/après. Les rendus d'interface ont été observés dans un vrai Chrome (puppeteer) avec **témoin positif** : le détecteur voit bien une charge injectée volontairement.

---

## 3. Résultats par cas

| ID | Titre | Risque | Résultat | Preuve / constat |
|---|---|---|---|---|
| SEC-01 | Injection SQL, 44 actions | Critique | ⚠️ | 34 440 requêtes (employé) + 34 440 (admin), session contrôlée (0 reconnexion, 0 réponse non JSON) : 41 actions × 40 paramètres × 11 charges, en GET **et** en corps JSON. **0 erreur SQL, 0 délai attribuable à une charge** (679 réponses lentes, toutes sur `exportProcessedHistory`, export de 10 000 lignes, y compris avec des valeurs anodines). Revue statique : 276 concaténations, toutes typées ou échappées. **Réserve : 18 réponses 500 par profil (A-10)**. L'import (3 actions à fichier) est couvert par SEC-02/11 |
| SEC-02 | Injection SQL de second ordre | Critique | ⚠️ | 8 valeurs hostiles importées (`'`, `"`, `\`, `%_`, `DROP TABLE`, `OR 1=1`, Unicode) puis relues par 9 fonctions : 0 effet de bord, valeurs relues à l'octet près, réimportation sans doublon. **Réserve : A-09** (émoji refusé avec un message SQL brut) |
| SEC-03 | Injection via filtres, dates, tri | Élevé | ⚠️ | 496 requêtes différentielles sur 31 couples action/paramètre (dates, listes d'identifiants, recherche, statut) : 0 erreur SQL, 0 lenteur. 2 écarts de volume, **expliqués** : la charge commence par « 1 », convertie en entier 1 (pas d'injection). **Réserve (A-10)** : une date reçue sous forme de tableau provoque un 500 |
| SEC-04 | XSS stocké | Critique | ✅ | 8 familles de charges plantées dans 6 champs (note, motif de création et de correction, compte rendu, libellé de projet, absence), affichées par 2 profils sur 6 routes : **0 exécution, 0 requête sortante, 0 nœud injecté**. Témoin positif validé. Couverture partielle : cloche de notifications, fenêtre d'import, PDF et courriels réels non observés |
| SEC-05 | XSS via paramètres d'URL | Élevé | ✅ | 10 paramètres × 2 routes : 0 exécution |
| SEC-06 | Matrice action × profil | Critique | ⏸ | En attente de validation (annexe A). Indice fortuit (SEC-14) : un compte sans aucun droit obtient `200` sur `getActiveTimer` |
| SEC-07 | IDOR | Critique | ❌ | **A-02** : `submitEntry` modifie la saisie d'autrui (4/4 essais, contrôlé en base). Les **30 autres contrôles** (arrêt, redémarrage, suppression, correction, comptes rendus, historique, exports, notifications, projets et clients non visibles, énumération d'identifiants) refusent ou ne renvoient aucune ligne d'autrui ; couverture : les 22 actions à identifiant du plan y compris `getTasks` et `startTimer` (projet non visible) |
| SEC-08 | Élévation de privilèges | Critique | ❌ | **A-02** (validée → soumise) et **A-03** (import). Champs réservés (`fk_user`, `status`, `fk_user_valid`, `entity`, `import_key`, `date_creation`, `duration`) correctement ignorés ; auto-validation, validation d'un compte rendu, absence prévue sans `validate`, suppression d'une saisie validée : refusées |
| SEC-09 | CSRF et méthode HTTP | Élevé | ⚠️ | 20 combinaisons sans jeton valide + formulaire inter-domaine + `text/plain` : **toutes 403**, 0 écriture. CORS fermé. Cookie `HttpOnly; SameSite=Lax`. **Réserves : A-06** (jeton dans l'URL, présent dans les journaux ; écritures acceptées en GET) |
| SEC-10 | Formules dans les exports CSV | Élevé | ❌ | **A-04** : 8 charges sur 8 conservées telles quelles par le vrai `downloadCsv` |
| SEC-11 | Fichiers d'import | Élevé | ⚠️ | 16/20 contrôles conformes : extension, fichier vide, dépassement de taille, nom piégé, chemin local forgé, aucun fichier temporaire conservé, 0 erreur fatale. **Réserves : A-09** (binaire et fichier sans en-têtes acceptés avec « succès » ; limite réelle 2 Mo) |
| SEC-12 | Secrets dans le dépôt | Critique | ❌ | **A-01** |
| SEC-13 | Dépendances | Élevé | ⚠️ | `npm audit --omit=dev` : racine **0** ; `frontend` **2 élevées** (`react-router` 7.18.1, avis GHSA-qwww-vcr4-c8h2) mais **non atteignable** (voir §5.4). `composer audit` : 0. Développement : 5 vulnérabilités (`undici`) |
| SEC-14 | Authentification et session | Élevé | ✅ | Sans cookie, cookie inventé, session rejouée après déconnexion, compte désactivé en cours de session : **tous refusés dès la requête suivante**. Jeton : 12 sessions, 12 jetons distincts de 32 caractères |
| SEC-15 | Divulgation et fichiers exposés | Moyen | ❌ | **A-05** ; `X-Powered-By: PHP/8.2.7` (A-07) |
| SEC-16 | Entrées inattendues | Moyen | ⚠️ | 9 formes d'entrée mal formées (JSON, corps) : 0 réponse 5xx ; mais des **tableaux à la place de chaînes** provoquent 18 erreurs 500 (A-10) ; service disponible ensuite ; 12 `startTimer` simultanés : un seul chronomètre actif. **Réserve** : un corps de 50 Mo est accepté et lu en mémoire (A-07) |
| SEC-17 | Courriels d'alerte | Moyen | ✅ | Rendu du courriel pour 7 noms hostiles (CRLF + `Bcc:`, balises, `javascript:`) en 4 langues : sujet sans donnée utilisateur, 0 balise active, lien limité à l'application. Couverture : constructeur du courriel (pas d'envoi réel ni lecture Mailpit) |
| SEC-18 | Comptes créés par l'import | Critique | ✅ | 13 contrôles : création refusée sans droit `user->creer` (employé et manager), compte créé par l'admin avec **exactement** `read`+`write`, non admin, sans groupe à droits étendus (retenu), identifiant pris/mal formé/doublon refusés, compte désactivé sans doublon, **aucun mot de passe dans les réponses** |
| SEC-19 | Fuites par filtres, exports, PDF | Élevé | ✅ | Employé : liste d'employés vide, `getSummaryReports` avec `user_ids` d'autrui sans aucun nom ni total d'autrui. PDF non rejoué (pas de rendu serveur) |
| SEC-20 | Piste d'audit | Moyen | ⚠️ | **A-08** : soumission, validation et refus ne créent aucune ligne d'audit ; aucune action d'API n'écrit ni ne supprime l'historique |

Décompte : ✅ 6 (04, 05, 14, 17, 18, 19) · ⚠️ 8 (01, 02, 03, 09, 11, 13, 16, 20) · ❌ 5 (07, 08, 10, 12, 15) · ⏸ 1 (06).

---

## 4. Anomalies

Sévérité = gravité **x** vraisemblance dans le contexte du module. Aucune n'est corrigée dans ce document.

### A-01 — Fichier `conf.php` réel dans l'historique d'un dépôt public — **Critique** (SEC-12)

- **Constat.** Le commit `f6cfa06c` contient `htdocs/conf/conf.php` avec un mot de passe de base de données de **16 caractères (minuscules, majuscules, chiffres, symbole)**, un identifiant `dolibarr_main_instance_unique_id` de **32 caractères hexadécimaux** et l'utilisateur `dolibarr_user`. Ces valeurs ont l'aspect de valeurs réelles. `conf.php.example` et `conf.php.old` contiennent des valeurs d'exemple (11 lettres minuscules). Le dépôt `mohamedksiaa/internship-project` est **public** et possède **1 fork** : l'historique y est donc copié.
- **Autres éléments** : des sauvegardes `backup_avant_*.sql` ont été commitées (tables TimeFlow partielles de 3 à 52 Ko, sans compte ni condensat), puis retirées de l'arbre ; tout un arbre Dolibarr est présent dans l'historique ; `composer.phar` (3,6 Mo) est suivi par Git. Les 378 correspondances brutes du balayage viennent presque toutes de cet arbre Dolibarr (valeurs par défaut) ; la seule occurrence `sk_live_` est un libellé de `stripe.php` (faux positif).
- **Impact.** Quiconque clone le dépôt connaît un identifiant de connexion à la base et la clé d'instance. Celle-ci sert à dériver des liens publics (cartes de visite d'utilisateurs) et à chiffrer les valeurs « dolcrypt ».
- **Recommandations** (décisions du responsable du 26 septembre) : (1) rotation du mot de passe de base — **prise en charge par le responsable** ; (2) régénération de `instance_unique_id` **après** examen de l'impact (§5.2) ; (3) réécriture de l'historique **plus tard, dans une étape dédiée**, en tenant compte du fork ; (4) empêcher la récidive : ajouter `conf.php`, `conf/conf.php*`, `/*.sql` et `*.dump` au `.gitignore`. **Attention** : ne pas ajouter `*.sql` sans exception, car `sql/` contient les schémas de tables **suivis** (`llx_timeflow_*.sql`) indispensables à l'installation ; si la règle globale est voulue, ajouter `!sql/*.sql`. Un `.gitignore` n'empêche pas l'ajout d'un fichier déjà suivi.
- **Preuve.** Analyse en lecture seule (valeurs masquées), `preuves/SECURITE/SEC-12/`.

### A-02 — `submitEntry` sans contrôle de propriétaire ni d'état — **Élevée** (SEC-07, SEC-08)

- **Constat.** `TimeEntry::submitEntry()` (`class/timeentry.class.php:1849`) charge la saisie, vérifie la date de fin et la durée maximale, puis passe le statut à « soumis » **sans comparer `fk_user` à l'utilisateur connecté** et **sans regarder le statut courant**.
- **Essai 1 (autrui).** `zz_nf_employee` (droits `read`+`write`) soumet des brouillons de `zz_nf_manager` et de `zz_nf_admin` : **4 essais sur 4 réussis** (JSON et GET). Base : `status=1`, `fk_user_submit=<employé>`, sur des lignes dont `fk_user` est la victime.
- **Essai 2 (régression).** L'employé re-soumet **sa propre** saisie déjà validée : le statut passe de **2 (validée) à 1 (soumise)** ; la validation est perdue.
- **Impact.** Un utilisateur ordinaire peut geler les brouillons d'un collègue (une saisie non brouillon ne peut plus être supprimée par son auteur), polluer la file de validation et annuler des validations acquises (facturation, paie). **Aucune trace** dans la piste d'audit (A-08).
- **Recommandation.** Exiger `fk_user == $user->id` (et le droit `write`), n'accepter que le statut « brouillon » (ou « refusé » si la re-soumission est voulue) ; PR séparée avec tests de non-régression.
- **Preuve.** `preuves/SECURITE/SEC-07-08/`.

### A-03 — Import Clockify accessible avec le seul droit `write` : saisies validées au nom d'autrui — **Élevée** (SEC-08)

- **Constat.** `previewClockifyImport`, `resolveClockifyMapping` et `executeClockifyImport` exigent seulement `write` (ou admin). Un employé téléverse un CSV dont la colonne « Email » est celle du manager, associe le projet à un projet existant, puis exécute.
- **Résultat en base.** Une saisie est créée avec `fk_user` = **le manager**, `status` = **2 (validée)**, `fk_user_valid` = **l'employé** ; un lien « contributeur » du manager est ajouté au projet visé (`project_contacts_created: 1`). Reproduit 2 fois.
- **Impact.** Fabrication de temps validé pour n'importe quel utilisateur, contournement du circuit de validation, modification des équipes de projet. La création de **comptes** reste protégée (SEC-18 ✅).
- **Décision de conception à prendre (D1).** L'import est-il un outil d'administration (recommandé : `validate` ou administrateur, ou un droit dédié) ou ouvert à tout `write` ? Tant que D1 n'est pas tranchée, la matrice proposée reflète l'état actuel du code.
- **Preuve.** `preuves/SECURITE/SEC-07-08/`.

### A-04 — Injection de formules dans les exports CSV — **Élevée** (SEC-10)

- **Constat.** `frontend/src/utils/csvExport.js` : `csvEscape` double les guillemets et préfixe les dates ISO, mais **ne neutralise aucun préfixe de formule**. Le vrai `downloadCsv` a produit, pour les 8 charges dangereuses (`=1+1`, `+1+1`, `-1+1`, `@SUM(1+1)`, tabulation ou retour chariot + `=`, `=HYPERLINK(…)`, `=cmd|' /C calc'!A0`), des cellules **inchangées** entre guillemets. C'est le **seul** producteur de CSV du module.
- **Impact.** Un libellé de projet ou une description saisis par un utilisateur s'exécutent dans le tableur du manager qui exporte (exfiltration par lien, exécution de commande selon la configuration du tableur).
- **Limite.** L'évaluation par un tableur réel n'a pas pu être observée (LibreOffice absent) ; le défaut est établi au niveau du fichier.
- **Recommandation.** Préfixer d'une apostrophe toute cellule commençant par `=`, `+`, `-`, `@`, tabulation ou retour chariot (en conservant les dates et nombres légitimes) ; tests unitaires sur l'ensemble des charges.

### A-05 — Fichiers internes servis par HTTP, dont `.git` — **Élevée** en déploiement par clone (SEC-15)

- **Constat.** Dans le Docker de test, où le module est un **clone Git** placé sous la racine web, les chemins suivants répondent `200` sans authentification : `.git/HEAD`, `.git/config`, `.git/index`, `.git/packed-refs`, `.git/logs/HEAD`, `.git/refs/heads/main` **et les objets** (`.git/objects/xx/…` : `200`) ; `sql/llx_timeflow_timeentry.sql`, `composer.json`, `composer.lock`, `composer.phar` (3,6 Mo), `package.json`, `frontend/package.json`, `frontend/.env.example`, `README.md`, `ChangeLog.md`, les fichiers de langue. Le listing de répertoire est refusé (403).
- **Impact.** Reconstitution complète du dépôt (code, historique et donc **A-01**) par un tiers. Le cas ne concerne pas un déploiement par archive de release, mais rien dans le dépôt ne l'interdit.
- **Recommandation.** Ne jamais déployer un clone Git sous la racine web ; à défaut, règle Apache refusant `\.git`, `sql/`, `docs/`, `test/`, `frontend/src` et les fichiers de configuration ; retirer `composer.phar` du dépôt.
- **Preuve.** `preuves/SECURITE/SEC-15/` (codes de réponse uniquement ; aucun contenu téléchargé n'est conservé).

### A-06 — Jeton CSRF transporté dans l'URL et écritures acceptées en GET — **Moyenne** (SEC-09)

- **Constat.** Le jeton est passé en paramètre `token` de l'URL. Il apparaît dans **5127 lignes du journal d'accès Apache** et dans les notices du filtre anti-injection du noyau (journal d'erreurs). Toute action d'écriture est acceptée en **GET** avec un jeton valide (constaté : `createManualEntry`). Le cookie de session porte `HttpOnly` et `SameSite=Lax` (pas `Secure` : HTTP en test).
- **Impact.** Le jeton n'est valable que pour la session en cours, ce qui limite l'exploitation ; il n'en reste pas moins exposé à qui lit les journaux ou l'en-tête `Referer`.
- **Recommandation.** Transmettre le jeton dans un en-tête dédié ou le corps ; refuser `GET` pour toute action d'écriture.

### A-07 — Durcissement : version PHP, taille de corps, absence de CSP — **Faible** (SEC-15, SEC-16)

`X-Powered-By: PHP/8.2.7` et `Server: Apache` ; pas de `Content-Security-Policy` ni de HSTS (TLS non terminé en test) ; un corps JSON de **50 Mo est accepté et lu en mémoire** (`php://input`) au lieu d'un refus 413. À traiter au niveau de la configuration Apache/PHP.

### A-08 — Piste d'audit incomplète — **Moyenne** (SEC-20)

Les changements de statut par `submitEntry`, `validateEntry` et `rejectEntry` n'écrivent **aucune ligne** dans `llx_timeflow_timeentry_modification` (le commentaire de `class/timeentry.class.php:641` l'indique : `validateEntry()` appelle `update()` sans motif). Sur 5 781 lignes d'audit : 0 action `submit`, et les lignes `validate` (590) proviennent de l'import. Seules les colonnes `fk_user_submit`, `fk_user_valid` et leurs dates gardent une trace, sans historique. Aggrave A-02. **Recommandation** : journaliser soumission, validation, refus avec auteur, date et motif.

### A-09 — Validation des fichiers d'import et caractères 4 octets — **Faible** (SEC-11, SEC-02)

- La limite documentée (10 Mo) est inatteignable : le serveur refuse au-delà de **2 Mo** (`upload_max_filesize=2M`) et répond « Fichier CSV manquant ».
- Un fichier binaire renommé `.csv`, une archive renommée et un CSV **sans les en-têtes attendus** sont acceptés avec le statut `success` (0 ligne utile) au lieu d'un refus explicite.
- Un **émoji** (UTF-8 sur 4 octets) dans une cellule fait échouer l'aperçu : HTTP 400 avec le message SQL brut « Incorrect string value … for column `dolibarr`.`llx_timeflow_import_mapping`.`source_value` » (échec fonctionnel + divulgation du nom de table et de colonne). Cause : jeu de caractères de la colonne.

### A-10 — Paramètre texte reçu sous forme de tableau : erreur 500 — **Faible** (SEC-01, SEC-03, SEC-16)

- **Constat.** 18 combinaisons par profil (identiques pour l'employé et l'administrateur) répondent **HTTP 500 à corps vide** : `note[]`, `project_label[]`, `reason[]`, `content[]` en GET (`startTimer`, `createManualEntry`, `saveDailyReport`, `updateDailyReport`, `correctTimeEntry`), et `date_from` / `date_to` / `weekStart` sous forme de tableau (GET ou JSON) sur `getSummaryReports`, `getProcessedHistory`, `exportProcessedHistory`, `getWeeklyTimesheet`.
- **Cause (journal PHP).** `Uncaught TypeError` : `strtotime()` (`ajax/timeentry.php:1533`), `preg_match()` (`ajax/timeentry.php:2878`), `strip_tags()` (noyau, via `GETPOST`).
- **Impact.** Faible : pas de fuite (`display_errors` désactivé), pas d'écriture, service disponible ensuite ; mais erreurs fatales PHP évitables et bruit dans les journaux.
- **Recommandation.** Valider le type (chaîne) des paramètres de date et de texte avant usage et répondre 400.

### A-11 — Un tableau JSON est converti en identifiant 1 ; une saisie supprimée reste modifiable — **Faible** (SEC-01, SEC-07)

- **Constat.** `(int) $postData['id']` transforme un **tableau non vide en 1** : `{"id":["x"]}` vise donc l'enregistrement n° 1. Lors de la série d'injection en tant qu'administrateur, cela a fait passer la saisie n° 1 (**supprimée le 18 septembre**, appartenant à l'utilisateur 1) du statut 2 au statut **9 (refusée)**, avec `fk_user_valid` et `fk_user_submit` du compte de test, et a mis à jour l'horodatage du compte rendu n° 1. Les actions de validation, refus et soumission **ne vérifient pas `date_delete`**.
- **Effet sur l'environnement de test.** Ces deux lignes préexistantes ont été modifiées par le test lui-même (voir §7). Elles sont signalées et **non restaurées sans accord**.
- **Recommandation.** Ignorer les valeurs non scalaires (400) et refuser toute action d'état sur une saisie supprimée.

---

## 5. Observations et informations

### 5.1 Points conformes notables

Filtre anti-injection du noyau : refus `403` de toute charge GET contenant `"` ou `UNION SELECT` (3 280 refus par profil sur 34 440 requêtes) — il **ne protège pas le corps JSON**, que le module traite lui-même correctement. Les champs réservés sont ignorés ; les 12 `startTimer` simultanés ne créent qu'un chronomètre ; le compte désactivé perd l'accès à la requête suivante.

### 5.2 Impact d'une régénération de `instance_unique_id` (demandé, **rien n'a été modifié**)

Le code de Dolibarr 19 (lecture seule) l'utilise comme suit :

| Usage | Effet d'un changement | Référence |
|---|---|---|
| Préfixe de session : `sha1('dolibarr' . id)` | **Toutes les sessions ouvertes sont perdues** (nom du cookie modifié) ; reconnexion de chacun | `functions.lib.php` (`dol_getprefix`) |
| Clé par défaut de `dolEncrypt` / `dolDecrypt` (sauf si `$dolibarr_main_dolcrypt_key` est défini) | Toute valeur stockée `dolcrypt:…` devient **indéchiffrable** : mots de passe SMTP, secrets OAuth, champs supplémentaires de type mot de passe, coordonnées bancaires, clés d'API (`llx_user.api_key`) | `security.lib.php` |
| **Mot de passe de la base** si `conf.php` le contient sous la forme `dolcrypt:…` | **La connexion à la base échoue : instance inaccessible** | `filefunc.inc.php:495` |
| Liens de réinitialisation de mot de passe en attente | Invalidés | `passwordforgotten.php` |
| Liens publics des cartes de visite / photos publiques d'utilisateurs (`md5(id . 'uservirtualcard' …)`) | Anciens liens et QR codes invalidés | `viewimage.php`, `public/users/view.php` |
| Étiquettes de suivi et de désinscription des publipostages | Liens des courriels déjà envoyés invalidés | `modules_mailings.php` |
| Identifiant de message des courriels, UID vCard, ping statistique | Cosmétique (fils de discussion, doublon de statistique) | `functions.lib.php`, `vcard.class.php`, `main.inc.php` |
| **Non concernés** | Mots de passe des utilisateurs (salés par `MAIN_SECURITY_SALT`), jetons CSRF (liés à la session), données TimeFlow (le module n'utilise pas cette clé) | — |

**Chiffres en base, sur le Docker de test** (lecture seule) : 0 valeur `dolcrypt:` dans `llx_const`, 0 champ supplémentaire de type mot de passe, 0 coordonnée bancaire, 0 jeton OAuth, **4 clés d'API** stockées **en clair** (12 caractères), 13 comptes hors comptes de test. **Pour la base de développement, à mesurer par le responsable** avec les requêtes suivantes : `SELECT COUNT(*) FROM llx_const WHERE value LIKE 'dolcrypt:%';` · `SELECT COUNT(*) FROM llx_user WHERE api_key IS NOT NULL AND api_key<>'';` · `SELECT COUNT(*) FROM llx_societe_rib;` · `SELECT COUNT(*) FROM llx_extrafields WHERE type='password';` · `SELECT COUNT(*) FROM llx_oauth_token;`. Vérifier aussi que `$dolibarr_main_db_pass` de `conf.php` ne commence pas par `dolcrypt:`. **Ordre conseillé** : sauvegarder ; noter les secrets chiffrés à ressaisir (SMTP, OAuth) ; changer le mot de passe de base ; changer `instance_unique_id` ; ressaisir ; prévenir les utilisateurs de la reconnexion.

### 5.3 Observations hors périmètre du module (noyau Dolibarr)

- Les mots de passe des comptes du Docker sont stockés sous forme de **condensat MD5 de 32 caractères non salé** (`MAIN_SECURITY_HASH_ALGO` non défini). Recommandation de configuration : `password_hash`.
- Le changement de mot de passe invalide les sessions du compte (constaté à la remise du mot de passe initial).
- Les mots de passe de test du `docker-compose.yml` sont en clair (jetables, documentés au plan, annexe C9).

### 5.4 `react-router` : le mode concerné n'est pas utilisé

L'avis GHSA-qwww-vcr4-c8h2 vise le **mode RSC** (composants serveur React). L'application est une SPA Vite avec `HashRouter` (`frontend/src/App.jsx`) ; aucun appel RSC (`unstable_*`, `react-router/rsc`) dans le code. **Non atteignable.** Le verrou `package-lock.json` épingle pourtant la version 7.18.1 (vulnérable) alors que l'arbre installé localement est en 7.18.4 : **la mise à jour du verrou est recommandée dans une PR séparée**, avec exécution de la suite de tests du frontend.

### 5.5 Observations fonctionnelles rencontrées en chemin (à traiter hors sécurité)

- **Import : décalage horaire et faux « chevauchement ».** Des lignes consécutives d'un CSV sont enregistrées avec **1 h de décalage** par rapport au fichier (fuseau du serveur : `Africa/Tunis`), et la ligne suivante d'un même utilisateur est rejetée à tort comme `overlap` (le rapport l'indique dans `unresolved_rows`). À vérifier avec le correctif de fuseau (PR n° 27).
- `startTimer` répond « Veuillez sélectionner un projet » à un utilisateur qui ne voit aucun projet.

---

## 6. Recommandations et PR de correctifs proposées

Une PR par anomalie ou groupe cohérent, **après relecture de ce rapport** :

| PR | Contenu | Anomalie(s) | Priorité |
|---|---|---|---|
| S1 | `.gitignore` (conf, dumps) ; retrait de `composer.phar` ; plus tard, purge d'historique dédiée | A-01 | Critique |
| S2 | `submitEntry` : propriétaire, droit et état ; tests | A-02 | Élevée |
| S3 | Droit requis pour l'import (décision D1) ; tests | A-03 | Élevée |
| S4 | Neutralisation des formules CSV ; tests | A-04 | Élevée |
| S5 | Interdire `.git`, `sql/`, `docs/`… par règle Apache ; documentation de déploiement | A-05 | Élevée |
| S6 | Jeton hors URL ; méthode POST obligatoire pour les écritures | A-06 | Moyenne |
| S7 | Journalisation de la soumission, validation, refus | A-08 | Moyenne |
| S8 | Import : validation des en-têtes, limite cohérente, `utf8mb4`, message d'erreur générique ; typage des paramètres (tableaux) ; saisie supprimée non modifiable | A-09, A-10, A-11 | Faible |
| S9 | Mise à jour du verrou `react-router` | SEC-13 | Faible |
| S10 | Configuration serveur : `expose_php`, `ServerTokens`, taille de corps, CSP | A-07 | Faible |
| — | Résultats de `SEC-06` (matrice) | à venir | — |

---

## 7. Comptes et données de test : cycle de vie

**Créés le 26 septembre 2026 (12 h 35) puis supprimés à la fin de la phase** (feu vert du responsable pour la création ; suppression prévue au plan).

| Élément | Avant les essais (= sauvegarde) | Pendant | Après nettoyage |
|---|---|---|---|
| Comptes (`llx_user`) | 13 | 19 (4 comptes de test + 2 comptes créés par l'import) | **13** |
| Droits utilisateur | 78 | 93 | **78** |
| Saisies | 563 | 722 | **563** |
| Lignes d'audit | 4 904 | 6 075 | **4 904** |
| Comptes rendus | 2 | 19 | **2** |
| Projets | 8 | 45 | **8** |
| Clients | 3 | 31 | **3** |
| Groupes | 7 | 36 | **7** |
| Contacts d'éléments | 16 | 56 | **16** |
| Correspondances d'import / liens | 24 / 13 / 6 / 26 | 183 / 84 / 41 / 70 | **24 / 13 / 6 / 26** |
| Tâches | 10 | 133 | **10** |

**Méthode.** Suppression ciblée (lignes des comptes `zz_nf_*` et lignes créées le 26 septembre dans les tables touchées), en **une transaction** dont le résultat devait égaler les comptages de la sauvegarde avant validation ; les six comptes ont ensuite été supprimés par l'API Dolibarr. Le clone Docker n'a jamais quitté la branche `main` (commit `10ea93f3`).

**Contrôle final : comparaison ligne à ligne de toutes les tables (387) avec la sauvegarde** chargée dans un schéma temporaire (supprimé ensuite). Écarts restants :

| Table | Écart | Origine |
|---|---|---|
| `llx_timeflow_timeentry` (1 ligne, n° 1) | statut 2 → 9, validateur et soumetteur = compte de test supprimé | **Effet collatéral du test** (A-11) |
| `llx_timeflow_daily_report` (1 ligne, n° 1) | horodatage `tms` mis à jour | **Effet collatéral du test** (A-11) |
| `llx_user` (compte `admin`) | dernière connexion | Connexion à l'instance, sans lien avec les essais |
| `llx_const` (10 lignes `TIMEFLOW_*`), `llx_cronjob` (2), `llx_timeflow_late_check` (+1) | horodatages et passage des tâches planifiées | Redémarrage de Docker et cron du module |

**Restauration proposée** (non exécutée, en attente d'accord) : remettre les deux lignes n° 1 aux valeurs de la sauvegarde.

Fichiers temporaires : les 1 400 fichiers `imp*` du dossier `/tmp` du conteneur (copies de CSV laissées par mes anciens essais en ligne de commande, propriétaire root, datés du 25 septembre) et mes scripts ont été supprimés ; **aucun envoi web du 26 septembre n'a laissé de fichier**.

---

## Annexe A — Matrice de droits proposée (SEC-06, **à valider**)

Codes : **OK** accepté · **OWN** accepté, périmètre limité à l'appelant · **403** refusé · **401** sans session (ou renvoi vers la connexion), jamais de donnée. Profils : ANO anonyme · NOR sans droit TimeFlow · EMP `read`+`write` · MGR `read`+`write`+`readall` · ADM administrateur avec les 6 droits. La colonne « code actuel » signale ce que la lecture du code laisse prévoir quand cela diffère de la proposition ; **SEC-06 le confirmera ou l'infirmera**.

| Action | Droit | ANO | NOR | EMP | MGR | ADM | Code actuel (lecture) |
|---|---|---|---|---|---|---|---|
| `startTimer` | write | 401 | 403 | OWN | OWN | OK | aucun test read/write dans l’endpoint (seulement isModEnabled + session + jeton) |
| `createManualEntry` | write | 401 | 403 | OWN | OWN | OK | idem |
| `submitEntry` | write | 401 | 403 | OWN | OWN | OK | ni propriétaire, ni état, ni droit write vérifiés (anomalie SEC-07 prouvée) |
| `stopTimer` | write | 401 | 403 | OWN | OWN | OK | propriétaire vérifié dans la classe ; pas de test write |
| `restartTimer` | write | 401 | 403 | OWN | OWN | OK | propriétaire vérifié ; pas de test write |
| `deleteTimeEntry` | write | 401 | 403 | OWN | OWN | OK | propriétaire + statut vérifiés ; pas de test write |
| `correctTimeEntry` | write | 401 | 403 | OWN | OWN | OK | exige write ET propriétaire ; pas de repli « admin » (un admin sans droit write explicite est refusé) |
| `saveDailyReport` | write | 401 | 403 | OWN | OWN | OK | aucun test write |
| `updateDailyReport` | write | 401 | 403 | OWN | OWN | OK |  |
| `deleteDailyReport` | write | 401 | 403 | OWN | OWN | OK |  |
| `getActiveTimer` | read | 401 | 403 | OWN | OK | OK | aucun test read (un compte sans droit obtient 200 : constat fortuit lors de SEC-14) |
| `getProjects` | read | 401 | 403 | OWN | OK | OK |  |
| `getTimeFlowProjects` | read | 401 | 403 | OWN | OK | OK |  |
| `getTasks` | read | 401 | 403 | OWN | OK | OK |  |
| `getTimeEntries` | read | 401 | 403 | OWN | OK | OK | aucun test read |
| `getWeeklyTimesheet` | read | 401 | 403 | OWN | OK | OK | aucun test read |
| `getSummaryReports` | read | 401 | 403 | OWN | OK | OK | aucun test read ; périmètre selon readall |
| `getDashboardFilterOptions` | read | 401 | 403 | OWN | OK | OK |  |
| `getProcessedHistory` | read | 401 | 403 | OWN | OK | OK |  |
| `exportProcessedHistory` | read | 401 | 403 | OWN | OK | OK |  |
| `exportGlobalCsv` | read | 401 | 403 | OWN | OK | OK |  |
| `getMyDailyReports` | read | 401 | 403 | OWN | OK | OK |  |
| `getDailyReports` | read | 401 | 403 | OWN | OK | OK | readall OU validate voient tout ; sinon les siens |
| `getTimeEntryUpdates` | read | 401 | 403 | OWN | OK | OK | scope=validation exige validate ; sinon aucun test read |
| `getModificationHistory` | read | 401 | 403 | OWN | OK | OK | lecture limitée à ses saisies sans readall/validate |
| `getTimeFlowUsers` | readall | 401 | 403 | 403 | OK | OK | readall (ou admin) |
| `getUsersPresence` | readall | 401 | 403 | 403 | OK | OK | readall (ou admin) |
| `getMyNotifications` | readall | 401 | 403 | 403 | OK | OK |  |
| `markNotificationsRead` | readall | 401 | 403 | 403 | OK | OK |  |
| `getAlertPreferences` | readall | 401 | 403 | 403 | OK | OK |  |
| `saveAlertPreferences` | readall | 401 | 403 | 403 | OK | OK |  |
| `getValidationEntries` | validate | 401 | 403 | 403 | 403 | OK | validate (ou admin) |
| `validateEntry` | validate | 401 | 403 | 403 | 403 | OK |  |
| `rejectEntry` | validate | 401 | 403 | 403 | 403 | OK |  |
| `validateDailyReport` | validate | 401 | 403 | 403 | 403 | OK |  |
| `rejectDailyReport` | validate | 401 | 403 | 403 | 403 | OK |  |
| `saveExpectedAbsence` | readall+validate | 401 | 403 | 403 | 403 | OK | readall ET validate (ou admin) |
| `deleteExpectedAbsence` | readall+validate | 401 | 403 | 403 | 403 | OK |  |
| `previewClockifyImport` | write | 401 | 403 | OK | OK | OK | write (ou admin) |
| `executeClockifyImport` | write | 401 | 403 | OK | OK | OK | write (ou admin) : anomalie SEC-08 prouvée |
| `resolveClockifyMapping` | write | 401 | 403 | OK | OK | OK | write (ou admin) ; création de compte : droit natif user->creer |
| `listActiveUsers` | write | 401 | 403 | OK | OK | OK |  |
| `listUserGroups` | write | 401 | 403 | OK | OK | OK |  |
| `listActiveThirdParties` | write | 401 | 403 | OK | OK | OK |  |

**Décisions à trancher.** D1 : import réservé aux administrateurs / `validate` (recommandé) ou ouvert à `write` ? D2 : un compte **sans aucun droit TimeFlow** doit-il être refusé (403) partout (proposé) ? D3 : un administrateur **sans** droits TimeFlow explicites (cas d'un compte administrateur créé par un script) doit-il fonctionner ? (`correctTimeEntry` n'a pas de repli « admin »).

## Annexe B — Paramètres lus par action

Extraction statique (`scripts d'inventaire`) : paramètres GET/JSON lus par le bloc de chaque action et par les fonctions qu'il appelle. Certains blocs partagent du code (notes) ; le corpus d'injection a donc été appliqué aux **40 noms de paramètres** de l'ensemble du point d'entrée pour chaque action.

| Action | Paramètres |
|---|---|
| `getActiveTimer` | — |
| `startTimer` | `billable`, `fk_project`, `fk_task`, `note`, `project_label` |
| `createManualEntry` | `billable`, `date_end`, `date_start`, `fk_project`, `fk_task`, `note`, `project_label`, `reason`, `tags`, `thm` |
| `submitEntry` | `id` |
| `stopTimer` | `id` |
| `restartTimer` | `id` |
| `deleteTimeEntry` | `id` |
| `getProjects` | — |
| `getTimeFlowProjects` | `client_id`, `date_from`, `date_to`, `page`, `per_page`, `search` |
| `getTimeFlowUsers` | `page`, `per_page` |
| `getUsersPresence` | `date`, `page`, `per_page` |
| `saveExpectedAbsence` | — |
| `deleteExpectedAbsence` | `date`, `reason_note`, `reason_type`, `user_id` |
| `getMyNotifications` | — |
| `markNotificationsRead` | — |
| `getAlertPreferences` | — |
| `saveAlertPreferences` | `all`, `email_enabled`, `ids`, `limit` |
| `exportGlobalCsv` | — |
| `listActiveThirdParties` | — |
| `getTasks` | `limit`, `projectId` |
| `getTimeEntryUpdates` | `billable_only`, `date_from`, `date_to`, `employee_id`, `marker`, `page`, `per_page`, `scope` |
| `getTimeEntries` | `billable_only`, `page`, `per_page` |
| `getValidationEntries` | `date_from`, `date_to`, `employee_id`, `page`, `per_page` |
| `getProcessedHistory` | — |
| `exportProcessedHistory` | — |
| `previewClockifyImport` | `FILE:csv_file` |
| `executeClockifyImport` | `FILE:csv_file` |
| `listActiveUsers` | — |
| `listUserGroups` | — |
| `resolveClockifyMapping` | `decisions` |
| `saveDailyReport` | `content`, `date_report`, `status` |
| `updateDailyReport` | `content`, `id`, `status` |
| `deleteDailyReport` | `id` |
| `getMyDailyReports` | — |
| `getDailyReports` | voir note |
| `validateDailyReport` | `id` |
| `rejectDailyReport` | `id` |
| `getWeeklyTimesheet` | `weekStart` |
| `getSummaryReports` | `client_ids`, `date_from`, `date_to`, `limit`, `only_validated`, `project_ids`, `user_ids` |
| `getDashboardFilterOptions` | — |
| `validateEntry` | `id` |
| `rejectEntry` | `id` |
| `correctTimeEntry` | `billable`, `date_end`, `date_start`, `id`, `reason` |
| `getModificationHistory` | `entryId`, `id` |

## Annexe C — Preuves

Dossier `docs/tests/preuves/SECURITE/` : journaux JSON des séries (jetons et adresses masqués), sorties d'audit npm et composer, résultats par cas. Aucun mot de passe, jeton ou valeur de secret n'y figure.
