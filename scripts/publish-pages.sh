#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
publish_dir="$(mktemp -d /tmp/digital-master-sheet-pages-publish.XXXXXX)"
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

VITE_BASE_PATH="/digital-master-sheet-pages/" npm run build

git clone --depth 1 https://github.com/cafeore-tkb/digital-master-sheet-pages.git "$publish_dir"
rm -rf "$publish_dir/site"
mkdir -p "$publish_dir/site"
cp -R "$repo_root/dist/." "$publish_dir/site/"

git -C "$publish_dir" add -A site

if git -C "$publish_dir" diff --cached --quiet; then
  echo "Pages bundle is already up to date."
  exit 0
fi

source_revision="$(git -C "$repo_root" rev-parse --short HEAD)"
git -C "$publish_dir" config user.name "digital-master-sheet publisher"
git -C "$publish_dir" config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git -C "$publish_dir" commit -m "Deploy ${source_branch} source ${source_revision}"
git -C "$publish_dir" push origin main
