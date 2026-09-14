Salut @soumeyachouaieb2004-prog @yahyabahar,

Je vais faire un **nettoyage de sécurité de l'historique git** du repo
`internship-project` — retrait de données sensibles présentes dans
d'anciens commits (le repo est public).

Ça va réécrire tout l'historique : **tous les hashs de commits vont
changer**. Ce n'est pas encore fait, je vous préviens à l'avance.

**Avant l'opération** : pushez tout votre travail en cours d'ici là, je
vous confirmerai l'heure exacte. Rien ne doit rester non-poussé sur vos
machines à ce moment-là.

**Après l'opération**, sur vos clones locaux :
- ⚠️ **Ne faites surtout pas `git pull` ou `git fetch`** sur votre clone
  existant — l'ancien et le nouvel historique sont incompatibles, ça va
  créer un vrai bazar de conflits.
- Sauvegardez si besoin votre travail non poussé (`git format-patch` ou
  copiez vos branches ailleurs).
- **Supprimez entièrement** votre dossier local du repo.
- Refaites un `git clone` propre depuis GitHub.
- Si vous aviez des PR ouvertes, elles devront être recréées après coup
  (les anciens commits de base n'existeront plus).

Je vous dis quand c'est fait. Des questions, n'hésitez pas.
