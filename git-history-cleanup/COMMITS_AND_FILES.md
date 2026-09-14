# Audit complet — chaînes sensibles dans l'historique git

Généré le 2026-09-11, mis à jour le 2026-09-14 (retrait des chaînes
sensibles en clair de ce document lui-même). Recherche exhaustive
(`git log --all -G"<terme>"`) sur toutes les refs accessibles.

## Comment lire ce document

Aucune donnée réelle (nom, société, codename) n'est écrite en clair
ici — chaque élément est référencé par un **code opaque** (`CODE-...`).
La table de correspondance entre ces codes et les chaînes exactes
n'existe **que** dans le fichier `replacements.txt` opérationnel, qui
est volontairement gardé **hors du dépôt git** (jamais committé) pour
ne pas recréer le problème que ce nettoyage doit résoudre. Ce document
reste utilisable pour comprendre l'étendue du problème, vérifier les
commits/chemins concernés, et suivre l'avancement — sans jamais
réintroduire les chaînes elles-mêmes dans l'historique.

| Code | Catégorie |
|---|---|
| `CODE-CLIENT-A`, `CODE-CLIENT-B` | Deux variantes du nom de la société cliente réelle |
| `CODE-EMP-A`, `CODE-EMP-B`, `CODE-EMP-C` | Trois noms complets (prénom + nom de famille) d'anciens employés réels |
| `CODE-EMP-D` à `CODE-EMP-H` | Cinq prénoms/identifiants de connexion d'employés réels, apparaissant seuls |
| `CODE-PROJ-A` à `CODE-PROJ-E` | Cinq noms de code de projets/groupes réels (usage systématique en MAJUSCULES) |
| `CODE-NICK-A`, `CODE-NICK-B` | Deux surnoms informels de projets réels |

## ⚠️ Découverte la plus grave : dossier `.git.backup-20260828-1020/`

Un dossier entier a été committé par erreur — une copie brute d'un
répertoire `.git` interne, avec **2544 objets git bruts**
(`objects/xx/yyyy...`), des refs, des logs, etc.

- Ajouté dans : `0b33e30faebd1c03c404a7fd03316039a11d446b` (2026-08-28,
  "correction de tout le css")
