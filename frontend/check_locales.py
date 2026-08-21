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
