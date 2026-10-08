# Synthèse des tests non fonctionnels — module TimeFlow

*Document de soutenance — 2026-10-08*

## 1. Contexte et méthode

TimeFlow est un module Dolibarr de suivi du temps : chronomètre, saisie manuelle, validation hiérarchique, import de données externes (Clockify), tableau de bord et exports. Au-delà des fonctionnalités, quatre questions non fonctionnelles ont été testées méthodiquement, dans cet ordre : **sécurité**, **tolérance aux pannes**, **disponibilité**, **scalabilité**.

**Environnement.** Tous les essais ont eu lieu sur un Docker de test dédié (`docker-timeflow-test`, Dolibarr 19.0.2), jamais sur l'environnement de développement. Chaque phase démarre d'une sauvegarde faite par le responsable du projet ; les cas destructifs (arrêt de conteneur, restauration, génération de gros volumes) sont annoncés avant exécution et nécessitent son accord.

**Règles suivies** :
- un identifiant stable par cas de test (`SEC-01`, `PAN-01`, `DISP-01`, `SCAL-01`…), repris dans les rapports et cette synthèse ;
- un rapport constate, il ne corrige pas : chaque anomalie est traitée dans **sa propre PR**, jamais fusionnée par l'exécutant — le responsable relit et fusionne ;
- toute mesure est reproductible (scripts conservés) et ses preuves archivées sous `docs/tests/preuves/<AXE>/<ID>/` ;
- aucune donnée de test n'est supprimée « à la main » : le responsable restaure la base de référence entre les phases.

## 2. Chiffres clés par axe

| Axe | Cas prévus | Exécutés | Anomalies trouvées | Corrigées | Atténuées | Ouvertes |
|---|---|---|---|---|---|---|
| Sécurité | 20 | 20 | 14 (dont 1 critique) | 8 | 1 | 5 |
| Pannes | 15 | 10 | 3 (toutes Moyen) | 3 | 0 | 0 |
| Disponibilité | 12 | 9 (+1 préparée) | 2 réelles (+1 invalidée après vérification) | 0* | 0 | 2* |
| Scalabilité | 13 | 9 | 2 (1 élevé, 1 moyen) | 1 | 0 | 1 (améliorée) |
| **Total** | **60** | **48** | **21** | **12** | **1** | **8** |

*Les 2 anomalies ouvertes de l'axe Disponibilité relèvent du cœur Dolibarr (nom de fichier de sauvegarde à la minute, mot de passe visible sur la ligne de commande `mysqldump`) : non corrigibles dans le module, documentées à l'intention de l'éditeur.

Au-delà du dénombrement : **environ 70 000 requêtes hostiles** rejouées contre de vraies sessions (axe Sécurité) sans injection exploitable ; **plus de 20 PR de correctifs**, chacune liée à un identifiant de cas et relue avant fusion ; **0 perte ni corruption de données** constatée sur l'ensemble des cas destructifs des axes Pannes et Disponibilité, y compris sous panne combinée ou coupure en pleine écriture.

## 3. Les découvertes les plus importantes

**1. La matrice de droits n'était pas respectée (A-13, sécurité).**
*Problème* : seules les actions d'équipe, de validation et d'import vérifiaient un droit ; les 25 autres actions de l'API (démarrer un chrono, créer/corriger/supprimer une saisie, consulter les rapports…) répondaient normalement à un compte **sans aucun droit TimeFlow**. *Impact concret* : n'importe quel utilisateur Dolibarr connecté, même sans le module, pouvait agir comme un employé du module. *Correction* : un contrôle central unique, exécuté avant l'aiguillage de chaque action, avec repli administrateur cohérent. *Preuve* : 220 combinaisons action × profil rejouées, 219/220 conformes (le seul écart restant est un artefact de construction de la requête de test, sans lien avec les droits) ; 9 tests PHPUnit dédiés.

