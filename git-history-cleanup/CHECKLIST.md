# Checklist — réécriture de l'historique git (à exécuter TOI-MÊME)

Rien dans ce dossier n'a été exécuté. Ce sont des fichiers préparés pour
toi : `replacements.txt` (règles de remplacement), `clean_history.sh`
(script prêt à l'emploi), `COMMITS_AND_FILES.md` (l'audit complet).

## Pourquoi c'est nécessaire

Le repo est **public**. Le nettoyage déjà fait (commits `91d8c47`,
`1d2bfdba`) corrige l'état actuel (HEAD), mais **tous les anciens commits
restent consultables et cloneables** avec les vraies données dedans —
n'importe qui peut faire `git clone` puis `git log -p` ou `git show
<ancien-commit>` et retrouver noms d'employés réels, nom du client réel,
et données d'heures/facturation associées. Réécrire l'historique est la
seule façon de vraiment les retirer.

## Ordre à suivre

### 1. Prévenir les collaborateurs (AVANT de toucher à quoi que ce soit)
- [ ] Lister tous les collaborateurs actifs (accès en écriture au repo).
- [ ] Leur annoncer : date/heure prévue de la réécriture, pourquoi
      (fuite de données réelles dans l'historique), et qu'ils devront
      **re-cloner** après (pas juste `git pull` — voir étape 5).
- [ ] Leur demander de **pusher tout travail en cours** avant l'heure
      annoncée, et de ne rien pusher pendant l'opération.
- [ ] Si des Pull Requests sont ouvertes : les hashs de commits vont
      changer pour toute branche basée sur l'historique réécrit — prévenir
      que ces PR devront être recréées ou rebasées après coup.

### 2. Sauvegarder le repo actuel (avant toute réécriture)
- [ ] Faire un clone miroir de sauvegarde, séparé du clone de travail que
      le script va créer :
      ```
      git clone --mirror https://github.com/mohamedksiaa/internship-project.git backup-avant-reecriture.git
      ```
- [ ] Garder ce dossier `backup-avant-reecriture.git` en lieu sûr
      (disque externe, autre machine) — **ne pas le pousser nulle part
      publiquement**, puisqu'il contient justement les données à
      retirer. C'est ton filet de sécurité si quelque chose se passe mal.

### 3. Exécuter le nettoyage localement (sur le clone miroir du script, pas sur ton clone de travail)
- [ ] Installer `git-filter-repo` si ce n'est pas déjà fait
      (`pip install git-filter-repo`).
- [ ] Lire `replacements.txt` en entier et vérifier que tu es d'accord
      avec chaque remplacement.
- [ ] Lancer `./clean_history.sh` — il clone un miroir frais séparé, y
      applique le nettoyage, et **s'arrête avant le push** en affichant
      un rapport de vérification (doit montrer 0 partout).
- [ ] Vérifier ce rapport toi-même : si un seul compteur n'est pas à 0,
      **ne pousse pas** — regarde `COMMITS_AND_FILES.md` pour comprendre
      quel commit/fichier pose encore problème.
- [ ] Optionnel mais recommandé : ouvrir `git log --all -p` sur quelques
      fichiers au hasard qui contiennent des mots proches (ex. un fichier
      qui utilise `dimension` en JS) pour t'assurer que le remplacement
      n'a rien cassé par erreur (voir la note sur `imen`/`dimension` dans
      `replacements.txt`).

### 4. Force-push vers GitHub (IRRÉVERSIBLE)
- [ ] Vérifier une dernière fois qu'il n'y a AUCUN push en attente de qui
      que ce soit sur le repo distant.
- [ ] Décommenter/exécuter les deux commandes affichées à la fin du
      script :
      ```
      git push --force --all origin
      git push --force --tags origin
      ```
- [ ] Vérifier sur GitHub que les nouveaux hashs de commits apparaissent
      et que les anciens ne sont plus référencés par aucune branche/tag.
- [ ] Si GitHub a un cache de vues/diffs sur les anciens commits (rare
      mais possible via des liens externes déjà partagés), contacte le
      support GitHub pour une purge complète du cache si nécessaire —
      les objets orphelins sont normalement garbage-collectés par GitHub
      après un force-push, mais un `git gc` côté serveur peut prendre un
      peu de temps.

### 5. Demander à chaque collaborateur de re-cloner
- [ ] **Ne pas** leur dire de faire `git pull` ou `git fetch` sur leur
      clone existant — leur historique local divergerait et créerait un
      vrai bazar (conflits, duplication de commits).
- [ ] Leur demander de :
      1. Sauvegarder tout travail non poussé (`git format-patch` ou
         copier leurs branches en `.bundle`).
      2. **Supprimer entièrement** leur dossier de clone local.
      3. Refaire un `git clone` propre depuis GitHub.
      4. Ré-appliquer leur travail sauvegardé sur le nouveau clone si
         besoin.
- [ ] Rappeler que tout fork existant sur GitHub garde l'ancien
      historique tant que son propriétaire ne le supprime/recrée pas —
      si des forks publics existent, les identifier et contacter leurs
      propriétaires séparément (un force-push sur le repo d'origine ne
      les affecte pas).

## Après coup
- [ ] Confirmer que `backup_*.sql` et tout futur dump de base de données
      sont bien dans `.gitignore` (déjà fait dans les commits `449d5f3d`
      et `c084ea4d` pour le pattern `backup_*.sql`, à revérifier).
- [ ] Envisager une revue rapide des pratiques de commit pour éviter que
      ça se reproduise (ex. ne jamais committer de dump SQL production,
      ne jamais committer un dossier `.git*` de sauvegarde).
