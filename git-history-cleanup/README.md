# git-history-cleanup/

Outillage pour retirer les données sensibles de l'historique git complet
du dépôt (pas seulement de l'état actuel). Voir `CHECKLIST.md` pour la
procédure complète, `COMMITS_AND_FILES.md` pour l'audit détaillé.

## Pourquoi certains fichiers ne sont pas dans ce dossier

Deux fichiers sont **nécessaires** au fonctionnement du nettoyage mais
**volontairement absents** de ce dépôt git, committés nulle part :

- `replacements.txt` — les règles `git filter-repo --replace-text`
- `terms.sh` — la liste utilisée par le rapport de vérification final

Ces deux fichiers doivent, par construction, contenir les **chaînes
sensibles exactes** (les vrais noms, le vrai nom du client, les vrais
noms de code de projet) pour pouvoir les chercher et les remplacer. Les
committer recréerait exactement le problème qu'on cherche à résoudre —
c'est d'ailleurs ce qui s'est passé lors du premier passage (une version
antérieure de ces fichiers, committée par erreur avec les chaînes en
clair, faisait encore partie de l'historique nettoyé).

`COMMITS_AND_FILES.md`, lui, reste dans le dépôt : il décrit l'étendue
du problème (fichiers, commits, catégories) en utilisant des **codes
opaques** (`CODE-CLIENT-A`, `CODE-EMP-A`, `CODE-PROJ-A`, ...) au lieu des
chaînes réelles, donc il ne réintroduit rien de sensible.

## Où trouver `replacements.txt` et `terms.sh`

Ils t'ont été livrés séparément (fichiers envoyés dans la conversation,
pas dans ce dépôt). Place-les où tu veux sur ta machine et pointe
`clean_history.sh` dessus :

```
REPLACEMENTS_FILE=/chemin/vers/replacements.txt \
TERMS_FILE=/chemin/vers/terms.sh \
./clean_history.sh
```

Par défaut (sans variables d'environnement), le script les cherche dans
ce même dossier (`git-history-cleanup/replacements.txt` et
`git-history-cleanup/terms.sh`) — donc si tu préfères, tu peux les poser
ici en local pour ton usage, **à condition de ne jamais les `git add` /
`git commit`**. Le `.gitignore` du dépôt ne les ignore pas explicitement
aujourd'hui : fais attention à un `git add -A` malencontreux, ou
ajoute-les toi-même à `.gitignore` si tu les poses ici.
