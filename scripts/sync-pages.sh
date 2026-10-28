#!/usr/bin/env bash
set -euo pipefail

build_dir="$(cd "${1:?Pass the built site directory}" && pwd)"
publish_dir="$(cd "${2:?Pass the public repository checkout}" && pwd)"
source_revision="${SOURCE_REVISION:?SOURCE_REVISION is required}"

test -f "$build_dir/index.html" || { echo 'The built site has no index.html' >&2; exit 1; }
git -C "$publish_dir" rev-parse --is-inside-work-tree >/dev/null
test "$(git -C "$publish_dir" branch --show-current)" = main || { echo 'The destination must be on main' >&2; exit 1; }
test ! -L "$publish_dir/site" || { echo 'The destination site must not be a symlink' >&2; exit 1; }

# Refuse an artifact from another revision before touching the public checkout.
node --input-type=module - "$build_dir/release.json" "$source_revision" <<'NODE'
import { readFileSync } from 'node:fs';
const release = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (!/^[a-f0-9]{40,64}$/.test(process.argv[3]) || release.sourceRevision !== process.argv[3])
  throw new Error('The Pages artifact does not match the source revision');
NODE

mkdir -p "$publish_dir/site"
# Keep the independent legacy preview if it is present; replace only main's files.
rsync -a --checksum --delete --exclude='/astalum-dev/' "$build_dir/" "$publish_dir/site/"
git -C "$publish_dir" add -A -- site
if git -C "$publish_dir" diff --cached --quiet -- site; then
  echo 'Pages bundle is already up to date.'
  exit 0
fi

git -C "$publish_dir" config user.name 'CaOS Pages publisher'
git -C "$publish_dir" config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git -C "$publish_dir" commit -m "Deploy main source $source_revision" -- site
git -C "$publish_dir" push origin HEAD:main
