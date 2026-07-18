#!/usr/bin/env bash
# Prints the semantic version: the VERSION file is the base, and every
# commit since it last changed bumps it according to Conventional
# Commits — type!: (breaking) bumps major, feat: bumps minor, anything
# else bumps patch. Run from the repository root.
set -euo pipefail

BASE=$(cat VERSION)
MAJOR=$(echo "$BASE" | cut -d. -f1)
MINOR=$(echo "$BASE" | cut -d. -f2)
PATCH=$(echo "$BASE" | cut -d. -f3)

LAST=$(git log -1 --format=%H -- VERSION)
while IFS= read -r subject; do
  [ -z "$subject" ] && continue
  if echo "$subject" | grep -qE '^[a-z]+(\([a-z0-9-]+\))?!: '; then
    MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0
  elif echo "$subject" | grep -qE '^feat(\([a-z0-9-]+\))?: '; then
    MINOR=$((MINOR + 1)); PATCH=0
  else
    PATCH=$((PATCH + 1))
  fi
done < <(git log --reverse --first-parent --format=%s "$LAST"..HEAD)

echo "$MAJOR.$MINOR.$PATCH"
