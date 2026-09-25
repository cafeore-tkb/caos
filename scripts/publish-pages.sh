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

case "$source_branch" in
  main)
    base_path="/digital-master-sheet-pages/"
    relative_target="."
    ;;
  astalum-dev)
    base_path="/digital-master-sheet-pages/astalum-dev/"
    relative_target="astalum-dev"
    ;;
  *)
    echo "Unsupported publish branch: ${source_branch:-detached HEAD}" >&2
    echo "Publish from main or astalum-dev, or set PUBLISH_SOURCE_BRANCH explicitly." >&2
    exit 1
    ;;
esac

VITE_BASE_PATH="$base_path" npm run build

git clone --depth 1 https://github.com/cafeore-tkb/digital-master-sheet-pages.git "$publish_dir"
mkdir -p "$publish_dir/site"

if [[ "$relative_target" == "." ]]; then
  # Replace only the production files. The astalum-dev preview must survive a
  # production publish so both variants remain available at the same time.
  find "$publish_dir/site" -mindepth 1 -maxdepth 1 ! -name astalum-dev -exec rm -rf {} +
  cp -R "$repo_root/dist/." "$publish_dir/site/"
else
  target_dir="$publish_dir/site/$relative_target"
  rm -rf "$target_dir"
  mkdir -p "$target_dir"
  cp -R "$repo_root/dist/." "$target_dir/"
fi

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
