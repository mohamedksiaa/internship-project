# frontend/scripts/

Utility scripts for this frontend. Not wired into `npm run` / CI — run
manually with Python when needed.

## check_dups.py

Detects structural duplicate keys at the same object level inside a JSON
file. Strict JSON allows a key to appear more than once in the same
object, but every mainstream parser (Python's `json.loads`, JavaScript's
`JSON.parse`, and therefore i18next at runtime) silently resolves that by
keeping only the **last** occurrence and discarding the earlier one(s) —
with no warning. If that duplication was accidental (a bad merge, a
copy-paste edit, a hand-written config), the file still "works" but
quietly drops data, and whoever edited it may not realize which value is
actually in effect. This script surfaces that before it becomes a
mystery bug: it reads the file with `json.object_pairs_hook`, which
(unlike a normal `json.loads`) sees every key exactly as it appears in
the source text, including duplicates, so it can flag them explicitly.

It operates on nested objects too — a duplicate inside `daily_report: {
read_report: ..., read_report: ... }` is caught the same way as a
duplicate at the file's root.

### Usage

```
python check_dups.py <json-file>
python check_dups.py <json-file> --clean
```

Run it against any JSON file in the repo — it was written with
`src/locales/*/translation.json` in mind (that's where duplicate keys are
most likely to sneak in through manual edits), but it takes any JSON file
as its argument; it does not scan the repo on its own.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | No duplicate keys found. |
| `1` | At least one duplicate key found (printed to stdout as `DUPLICATES FOUND: [...]`). |
| `2` | Error — file not found, not valid JSON, or (with `--clean`) the file could not be written back. |

### ⚠️ Warning: `--clean` keeps the FIRST occurrence, not the last

Without `--clean`, this script is pure read-only — safe to run anytime.

**With `--clean`, it rewrites the file in place**, and its policy is to
**keep the first occurrence of a duplicate key and silently drop every
later one**. This is the *opposite* of what every JSON parser actually
does at runtime (Python, JavaScript, and i18next all keep the **last**
occurrence). Concretely: if a duplicate key exists because someone
intentionally appended a corrected value further down in the file — a
very plausible way for a duplicate to happen — that corrected value is
the one currently in effect in the running app. Running `--clean` would
silently discard that corrected value and keep the older, wrong one
instead, with no way to tell from the tool's output which one you lost.

**Never run `--clean` without diffing the file afterwards** (`git diff`)
and confirming by hand that the *value* it kept is the one you actually
want — not just that a duplicate was removed. When in doubt, resolve a
found duplicate manually instead of trusting `--clean`'s choice.

As of the audit that added this README, `check_dups.py` was run
read-only against every JSON file in `frontend/` (all four locale files,
`package.json`, `package-lock.json`, `.oxlintrc.json`, and the dashboard
export fixture) with zero duplicates found anywhere — so `--clean` has
not been needed or exercised on this codebase's real files.
