#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
publish_dir="$(mktemp -d /tmp/caos-game-publish.XXXXXX)"
cleanup() {
  rm -rf "$publish_dir"
}
trap cleanup EXIT

cd "$repo_root"
source_branch="${PUBLISH_SOURCE_BRANCH:-$(git branch --show-current)}"

if [[ "$source_branch" != "main" ]]; then
  echo "Unsupported publish branch: ${source_branch:-detached HEAD}" >&2
  echo "Publish from main, or set PUBLISH_SOURCE_BRANCH=main explicitly." >&2
  exit 1
fi

VITE_BASE_PATH="/caos-game/" npm run build
node --import tsx scripts/write-release.ts

git clone --depth 1 https://github.com/cafeore-tkb/caos-game.git "$publish_dir"
SOURCE_REVISION="$(git rev-parse HEAD)" bash scripts/sync-pages.sh "$repo_root/dist" "$publish_dir"
