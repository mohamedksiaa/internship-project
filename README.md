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

## Licence

GPLv3 ou version ultérieure.

