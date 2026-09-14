#!/usr/bin/env bash
# =============================================================================
# git-history-cleanup/clean_history.sh
#
# Purge real employee names, the real client company, real project
# codenames, and two entire files/directories that should never have been
# committed, from the FULL git history of mohamedksiaa/internship-project.
#
# THIS SCRIPT IS NOT RUN AUTOMATICALLY BY ANYONE. Read it, edit the
# REPO_URL below, then run it yourself after completing the checklist in
# CHECKLIST.md (warn collaborators, back up, etc). It is irreversible once
# you reach the `git push --force` step.
#
# This script deliberately does NOT hardcode any of the sensitive strings
# itself — it sources two files that are NOT committed to this repo (see
# README.md in this folder for why, and how to get them):
#   - replacements.txt : git filter-repo --replace-text rules
#   - terms.sh          : the VERIFY_TERMS array used for the post-run check
# Point REPLACEMENTS_FILE / TERMS_FILE below at wherever you keep them, or
# override via environment variables (see README.md).
#
# Requires: git-filter-repo (https://github.com/newren/git-filter-repo)
#   pip install git-filter-repo   OR   brew install git-filter-repo
# =============================================================================
set -euo pipefail

# ---- EDIT THIS ----
REPO_URL="https://github.com/mohamedksiaa/internship-project.git"
WORKDIR="$(pwd)/history-cleanup-workspace"
MIRROR_DIR="$WORKDIR/internship-project-mirror.git"
REPLACEMENTS_FILE="${REPLACEMENTS_FILE:-$(cd "$(dirname "$0")" && pwd)/replacements.txt}"
TERMS_FILE="${TERMS_FILE:-$(cd "$(dirname "$0")" && pwd)/terms.sh}"
# -------------------

command -v git-filter-repo >/dev/null 2>&1 || {
  echo "ERROR: git-filter-repo is not installed. Install it first:" >&2
  echo "  pip install git-filter-repo   (or)   brew install git-filter-repo" >&2
  exit 1
}
[ -f "$REPLACEMENTS_FILE" ] || {
  echo "ERROR: $REPLACEMENTS_FILE not found." >&2
  echo "  This file is delivered separately (not committed) — see README.md." >&2
  echo "  Point REPLACEMENTS_FILE at it, e.g.:" >&2
  echo "    REPLACEMENTS_FILE=/path/to/replacements.txt TERMS_FILE=/path/to/terms.sh ./clean_history.sh" >&2
  exit 1
}
[ -f "$TERMS_FILE" ] || {
  echo "ERROR: $TERMS_FILE not found (see README.md)." >&2
  exit 1
}
# shellcheck source=/dev/null
source "$TERMS_FILE"   # defines VERIFY_TERMS=(...)

echo "This will operate on a FRESH MIRROR CLONE at: $MIRROR_DIR"
echo "It will NOT touch your existing working copy until the final push step."
read -r -p "Type YES to continue: " confirm
[ "$confirm" = "YES" ] || { echo "Aborted."; exit 1; }

mkdir -p "$WORKDIR"

# 1. Fresh mirror clone (bare, all refs, no working tree) — filter-repo
#    requires this so it never operates on a repo that might have local
#    uncommitted state or partial history.
if [ -d "$MIRROR_DIR" ]; then
  echo "ERROR: $MIRROR_DIR already exists — remove it first if you want a truly fresh mirror." >&2
  exit 1
fi
echo ">>> Cloning fresh mirror from $REPO_URL ..."
git clone --mirror "$REPO_URL" "$MIRROR_DIR"

cd "$MIRROR_DIR"

echo ">>> Repo size before cleanup:"
du -sh .

# 2. Run filter-repo: text replacement (blob content AND commit messages —
#    --replace-text only covers blob content, --replace-message is a
#    separate flag for commit messages) + full removal of the raw SQL
#    dumps, the accidentally-committed nested .git backup directory, and
#    every historical copy of this folder's own operational rules file
#    (git-history-cleanup/replacements.txt / terms.sh, if ever committed).
#    That last removal matters because the rules file's own notation
#    (e.g. the literal text "Acme Corp") can defeat its own word-boundary
#    regex when the file's raw bytes are scanned by that same rule — the
#    "b" right before the search word blocks the boundary match — so
#    text-replace alone can't reliably self-clean a rules file that was
#    ever accidentally committed; removing it by path sidesteps that.
echo ">>> Running git filter-repo ..."
git filter-repo \
  --replace-text "$REPLACEMENTS_FILE" \
  --replace-message "$REPLACEMENTS_FILE" \
  --invert-paths \
  --path backup_avant_fix_20260818_1140.sql \
  --path backup_avant_softdelete_20260818_1537.sql \
  --path backup_avant_suppression_clockify_20260901_1317.sql \
  --path .git.backup-20260828-1020 \
  --path git-history-cleanup/replacements.txt \
  --path git-history-cleanup/terms.sh \
  --force

echo ">>> Repo size after cleanup:"
du -sh .

# 3. filter-repo strips the 'origin' remote as a safety measure — re-add it.
git remote add origin "$REPO_URL"

# 4. Verification pass — must all print 0. Checks BOTH blob/diff content
#    (-G, what --replace-text covers) and commit message text (--grep,
#    what --replace-message covers) separately, since they're two
#    different mechanisms and a fix to one doesn't imply the other.
echo ">>> Verifying: each count below must be 0"
for term in "${VERIFY_TERMS[@]}"; do
  if [[ "$term" == \\b* ]]; then
    n_content=$(git log --all -G"$term" --oneline 2>/dev/null | grep -vc "not a valid attribute" || true)
    n_message=$(git log --all --extended-regexp --grep="$term" --oneline 2>/dev/null | grep -vc "not a valid attribute" || true)
  else
    n_content=$(git log --all -i -G"$term" --oneline 2>/dev/null | grep -vc "not a valid attribute" || true)
    n_message=$(git log --all -i --grep="$term" --oneline 2>/dev/null | grep -vc "not a valid attribute" || true)
  fi
  echo "  '$term' -> content: $n_content matching commits, commit messages: $n_message matching commits"
done
echo ">>> Verifying the two removed paths are gone from every commit"
git log --all --oneline -- backup_avant_fix_20260818_1140.sql backup_avant_softdelete_20260818_1537.sql backup_avant_suppression_clockify_20260901_1317.sql .git.backup-20260828-1020 2>/dev/null | grep -vc "not a valid attribute" || true

echo ""
echo "If every count above is 0, the mirror is clean."
echo "Next step (IRREVERSIBLE): push it to GitHub. This is commented out —"
echo "uncomment the two lines below in this script, or run them by hand,"
echo "only once you're satisfied with the verification output and have"
echo "warned every collaborator per CHECKLIST.md."
echo ""
echo "# git push --force --all origin"
echo "# git push --force --tags origin"
