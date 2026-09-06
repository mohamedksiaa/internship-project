# TimeFlow pour Dolibarr

## Présentation

Ce module développe un prototype de suivi du temps inspiré de TimeFlow, intégré à Dolibarr avec une interface React/Vite et une API REST dédiée.

Il permet de :
- démarrer et arrêter un chrono
- saisir manuellement une plage horaire
- associer un temps à un projet et à une tâche Dolibarr
- marquer une saisie comme billable ou non billable
- ajouter des tags simples sur les entrées
- consulter l’historique des entrées de temps
- soumettre une entrée puis la valider ou la refuser depuis une logique manager
- visualiser un tableau de bord hebdomadaire avec métriques de base
- voir une vue calendrier hebdomadaire et des rapports consolidés
- préparer des lignes de facturation sur les saisies billables

## Architecture

### Backend Dolibarr
- objet métier : TimeEntry
- table : llx_timeflow_timeentry
- API REST : endpoints TimeFlow pour le timer, l’historique et la validation

### Frontend React
- Vite + React
- architecture Atomic Design
- communication via fetch natif
- état de chargement, erreur et vide géré proprement

## Fonctionnalités livrées

- suivi du temps en temps réel
- saisie manuelle de créneaux
- sélection d’un projet et d’une tâche
- ajout d’une note de description
- gestion d’un statut soumise/validée/refusée
- affichage de tags et du caractère billable
- historique des entrées
- validation/refus des entrées
- dashboard avec synthèse hebdomadaire
- vue calendrier hebdomadaire
- rapports de synthèse et prévisualisation de lignes de facture

## Installation

### Prérequis
- Dolibarr installé et configuré
- module placé dans le dossier custom de Dolibarr
- dépendances Node.js installées pour le frontend

### Backend
1. Copier le module dans le répertoire custom de Dolibarr.
2. Activer le module depuis l’interface Dolibarr.
3. Vérifier que la table llx_timeflow_timeentry est bien créée.

### Frontend
1. Se placer dans le dossier frontend.
2. Installer les dépendances :
   ```bash
   npm install
   ```
3. Lancer le serveur de développement :
   ```bash
   npm run dev
   ```
4. Vérifier la configuration du fichier .env si vous souhaitez utiliser l’API réelle.

## Utilisation

- Un utilisateur peut démarrer un chrono depuis l’interface React.
- Il peut associer une note et un projet/tâche.
- Le manager peut valider ou refuser une entrée depuis la liste.
- Le dashboard affiche la synthèse du temps de la semaine en cours.

## Sécurité

- les actions sensibles passent par les droits Dolibarr
- l’API exige une authentification valide
- les réponses sont nettoyées avant d’être exposées au frontend

## Compatibilité & portabilité

### Versions Dolibarr réellement validées

- **Dolibarr 22.0.4** (Windows/WAMP) et **Dolibarr 23.0.3** (Linux) sont les deux seules versions sur lesquelles ce module a effectivement tourné.
- `modTimeFlow.class.php` déclare `need_dolibarr_version = [19, -3]` sans plafond, mais cette plage est héritée du template ModuleBuilder et n'a jamais été vérifiée en dehors de 22.x-23.x. Ne pas la lire comme une garantie de fonctionnement sur 19-21.x ou au-delà de 23.0.3.

### Règles de développement

- **Pas de fonction ou de chemin spécifique à un OS sans fallback portable.** Toute fonction `posix_*`/`pcntl_*`, tout chemin codé en dur (`/tmp/`, `/var/`, `/usr/`...) casse silencieusement ou fatalement sous Windows. Un module lancé indifféremment sur WAMP (dev) et un serveur Linux (prod) doit rester agnostique de l'OS — utiliser `sys_get_temp_dir()`, `DOL_DATA_ROOT`, ou l'API Dolibarr existante plutôt qu'un chemin en dur.
- **Aucun diagnostic temporaire ne doit rester dans le code au-delà de l'investigation qui l'a motivé.** Incident de référence : une fonction `timeflowDebugLog()` ajoutée pour déboguer `getTimeFlowProjects` appelait `posix_getuid()` — indétectable sous Linux (où l'extension POSIX existe), elle a cassé `ajax/timeentry.php` avec une erreur fatale dès son premier chargement sur un environnement Windows. Un `TODO`/commentaire "TEMPORARY" ne suffit pas : si l'investigation est close, le code doit être supprimé avant le commit qui la clôt, pas laissé "au cas où".
- Les scripts d'exploitation shell (`sql/*.sh`) sont Linux-only par nature et c'est acceptable — mais doivent le dire explicitement en en-tête plutôt que de le laisser deviner.

## Licence

GPLv3 ou version ultérieure.

