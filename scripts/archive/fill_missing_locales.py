# ARCHIVÉ : déplacé de frontend/ vers scripts/archive/. Jamais appelé par
# aucun script/CI/README (confirmé par grep exhaustif sur tout le dépôt) :
# usage manuel ponctuel uniquement (`python fill_missing_locales.py`, à
# lancer depuis frontend/ -- le chemin 'src/locales' ci-dessous est
# relatif au répertoire d'exécution, pas au fichier lui-même).
#
# Raison de l'archivage, plus sérieuse qu'un simple "logique dépassée" :
# CE SCRIPT ÉCRIT SUR DISQUE (contrairement à check_locales.py, purement
# en lecture), et le relancer aujourd'hui ferait activement du tort :
# 1. Il court-circuiterait le processus de revue humaine déjà en place
#    (frontend/src/locales/TRANSLATIONS_TO_REVIEW.md, qui exige qu'une
#    traduction de/ar validée passe par une revue humaine, jamais par
#    une copie automatique de l'anglais) en remplissant silencieusement
#    toute clé manquante avec le texte ANGLAIS tel quel -- une fausse
#    traduction qu'un utilisateur de/ar verrait comme définitive alors
#    qu'elle ne l'est pas.
# 2. Il propagerait projects.col_status (clé déjà morte, présente
#    seulement en fr, jamais lue par aucun composant React -- la vraie
#    clé utilisée est timeentry.col_status) vers en/de/ar au lieu de la
#    supprimer là où elle traîne inutilement.
# 3. Il remplirait en/fr/de avec des variantes de pluriel CLDR
#    (_two/_few/_many/_zero) qu'elles n'utilisent jamais grammaticalement
#    (seul l'arabe a besoin de ces 6 formes ; en/fr/de n'en résolvent
#    que 2) -- du bruit permanent ajouté aux fichiers de langue sans
#    aucun bénéfice fonctionnel.
# Les 2 vraies clés manquantes qu'il aurait fini par "corriger"
# (daily_report.read_report / daily_report.send_report en de et ar) ont
# été traitées séparément, à la main, en suivant le vrai processus de
# revue documenté dans TRANSLATIONS_TO_REVIEW.md -- voir l'historique
# git pour ce commit.
import json
from pathlib import Path

base_dir = Path('src/locales')
langs = ['en','de','fr','ar']
files = {lang: base_dir/lang/'translation.json' for lang in langs}

# load
data = {lang: json.load(open(p,'r',encoding='utf-8')) for lang,p in files.items()}

def collect_keys(d, prefix=''):
    keys = set()
    if isinstance(d, dict):
        for k,v in d.items():
            full = f"{prefix}.{k}" if prefix else k
            keys.add(full)
            keys |= collect_keys(v, full)
    return keys

all_keys = set()
for lang in langs:
    all_keys |= collect_keys(data[lang])

# helper to set nested key
def set_nested(d, dotted, value):
    parts = dotted.split('.')
    cur = d
    for p in parts[:-1]:
        if p not in cur or not isinstance(cur[p], dict):
            cur[p] = {}
        cur = cur[p]
    cur[parts[-1]] = value

# helper to get nested
def get_nested(d, dotted):
    parts = dotted.split('.')
    cur = d
    for p in parts:
        if not isinstance(cur, dict) or p not in cur:
            return None
        cur = cur[p]
    return cur

changed = False
for lang in langs:
    for key in sorted(all_keys):
        if get_nested(data[lang], key) is None:
            val = get_nested(data['en'], key)
            if val is None:
                val = ''
            set_nested(data[lang], key, val)
            changed = True

if changed:
    for lang in langs:
        p = files[lang]
        json.dump(data[lang], open(p,'w',encoding='utf-8'), ensure_ascii=False, indent=2)
    print('Filled missing keys for languages:', ','.join(langs))
else:
    print('No changes needed')
