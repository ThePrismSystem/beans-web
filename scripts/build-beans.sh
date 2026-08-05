#!/usr/bin/env bash
#
# Builds the `beans` CLI (github.com/hmans/beans) from source and writes the
# resulting static binary to the requested output path.
#
# `go install pkg@version` resolves upstream's own go.mod, and that go.mod
# pins golang.org/x/net and golang.org/x/text versions that carry known CVEs.
# `go install` has no flag to override a dependency's version, so building
# through a throwaway module instead lets `go get` lift those two deps past
# upstream's pins before the build runs.
#
# This script is the ONLY place those two pins are written down. The
# Dockerfile's beans-builder stage and CI's "Install beans" steps both call
# it with the same beans version, so the binary the image ships and the
# binary CI's integration/E2E suites exercise are always the same build —
# if they diverged, CI would stop testing what actually ships.
#
# Usage: build-beans.sh <beans-version> <output-path>
set -euo pipefail

version="${1:?usage: build-beans.sh <beans-version> <output-path>}"
output="${2:?usage: build-beans.sh <beans-version> <output-path>}"

# CGO disabled so the result is a static binary that runs on any glibc/musl
# base without extra shared libraries — the runtime stage depends on that.
export CGO_ENABLED=0

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
cd "$workdir"

go mod init beansbuild
go get "github.com/hmans/beans@${version}"
# Deliberate, not `@latest`: builds stay reproducible, and the image-scan CI
# job goes red when these go stale, which is the signal to bump them.
go get golang.org/x/net@v0.55.0 golang.org/x/text@v0.39.0

mkdir -p "$(dirname "$output")"
go build -o "$output" github.com/hmans/beans