**2. L'export CSV global tronquait silencieusement au-delà de 50 000 lignes (ANO-SCAL-01, scalabilité).**
*Problème* : une limite codée en dur, sans compteur ni avertissement. *Impact concret* : à 108 539 lignes, l'export n'en renvoyait que 50 000 — 54 % de données manquantes dans un fichier présenté comme complet, utilisable tel quel pour la paie ou la facturation. *Correction* : pagination par curseur (immunisée contre un ajout/suppression pendant l'export), aucun fichier partiel possible en cas d'échec d'un lot. *Preuve* : re-mesuré à 100 562 lignes, 100 562/100 562 reçues, 0 écart, 4,6 s.

**3. Les totaux du tableau de bord étaient faux au-delà de 1 000 lignes (SCAL-02 / F2, scalabilité).**
*Problème* : les totaux et graphiques étaient calculés sur un échantillon plafonné à 1 000 lignes, pas sur la période entière. *Impact concret* : un responsable consultant un total annuel sur un volume réel voyait un chiffre incomplet, sans que rien ne l'indique clairement à l'écran au-delà du plafond. *Correction* : une seule requête d'agrégation SQL au grain le plus fin, exacte quel que soit le volume, remplaçant le calcul PHP plafonné. *Preuve* : exactitude vérifiée contre un calcul SQL brut indépendant (0 écart) à 100 562 lignes ; temps de réponse par ailleurs amélioré (973 ms → 196 ms p95 sur un mois).

**4. Un décalage d'une heure (parfois deux) sur les horodatages de saisie, et un chronomètre qui ne pouvait plus être arrêté après minuit (pannes/sécurité).**
*Problème* : les dates étaient converties deux fois avant d'être enregistrées (une fois par le module, une fois par le cœur Dolibarr), décalant l'heure stockée. *Impact concret* : 554 saisies historiques avaient une heure de début/fin erronée. Un bug lié, découvert en creusant le même code, bloquait **définitivement** l'arrêt d'un chronomètre ayant dépassé la durée maximale après un découpage de minuit. *Correction* : ne plus convertir la date deux fois ; recharger l'objet après le découpage de minuit. *Preuve* : script de correction exécuté par le responsable, **554 lignes corrigées, 0 échec, idempotence vérifiée** ; les 4 échecs de tests qui subsistaient depuis le début de l'axe Pannes se sont révélés être la **même cause unique**, résolue en une fois.

**5. Un index unique manquant côté import, et un piège du cœur Dolibarr qui masque silencieusement son échec (I1, pannes/scalabilité).**
*Problème* : rien en base n'empêchait deux imports simultanés de créer deux fois la même ligne ; la seule protection était une vérification applicative, non atomique. *Découverte additionnelle* : si cet index est créé sur une base contenant déjà des doublons, le cœur Dolibarr **ignore silencieusement l'échec**, sans erreur ni trace dans les journaux. *Correction* : index `UNIQUE` sur `import_key`, avec une vérification ajoutée après chaque activation (requête `SHOW INDEX`) et un avertissement visible dans la configuration du module si l'index est absent. *Preuve* : test de concurrence réel (deux imports simultanés du même fichier) : 0 doublon sur 20 lignes ; test PHPUnit qui reproduit la course en un seul thread.

## 4. Leçons de méthode

- **Une fausse anomalie, gardée pour mémoire (ANO-DISP-01).** `docker kill` sur les 4 conteneurs ne provoquait aucun redémarrage automatique — à tort interprété comme un échec de la politique de redémarrage. En réalité, Docker enregistre `kill`/`stop` comme un **arrêt volontaire**, que la politique `unless-stopped` ignore par conception. Rejoué avec un vrai plantage (saturation mémoire provoquant un arrêt par le noyau, jamais une commande Docker) : la reprise automatique fonctionne bien sur 3 conteneurs sur 4 testés.
- **Des tests en échec qui cachaient un vrai bug, pas un problème de test.** Quatre échecs PHPUnit étaient reportés depuis le début de l'axe Pannes comme une « dérive de date » sans gravité. En creusant leur cause commune, les quatre se sont révélés être le **même bug réel** (le chronomètre bloqué à minuit, découverte n° 4 ci-dessus) : ne jamais classer des échecs répétés comme du bruit sans en avoir vérifié la cause.
- **Une procédure de restauration qui a demandé trois essais avant de fonctionner (DISP-06).** La commande en ligne de commande pour déclencher la sauvegarde ne fonctionnait pas malgré un job activé ; la comparaison des sommes de contrôle comparait par erreur le nom de la base en plus de la donnée ; une sécurité a été ajoutée après coup pour vérifier qu'aucune instruction ne pouvait écraser la vraie base. Résultat final, exécuté par le responsable : 15/15 tables identiques, restauration en 18,3 s.
- **Un test qui « passait » selon sa propre conception, et montrait pourtant un vrai problème (SCAL-02).** L'avertissement de troncature du tableau de bord se déclenchait exactement comme prévu au-delà de 1 000 lignes — le mécanisme fonctionnait. Mais son déclenchement correct était lui-même la preuve que les totaux n'étaient qu'approximatifs au-delà de ce seuil : un test qui réussit formellement peut révéler un défaut qu'il n'était pas censé chercher.
- **Alléger ne suffit pas (F1).** Diviser le poids du paquet principal par trois (−66 %) n'a réduit le temps de chargement mesuré que de 4 %, toujours au-dessus du seuil visé : sous une connexion lente, chaque ressource encore chargée d'un bloc (bibliothèques partagées, feuille de style) et chaque nouvel aller-retour réseau pèsent autant que le poids téléchargé. Une mesure de bout en bout, pas seulement la taille d'un fichier, est nécessaire pour juger un correctif de performance.
- **Restreindre un accès réseau peut casser la performance, pas seulement l'ouvrir (A-14).** Après avoir fermé l'écoute réseau de la base du dev local à la seule boucle locale (correction de sécurité justifiée, §3), chaque page est devenue très lente (jusqu'à 26 s), sans lien apparent avec le changement : `conf.php` désignait l'hôte par le nom `localhost`, que PHP résout d'abord en IPv6 avant de retomber sur IPv4 — or la base ne répondait plus du tout en IPv6, et chaque tentative coûtait environ 2 s avant l'abandon, les délais s'additionnant sur une page à plusieurs requêtes. Corrigé en remplaçant le nom par l'adresse IPv4 explicite. **Leçon** : toute restriction d'écoute réseau doit être suivie d'une mesure de performance, pas seulement d'une vérification que l'application répond encore.

## 5. Ce qui reste ouvert

- **A-01 (critique, sécurité) — risque résiduel réduit, décisions restantes optionnelles.** Un fichier de configuration réel (mot de passe de base, identifiant d'instance) figure dans l'historique d'un dépôt public ; la récidive est bloquée. Vérifications faites par le responsable (2026-10-08) : le mot de passe exposé **n'ouvre plus aucun compte connu** (utilisateur et longueur différents de ceux en usage) ; l'identifiant d'instance exposé **diffère** de celui en usage sur le dev local (comparé par empreinte, jamais affiché). La rotation du mot de passe et la réécriture de l'historique restent des décisions optionnelles du responsable ; régénérer l'identifiant d'instance n'est plus nécessaire pour écarter un risque de collision. **Découverte additionnelle en traitant ce point** : la base de données du dev local écoutait sur toutes les interfaces réseau, pas seulement en local — **corrigée** par le responsable le même jour (`bind-address=127.0.0.1`).
- **A-06 à A-09 (sécurité, priorité moyenne/faible).** Jeton CSRF transporté dans l'URL ; durcissement serveur (version PHP exposée, pas de limite de taille de corps) ; aucune trace d'audit sur soumission/validation/refus ; validation perfectible des fichiers importés.
- **ANO-SCAL-02 / SCAL-04 (scalabilité) — améliorée, pas résolue.** L'import de 5 000 lignes est passé de 384 s à 313 s après l'index unique, mais reste au-dessus des deux seuils (120 s visé, ~300 s avant que le navigateur n'abandonne). La cause restante : environ 6 requêtes séquentielles exécutées pour chaque ligne importée, indépendantes de tout index.
- **SCAL-11 — améliorée, pas résolue.** Voir leçon F1 ci-dessus : le temps de chargement sous connexion lente reste légèrement au-dessus du seuil de 5 s (5,24 s mesuré) malgré la réduction du poids du paquet.
- **Cas non exécutés**, par manque de temps dans cette session : test de charge concurrente avec l'outil dédié (k6, absent de l'environnement) ; essai de disponibilité continue sur 24 h (optionnel par consigne) ; comparaison complète avec Dolibarr 22.0.4 (un seul environnement 19.0.2 était disponible).
- **Recommandations d'infrastructure R1-R5 (disponibilité)**, à décider par le responsable : sonde de santé applicative sur le conteneur web (R1) ; figer la version d'image Docker plutôt que `latest` (R2) ; détecter un conteneur de tâches planifiées arrêté (R4) ; activer le job de sauvegarde en production et prévoir une copie hors site, la sauvegarde actuelle restant sur la même machine que l'application (R5).

## 6. Récapitulatif et rapports détaillés

| Axe | Statut global | Rapport détaillé |
|---|---|---|
| Sécurité | 20/20 cas exécutés · 8 anomalies corrigées, 1 atténuée, 5 ouvertes (dont A-01, critique, risque résiduel réduit — voir §5) | [`RAPPORT_SECURITE.md`](./RAPPORT_SECURITE.md) |
| Pannes | 10/15 cas exécutés · 3/3 anomalies trouvées corrigées · 0 perte de donnée sur tous les cas destructifs | [`RAPPORT_PANNES.md`](./RAPPORT_PANNES.md) |
| Disponibilité | 9/12 cas exécutés (+1 préparée) · restauration complète vérifiée (RTO 18,3 s) · 2 anomalies, toutes deux côté cœur Dolibarr | [`RAPPORT_DISPONIBILITE.md`](./RAPPORT_DISPONIBILITE.md) |
| Scalabilité | 9/13 cas exécutés · export corrigé, tableau de bord corrigé, index ajoutés, import et temps de chargement améliorés mais encore ouverts | [`RAPPORT_SCALABILITE.md`](./RAPPORT_SCALABILITE.md) |

Plan de référence : [`PLAN_DE_TESTS.md`](./PLAN_DE_TESTS.md).
