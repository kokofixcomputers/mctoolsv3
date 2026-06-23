#!/usr/bin/env bash
#
# Sync the vendored cubiomes-wasm/ with upstream (xpple/cubiomes), git-merge style,
# using only core git (no `git subtree` required).
#
# How it works: cubiomes-wasm/.upstream-base/ holds a snapshot of the upstream files
# as of the last sync (the common ancestor). On update we 3-way merge:
#       base   = .upstream-base/<file>   (last synced upstream)
#       theirs = upstream HEAD/<file>    (new upstream)
#       ours   = cubiomes-wasm/<file>    (your working copy, possibly edited)
# `git merge-file` applies upstream's changes to your copy, leaving normal
# <<<<<<< / ======= / >>>>>>> conflict markers if your edits collide. Local-only
# files (wrapper.c, README.md) are never in upstream's set, so they're left alone.
#
# Usage:
#   ./updateCubiomes.sh --setup   # one-time: snapshot the current files as the base
#   ./updateCubiomes.sh           # pull upstream and merge
#
# After syncing, rebuild:  ./buildCubiomes.sh
set -euo pipefail

REPO="https://github.com/xpple/cubiomes"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIR="$ROOT/cubiomes-wasm"
BASE="$DIR/.upstream-base"

# Only these upstream paths are vendored/merged (skip Makefile, docs/, .github/, tests.c…).
relevant() {
  case "$1" in
    tests.c) return 1 ;;
    *.c|*.h|tables/*|features/*|loot/*|LICENSE) return 0 ;;
    *) return 1 ;;
  esac
}

# ── setup: snapshot current vendored files as the merge base ──────────────────────
if [ "${1:-}" = "--setup" ]; then
  echo "Snapshotting current cubiomes-wasm/ as the upstream merge base…"
  rm -rf "$BASE"; mkdir -p "$BASE"
  ( cd "$DIR" && find . -type f \( -name '*.c' -o -name '*.h' -o -name 'LICENSE' \) \
      ! -path './.upstream-base/*' ! -name 'wrapper.c' ) | sed 's#^\./##' | while read -r rel; do
    if relevant "$rel"; then
      mkdir -p "$BASE/$(dirname "$rel")"
      cp "$DIR/$rel" "$BASE/$rel"
    fi
  done
  echo "✓ Base saved to cubiomes-wasm/.upstream-base/. Commit it, then use ./updateCubiomes.sh to pull upstream."
  exit 0
fi

if [ ! -d "$BASE" ]; then
  echo "error: no merge base found. Run ./updateCubiomes.sh --setup once first." >&2
  exit 1
fi

# ── update: clone upstream, 3-way merge each relevant file ────────────────────────
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
echo "Cloning $REPO …"
git clone --quiet --depth 1 "$REPO" "$tmp/up"
NEW="$(git -C "$tmp/up" rev-parse HEAD)"
echo "Upstream HEAD: ${NEW:0:10}"

merged=0; added=0; conflicts=0
# iterate upstream's tracked files
git -C "$tmp/up" ls-files | while read -r rel; do
  relevant "$rel" || continue
  theirs="$tmp/up/$rel"
  ours="$DIR/$rel"
  basef="$BASE/$rel"

  if [ ! -f "$ours" ] && [ ! -f "$basef" ]; then
    # brand-new upstream file → adopt it
    mkdir -p "$(dirname "$ours")" "$(dirname "$basef")"
    cp "$theirs" "$ours"; cp "$theirs" "$basef"
    echo "  + added $rel"; added=$((added + 1)); continue
  fi
  [ -f "$ours" ] || cp "$theirs" "$ours"      # we deleted it locally → re-adopt
  [ -f "$basef" ] || : > "$basef"             # no ancestor → empty base (may conflict)

  if git merge-file -q -L ours -L base -L upstream "$ours" "$basef" "$theirs"; then
    merged=$((merged + 1))
  else
    echo "  ! CONFLICT $rel"; conflicts=$((conflicts + 1))
  fi
  cp "$theirs" "$basef"                        # advance the base to current upstream
done

# the while-loop runs in a subshell (pipe), so recompute the conflict count for the exit note
CONF=$(git -C "$DIR" grep -lE '^<<<<<<< ours' -- ':!.upstream-base' 2>/dev/null | wc -l | tr -d ' ')
echo
if [ "$CONF" != "0" ]; then
  echo "⚠  $CONF file(s) have merge conflicts — resolve the <<<<<<< markers, then rebuild."
else
  echo "✓ Merged cleanly."
fi
echo "Next: review the diff, then ./buildCubiomes.sh"