- Retiré (untracked, mais toujours dans l'historique) dans :
  `c084ea4d8c3da70ba742dd131937b8e8956d4a34` (2026-08-30, "chore: untrack
  accidental .git backup and SQL dumps")

**Pourquoi c'est le point le plus critique** : ces objets git bruts sont
une copie quasi complète de la base d'objets du dépôt à cette date — ils
contiennent très probablement, sous forme compressée mais parfaitement
extractible (`git cat-file`), les mêmes blobs sensibles (voire des
versions intermédiaires jamais visibles dans l'historique normal). Un
simple remplacement de texte (`--replace-text`) ne peut PAS nettoyer des
objets git bruts compressés — il faut supprimer ce dossier entièrement de
l'historique par chemin, ce que fait le script fourni.

## Fichiers avec de vraies données, par catégorie

### 1. Dumps SQL bruts (base de données réelle) — SUPPRIMÉS ENTIÈREMENT

| Fichier | Ajouté | Retiré (untracked) | Codes trouvés |
|---|---|---|---|
| `backup_avant_fix_20260818_1140.sql` | `96752ca1` (2026-08-18) | `c084ea4d` (2026-08-30) | CODE-PROJ-A/B/C/D/E, CODE-EMP-D/E/F/G |
| `backup_avant_softdelete_20260818_1537.sql` | `5fb62007` (2026-08-19) | `c084ea4d` (2026-08-30) | idem |
| `backup_avant_suppression_clockify_20260901_1317.sql` | `2e47e439` (2026-09-02) | `449d5f3d` (2026-09-04) | CODE-CLIENT-A, CODE-PROJ-A/B/C, CODE-EMP-D/E/F/G |

Ces 3 fichiers étaient déjà "untracked" (absents de HEAD) mais restaient
récupérables depuis les commits ci-dessus. Suppression complète par
chemin (pas de remplacement de texte ligne par ligne sur un dump SQL
entier — trop risqué de le corrompre partiellement, et ces fichiers
n'ont de toute façon aucune valeur à conserver dans l'historique).

*(Les autres `backup_*.sql` du dépôt ont été vérifiés : 0 occurrence des
codes ci-dessus, aucune action requise, volontairement laissés
intacts.)*

### 2. Fixtures/tests frontend (déjà corrigés à HEAD, historique à nettoyer)

| Chemin (nom courant à HEAD) | Ancien(s) nom(s) dans l'historique | Commits concernés |
|---|---|---|
| `frontend/src/utils/dashboardExport.fixture.json` | `dashboardExport.realdata.fixture.json` | `0c6e08cd`, `91d8c47c`, `1d2bfdb` (+ `dafdb12b`, `42c6ce94`, `449d5f3d`, `ee143f3f`) |
| `frontend/src/utils/dashboardExport.crossing.test.js` | `dashboardExport.crossing.realdata.test.js` | `0c6e08cd`, `91d8c47c` |
| `frontend/src/utils/dashboardExport.test.js` | (même nom) | `1d2bfdb`, `dafdb12b`, `42c6ce94` |
| `frontend/src/utils/dashboardExport.js` | (même nom) | `dafdb12b`, `0c6e08cd`, `42c6ce94` (commentaire mentionnant CODE-PROJ-B) |
| `frontend/src/components/organisms/CustomChartWidget.pivot.test.js` | (même nom) | `ee143f3f`, `1d2bfdb` |
| `frontend/src/components/molecules/EditHistoryModal.test.jsx` | (même nom) | `8ccf697b` (création), `8c7f0185`, `1d2bfdb` (nettoyage) |
| `frontend/src/components/organisms/TimeEntryList.test.jsx` | (même nom) | `dafdb12b`, `1d2bfdb` |
| `frontend/src/pages/ReportsPage.test.jsx` | (même nom) | `587989ec`, `9891e04c`, `1d2bfdb` |
| `frontend/src/pages/ProcessedHistoryPage.test.jsx` | (fichier aujourd'hui supprimé, toujours dans l'historique) | `8ccf697b`, `086676a5`, `5a915f53`, `3411755` |
| `frontend/src/api/timeflowApi.js` | (même nom) | `2ffec0cf`, `1d2bfdb` |
| `class/timeimport.class.php` | (même nom) | `2e47e439` (CODE-PROJ-A), `c007034e` (CODE-PROJ-B), `1d2bfdb` (CODE-EMP-E, nettoyage) |

`ProcessedHistoryPage.test.jsx` n'était pas dans la demande initiale mais
contenait CODE-EMP-H bare (sans nom de famille) — inclus par prudence,
couvert par la même règle de remplacement générique.

## Répartition par code

| Code | Commits où il apparaît (ajout ou retrait) |
|---|---|
| CODE-CLIENT-A / CODE-CLIENT-B | `1d2bfdb`, `91d8c47c`, `0c6e08cd`, `449d5f3d`, `ee143f3f`, `2e47e439` |
| CODE-EMP-A | `1d2bfdb`, `91d8c47c`, `0c6e08cd`, `ee143f3f` |
| CODE-EMP-B | `1d2bfdb`, `91d8c47c`, `0c6e08cd`, `ee143f3f` |
| CODE-EMP-C (nom complet) | `1d2bfdb`, `8c7f0185`, `8ccf697b` |
| CODE-EMP-D | `1d2bfdb`, `91d8c47c`, `0c6e08cd`, `449d5f3d`, `ee143f3f`, `2e47e439` |
| CODE-EMP-E | `1d2bfdb`, `91d8c47c`, `0c6e08cd`, `449d5f3d`, `ee143f3f`, `2e47e439` |
| CODE-EMP-F | `1d2bfdb`, `91d8c47c`, `0c6e08cd`, `449d5f3d`, `ee143f3f`, `2e47e439` |
| CODE-EMP-G | `1d2bfdb`, `91d8c47c`, `0c6e08cd`, `449d5f3d`, `ee143f3f`, `2e47e439` |
| CODE-EMP-H (⚠️ voir note collision) | `1d2bfdb`, `91d8c47c`, + toute la série touchant `CustomChartWidget.jsx`/`dashboardExport.*` |
| CODE-EMP-C (bare, hors périmètre initial) | `1d2bfdb`, `dafdb12b`, `9891e04c`, `587989ec`, `c084ea4d`*, `5fb62007`*, `96752ca1`*, `8c7f0185`, `8ccf697b` |
| CODE-PROJ-A | `1d2bfdb`, `91d8c47c`, `dafdb12b`, `42c6ce94`, `0c6e08cd`, `449d5f3d`, `ee143f3f`, `2e47e439` |
| CODE-PROJ-B | `1d2bfdb`, `91d8c47c`, `dafdb12b`, `0c6e08cd`, `449d5f3d`, `ee143f3f`, `2e47e439`, `c007034e`, `2ffec0cf` |
| CODE-PROJ-C | mêmes fichiers que CODE-PROJ-A/B |
| CODE-PROJ-D | `1d2bfdb`, `91d8c47c`, `dafdb12b`, `0c6e08cd`, `449d5f3d`, `ee143f3f`, `2e47e439`, `c084ea4d`*, `5fb62007`*, `96752ca1`* |
| CODE-PROJ-E | mêmes fichiers que CODE-PROJ-D |
| CODE-NICK-A | `1d2bfdb`, `dafdb12b` |
| CODE-NICK-B | `1d2bfdb`, `dafdb12b` |

`*` = commit où le hit se trouve dans un dump SQL brut (`backup_*.sql`),
pas dans le code source.

## Faux positifs écartés (vérifiés, aucune action nécessaire)

Ces correspondances sont apparues dans la recherche brute mais **ne sont
pas des données réelles** — vérifié à la casse exacte / limites de mots :

- CODE-PROJ-D et CODE-PROJ-C dans `vendor/nikic/php-parser/README.md`,
  `vendor/phpunit/phpunit/SECURITY.md` et `frontend/README.md` → mots
  anglais génériques sans rapport (un terme technique très courant, et
  une URL de documentation officielle React). Vérifiés : ces occurrences
  ne sont ni en majuscules ni entourées des mêmes limites de mots que le
  codename réel, donc non affectées par la règle de remplacement
  (limites de mots strictes + casse exacte).
- CODE-EMP-H dans les bundles JS (`frontend/dist/assets/*.js`) et dans
  tout le code React/Recharts → toujours une sous-chaîne d'un nom de
  prop interne à une librairie de graphiques (rien à voir avec le
  prénom réel). Vérifié avec limites de mots : 0 résultat dans ces
  bundles.
- CODE-EMP-F/G/E/D et CODE-NICK-B dans divers fichiers `node_modules/**`
  (bundles minifiés tiers) → sous-chaînes fortuites dans du code
  minifié/données encodées, jamais un mot entier. Vérifié avec limites
  de mots : 0 résultat.
- CODE-CLIENT-A dans un fichier de licence de police de caractères
  bundlé sur une branche annexe (`dev_class_Y`) → sous-chaîne d'un nom
  de famille de polices typographiques, sans rapport.
- CODE-NICK-B dans un fichier de traduction Dolibarr bundlé (langue
  d'Afrique de l'Est) sur une branche annexe → sous-chaîne d'un mot de
  cette langue, sans rapport avec le surnom de projet réel.
- Chaînes de remplissage génériques dans deux fichiers de test
  frontend → texte de test sans rapport avec les données réelles déjà
  anonymisées en Étape 1.

`node_modules/` et `vendor/` ne sont plus suivis à HEAD (retirés dans des
commits antérieurs) mais restent dans l'historique — purement du bloat
(≈140 Mo dans le `.git` local avant nettoyage), sans donnée personnelle
réelle. Le script de nettoyage ne les touche pas par défaut (hors
périmètre de cette demande).

## Branches et PR découvertes en cours de route

Un premier passage du script sur un clone miroir frais depuis GitHub a
révélé **5 branches** (`main`, `dev_class_Y`, et deux branches de
développement personnelles nommées d'après des membres de l'équipe, en
plus de la branche de travail) et **12 PR**
que l'audit initial (limité au clone local de travail) n'avait pas
couvertes dans sa description écrite. Le nettoyage effectif (exécution
de `git filter-repo`) s'applique cependant à **tout** ce que contient le
miroir cloné, donc à ces branches et PR aussi, indépendamment de ce que
ce document décrit par écrit — vérifié par un nouveau passage de
vérification après la découverte (0 résultat réel sur ces branches, en
dehors des faux positifs déjà documentés ci-dessus).
