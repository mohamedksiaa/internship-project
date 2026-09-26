# Plan de tests non fonctionnels — module TimeFlow

| | |
|---|---|
| **Module** | TimeFlow (module Dolibarr : back-end PHP + interface React/Vite) |
| **Versions cibles** | Dolibarr 19.0.2 pour toutes les phases ; Dolibarr 22.0.4 en fin de parcours, sur un second environnement à version fixée (voir §0.5) |
| **Statut du document** | Plan **validé le 2026-09-25** avec les ajustements du §0.7 (priorisation, comptes de test, environnement 22.0.4). Deux points restent à confirmer explicitement : seuils et matrice de droits (§0.7) |
| **Axes, dans l'ordre** | 1. Sécurité · 2. Tolérance aux pannes · 3. Disponibilité · 4. Scalabilité |
| **Livrables par axe** | `docs/tests/RAPPORT_SECURITE.md`, `RAPPORT_PANNES.md`, `RAPPORT_DISPONIBILITE.md`, `RAPPORT_SCALABILITE.md` (modèle en annexe A) |

---

## 0. Cadre général

### 0.1 Objectif

Démontrer, par des essais **reproductibles et mesurables**, que le module reste sûr, robuste, disponible et performant au-delà de ses fonctionnalités. Chaque cas de test a un identifiant stable (`SEC-01`, `PAN-01`, `DISP-01`, `SCAL-01`…) repris tel quel dans les rapports, pour que chaque affirmation de la soutenance renvoie à une preuve.

### 0.2 Règles d'exécution (à respecter à chaque phase)

