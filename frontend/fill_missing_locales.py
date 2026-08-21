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
