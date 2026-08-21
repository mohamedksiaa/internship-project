#!/usr/bin/env python3
"""
check_dups.py

Detect structural duplicate keys at the same object level inside a JSON file
and optionally write a cleaned version (keeping the first occurrence of a
duplicate key). This uses the object_pairs_hook to observe key ordering and
remove duplicates while preserving nesting.

Usage:
  ./check_dups.py <json-file> [--clean]

Returns exit code 0 when no duplicates, 1 when duplicates found, 2 on error.
"""

import sys
import json
from collections import OrderedDict


def check_and_optionally_clean(path, clean=False):
    duplicates = []

    def hook(pairs):
        od = OrderedDict()
        seen = set()
        for k, v in pairs:
            if k in seen:
                duplicates.append(k)
                # skip duplicate (keep first occurrence)
                continue
            seen.add(k)
            od[k] = v
        return od

    try:
        with open(path, 'r', encoding='utf-8') as fh:
            text = fh.read()
            obj = json.loads(text, object_pairs_hook=hook)
    except Exception as e:
        print('ERROR:', e)
        return 2

    if clean:
        # write cleaned JSON back preserving unicode and indentation
        try:
            with open(path, 'w', encoding='utf-8') as fh:
                json.dump(obj, fh, ensure_ascii=False, indent=2)
        except Exception as e:
            print('ERROR writing cleaned file:', e)
            return 2

    if duplicates:
        print('DUPLICATES FOUND:', sorted(set(duplicates)))
        return 1

    print('0 duplicate found')
    return 0


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: check_dups.py <json-file> [--clean]')
        sys.exit(2)
    path = sys.argv[1]
    clean_flag = '--clean' in sys.argv[2:]
    sys.exit(check_and_optionally_clean(path, clean=clean_flag))
