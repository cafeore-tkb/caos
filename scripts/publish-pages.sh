#!/usr/bin/env bash
set -euo pipefail
# Use the same validated Actions release as every main push.
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"
test "$(git branch --show-current)" = main || { echo 'Publish the latest main only' >&2; exit 1; }
gh workflow run deploy-pages.yml --repo cafeore-tkb/caos --ref main
