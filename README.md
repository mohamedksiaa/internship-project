# Clockify pour Dolibarr

## Présentation

Ce module développe un prototype de suivi du temps inspiré de Clockify, intégré à Dolibarr avec une interface React/Vite et une API REST dédiée.

Il permet de :
- démarrer et arrêter un chrono
- associer un temps à un projet et à une tâche Dolibarr
- consulter l’historique des entrées de temps
- valider ou refuser des saisies depuis une logique manager
- visualiser un tableau de bord simple avec des métriques hebdomadaires

## Architecture

### Backend Dolibarr
- objet métier : TimeEntry
- table : llx_clockify_timeentry
- API REST : endpoints Clockify pour le timer, l’historique et la validation

### Frontend React
- Vite + React
- architecture Atomic Design
- communication via fetch natif
- état de chargement, erreur et vide géré proprement

## Fonctionnalités livrées

- suivi du temps en temps réel
- sélection d’un projet et d’une tâche
- ajout d’une note de description
- historique des entrées
- validation/refus des entrées
- dashboard avec synthèse hebdomadaire

## Installation

### Prérequis
- Dolibarr installé et configuré
- module placé dans le dossier custom de Dolibarr
- dépendances Node.js installées pour le frontend

### Backend
1. Copier le module dans le répertoire custom de Dolibarr.
2. Activer le module depuis l’interface Dolibarr.
3. Vérifier que la table llx_clockify_timeentry est bien créée.

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