1. **Docker de test uniquement.** Aucun essai sur l'environnement de développement local.
2. **Sauvegarde préalable par le responsable du projet.** Il sauvegarde la base avant chaque phase ; je ne démarre pas une phase sans sa confirmation.
3. **Rien de destructif sans accord explicite** et nominatif. Sont considérés comme destructifs : arrêt, `kill` ou redémarrage d'un conteneur ; coupure réseau ; remplissage disque ; chargement d'un jeu de données volumineux ; activation du job de sauvegarde ; restauration ; toute requête d'écriture de masse ; tout test de charge. Chaque cas de ce plan indique s'il est destructif (**⚠ accord requis**).
4. **Remise en état.** À la fin de chaque phase, le clone Docker est remis sur `main` (`git status` propre, aucune différence avec `origin/main`) et **je le confirme explicitement**. Les données de test que j'ai créées sont supprimées ou la base est restaurée à partir de la sauvegarde.
5. **Corrections séparées du rapport.** Le rapport d'une phase ne contient aucun correctif. Chaque anomalie, ou groupe cohérent d'anomalies, est corrigée dans **sa propre PR** (une branche, des commits clairs, pas de merge par moi), qui référence l'identifiant du cas (`SEC-07`…). Le rapport est ensuite mis à jour avec le statut « corrigé (PR #n) ».
6. **Aucun mot de passe saisi par moi.** Les sessions authentifiées nécessaires (tests d'accès, de charge) reposent sur des **comptes de test dédiés** dont le mode d'authentification est validé avec le responsable avant la phase.
7. **Aucune donnée réelle dans les rapports.** Les captures et extraits de logs sont caviardés (adresses, jetons, identifiants).

### 0.3 Niveaux de risque

| Niveau | Signification pour une anomalie | Délai de correction visé |
|---|---|---|
| **Critique** | Compromission de données ou de comptes, perte de données, service inutilisable | Avant toute démonstration |
| **Élevé** | Fuite ou altération limitée, indisponibilité prolongée, dégradation majeure | Avant la soutenance |
| **Moyen** | Défaut de robustesse ou de performance sans atteinte aux données | Planifié |
| **Faible** | Amélioration, bonne pratique, information | Perspective |

### 0.4 Statuts d'un résultat

✅ conforme au critère · ❌ non conforme (anomalie ouverte) · ⚠️ conforme avec réserve, ou non concluant / partiellement testable · ⏭ non exécuté (avec la raison).

### 0.5 Environnement et hypothèses communes

- **Environnement de test** : les 4 conteneurs du dossier `docker-timeflow-test` (`timeflow-mariadb` MariaDB 10.11, `timeflow-dolibarr` et `timeflow-dolibarr-cron` sur `tuxgasy/dolibarr:latest` = Dolibarr 19.0.2, `timeflow-mailpit` comme puits de courrier). Fuseau `Africa/Tunis`.
- **Dolibarr 22.0.4** : **toutes les phases se déroulent sur le Docker 19.0.2.** À la fin du parcours, un **second environnement Docker** avec une image Dolibarr 22 à **version fixée** (pas de balise `latest`) sera créé, sur demande du responsable, pour **rejouer les cas critiques** (marqués **[19+22]**). Cet environnement n'est pas créé avant cette étape ; d'ici là les cas [19+22] restent à l'état « à rejouer ».
- **Comptes de test** (4 comptes dédiés, préfixe `zz_nf_`, créés au début de chaque phase, connexion par une **session Dolibarr normale**) :

| Compte | Droits | Rôle dans les essais |
|---|---|---|
| `zz_nf_admin` | Administrateur Dolibarr | Référence « tout autorisé », cible des essais de droits d'administration |
| `zz_nf_manager` | TimeFlow `read`, `write`, `readall` (sans `validate`) | Responsable qui lit tout mais ne valide pas ; **victime** des essais d'IDOR (ses saisies et comptes rendus servent de cibles) |
| `zz_nf_employee` | TimeFlow `read`, `write` | Employé simple : **attaquant** dans les essais d'accès horizontal et vertical |
| `zz_nf_norights` | Aucun droit TimeFlow | Utilisateur connecté sans le module |

  Le profil « anonyme » n'est pas un compte : c'est une requête sans session. Les cas qui exigent `readall`+`validate` sont couverts par `zz_nf_admin` (qui possède tout) contre `zz_nf_manager` (qui n'a pas `validate`). **Ces comptes, et les données créées avec eux, sont supprimés à la fin de chaque phase ; le rapport de la phase le mentionne** (liste des comptes créés, puis supprimés, avec les comptages avant/après). Les mots de passe sont générés aléatoirement, ne figurent dans aucun fichier du dépôt ni dans aucun rapport.
- **Traçabilité** : les scripts d'essai sont versionnés dans le dépôt (dossier `tests/nonfunctional/`, ajouté dans une PR séparée lors de la première phase) ; les preuves (sorties, captures, `EXPLAIN`) sont rangées dans `docs/tests/preuves/<AXE>/<ID>/`.
- **Références** : OWASP Top 10 (2021), OWASP ASVS niveau 2 (chapitres V4 contrôle d'accès, V5 validation, V13 API), OWASP Testing Guide, CWE (89, 79, 639, 352, 1236).

### 0.6 Déroulement

| Phase | Axe | Prérequis | Cas destructifs ? | Livrables |
|---|---|---|---|---|
| 1 | Sécurité | Sauvegarde ; comptes de test | Écritures ciblées seulement | `RAPPORT_SECURITE.md` + PR de correctifs |
| 2 | Tolérance aux pannes | Sauvegarde ; accord par cas | **Oui** (arrêts de conteneurs) | `RAPPORT_PANNES.md` + PR |
| 3 | Disponibilité | Sauvegarde ; accord par cas | **Oui** (redémarrages, restauration) | `RAPPORT_DISPONIBILITE.md` + PR |
| 4 | Scalabilité | Sauvegarde ; accord pour le jeu de données | **Oui** (volumétrie, charge) | `RAPPORT_SCALABILITE.md` + PR |

Fin de phase : rapport → remise du clone sur `main` + confirmation → revue avec le responsable → PR de correctifs → mise à jour du rapport.

### 0.7 Ajustements validés par le responsable (2026-09-25)

1. **Priorisation.** On exécute **d'abord tous les cas de risque « critique » puis « élevé »** (42 cas, dont `DISP-10` optionnel). Les cas de risque **« moyen »** (18 cas) sont exécutés **si le temps le permet**, dans l'ordre de l'axe. Deux cas deviennent **optionnels** : l'**essai de disponibilité de 24 h** (`DISP-10`) et le **palier de 500 000 saisies** de `SCAL-10` (les paliers 10 000, 50 000 et 100 000 restent obligatoires). Un cas non exécuté est marqué ⏭ dans le rapport avec sa raison.
2. **Seuils** (RTO 5 min, RPO 24 h, disponibilité 99,5 %, temps de réponse du §4.2, etc.) : **à confirmer explicitement.** Le message de validation contenait un champ à compléter laissé en l'état ; ces seuils restent donc **proposés** et sont utilisés comme critères provisoires. Toute correction sera reportée ici avant l'axe concerné.
3. **Matrice des droits attendus par action** (`SEC-06`) : **à confirmer explicitement**, pour la même raison. Une **proposition dérivée du code** est produite en préparation de la phase 1 et soumise au responsable ; `SEC-06` n'est pas exécuté tant qu'elle n'est pas validée.
4. **Comptes de test** : 4 comptes dédiés, session Dolibarr normale, supprimés à la fin de chaque phase (§0.5).
5. **Dolibarr 22.0.4** : toutes les phases sur le Docker 19.0.2 ; second environnement à version fixée créé **à la fin**, sur demande, pour rejouer les cas critiques (§0.5). Pas de création anticipée.

---

## 1. Axe Sécurité

### 1.1 Périmètre

- **API** : `ajax/timeentry.php`, point d'entrée unique de **44 actions** (inventaire en annexe B), toutes derrière une session Dolibarr et un jeton.
- **Interface React** : rendu des données saisies par les utilisateurs ou importées, paramètres d'URL, exports CSV et PDF.
- **Import Clockify** : téléversement de CSV, création de projets, groupes, clients et **comptes utilisateurs**.
- **Courriels** d'alerte (contenu HTML, en-têtes).
- **Dépôt et chaîne de construction** : secrets, dépendances npm et composer, fichiers exposés par le serveur web.
- **Hors périmètre** : le noyau Dolibarr (authentification, gestion de session, pages natives), le durcissement du serveur Apache/PHP de l'image officielle, le chiffrement du transport (TLS n'est pas terminé dans le Docker de test). Les points touchant le noyau sont notés comme **observations**, pas comme anomalies du module.

### 1.2 Hypothèses

- L'attaquant est un **utilisateur authentifié à faibles droits** (cas le plus réaliste), ou un tiers qui piège un utilisateur connecté (CSRF, XSS). Un attaquant anonyme est testé en complément.
- Les droits attendus sont ceux du module : `read`, `write`, `readall`, `validate`, `delete`, `deletevalidated`, plus le droit natif `user->creer` pour la création de comptes par l'import. La **matrice de droits attendus** est fixée avec le responsable avant l'exécution (SEC-06) : sans elle, « attendu » n'a pas de sens.
- Points d'attention relevés **à la lecture du code**, à confirmer ou infirmer par les essais (ce ne sont pas des constats) : voir annexe C, éléments C1, C2, C4, C9.

### 1.3 Outils

`curl` et un jeu de scripts (PowerShell ou Node) pour le rejeu d'API · **OWASP ZAP** (analyse passive + scan actif limité au Docker de test) · **sqlmap** (niveau/risque limités, uniquement contre le Docker de test, avec autorisation écrite) · **puppeteer + Chrome** (détection d'exécution de scripts, mode hors ligne) · **LibreOffice en ligne de commande** (ouverture des CSV exportés) · **gitleaks** et **trufflehog** (secrets, historique complet) · **npm audit** (`--omit=dev` puis complet) · **composer audit** · **semgrep** (règles PHP/JS de sécurité, lecture seule).

### 1.4 Synthèse des cas

| ID | Titre | Risque |
|---|---|---|
| SEC-01 | Injection SQL sur les 44 actions ajax | Critique |
| SEC-02 | Injection SQL de second ordre (import, valeurs stockées) | Critique |
| SEC-03 | Injection SQL via les filtres, dates et paramètres de tri | Élevé |
| SEC-04 | XSS stocké (libellés, commentaires, imports) | Critique |
| SEC-05 | XSS réfléchi / DOM via les paramètres d'URL | Élevé |
| SEC-06 | Contrôle d'accès vertical : matrice action × profil | Critique |
| SEC-07 | IDOR : lecture ou modification des données d'autrui par changement d'identifiant | Critique |
| SEC-08 | Élévation de privilèges et affectation de masse | Critique |
| SEC-09 | CSRF et méthode HTTP | Élevé |
| SEC-10 | Injection de formules dans les exports CSV | Élevé |
| SEC-11 | Validation des fichiers d'import | Élevé |
| SEC-12 | Secrets dans le dépôt et son historique | Critique |
| SEC-13 | Vulnérabilités des dépendances (npm audit, composer audit) | Élevé |
| SEC-14 | Authentification et session de l'API | Élevé |
| SEC-15 | Divulgation d'informations et fichiers exposés | Moyen |
| SEC-16 | Robustesse aux entrées inattendues | Moyen |
| SEC-17 | Sécurité des courriels d'alerte | Moyen |
| SEC-18 | Création de comptes par l'import (non-régression sécurité) | Critique |
| SEC-19 | Fuites par les listes de filtres, exports et PDF | Élevé |
| SEC-20 | Intégrité de la piste d'audit | Moyen |

### 1.5 Cas de test

#### SEC-01 — Injection SQL sur les 44 actions ajax
- **Objectif** : prouver qu'aucun paramètre d'aucune action n'atteint le SQL sans être échappé, typé ou paramétré.
- **Procédure** : (1) extraire par analyse statique (semgrep + revue) la liste des paramètres lus par chaque action (annexe B) ; (2) pour chaque couple action × paramètre, rejouer, en corps JSON **et** en paramètres GET, un corpus de charges : apostrophe, guillemet, `\`, `' OR '1'='1`, `1) OR 1=1 --`, `1; SELECT SLEEP(5) --`, `UNION SELECT`, séquences hexadécimales, chaînes très longues, `%00`, tableaux à la place des chaînes ; (3) mesurer le temps de réponse pour repérer les injections « à l'aveugle » (`SLEEP`) ; (4) lancer sqlmap sur les actions à paramètres libres ; (5) comparer avant/après la somme de contrôle de chaque table `llx_timeflow_*`.
- **Résultat attendu** : refus propre (400/403) ou valeur traitée comme donnée ; aucune erreur SQL renvoyée ; aucune donnée modifiée.
- **Critère de réussite** : **0** réponse contenant `SQL`, `mysqli`, `syntax`, un nom de table ou un chemin ; **0** réponse 5xx ; **0** écart de somme de contrôle ; **0** écart de temps > 3 s attribuable à `SLEEP` ; sqlmap : « not injectable » sur tous les paramètres.
- **Risque** : Critique

#### SEC-02 — Injection SQL de second ordre
- **Objectif** : vérifier qu'une valeur stockée « inoffensive » n'est pas réinjectée sans échappement lors d'un traitement ultérieur.
- **Procédure** : importer des CSV dont les cellules (projet, client, groupe, email, description, nom d'utilisateur) contiennent `'`, `"`, `\`, `%`, `_`, `';DROP TABLE x;--`, `zz' OR '1'='1` ; relancer l'aperçu, la résolution, l'exécution, la réimportation (clé `import_key`, mappings, liens), les exports, la détection de retards et les filtres du tableau de bord sur ces valeurs.
- **Résultat attendu** : valeurs stockées et relues à l'identique, aucun effet de bord SQL.
- **Critère de réussite** : 0 erreur SQL dans les journaux Dolibarr et MariaDB (`general_log` activé pendant l'essai) ; nombre de lignes de chaque table conforme à l'attendu ; les valeurs sont relues **octet pour octet**.
- **Risque** : Critique

#### SEC-03 — Injection SQL via filtres, dates et paramètres de tri
- **Objectif** : couvrir les entrées « structurelles » : plages de dates, listes d'identifiants (`project_ids`, `client_ids`, `user_ids`), `page`, `per_page`, `limit`, `search`, `status`, `order`.
- **Procédure** : rejouer le corpus de SEC-01 sur ces paramètres ; valeurs limites : négatif, zéro, très grand, flottant, chaîne, tableau imbriqué, > 500 identifiants, dates invalides (`2026-02-30`, `0000-00-00`, `9999-99-99`).
- **Résultat attendu** : 400 « valeur invalide » ou valeur ramenée à une borne sûre ; pas d'exécution de charge.
- **Critère de réussite** : 100 % des valeurs invalides refusées ou neutralisées ; 0 erreur SQL ; pas de requête dont le temps dépasse 5 s.
- **Risque** : Élevé

#### SEC-04 — XSS stocké
- **Objectif** : aucune donnée saisie ou importée ne doit s'exécuter dans le navigateur d'un autre utilisateur.
- **Procédure** : injecter des charges (`<script>`, `<img src=x onerror=…>`, `"><svg onload=…>`, `javascript:`, `<iframe srcdoc>`, entités encodées, Unicode bidirectionnel) dans **tous** les champs texte : titre de projet et de tâche, description d'entrée, motif de correction et de refus, contenu et statut des comptes rendus quotidiens, motif d'absence prévue (`reason_note`), noms d'employés, de clients et de groupes importés, libellés de notification. Les afficher **en tant qu'un autre utilisateur** dans chaque écran (Suivi du temps, Calendrier, Historique, Validation, Rapports, Tableau de bord, cloche, modal d'import) et dans le PDF, le CSV et les courriels. Sonde puppeteer : ouverture de boîtes de dialogue, requêtes sortantes et erreurs console interceptées.
- **Résultat attendu** : texte affiché littéralement, jamais interprété.
- **Critère de réussite** : **0** exécution de script (aucune boîte de dialogue, aucune requête vers l'hôte contrôlé) sur l'ensemble des écrans ; le HTML émis est échappé ; l'export PDF affiche le texte brut.
- **Risque** : Critique

#### SEC-05 — XSS réfléchi / DOM via les paramètres d'URL
- **Objectif** : les paramètres lus dans l'URL (`tab`, `dimension`, `chartType`, `crossWith`, `dateFrom`, `dateTo`, `presenceDate`, `projects`, `clients`, `employees`, `token`) ne sont ni injectés dans le DOM ni interprétés.
- **Procédure** : ouvrir chaque route avec des charges dans chaque paramètre ; observer le DOM, les attributs et la console ; vérifier aussi les liens du courriel d'alerte.
- **Résultat attendu** : valeur inconnue → valeur par défaut, jamais de HTML injecté.
- **Critère de réussite** : 0 exécution de script ; toute valeur hors liste blanche est ignorée.
- **Risque** : Élevé

#### SEC-06 — Contrôle d'accès vertical (matrice action × profil)
- **Objectif** : chaque action n'est accessible qu'aux profils autorisés, **côté serveur**, indépendamment de l'interface.
- **Procédure** : (1) établir avec le responsable la matrice « droit attendu » des 44 actions ; (2) pour chaque action et chacun des 5 profils (anonyme, `zz_nf_norights`, `zz_nf_employee`, `zz_nf_manager`, `zz_nf_admin`), envoyer une requête valide et relever le code et le contenu ; (3) comparer automatiquement à la matrice.
- **Résultat attendu** : 401 sans session, 403 sans le droit requis, 200 sinon.
- **Critère de réussite** : **100 %** des 220 cellules (44 × 5) conformes à la matrice ; toute divergence est une anomalie classée par le risque de l'action.
- **Risque** : Critique

#### SEC-07 — IDOR : accès aux données d'autrui en changeant un identifiant
- **Objectif** : un utilisateur **sans `readall`** ne peut ni lire ni modifier les données d'un autre, quel que soit l'identifiant fourni.
- **Procédure** : avec `zz_nf_employee`, cibler les objets de `zz_nf_manager` et de `zz_nf_admin` (données créées pour l'essai) en substituant les identifiants (énumération par plage) dans : `stopTimer`, `restartTimer`, `submitEntry`, `deleteTimeEntry`, `correctTimeEntry`, `getModificationHistory`, `getTimeEntryUpdates`, `getTimeEntries` (`user_id`, `id`), `getWeeklyTimesheet` (`user_id`), `updateDailyReport`, `deleteDailyReport`, `getMyDailyReports`, `markNotificationsRead` (`ids`), `saveAlertPreferences`, `getTasks` et `startTimer` (projet non autorisé), `getSummaryReports` (`user_ids`), `getDashboardFilterOptions`, `getProcessedHistory`, `exportProcessedHistory`, `exportGlobalCsv`, `getUsersPresence`, `saveExpectedAbsence`. Même essai pour un projet ou un client non visible.
- **Résultat attendu** : 403 ou 404 uniforme (sans distinguer « inexistant » de « interdit » quand c'est possible) ; jamais de donnée d'autrui dans la réponse.
- **Critère de réussite** : **0** ligne appartenant à un autre utilisateur dans les réponses ; **0** modification en base des objets d'autrui (comparaison des sommes de contrôle) ; couverture de **100 %** des actions qui prennent un identifiant.
- **Risque** : Critique

#### SEC-08 — Élévation de privilèges et affectation de masse
- **Objectif** : un utilisateur ne peut pas s'attribuer un droit, valider ses propres saisies ou forcer des champs réservés.
- **Procédure** : (1) valider ou refuser ses propres saisies avec un simple `write` ; (2) rejouer `createManualEntry`, `correctTimeEntry`, `saveDailyReport` avec des champs supplémentaires (`fk_user`, `status`, `fk_user_valid`, `entity`, `import_key`, `date_creation`, `duration`) ; (3) modifier une saisie déjà validée ; (4) supprimer une saisie validée sans `deletevalidated` ; (5) enregistrer une absence prévue sans `validate` ; (6) tenter de créer un compte par l'import avec un droit `write` seul (décision `create_new` forgée).
- **Résultat attendu** : champs réservés ignorés ; opérations refusées (403) sans le droit.
- **Critère de réussite** : aucune saisie n'est créée, modifiée ou validée hors droits ; les champs réservés relus en base sont inchangés ; **0** compte créé sans `admin` ou `user->creer`.
- **Risque** : Critique

#### SEC-09 — CSRF et méthode HTTP
- **Objectif** : une page tierce ne peut pas déclencher d'action d'écriture au nom d'un utilisateur connecté.
- **Procédure** : (1) requêtes sans jeton, avec un jeton vide, périmé, celui d'un autre utilisateur, celui d'une session précédente ; (2) essai depuis une page d'un autre domaine (formulaire auto-soumis, `fetch` avec cookies, types de contenu `text/plain`, `multipart/form-data`) ; (3) actions d'écriture en **GET** ; (4) relever les attributs du cookie de session (`SameSite`, `HttpOnly`, `Secure`) et les en-têtes CORS ; (5) noter que le jeton est passé **dans l'URL** (risque de fuite dans les journaux et en-têtes `Referer`).
- **Résultat attendu** : 403 systématique sans jeton valide ; aucune écriture en GET.
- **Critère de réussite** : 100 % des requêtes d'écriture sans jeton valide refusées ; 0 action réalisée par une page tierce ; le jeton n'apparaît pas dans les journaux du serveur ni dans le `Referer` sortant (sinon : observation classée Moyen).
- **Risque** : Élevé

#### SEC-10 — Injection de formules dans les exports CSV
- **Objectif** : aucune cellule exportée ne peut être interprétée comme une formule par un tableur (CWE-1236).
- **Procédure** : créer projets, tâches, descriptions, noms et motifs commençant par `=`, `+`, `-`, `@`, tabulation, retour chariot, y compris `=HYPERLINK("http://…";"x")` et `=cmd|' /C calc'!A0` ; exporter par **tous** les chemins (export CSV global, historique traité, exports des onglets Rapports, export du tableau de bord) ; ouvrir chaque fichier avec LibreOffice en ligne de commande et inspecter le contenu des cellules.
- **Résultat attendu** : préfixe neutralisant (apostrophe ou espace) ou champ traité comme texte ; aucune formule active.
- **Critère de réussite** : **0** cellule évaluée comme formule sur l'ensemble des exports. *Point d'attention issu de la lecture de `csvExport.js` (annexe C2) : la fonction d'échappement traite les guillemets et les dates ISO mais pas les préfixes de formule ; à confirmer par l'essai.*
- **Risque** : Élevé

#### SEC-11 — Validation des fichiers d'import
- **Objectif** : l'import ne traite que des CSV valides et borne son coût.
- **Procédure** : téléverser : extension non `.csv`, double extension (`x.php.csv`), fichier binaire renommé, archive renommée, fichier vide, en-têtes manquants ou dupliqués, très nombreuses colonnes, cellule de plusieurs Mo, 10 Mo + 1 octet, 100 000 lignes, encodages exotiques (UTF-16, Latin-1, BOM), retours à la ligne mixtes, nom de fichier avec `../` ou caractères de contrôle, cellules de formules, chemins non téléversés (appel avec un chemin local).
- **Résultat attendu** : refus clair (400) des fichiers invalides ; aucun avertissement PHP ; consommation bornée.
- **Critère de réussite** : 100 % des fichiers invalides refusés avec un message explicite ; aucun fichier conservé sur disque après la requête ; pic mémoire < 128 Mo ; durée < 60 s pour le cas de 10 Mo ; **0** écriture en base pour un fichier refusé.
- **Risque** : Élevé

#### SEC-12 — Secrets dans le dépôt et son historique
- **Objectif** : aucun secret valide n'est présent, ni dans l'arbre de travail ni dans l'historique Git.
- **Procédure** : `gitleaks` et `trufflehog` sur **tout l'historique** de toutes les branches ; recherche ciblée (mots de passe, jetons, clés d'API, clés privées, chaînes de connexion, fichiers `.env`, sauvegardes `.sql`) ; contrôle de `.gitignore` ; examen du dossier `git-history-cleanup/` et de son contenu (il indique un nettoyage d'historique passé) ; lecture des fichiers de configuration Docker.
- **Résultat attendu** : aucun secret réel ; les seuls mots de passe présents sont ceux, jetables, du Docker de test, clairement documentés.
- **Critère de réussite** : **0** secret valide détecté (les faux positifs sont justifiés un par un) ; tout secret trouvé est **révoqué** et signalé comme anomalie Critique. *Point d'attention : les mots de passe de test sont en clair dans `docker-compose.yml` (annexe C9) : acceptable en test, à ne jamais réutiliser.*
- **Risque** : Critique

#### SEC-13 — Vulnérabilités des dépendances
- **Objectif** : aucune dépendance de production n'a de vulnérabilité connue de gravité élevée ou critique.
- **Procédure** : `npm audit --omit=dev` puis `npm audit` (dossier `frontend/` et racine), `composer audit` (`composer.lock`), inventaire des versions, examen des dépendances transitives portant les alertes, vérification que le paquet vulnérable est réellement atteignable.
- **Résultat attendu** : rapport d'audit sans alerte haute ou critique en production.
- **Critère de réussite** : **0** alerte haute ou critique sur les dépendances de production ; chaque alerte restante (développement) est justifiée et datée ; le journal d'audit est joint comme preuve.
- **Risque** : Élevé

#### SEC-14 — Authentification et session de l'API
- **Objectif** : l'API n'est jamais utilisable sans session valide.
- **Procédure** : requêtes sans cookie, avec cookie expiré, après déconnexion, avec un utilisateur désactivé en cours de session, avec un cookie d'un autre utilisateur ; vérifier la longueur et l'imprévisibilité du jeton ; comportement après un changement de mot de passe.
- **Résultat attendu** : 401 sans session ; un compte désactivé perd l'accès immédiatement.
- **Critère de réussite** : 100 % des requêtes sans session valide refusées ; accès coupé en moins d'une requête après désactivation.
- **Risque** : Élevé

#### SEC-15 — Divulgation d'informations et fichiers exposés
- **Objectif** : ne rien révéler d'inutile et n'exposer aucun fichier interne.
- **Procédure** : provoquer des erreurs (JSON invalide, types incorrects, identifiants inexistants) et lire les messages ; accès HTTP direct à `sql/`, `docs/`, `test/`, `config/`, `class/`, `lib/`, `.git/`, `composer.json`, `package.json`, sauvegardes ; liste de répertoires ; paramètre `debug` réservé à l'administrateur ; en-têtes (`X-Powered-By`, `Server`), `display_errors`.
- **Résultat attendu** : messages génériques, 403/404 sur les fichiers internes.
- **Critère de réussite** : **0** chemin, version, trace ou requête SQL dans une réponse ; **0** fichier interne servi ; le paramètre `debug` est sans effet pour un non-administrateur.
- **Risque** : Moyen

#### SEC-16 — Robustesse aux entrées inattendues
- **Objectif** : aucune entrée mal formée ne provoque de plantage ni d'état incohérent.
- **Procédure** : JSON invalide ou tronqué, corps de 50 Mo, types inversés (tableau pour chaîne, objet pour entier), `null`, chaînes Unicode extrêmes (emoji, RTL, zéro-largeur, NUL), doublons de clés, en-têtes contradictoires, requêtes concurrentes identiques.
- **Résultat attendu** : 400 ou 413 propre ; le serveur reste disponible.
- **Critère de réussite** : 0 erreur fatale PHP dans les journaux ; 0 réponse 5xx ; le service répond normalement après la salve.
- **Risque** : Moyen

#### SEC-17 — Sécurité des courriels d'alerte
- **Objectif** : le contenu des courriels ne permet ni injection d'en-têtes ni HTML actif.
- **Procédure** : noms d'employés contenant `\r\nBcc: …`, HTML, liens `javascript:` ; lire le courriel reçu dans Mailpit (source brute) ; vérifier l'échappement, les en-têtes et le lien de retour.
- **Résultat attendu** : nom échappé ; aucun en-tête ajouté.
- **Critère de réussite** : 0 en-tête injecté ; 0 balise active dans le corps ; le lien pointe uniquement vers l'application.
- **Risque** : Moyen

#### SEC-18 — Création de comptes par l'import (non-régression sécurité)
- **Objectif** : le compte créé n'a que les droits de base, ne peut pas dupliquer un identifiant existant, et ne rejoint pas de groupe à droits étendus.
- **Procédure** : rejouer les scénarios des PR de l'import : acteur sans droit, login déjà pris, email de compte désactivé, groupe à droits étendus (y compris groupe créé par l'import puis enrichi), identité falsifiée, `create_new` forgé.
- **Résultat attendu** : conforme aux décisions validées.
- **Critère de réussite** : le compte créé possède exactement `timeentry read` + `write` ; 0 compte créé sans droit ; 0 rattachement à un groupe à droits étendus ; les mots de passe n'apparaissent dans aucun rapport ni journal.
- **Risque** : Critique

#### SEC-19 — Fuites par les listes de filtres, exports et PDF
- **Objectif** : les listes de filtres du tableau de bord, les exports et le PDF ne révèlent rien qu'un utilisateur limité ne pourrait pas voir.
- **Procédure** : comparer, pour `zz_nf_employee` et pour `zz_nf_manager` (`readall`), les réponses de `getDashboardFilterOptions`, `getSummaryReports` avec `user_ids`, l'export CSV du tableau de bord et le PDF ; chercher des noms d'autres employés dans chaque sortie.
- **Résultat attendu** : aucune donnée d'autrui pour l'utilisateur limité.
- **Critère de réussite** : **0** occurrence d'un nom, identifiant ou total d'un autre employé dans les sorties de l'utilisateur limité.
- **Risque** : Élevé

#### SEC-20 — Intégrité de la piste d'audit
- **Objectif** : les modifications de saisies sont tracées et la trace ne peut pas être altérée via l'API.
- **Procédure** : modifier, corriger, valider et refuser des saisies ; lire `getModificationHistory` ; tenter d'écrire ou de supprimer une ligne d'historique par l'API ; vérifier auteur, date et motif.
- **Résultat attendu** : chaque modification a une ligne d'audit avec auteur et motif ; aucune action d'API ne modifie l'historique.
- **Critère de réussite** : 100 % des modifications tracées ; 0 chemin d'écriture ou de suppression de l'historique.
- **Risque** : Moyen

---

## 2. Axe Tolérance aux pannes

### 2.1 Périmètre

Comportement du module lorsqu'une dépendance ou un composant tombe : base de données, tâches planifiées (cron), serveur de courrier, serveur web, réseau côté navigateur, processus d'import. On mesure : **absence de perte ou de corruption de données**, **qualité des messages d'erreur**, **reprise automatique**, **absence de doublons à la reprise**.

### 2.2 Hypothèses

- Une seule instance de chaque conteneur (pas de redondance) : la tolérance attendue est la **reprise propre**, pas la continuité de service (voir axe 3 et perspectives).
- Les mécanismes déjà conçus sont vérifiés, pas supposés : marqueur de journée du job d'alertes (clé unique + prise en charge d'une réservation périmée), envoi d'email avec statut, réessais espacés, 3 tentatives maximum, idempotence de l'import par `import_key`, fenêtre de rattrapage du délai maximal de détection.
- Toute coupure est déclenchée par `docker stop/pause/kill` ou une déconnexion réseau du conteneur : **⚠ accord requis, cas par cas**.

### 2.3 Outils

`docker stop / kill / pause / network disconnect` · émulation hors ligne et ralentissement réseau via puppeteer (protocole DevTools) · scripts de charge légère pour créer de la concurrence · lecture des journaux (`docker logs`, syslog Dolibarr, `general_log` MariaDB) · requêtes SQL de contrôle d'état avant/après.

### 2.4 Synthèse des cas

| ID | Titre | Destructif | Risque |
|---|---|---|---|
| PAN-01 | Base de données indisponible | ⚠ | Critique |
| PAN-02 | Base coupée en pleine écriture (atomicité) | ⚠ | Critique |
| PAN-03 | Cron arrêté plusieurs heures puis relancé | ⚠ | Élevé |
| PAN-04 | Serveur de courrier arrêté : l'alerte doit exister | ⚠ | Critique |
| PAN-05 | Serveur de courrier lent ou injoignable (délais) | ⚠ | Moyen |
| PAN-06 | Import interrompu (atomicité et reprise) | ⚠ | Critique |
| PAN-07 | Double exécution simultanée du cron | Faible impact | Critique |
| PAN-08 | Chronomètre actif pendant une panne | ⚠ | Critique |
| PAN-09 | Perte réseau côté navigateur | Non | Élevé |
| PAN-10 | Redémarrage du serveur web pendant des requêtes | ⚠ | Élevé |
| PAN-11 | Concurrence : démarrages simultanés d'un chronomètre | Non | Élevé |
| PAN-12 | Données incohérentes (projet supprimé, compte désactivé, orphelins) | Non | Moyen |
| PAN-13 | Requêtes longues et délai d'exécution PHP | Non | Moyen |
| PAN-14 | Redémarrage pendant l'envoi de courriels (état `sending`) | ⚠ | Moyen |
| PAN-15 | Espace disque ou droits d'écriture insuffisants | ⚠ (sur accord) | Moyen |

### 2.5 Cas de test

#### PAN-01 — Base de données indisponible
- **Objectif** : le module échoue proprement et reprend seul quand la base revient.
- **Procédure** : `docker stop timeflow-mariadb` ; pendant 2 minutes, appeler chaque type d'action (lecture, écriture, cron) et charger l'interface ; relancer la base ; observer la reprise sans redémarrer les autres conteneurs.
- **Résultat attendu** : réponses d'erreur contrôlées (pas de trace PHP, pas de page blanche), message clair dans l'interface, aucune écriture partielle, reprise automatique.
- **Critère de réussite** : 0 trace PHP ou SQL exposée ; 100 % des requêtes pendant la panne renvoient une erreur JSON exploitable ; la première requête valide après le retour de la base réussit en ≤ 30 s ; 0 ligne incohérente dans les tables du module.
- **Risque** : Critique

#### PAN-02 — Base coupée en pleine écriture
- **Objectif** : aucune opération à plusieurs étapes ne laisse un état à moitié écrit.
- **Procédure** : pendant des écritures multi-étapes (création manuelle, validation, exécution d'import, fermeture des chronomètres de minuit), `docker kill timeflow-mariadb` ; redémarrer ; contrôler la cohérence (saisies sans projet valide, comptes créés sans droits, mappings dans un état intermédiaire, notifications sans marqueur de journée).
- **Résultat attendu** : chaque opération est soit complète, soit absente (InnoDB rétablit les transactions ouvertes) ; les étapes non transactionnelles de l'import se rattrapent au second lancement.
- **Critère de réussite** : 0 incohérence relevée par les requêtes de contrôle ; le second lancement de l'opération aboutit à l'état complet attendu.
- **Risque** : Critique

#### PAN-03 — Cron arrêté plusieurs heures
- **Objectif** : le rattrapage respecte les règles fonctionnelles et n'envoie pas de doublons.
- **Procédure** : arrêter `timeflow-dolibarr-cron` (a) avant l'heure limite jusqu'à après le délai maximal de détection, (b) avant l'heure limite jusqu'à l'intérieur de la fenêtre, (c) à cheval sur minuit avec un chronomètre actif ; relancer et lire la sortie du job et l'état des tables.
- **Résultat attendu** : (a) journée `missed` sans alerte ; (b) détection tardive unique ; (c) chronomètres fermés à la reprise selon la règle de minuit ; aucun doublon.
- **Critère de réussite** : 1 seule ligne de journée et au plus 1 notification par responsable ; sortie du job explicite ; délai maximal respecté à la minute.
- **Risque** : Élevé

#### PAN-04 — Serveur de courrier arrêté
- **Objectif** : l'alerte interne existe **même si l'email échoue**, et l'email est renvoyé au retour du serveur.
- **Procédure** : `docker stop timeflow-mailpit` ; provoquer une détection de retard (responsable ayant choisi l'email) ; observer la cloche, `email_status`, `email_attempts`, la sortie du job ; relancer Mailpit et attendre les cycles du cron.
- **Résultat attendu** : notification créée immédiatement ; email en `failed` puis réessayé (au plus 3 tentatives, espacées) ; le job renvoie 0 et l'indique ; à la reprise, 1 email envoyé.
- **Critère de réussite** : notification présente à 100 % ; ≤ 3 tentatives ; **1 seul** email reçu après reprise ; 0 doublon de notification ; durée du job < 60 s malgré la panne.
- **Risque** : Critique

#### PAN-05 — Serveur de courrier lent ou injoignable
- **Objectif** : un SMTP lent ne bloque pas le cron ni les autres alertes.
- **Procédure** : mettre le SMTP en pause (`docker pause`) ; pointer vers une adresse qui n'accepte pas la connexion ; mesurer la durée du job avec 1, 10 puis 50 destinataires.
- **Résultat attendu** : temps de blocage borné par le délai de connexion ; les autres destinataires ne sont pas pénalisés à l'infini.
- **Critère de réussite** : durée du job ≤ 120 s pour 50 destinataires en panne ; le job suivant n'est pas retardé (pas de chevauchement) ; états `failed` correctement enregistrés.
- **Risque** : Moyen

#### PAN-06 — Import interrompu
- **Objectif** : un import coupé à n'importe quel moment peut être relancé et converge vers l'état de l'import complet.
- **Procédure** : lancer l'import d'un fichier de 5 000 lignes ; l'interrompre à 10 points (fermeture du navigateur, `kill` du processus PHP, arrêt du conteneur, dépassement du délai d'exécution) ; relancer chaque fois le **même** fichier ; comparer l'état final à celui d'un import ininterrompu (sommes de contrôle des tables cibles).
- **Résultat attendu** : aucun doublon de saisies, comptes, groupes ou liens ; l'état final est identique.
- **Critère de réussite** : **0** doublon (clé `import_key`, comptes, mappings) ; sommes de contrôle finales égales à celles de la référence pour 10 interruptions sur 10 ; le rapport d'import de la reprise décrit fidèlement ce qui restait à faire.
- **Risque** : Critique

#### PAN-07 — Double exécution du cron
- **Objectif** : deux exécutions simultanées du même job n'aboutissent ni à des doublons ni à un blocage.
- **Procédure** : lancer deux `cron_run_jobs.php` au même instant (et avec un décalage de 1 s) pour le job des alertes et celui de fermeture des chronomètres, pendant une détection réelle.
- **Résultat attendu** : une exécution effectue le travail, l'autre constate « en cours » ou « déjà traité ».
- **Critère de réussite** : 1 ligne de journée ; ≤ 1 notification par (responsable, jour) ; ≤ 1 email par notification ; 0 erreur de clé dupliquée non gérée ; 20 essais consécutifs sans divergence.
- **Risque** : Critique

#### PAN-08 — Chronomètre actif pendant une panne
- **Objectif** : un chronomètre en cours ne perd ni ne fausse du temps lors d'une panne ou d'un redémarrage.
- **Procédure** : démarrer un chronomètre ; (a) redémarrer le serveur web, (b) couper la base 2 minutes, (c) fermer puis rouvrir le navigateur, (d) décaler l'horloge du navigateur de ± 10 minutes, (e) laisser courir jusqu'après minuit ; arrêter le chronomètre et comparer la durée à la référence (horodatages serveur).
- **Résultat attendu** : la durée est calculée à partir des horodatages serveur, pas d'un compteur local ; le chronomètre reste actif après la panne ; la règle de minuit s'applique.
- **Critère de réussite** : écart de durée ≤ 2 s par rapport aux horodatages serveur dans tous les scénarios ; 0 chronomètre perdu ou doublé ; 1 seul chronomètre actif par utilisateur.
- **Risque** : Critique

#### PAN-09 — Perte réseau côté navigateur
- **Objectif** : l'interface gère l'absence de réseau sans corrompre ni dupliquer.
- **Procédure** : avec puppeteer, passer hors ligne pendant : le chargement, le démarrage et l'arrêt d'un chronomètre, l'enregistrement d'un compte rendu, l'export, la cloche (sondage) ; ralentir le réseau (débit bas, latence élevée) ; rétablir ; cliquer plusieurs fois sur un bouton pendant la latence.
- **Résultat attendu** : message d'erreur traduit, aucun état affiché comme réussi alors qu'il ne l'est pas, reprise du sondage, pas de doublon après réémission.
- **Critère de réussite** : 100 % des échecs réseau affichent un message ; 0 saisie en double après 10 clics rapides ; la cloche et le chronomètre se resynchronisent en ≤ 60 s après retour du réseau.
- **Risque** : Élevé

#### PAN-10 — Redémarrage du serveur web pendant des requêtes
- **Objectif** : un redémarrage à chaud ne laisse pas de saisie à moitié écrite.
- **Procédure** : avec une charge d'écritures continue, `docker restart timeflow-dolibarr` ; comparer les requêtes acquittées (200) aux lignes présentes en base.
- **Résultat attendu** : toute requête acquittée est persistée ; toute requête non acquittée est absente ou rejouable sans doublon.
- **Critère de réussite** : 0 écriture acquittée absente de la base ; 0 doublon après réémission par le client.
- **Risque** : Élevé

#### PAN-11 — Concurrence sur un chronomètre
- **Objectif** : un utilisateur ne peut avoir qu'un chronomètre actif et aucune mise à jour n'est perdue.
- **Procédure** : 50 requêtes `startTimer` simultanées pour le même utilisateur ; puis mélange `startTimer`, `stopTimer`, `restartTimer`, `submitEntry` en parallèle sur la même saisie ; relever les erreurs, verrous morts et l'état final.
- **Résultat attendu** : 1 seul chronomètre actif ; les autres appels reçoivent un refus explicite ; état final valide.
- **Critère de réussite** : exactement 1 chronomètre actif à la fin ; 0 mise à jour perdue ; 0 erreur non gérée ; nombre de verrous morts relevé et documenté.
- **Risque** : Élevé

#### PAN-12 — Données incohérentes
- **Objectif** : le module tolère des références disparues.
- **Procédure** : supprimer (côté Dolibarr) un projet, un client, un groupe, ou désactiver un compte alors que des saisies, des chronomètres, des notifications et des mappings d'import y font référence ; ouvrir tous les écrans et relancer job et import.
- **Résultat attendu** : libellé de secours, aucun plantage, avertissements clairs (mappings revalidés).
- **Critère de réussite** : 0 erreur 5xx ; 0 écran en échec ; les avertissements de l'import apparaissent pour 100 % des références disparues.
- **Risque** : Moyen

#### PAN-13 — Requêtes longues et délai d'exécution PHP
- **Objectif** : une opération longue est interrompue proprement.
- **Procédure** : abaisser temporairement `max_execution_time` sur le Docker de test et lancer aperçu, import, export global et tableau de bord sur un volume moyen ; relever l'état après interruption.
- **Résultat attendu** : message d'erreur exploitable ; reprise possible ; pas d'état corrompu.
- **Critère de réussite** : 0 corruption ; message d'erreur clair dans 100 % des cas ; reprise réussie.
- **Risque** : Moyen

#### PAN-14 — Redémarrage pendant l'envoi de courriels
- **Objectif** : un envoi interrompu (`sending`) est repris sans double envoi.
- **Procédure** : interrompre le cron pendant l'envoi (SMTP en pause puis arrêt du conteneur) ; relancer après le délai de péremption de l'état `sending`.
- **Résultat attendu** : l'email est réessayé une fois au plus après péremption.
- **Critère de réussite** : ≤ 1 email reçu par notification ; état final `sent` ou `failed` (jamais `sending` durablement).
- **Risque** : Moyen

#### PAN-15 — Espace disque ou droits d'écriture insuffisants
- **Objectif** : le module échoue proprement quand il ne peut pas écrire (journaux, répertoire de documents, fichiers temporaires).
- **Procédure** : **sur accord uniquement**, remplir un volume de test restreint ou retirer le droit d'écriture du répertoire de documents ; lancer import, export, alerte.
- **Résultat attendu** : erreur contrôlée, aucune corruption de la base.
- **Critère de réussite** : 0 corruption ; message d'erreur explicite ; retour à la normale après libération de l'espace.
- **Risque** : Moyen

---

## 3. Axe Disponibilité

### 3.1 Périmètre

Ce qui est **mesurable sur un Docker local mono-nœud** : redémarrage et reprise des conteneurs, politiques de redémarrage, sondes de santé, **sauvegarde et restauration réellement testées**, temps de reprise (RTO) et perte de données maximale (RPO), comportement en mode dégradé.

### 3.2 Hors périmètre et perspectives

Les éléments suivants **ne sont pas testables ni pertinents sur un Docker local** ; ils sont présentés comme **perspectives d'évolution** pour un déploiement de production, pas comme des manques du module :

- haute disponibilité applicative (plusieurs instances derrière un répartiteur de charge) ;
- réplication et bascule automatique de la base (primaire/réplica, Galera) ;
- sauvegarde hors site chiffrée, plan de reprise d'activité multi-sites ;
- supervision et alertes (Prometheus, Grafana), tableau de bord de disponibilité ;
- mises à jour sans interruption (déploiement progressif) ;
- terminaison TLS et gestion des certificats.

### 3.3 Hypothèses

- Objectifs proposés (à valider avec le responsable) : **RTO ≤ 5 minutes** après un redémarrage ou un plantage de conteneur, **RPO ≤ 24 heures** (sauvegarde quotidienne), **disponibilité ≥ 99,5 %** sur un essai continu de 24 h hors pannes provoquées.
- Le job Dolibarr « Sauvegarde locale de base » est **désactivé** dans l'état actuel : DISP-05 l'active sur le Docker de test uniquement, avec accord.
- Les images sont référencées avec la balise `latest` (annexe C5) : la reproductibilité d'un redémarrage après téléchargement d'une nouvelle image n'est pas garantie ; c'est noté, pas testé de façon destructive.

### 3.4 Outils

`docker compose` (`restart`, `kill`, `ps`, `inspect`) · sonde HTTP (`curl` en boucle chronométrée, une requête par seconde) · `mysqldump`, `mariadb-backup`, `gzip -t` · comparaison de sommes de contrôle (`CHECKSUM TABLE`, comptages par table) · journaux `docker logs` · chronomètre à la seconde.

### 3.5 Synthèse des cas

| ID | Titre | Destructif | Risque |
|---|---|---|---|
| DISP-01 | Redémarrage propre de chaque conteneur | ⚠ | Élevé |
| DISP-02 | Plantage brutal (`kill -9`) et politique de redémarrage | ⚠ | Élevé |
| DISP-03 | Redémarrage complet de la pile et ordre de démarrage | ⚠ | Élevé |
| DISP-04 | Sondes de santé (healthcheck) | Non | Moyen |
| DISP-05 | Sauvegarde : activation, exécution, contenu | ⚠ | Critique |
| DISP-06 | Restauration complète testée (RPO/RTO) | ⚠ | Critique |
| DISP-07 | Restauration partielle et volumes de documents | ⚠ | Élevé |
| DISP-08 | Désactivation/réactivation du module : données conservées | ⚠ | Élevé |
| DISP-09 | Mode dégradé : dépendances indisponibles une à une | ⚠ | Moyen |
| DISP-10 | Essai de disponibilité continue (24 h) — **optionnel** | Non | Élevé |
| DISP-11 | Observabilité : les pannes sont-elles visibles ? | Non | Moyen |
| DISP-12 | Compatibilité 19.0.2 / 22.0.4 après reprise **[19+22]** | ⚠ | Moyen |

### 3.6 Cas de test

#### DISP-01 — Redémarrage propre de chaque conteneur
- **Objectif** : chaque service revient en état sain sans intervention et sans perte.
- **Procédure** : pour chacun des 4 conteneurs, `docker restart` ; mesurer le temps jusqu'à la première requête applicative réussie (sonde 1 s) ; comparer les comptages de tables avant/après.
- **Résultat attendu** : retour automatique, données intactes.
- **Critère de réussite** : RTO ≤ 60 s (web, cron, mail), ≤ 120 s (base) ; comptages identiques ; 0 erreur dans les journaux après retour.
- **Risque** : Élevé

#### DISP-02 — Plantage brutal et politique de redémarrage
- **Objectif** : la politique `unless-stopped` relance un service tué.
- **Procédure** : `docker kill` (SIGKILL) de chaque conteneur, séparément, sans redémarrage manuel ; observer `docker ps` et les journaux ; pour la base, contrôler la récupération InnoDB.
- **Résultat attendu** : relance automatique ; base cohérente après récupération.
- **Critère de réussite** : relance sans intervention pour 4 conteneurs sur 4 ; RTO ≤ 5 min ; `CHECK TABLE` sans erreur sur les tables du module.
- **Risque** : Élevé

#### DISP-03 — Redémarrage complet de la pile et ordre de démarrage
- **Objectif** : après un arrêt total (équivalent d'un redémarrage de l'hôte), la pile revient dans un état utilisable dans le bon ordre.
- **Procédure** : `docker compose stop` puis démarrage simultané ; mesurer les erreurs pendant la fenêtre où l'application démarre avant la base ; vérifier l'absence de tâche cron exécutée à vide. *Point d'attention : `depends_on` sans condition de santé (annexe C5).*
- **Résultat attendu** : quelques erreurs transitoires tolérées, puis service normal sans intervention.
- **Critère de réussite** : service nominal en ≤ 5 min ; 0 donnée altérée ; durée de la fenêtre d'erreur mesurée et rapportée.
- **Risque** : Élevé

#### DISP-04 — Sondes de santé
- **Objectif** : évaluer si un composant « démarré mais cassé » est détecté.
- **Procédure** : constater l'existence de sondes (seule la base en a une, annexe C5) ; simuler une panne applicative (fichier PHP corrompu sur le clone, redémarrage d'Apache sans PHP) et vérifier si Docker signale l'état ; proposer une sonde applicative (URL de santé, contrôle base) sans la déployer.
- **Résultat attendu** : constat documenté, recommandation chiffrée.
- **Critère de réussite** : tableau « service / sonde / détecte une panne applicative ? » complété ; recommandation rédigée. Cas informatif, sans seuil bloquant.
- **Risque** : Moyen

#### DISP-05 — Sauvegarde : activation, exécution, contenu
- **Objectif** : disposer d'une sauvegarde **réellement produite et exploitable**.
- **Procédure** : activer sur le Docker de test le job « Sauvegarde locale de base », l'exécuter ; contrôler emplacement (volume persistant ou intérieur du conteneur ?), taille, horodatage, intégrité (`gzip -t`), présence de **toutes** les tables `llx_timeflow_*` et des données (comptages) ; vérifier que les identifiants de connexion n'apparaissent pas dans la liste des processus ; vérifier la rétention et l'espace occupé après 7 exécutions.
- **Résultat attendu** : fichier complet, valide, hors du conteneur éphémère.
- **Critère de réussite** : fichier produit à chaque exécution ; `gzip -t` OK ; 100 % des tables du module présentes ; taille cohérente avec la base ; sauvegarde stockée sur un volume persistant.
- **Risque** : Critique

#### DISP-06 — Restauration complète testée
- **Objectif** : prouver que la sauvegarde permet de reconstruire le service, et mesurer RPO et RTO.
- **Procédure** : créer une base vierge (autre conteneur ou autre schéma), y restaurer la sauvegarde de DISP-05 ; pointer une instance de test dessus ; comparer, table par table, les comptages et les sommes de contrôle avec l'original ; ouvrir l'application (connexion, tableau de bord, calendrier, cloche) et comparer des valeurs clés (totaux du tableau de bord sur une période donnée) ; chronométrer.
- **Résultat attendu** : restauration fidèle, application fonctionnelle.
- **Critère de réussite** : sommes de contrôle égales sur 100 % des tables ; totaux du tableau de bord identiques ; RTO de restauration ≤ 15 min pour la base de test ; RPO mesuré (âge de la dernière sauvegarde) ≤ 24 h ; procédure écrite étape par étape jointe au rapport.
- **Risque** : Critique

#### DISP-07 — Restauration partielle et volumes de documents
- **Objectif** : savoir restaurer une table ou un jour, et les fichiers du volume de documents.
- **Procédure** : simuler la perte d'une table `llx_timeflow_*` ; la restaurer seule depuis la sauvegarde ; sauvegarder et restaurer le volume `dolibarr_documents`.
- **Résultat attendu** : restauration ciblée possible, sans effet sur les autres tables.
- **Critère de réussite** : table restaurée à l'identique ; autres tables inchangées (sommes de contrôle) ; volume de documents restauré.
- **Risque** : Élevé

#### DISP-08 — Désactivation puis réactivation du module
- **Objectif** : aucune donnée n'est perdue ; les tâches planifiées sont recréées sans doublon.
- **Procédure** : comptages avant ; désactiver puis réactiver le module ; comptages après ; vérifier les tâches planifiées, les constantes de réglage et l'absence de doublons de tâches.
- **Résultat attendu** : données et réglages conservés ; 2 tâches planifiées (et non 4).
- **Critère de réussite** : comptages identiques ; 2 tâches planifiées exactement ; réglages inchangés.
- **Risque** : Élevé

#### DISP-09 — Mode dégradé
- **Objectif** : documenter, pour chaque dépendance indisponible, ce qui reste utilisable.
- **Procédure** : arrêter tour à tour Mailpit, le conteneur cron, puis la base ; exécuter un scénario type (démarrer un chronomètre, l'arrêter, consulter le tableau de bord, valider) et noter ce qui fonctionne.
- **Résultat attendu** : messagerie ou cron arrêtés → l'application reste utilisable ; base arrêtée → indisponible avec message clair.
- **Critère de réussite** : matrice « dépendance en panne / fonctions disponibles » conforme à l'attendu ; 0 perte de donnée.
- **Risque** : Moyen

#### DISP-10 — Essai de disponibilité continue (optionnel)
- **Objectif** : mesurer une disponibilité et un taux d'erreur réels.
- **Procédure** : sonde d'un appel applicatif léger par seconde pendant 24 h avec une charge de fond faible (10 utilisateurs virtuels), sans panne provoquée ; consigner chaque échec ; calculer disponibilité et latence (médiane, p95, p99).
- **Résultat attendu** : service continu.
- **Critère de réussite** : disponibilité ≥ 99,5 % ; taux d'erreur < 0,5 % ; p95 < 1 s ; aucun redémarrage spontané de conteneur.
- **Risque** : Élevé

#### DISP-11 — Observabilité
- **Objectif** : une panne est visible sans enquête lourde.
- **Procédure** : pour chaque panne des axes 2 et 3, vérifier où l'incident apparaît (journal Dolibarr, sortie du job, statut Docker, notification) et le temps nécessaire pour le diagnostiquer.
- **Résultat attendu** : chaque panne laisse une trace exploitable.
- **Critère de réussite** : 100 % des pannes provoquées identifiables dans un journal en < 5 minutes de lecture ; les manques sont listés (perspective : supervision).
- **Risque** : Moyen

#### DISP-12 — Compatibilité après reprise **[19+22]**
- **Objectif** : le comportement après redémarrage et restauration est le même sur 19.0.2 et 22.0.4.
- **Procédure** : rejouer DISP-01, DISP-06 et DISP-08 sur l'environnement 22.0.4.
- **Résultat attendu** : résultats équivalents.
- **Critère de réussite** : mêmes verdicts sur les deux versions ; sinon écart documenté.
- **Risque** : Moyen

---

## 4. Axe Scalabilité

### 4.1 Périmètre

Temps de réponse et consommation de ressources à volume réaliste puis élevé : tableau de bord, rapports, exports, import Clockify, job d'alertes, listes paginées, interface (taille du paquet, rendu), et **concurrence** de plusieurs utilisateurs.

### 4.2 Hypothèses

- **Jeu de données de référence** : 50 employés × 250 jours ouvrés × 8 saisies ≈ **100 000 saisies** sur 1 an, 200 projets, 30 clients, 15 groupes, 10 % de saisies non facturables, statuts variés. Le générateur est **déterministe** (graine fixe) et écrit en SQL par lots ; tout est préfixé `zz_perf_` pour un nettoyage exact ; la base d'origine est sauvegardée par le responsable avant chargement (**⚠ accord requis**). Paliers : 10 000, 50 000, 100 000, 500 000 saisies pour tracer la courbe de croissance.
- **Seuils acceptables** (à valider avec le responsable) :

| Mesure | Seuil (p95, jeu de 100 000) |
|---|---|
| Tableau de bord (un mois, avec et sans filtre) | ≤ 2 s |
| Tableau de bord (un an) | ≤ 5 s |
| Rapports (projets, utilisateurs, historique), page de 20 | ≤ 2 s |
| Export CSV global | ≤ 30 s, mémoire ≤ 256 Mo |
| Démarrage / arrêt d'un chronomètre | ≤ 500 ms |
| Import Clockify de 5 000 lignes (aperçu + exécution) | ≤ 120 s, mémoire ≤ 256 Mo |
| Job d'alertes (50 employés) | ≤ 30 s |
| Charge concurrente 50 utilisateurs virtuels | taux d'erreur < 1 %, p95 ≤ 3 s |
| Requêtes fréquentes | pas de balayage complet de table > 10 000 lignes |

- **Point d'attention (annexe C3)** : le résumé du tableau de bord ne charge que **1 000 lignes** par requête ; à ce volume, un mois entier dépasse cette limite. Le cas SCAL-02 mesure aussi l'**exactitude** des totaux (avertissement de troncature), pas seulement le temps.
- Le test de charge suppose des **sessions authentifiées de comptes de test** : mode de connexion à valider avec le responsable avant la phase.

### 4.3 Outils

Générateur de données maison (Node ou PHP) · **k6** (scénarios de charge, seuils intégrés) ou à défaut autocannon · `EXPLAIN` / `EXPLAIN ANALYZE`, journal des requêtes lentes MariaDB (`long_query_time` = 0,2 s) · `docker stats` · Lighthouse et puppeteer (temps de chargement, mémoire du navigateur) · `mysqltuner` (lecture seule) · comptage des requêtes SQL par action (`general_log`) pour repérer les motifs « N+1 ».

### 4.4 Synthèse des cas

| ID | Titre | Destructif | Risque |
|---|---|---|---|
| SCAL-01 | Génération et vérification du jeu de données | ⚠ | Élevé |
| SCAL-02 | Tableau de bord : temps et exactitude | Non | Élevé |
| SCAL-03 | Rapports, listes paginées et exports | Non | Élevé |
| SCAL-04 | Import Clockify (1 000 / 5 000 / 20 000 lignes) | ⚠ | Élevé |
| SCAL-05 | Job d'alertes (50 / 200 / 1 000 employés) | ⚠ | Élevé |
| SCAL-06 | Job de fermeture des chronomètres de minuit | ⚠ | Moyen |
| SCAL-07 | Analyse des index et plans d'exécution (EXPLAIN) | Non | Élevé |
| SCAL-08 | Test de charge concurrent | ⚠ | Élevé |
| SCAL-09 | Intégrité sous écritures concurrentes | ⚠ | Élevé |
| SCAL-10 | Courbe de croissance et extrapolation (palier 500 000 **optionnel**) | Non | Moyen |
| SCAL-11 | Interface : poids, chargement, rendu de grandes listes | Non | Moyen |
| SCAL-12 | Bornes des paramètres de pagination (abus) | Non | Moyen |
| SCAL-13 | Ressources des conteneurs sous charge | Non | Moyen |

### 4.5 Cas de test

#### SCAL-01 — Génération et vérification du jeu de données
- **Objectif** : disposer d'un jeu réaliste, reproductible, nettoyable.
- **Procédure** : (après sauvegarde et accord) générer les paliers ; contrôler les comptages, la répartition (par employé, projet, statut), l'absence d'anomalies (durées négatives, chevauchements) ; mesurer la durée de génération ; supprimer par le préfixe et vérifier le retour à l'état initial.
- **Résultat attendu** : jeu conforme à la spécification, suppression exacte.
- **Critère de réussite** : comptages = spécification ± 1 % ; 0 ligne hors préfixe supprimée ; retour au comptage initial de toutes les tables.
- **Risque** : Élevé

#### SCAL-02 — Tableau de bord : temps et exactitude
- **Objectif** : mesurer les temps et vérifier que les chiffres affichés sont **justes** à volume élevé.
- **Procédure** : pour un mois, un trimestre et un an, avec et sans filtres (projet, client, employé), en utilisateur limité et en `readall` : 30 mesures par cas (médiane, p95) ; comparer total et répartitions affichés à un calcul SQL indépendant ; relever `entries_returned` et `entries_total_in_period`.
- **Résultat attendu** : temps sous les seuils ; totaux exacts ou signalés comme partiels.
- **Critère de réussite** : p95 conformes au tableau des seuils ; **écart de total = 0** ou avertissement de troncature affiché à 100 % des cas où `entries_total_in_period` > `entries_returned` ; anomalie de gravité Élevé si un total faux est affiché sans avertissement.
- **Risque** : Élevé

#### SCAL-03 — Rapports, listes paginées et exports
- **Objectif** : les écrans de rapports et exports restent réactifs.
- **Procédure** : mesurer `getTimeFlowProjects`, `getTimeFlowUsers`, `getProcessedHistory`, `getUsersPresence`, `getTimeEntries`, `getValidationEntries`, `getWeeklyTimesheet` ; exporter le CSV global et l'historique complet (10 000 puis 100 000 lignes) ; relever durée et pic mémoire.
- **Résultat attendu** : pagination efficace ; exports aboutissent sans dépasser la mémoire.
- **Critère de réussite** : p95 ≤ 2 s par page de 20 ; export global ≤ 30 s et ≤ 256 Mo ; pas d'échec pour 100 000 lignes (sinon anomalie avec le seuil de rupture mesuré).
- **Risque** : Élevé

#### SCAL-04 — Import Clockify
- **Objectif** : caractériser l'import en durée, mémoire et nombre de requêtes.
- **Procédure** : générer des CSV de 1 000, 5 000 puis 20 000 lignes (dans la limite de 10 Mo) ; mesurer aperçu, résolution et exécution ; compter les requêtes SQL par ligne (repérage du N+1) ; relancer le même fichier (idempotence : durée et absence de doublons).
- **Résultat attendu** : temps proportionnel au nombre de lignes, sans dépassement du délai PHP.
- **Critère de réussite** : 5 000 lignes ≤ 120 s et ≤ 256 Mo ; croissance approximativement linéaire (rapport durée/lignes stable à ±30 %) ; réimport sans doublon en ≤ durée du premier passage ; seuil de rupture (lignes) mesuré et documenté.
- **Risque** : Élevé

#### SCAL-05 — Job d'alertes
- **Objectif** : le job reste rapide quand le nombre d'utilisateurs et de responsables augmente.
- **Procédure** : avec 50, 200 puis 1 000 comptes (générés) et 5 puis 50 responsables, exécuter le job à un instant fixé ; mesurer durée, requêtes par exécution et mémoire ; observer en particulier la recherche des responsables (chargement des droits compte par compte).
- **Résultat attendu** : durée sous le seuil, croissance maîtrisée.
- **Critère de réussite** : 50 employés ≤ 30 s ; 200 ≤ 90 s ; 1 000 : durée mesurée et extrapolation documentées ; nombre de requêtes rapporté par employé.
- **Risque** : Élevé

#### SCAL-06 — Job de fermeture des chronomètres de minuit
- **Objectif** : le passage de minuit reste court avec de nombreux chronomètres actifs.
- **Procédure** : 50 puis 500 chronomètres actifs à minuit ; exécuter le job ; mesurer la durée et vérifier chaque scission de saisie.
- **Résultat attendu** : traitement complet en une exécution.
- **Critère de réussite** : 100 % des chronomètres fermés correctement ; durée ≤ 60 s pour 500.
- **Risque** : Moyen

#### SCAL-07 — Analyse des index et plans d'exécution
- **Objectif** : repérer les requêtes qui ne passent pas à l'échelle avant de les mesurer en charge.
- **Procédure** : capturer les requêtes chaudes (résumé, présence, détection de retards, historique, feuille de temps hebdomadaire, recherche de chevauchement à l'import, recherche par `import_key`, notifications) au volume de 100 000 ; exécuter `EXPLAIN` et `EXPLAIN ANALYZE` ; relever type d'accès, index utilisé, lignes examinées, tri sur fichier temporaire ; confronter aux index existants (`fk_user`, `fk_project`, `date_start`, `date_delete`, `(fk_user, date_start)`). *Candidats à confirmer (annexe C4) : `import_key` (recherche à chaque ligne importée), `(fk_user, status, date_start)`, `(fk_project, date_start)`.*
- **Résultat attendu** : chaque requête chaude utilise un index adapté.
- **Critère de réussite** : **0** balayage complet de table sur plus de 10 000 lignes pour les requêtes fréquentes ; lignes examinées ≤ 10 × lignes retournées ; chaque plan retenu est archivé dans les preuves ; les index proposés sont testés avant/après (gain mesuré) dans une PR séparée.
- **Risque** : Élevé

#### SCAL-08 — Test de charge concurrent
- **Objectif** : évaluer la tenue sous utilisateurs simultanés et identifier le point de saturation.
- **Procédure** : scénario k6 réaliste : 70 % lectures (tableau de bord, rapports, calendrier), 20 % démarrage/arrêt de chronomètre, 10 % validation ; montée 5 → 25 → 50 → 100 utilisateurs virtuels par paliers de 5 min, puis 10 min de palier stable, puis descente ; relever débit, latences (p50/p95/p99), erreurs, CPU et mémoire des conteneurs, requêtes lentes.
- **Résultat attendu** : dégradation progressive, aucun plantage.
- **Critère de réussite** : à 50 utilisateurs : erreurs < 1 %, p95 ≤ 3 s ; le point de saturation (débit maximal avant erreurs) est mesuré et rapporté ; retour à la normale en ≤ 2 min après la charge ; 0 conteneur redémarré.
- **Risque** : Élevé

#### SCAL-09 — Intégrité sous écritures concurrentes
- **Objectif** : aucune perte, aucun doublon, aucun blocage sous forte concurrence en écriture.
- **Procédure** : 50 utilisateurs virtuels démarrent, arrêtent, corrigent et valident des saisies en parallèle pendant 10 minutes ; contrôle final : 1 chronomètre actif au plus par utilisateur, cohérence durées/dates, absence de doublons, nombre de verrous morts (`SHOW ENGINE INNODB STATUS`).
- **Résultat attendu** : état final valide.
- **Critère de réussite** : 0 incohérence ; 0 requête acquittée non persistée ; verrous morts et attentes de verrou relevés (seuil : 0 échec définitif).
- **Risque** : Élevé

#### SCAL-10 — Courbe de croissance et extrapolation
- **Objectif** : caractériser la complexité (linéaire ou pire) de chaque opération clé.
- **Procédure** : répéter les mesures de SCAL-02 à SCAL-05 sur 10 000, 50 000, 100 000 et 500 000 saisies ; tracer temps en fonction du volume ; estimer le volume où chaque seuil est franchi.
- **Résultat attendu** : croissance sous-linéaire ou linéaire pour les lectures indexées.
- **Critère de réussite** : pour chaque opération, la courbe est fournie et le volume de franchissement du seuil est estimé ; toute croissance supérieure au linéaire est une anomalie.
- **Risque** : Moyen

#### SCAL-11 — Interface : poids, chargement, rendu de grandes listes
- **Objectif** : le poids du paquet et le rendu restent acceptables.
- **Procédure** : mesurer le poids des paquets JavaScript de production (le paquet principal dépasse aujourd'hui les 1 Mo), le temps d'interactivité (Lighthouse, processeur ralenti 4×, réseau 3G rapide), le rendu de listes de 20 à 1 000 lignes, du graphique avec 1 000 points, la mémoire du navigateur après 30 min d'utilisation (fuites) ; vérifier le chargement différé de la génération de PDF.
- **Résultat attendu** : chargement acceptable, mémoire stable.
- **Critère de réussite** : score Lighthouse « Performance » ≥ 70 ; temps d'interactivité ≤ 5 s (processeur ralenti) ; croissance mémoire < 20 % après 30 min ; le module PDF n'est chargé qu'à la demande.
- **Risque** : Moyen

#### SCAL-12 — Bornes des paramètres de pagination
- **Objectif** : un paramètre abusif ne permet pas de saturer le serveur.
- **Procédure** : envoyer `per_page` et `limit` à 1 000 000, négatifs, non numériques, `page` très grande, sur toutes les actions paginées ; mesurer la charge induite.
- **Résultat attendu** : valeurs ramenées à un plafond raisonnable.
- **Critère de réussite** : réponse jamais supérieure au plafond documenté (par exemple 1 000 lignes) ; temps ≤ 5 s ; mémoire ≤ 256 Mo.
- **Risque** : Moyen

#### SCAL-13 — Ressources des conteneurs sous charge
- **Objectif** : identifier le composant limitant (processeur, mémoire, disque, connexions).
- **Procédure** : `docker stats` échantillonné à 1 Hz pendant SCAL-08 ; lecture du réglage MariaDB (`innodb_buffer_pool_size`, `max_connections`, requêtes lentes) ; nombre de processus PHP.
- **Résultat attendu** : profil de consommation compréhensible, sans saturation avant le palier visé.
- **Critère de réussite** : aucun conteneur > 85 % de processeur ou de mémoire de façon soutenue au palier de 50 utilisateurs ; goulot identifié et documenté.
- **Risque** : Moyen

---

## Annexe A — Modèle de rapport de résultats

Fichier à produire par axe : `docs/tests/RAPPORT_<AXE>.md` (`SECURITE`, `PANNES`, `DISPONIBILITE`, `SCALABILITE`).

````markdown
# Rapport de tests — <AXE>

| | |
|---|---|
| **Date d'exécution** | AAAA-MM-JJ (début → fin) |
| **Environnement** | Docker de test, Dolibarr <version>, commit du module `<sha>` |
| **Sauvegarde préalable confirmée par** | <nom>, le <date> |
| **Jeu de données** | <description, graine, volumes> |
| **Exécutant** | Claude Code, sous la supervision de <nom> |
| **Clone Docker remis sur `main`** | ✅ confirmé le <date> (HEAD `<sha>`, 0 fichier modifié) |

## 1. Résumé
- Cas prévus : N · exécutés : N · ✅ N · ⚠️ N · ❌ N · ⏭ N
- Anomalies : Critique N · Élevé N · Moyen N · Faible N
- Conclusion en 3 lignes (l'axe est-il acceptable en l'état ? réserves ?).

## 2. Tableau récapitulatif

| Cas | Titre | Résultat mesuré | Critère | Statut | Preuve |
|---|---|---|---|---|---|
| SEC-01 | … | 0 erreur SQL sur 44 actions | 0 | ✅ | `preuves/SECURITE/SEC-01/…` |

## 3. Détail des anomalies

### ANO-<AXE>-01 — <titre court>
- **Cas concerné** : SEC-07
- **Gravité** : Critique / Élevé / Moyen / Faible
- **Description** : ce qui a été observé, en une ou deux phrases.
- **Reproduction** : étapes exactes, jeu de données, requête ou commande.
- **Impact** : conséquence concrète (données exposées, perte, indisponibilité…).
- **Preuve** : extrait de sortie, requête, capture (caviardée).
- **Cause probable** : fichier et ligne quand elles sont connues.
- **Recommandation** : correctif proposé, effort estimé.
- **Correctif** : PR #<n> (statut) · **Re-test** : ✅ le <date>

## 4. Cas non exécutés ou non concluants
Liste avec la raison (accord refusé, environnement absent, limite de l'outil).

## 5. Limites et hypothèses
Ce que ces essais ne prouvent pas.

## 6. Perspectives
Éléments hors périmètre ou améliorations non bloquantes.
````

---

## Annexe B — Inventaire des 44 actions de `ajax/timeentry.php` (traçabilité SEC-01, SEC-06, SEC-07)

| Famille | Actions |
|---|---|
| Chronomètre et saisies | `getActiveTimer`, `startTimer`, `stopTimer`, `restartTimer`, `createManualEntry`, `submitEntry`, `deleteTimeEntry`, `correctTimeEntry`, `getTimeEntries`, `getTimeEntryUpdates`, `getModificationHistory`, `getWeeklyTimesheet` |
| Projets, tâches, référentiels | `getProjects`, `getTimeFlowProjects`, `getTasks`, `listActiveThirdParties`, `listActiveUsers`, `listUserGroups` |
| Validation et historique | `getValidationEntries`, `validateEntry`, `rejectEntry`, `getProcessedHistory`, `exportProcessedHistory`, `exportGlobalCsv` |
| Comptes rendus quotidiens | `saveDailyReport`, `updateDailyReport`, `deleteDailyReport`, `getMyDailyReports`, `getDailyReports`, `validateDailyReport`, `rejectDailyReport` |
| Utilisateurs et présence | `getTimeFlowUsers`, `getUsersPresence`, `saveExpectedAbsence`, `deleteExpectedAbsence` |
| Alertes et notifications | `getMyNotifications`, `markNotificationsRead`, `getAlertPreferences`, `saveAlertPreferences` |
| Import Clockify | `previewClockifyImport`, `resolveClockifyMapping`, `executeClockifyImport` |
| Tableau de bord | `getSummaryReports`, `getDashboardFilterOptions` |

Le **droit attendu** de chaque action est ajouté à ce tableau lors de la première étape de SEC-06 et validé avec le responsable avant exécution.

---

## Annexe C — Points d'attention relevés à la lecture du code (hypothèses à confirmer)

Ce sont des **pistes pour cibler les essais**, pas des constats : chacune est confirmée ou infirmée par le cas indiqué.

| # | Observation à la lecture | Cas qui la vérifie |
|---|---|---|
| C1 | `ajax/timeentry.php` déclare `NOCSRFCHECK` : la protection repose uniquement sur le paramètre `token`, transmis **dans l'URL** | SEC-09 |
| C2 | `csvEscape` (`frontend/src/utils/csvExport.js`) échappe les guillemets et les dates ISO mais ne neutralise pas les préfixes `=`, `+`, `-`, `@` | SEC-10 |
| C3 | `getSummaryReports` limite la récupération à 1 000 lignes ; un mois à 100 000 saisies/an dépasse ce plafond (un avertissement existe) | SCAL-02 |
| C4 | Aucun index sur `import_key` (colonne `varchar(14)`, consultée à chaque ligne importée) ni sur `(fk_project, date_start)` ; `date_delete` seul est peu sélectif | SCAL-07, SCAL-04 |
| C5 | Seul MariaDB a un `healthcheck` ; `depends_on` sans condition de santé ; images en `latest` | DISP-03, DISP-04 |
| C6 | Le job « Sauvegarde locale de base » est désactivé | DISP-05, DISP-06 |
| C7 | `findManagers()` charge les droits compte par compte (coût croissant avec le nombre de comptes) | SCAL-05 |
| C8 | Un import n'est pas une transaction unique : par conception, chaque élément est traité séparément et l'import se rattrape par idempotence | PAN-06 |
| C9 | Mots de passe de test en clair dans `docker-compose.yml` ; présence d'un dossier `git-history-cleanup/` (nettoyage d'historique passé) | SEC-12 |

---

## Annexe D — Récapitulatif des cas

| Axe | Cas | Critique | Élevé | Moyen | Faible |
|---|---|---|---|---|---|
| Sécurité | 20 | 8 | 8 | 4 | 0 |
| Tolérance aux pannes | 15 | 6 | 4 | 5 | 0 |
| Disponibilité | 12 | 2 | 6 | 4 | 0 |
| Scalabilité | 13 | 0 | 8 | 5 | 0 |
| **Total** | **60** | **16** | **26** | **18** | **0** |
