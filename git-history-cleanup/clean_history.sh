#!/usr/bin/env bash
# =============================================================================
# git-history-cleanup/clean_history.sh
#
# Purge real employee names, the real client company (imbus AG/TN), real
# project codenames, and two entire files/directories that should never
# have been committed, from the FULL git history of
# mohamedksiaa/internship-project.
#
# THIS SCRIPT IS NOT RUN AUTOMATICALLY BY ANYONE. Read it, edit the
# REPO_URL below, then run it yourself after completing the checklist in
# CHECKLIST.md (warn collaborators, back up, etc). It is irreversible once
# you reach the `git push --force` step.
#
# Requires: git-filter-repo (https://github.com/newren/git-filter-repo)
#   pip install git-filter-repo   OR   brew install git-filter-repo
# =============================================================================
set -euo pipefail

# ---- EDIT THIS ----
REPO_URL="https://github.com/mohamedksiaa/internship-project.git"
WORKDIR="$(pwd)/history-cleanup-workspace"
MIRROR_DIR="$WORKDIR/internship-project-mirror.git"
REPLACEMENTS_FILE="$(cd "$(dirname "$0")" && pwd)/replacements.txt"
# -------------------

command -v git-filter-repo >/dev/null 2>&1 || {
  echo "ERROR: git-filter-repo is not installed. Install it first:" >&2
  echo "  pip install git-filter-repo   (or)   brew install git-filter-repo" >&2
  exit 1
}

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

# 2. Run filter-repo: text replacement + full removal of the raw SQL dumps
#    and the accidentally-committed nested .git backup directory.
echo ">>> Running git filter-repo ..."
git filter-repo \
  --replace-text "$REPLACEMENTS_FILE" \
  --invert-paths \
  --path backup_avant_fix_20260818_1140.sql \
  --path backup_avant_softdelete_20260818_1537.sql \
  --path backup_avant_suppression_clockify_20260901_1317.sql \
  --path .git.backup-20260828-1020 \
  --force

echo ">>> Repo size after cleanup:"
du -sh .

# 3. filter-repo strips the 'origin' remote as a safety measure — re-add it.
git remote add origin "$REPO_URL"

# 4. Verification pass — must all print 0.
echo ">>> Verifying: each count below must be 0"
for term in \
  "imbus" \
  "samir chouaieb" "mohamed chouaieb" "soumeya chouaieb" \
  '\bwissal\b' '\bbacem\b' '\bwafa\b' '\bsoyah\b' '\bimen\b' '\bsoumeya\b' \
  '\bTB-UNITED\b' '\bIDARA\b' '\bLEARN\b' '\bINFRA\b' '\bTRAINING\b' \
  "falous" "mtaa" ; do
  if [[ "$term" == \\b* ]]; then
    n=$(git log --all -G"$term" --oneline | wc -l)
  else
    n=$(git log --all -i -G"$term" --oneline | wc -l)
  fi
  echo "  '$term' -> $n matching commits"
done
echo ">>> Verifying the two removed paths are gone from every commit"
git log --all --oneline -- backup_avant_fix_20260818_1140.sql backup_avant_softdelete_20260818_1537.sql backup_avant_suppression_clockify_20260901_1317.sql .git.backup-20260828-1020 | wc -l

echo ""
echo "If every count above is 0, the mirror is clean."
echo "Next step (IRREVERSIBLE): push it to GitHub. This is commented out —"
echo "uncomment the two lines below in this script, or run them by hand,"
echo "only once you're satisfied with the verification output and have"
echo "warned every collaborator per CHECKLIST.md."
echo ""
echo "# git push --force --all origin"
echo "# git push --force --tags origin"
