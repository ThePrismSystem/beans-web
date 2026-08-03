#!/usr/bin/env bash
#
# The `beans` CLI version is pinned in exactly one place: `ARG BEANS_VERSION` in
# the Dockerfile. docker-compose builds inherit it, and CI reads it from there.
#
# It used to live in four places kept in sync only by comments, which bit twice:
# a compose build arg silently overrides the Dockerfile default, so bumping the
# Dockerfile alone shipped the old binary, and the docs said to bump the
# Dockerfile alone. This fails the build if a second literal pin reappears.
set -euo pipefail

cd "$(dirname "$0")/.."

version="$(sed -n 's/^ARG BEANS_VERSION=//p' Dockerfile)"
if [ -z "$version" ]; then
  echo "check-beans-pin: no 'ARG BEANS_VERSION=' found in Dockerfile" >&2
  exit 1
fi
echo "check-beans-pin: Dockerfile pins beans@$version"

# Scoped to files that actually feed a build. A literal pin in one of these is
# a competing source of truth that can change what gets installed; a version
# mentioned in prose elsewhere cannot. `@${...}` is fine — that is derived.
mapfile -t inputs < <(git ls-files -- '.github/workflows/*' 'Dockerfile*' 'docker-compose*.yml')
if [ "${#inputs[@]}" -gt 0 ]; then
  if strays="$(grep -n -E 'hmans/beans@v[0-9]' "${inputs[@]}")"; then
    echo "check-beans-pin: hardcoded beans version in a build input:" >&2
    echo "$strays" >&2
    echo >&2
    echo "Derive it from 'ARG BEANS_VERSION' in the Dockerfile instead." >&2
    exit 1
  fi
fi

echo "check-beans-pin: no competing pins"
