# Audit complet — chaînes sensibles dans l'historique git

Généré le 2026-09-11 par recherche exhaustive (`git log --all -G"<terme>"`,
insensible à la casse puis vérifié à la casse exacte + limites de mots)
sur les 142 commits accessibles depuis toutes les refs du dépôt local.
Chaque commit listé est celui où le *diff* introduit ou retire la chaîne
(ligne ajoutée ou supprimée) — donc à la fois les commits qui ont
introduit la donnée réelle et ceux qui l'ont déjà nettoyée à HEAD.
`git filter-repo` réécrit de toute façon TOUS les commits qui contiennent
la donnée dans leur arbre, introduction et nettoyage compris.

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
l'historique par chemin (`--invert-paths --path
.git.backup-20260828-1020`), ce que fait le script fourni.

## Fichiers avec de vraies données, par catégorie

### 1. Dumps SQL bruts (base de données réelle) — À SUPPRIMER ENTIÈREMENT

| Fichier | Ajouté | Retiré (untracked) | Contient |
|---|---|---|---|
| `backup_avant_fix_20260818_1140.sql` | `96752ca1` (2026-08-18) | `c084ea4d` (2026-08-30) | IDARA/INFRA/TRAINING/bacem/wafa/soyah/wissal |
| `backup_avant_softdelete_20260818_1537.sql` | `5fb62007` (2026-08-19) | `c084ea4d` (2026-08-30) | idem |
| `backup_avant_suppression_clockify_20260901_1317.sql` | `2e47e439` (2026-09-02) | `449d5f3d` (2026-09-04) | imbus/TB-UNITED/IDARA/INFRA/wissal/bacem/wafa/soyah |

Ces 3 fichiers sont déjà "untracked" (absents de HEAD) mais restent
récupérables depuis les commits ci-dessus. Recommandation : suppression
complète par chemin (pas de remplacement de texte ligne par ligne sur un
dump SQL entier — trop risqué de le corrompre partiellement, et ces
fichiers n'ont de toute façon aucune valeur à conserver dans l'historique).

*(Les autres `backup_*.sql` du dépôt —
`backup_avant_daily_report_softdelete_20260821_103607.sql`,
`backup_avant_decommissionnement_tables_legacy_20260901_1335.sql`,
`backup_avant_migration_projet52_20260901_1040.sql`,
`backup_avant_migration_projet_natif_20260901_1022.sql`,
`backup_structure_llx_timeflow_timeentry_avant_renommage_index_20260901_1329.sql`,
`backup_avant_fix_20260818_1136.sql` — ont été vérifiés : 0 occurrence
des termes sensibles, aucune action requise.)*

### 2. Fixtures/tests frontend (déjà corrigés à HEAD, mais historique à nettoyer)

| Chemin (nom courant à HEAD) | Ancien(s) nom(s) dans l'historique | Commits concernés |
|---|---|---|
| `frontend/src/utils/dashboardExport.fixture.json` | `dashboardExport.realdata.fixture.json` | `0c6e08cd`, `91d8c47c`, `1d2bfdb` (+ `dafdb12b`, `42c6ce94`, `449d5f3d`, `ee143f3f` selon le terme) |
| `frontend/src/utils/dashboardExport.crossing.test.js` | `dashboardExport.crossing.realdata.test.js` | `0c6e08cd`, `91d8c47c` |
| `frontend/src/utils/dashboardExport.test.js` | (même nom) | `1d2bfdb`, `dafdb12b`, `42c6ce94` |
| `frontend/src/utils/dashboardExport.js` | (même nom) | `dafdb12b`, `0c6e08cd`, `42c6ce94` (commentaire mentionnant IDARA) |
| `frontend/src/components/organisms/CustomChartWidget.pivot.test.js` | (même nom) | `ee143f3f`, `1d2bfdb` |
| `frontend/src/components/molecules/EditHistoryModal.test.jsx` | (même nom) | `8ccf697b` (2026-08-12, création), `8c7f0185` (2026-08-17), `1d2bfdb` (nettoyage) |
| `frontend/src/components/organisms/TimeEntryList.test.jsx` | (même nom) | `dafdb12b`, `1d2bfdb` |
| `frontend/src/pages/ReportsPage.test.jsx` | (même nom) | `587989ec` (2026-09-03), `9891e04c` (2026-09-09), `1d2bfdb` |
| `frontend/src/pages/ProcessedHistoryPage.test.jsx` | (même nom — **fichier aujourd'hui supprimé**, mais toujours dans l'historique) | `8ccf697b`, `086676a5`, `5a915f53`, `3411755` |
| `frontend/src/api/timeflowApi.js` | (même nom) | `2ffec0cf` (2026-08-31), `1d2bfdb` |
| `class/timeimport.class.php` | (même nom) | `2e47e439` (TB-UNITED), `c007034e` (IDARA), `1d2bfdb` (bacem, nettoyage) |

Note : `ProcessedHistoryPage.test.jsx` n'apparaissait pas dans ta liste de
termes explicite, mais contenait le prénom réel bare "Soumeya" (sans nom
de famille) — je l'ai inclus par prudence car c'est la même règle de
remplacement (`\bSoumeya\b`) qui s'applique automatiquement dessus une
fois le fichier ciblé par `--replace-text`.

## Répartition par terme recherché

| Terme | Commits où il apparaît (ajout ou retrait) |
|---|---|
| `imbus` | `1d2bfdb`, `91d8c47c`, `0c6e08cd`, `449d5f3d`, `ee143f3f`, `2e47e439` |
| `samir chouaieb` | `1d2bfdb`, `91d8c47c`, `0c6e08cd`, `ee143f3f` |
| `mohamed chouaieb` | `1d2bfdb`, `91d8c47c`, `0c6e08cd`, `ee143f3f` |
| `wissal` | `1d2bfdb`, `91d8c47c`, `0c6e08cd`, `449d5f3d`, `ee143f3f`, `2e47e439` |
| `bacem` | `1d2bfdb`, `91d8c47c`, `0c6e08cd`, `449d5f3d`, `ee143f3f`, `2e47e439` |
| `wafa` | `1d2bfdb`, `91d8c47c`, `0c6e08cd`, `449d5f3d`, `ee143f3f`, `2e47e439`, `4e66b888`*, `a881e93f`* |
| `soyah` | `1d2bfdb`, `91d8c47c`, `0c6e08cd`, `449d5f3d`, `ee143f3f`, `2e47e439` |
| `imen` (⚠️ substring de "dimension", voir note) | `1d2bfdb`, `91d8c47c`, + toute la série de commits touchant `CustomChartWidget.jsx`/`dashboardExport.*` (dimension est un nom de paramètre très utilisé) |
| `soumeya chouaieb` | `1d2bfdb`, `8c7f0185`, `8ccf697b` |
| `soumeya` (bare, hors périmètre initial mais lié) | `1d2bfdb`, `dafdb12b`, `9891e04c`, `587989ec`, `c084ea4d`*, `5fb62007`*, `96752ca1`*, `8c7f0185`, `8ccf697b` |
| `TB-UNITED` | `1d2bfdb`, `91d8c47c`, `dafdb12b`, `42c6ce94`, `0c6e08cd`, `449d5f3d`, `ee143f3f`, `2e47e439` |
| `IDARA` | `1d2bfdb`, `91d8c47c`, `dafdb12b`, `0c6e08cd`, `449d5f3d`, `ee143f3f`, `2e47e439`, `c007034e`, `2ffec0cf` |
| `LEARN` (lié projet, cf. note casse) | mêmes fichiers que TB-UNITED/IDARA (dashboardExport.\*, CustomChartWidget.pivot.test.js) |
| `INFRA` | `1d2bfdb`, `91d8c47c`, `dafdb12b`, `0c6e08cd`, `449d5f3d`, `ee143f3f`, `2e47e439`, `c084ea4d`*, `5fb62007`*, `96752ca1`* |
| `TRAINING` | mêmes fichiers que INFRA/IDARA |
| `falous` | `1d2bfdb`, `dafdb12b` |
| `mtaa` | `1d2bfdb`, `dafdb12b` |

`*` = commit où le hit se trouve dans un dump SQL brut (`backup_*.sql`),
pas dans le code source.

## Faux positifs écartés (vérifiés, aucune action nécessaire)

Ces correspondances sont apparues dans la recherche brute mais **ne sont
pas des données réelles** — vérifié à la casse exacte / limites de mots :

- `INFRA` / `infra` dans `vendor/nikic/php-parser/README.md` et
  `vendor/phpunit/phpunit/SECURITY.md` → mot anglais "Infrastructure" /
  "infrastructure", rien à voir avec le codename projet.
- `LEARN` / `learn` dans `frontend/README.md` → URL
  `react.dev/learn/react-compiler` (documentation React officielle).
- `imen` dans les bundles JS (`frontend/dist/assets/*.js`) et dans tout
  le code React/Recharts → toujours une sous-chaîne de `Dimension` /
  `initialDimension` (prop interne de la librairie de graphiques), jamais
  le prénom réel. Vérifié avec limites de mots (`\bimen\b`) : 0 résultat
  dans ces bundles.
- `wafa`, `mtaa`, `bacem`, `soyah`, `wissal` dans divers fichiers
  `node_modules/**` (bundles minifiés tiers : tldts, css-color, etc.) →
  sous-chaînes fortuites dans du code minifié/données binaires, jamais un
  mot entier. Vérifié avec limites de mots : 0 résultat.
- Chaînes de remplissage `'aaaaaaaa'` / `'aaaaaaaaaaaaaaaaaaaaaaaaaaa'`
  dans `TimeEntryList.test.jsx` et `EditHistoryModal.test.jsx` → texte de
  test générique sans rapport avec le label `'AAAAA'` (5 lettres) déjà
  anonymisé en Étape 1.

`node_modules/` et `vendor/` ne sont plus suivis à HEAD (retirés dans des
commits antérieurs) mais restent dans l'historique — purement du bloat
(141 Mo de `.git`), sans donnée personnelle réelle. Le script de
nettoyage ne les touche pas par défaut (hors périmètre de cette demande),
mais si tu veux réduire la taille du dépôt au passage, ajoute
`--path node_modules --path vendor --path frontend/dist --invert-paths`
à la commande `git filter-repo` (à tes risques : vérifie d'abord qu'aucun
collaborateur n'en a besoin en référence).
