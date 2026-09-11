# ARCHIVÉ : déplacé de frontend/ vers scripts/archive/. Jamais appelé par
# aucun script/CI/README (confirmé par grep exhaustif sur tout le dépôt --
# frontend/package.json ne déclare que des scripts JS, aucune CI n'existe
# dans ce dépôt) : usage manuel ponctuel uniquement
# (`python check_locales.py`, à lancer depuis frontend/ -- le chemin
# 'src/locales' ci-dessous est relatif au répertoire d'exécution, pas au
# fichier lui-même).
#
# Raison de l'archivage : sa logique brute est dépassée par le vrai
# processus de revue de traduction déjà en place,
# frontend/src/locales/TRANSLATIONS_TO_REVIEW.md, qui exige une revue
# humaine par langue plutôt qu'une comparaison mécanique de clés.
# Vérifié en le relançant sur l'état actuel des fichiers de langue avant
# archivage : le calcul brut ("union de toutes les clés de toutes les
# langues, signaler celles absentes ailleurs") signale 68 à 71 clés
# "manquantes" par langue en:fr:de, mais l'écrasante majorité sont des
# faux positifs -- des suffixes de pluriel CLDR (_zero/_two/_few/_many)
# que seul l'arabe a besoin de porter (6 formes grammaticales de pluriel
# contre 2 pour en/fr/de) ; le script ne le sait pas et traite ça comme
# un trou à combler partout. Un faux positif d'un autre type s'y ajoute
# (projects.col_status, une clé déjà morte présente seulement en fr,
# jamais lue par aucun composant React -- la vraie clé utilisée est
# timeentry.col_status, correcte dans les 4 langues). Une fois ces faux
# positifs filtrés, il ne restait que 2 vraies clés manquantes
# (daily_report.read_report / daily_report.send_report en de et ar,
# corrigées séparément, voir l'historique git). Le signal réel de cet
# outil est donc noyé dans du bruit qu'il ne sait pas filtrer -- à
# réutiliser un jour, il faudrait d'abord lui apprendre à ignorer les
# suffixes de pluriel CLDR, sous peine de générer une liste de "trous"
# trompeuse à chaque exécution.
import json
from pathlib import Path
files={p.parent.name:json.load(open(p,'r',encoding='utf-8')) for p in Path('src/locales').rglob('translation.json')}

def collect(d,prefix=''):
    keys=set()
    if isinstance(d,dict):
        for k,v in d.items():
            full = f"{prefix}.{k}" if prefix else k
            keys.add(full)
            keys |= collect(v, full)
    return keys

keysets={lang:collect(obj) for lang,obj in files.items()}
allkeys = set().union(*keysets.values())
for lang,keys in keysets.items():
    missing = sorted(allkeys-keys)
    print(f"== {lang} ==\nkeys: {len(keys)}\nmissing_count: {len(missing)}")
    if len(missing)>0:
        print('missing sample:', missing[:20])
    print()
