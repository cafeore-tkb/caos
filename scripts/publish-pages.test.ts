import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const sync = resolve('scripts/sync-pages.sh');
const revision = 'a'.repeat(40);
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'caos-pages-test-'));
  const repo = join(root, 'public'),
    bare = join(root, 'origin.git'),
    build = join(root, 'dist');
  mkdirSync(repo);
  mkdirSync(build);
  git(root, 'init', '--bare', '--initial-branch=main', bare);
  git(repo, 'init', '--initial-branch=main');
  git(repo, 'config', 'user.name', 'test');
  git(repo, 'config', 'user.email', 'test@example.invalid');
  mkdirSync(join(repo, '.github', 'workflows'), { recursive: true });
  mkdirSync(join(repo, 'site', 'assets'), { recursive: true });
  mkdirSync(join(repo, 'site', 'astalum-dev'), { recursive: true });
  writeFileSync(join(repo, 'README.md'), 'Public deployment repository');
  writeFileSync(join(repo, '.github', 'workflows', 'pages.yml'), 'Keep this workflow');
  writeFileSync(join(repo, 'site', 'index.html'), 'Old release');
  writeFileSync(join(repo, 'site', 'assets', 'old.js'), 'stale asset');
  writeFileSync(join(repo, 'site', 'astalum-dev', 'index.html'), 'Independent preview');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'initial');
  git(repo, 'remote', 'add', 'origin', bare);
  git(repo, 'push', '-u', 'origin', 'main');
  mkdirSync(join(build, 'assets'));
  writeFileSync(join(build, 'index.html'), 'New release');
  writeFileSync(join(build, 'assets', 'current.js'), 'current asset');
  writeFileSync(
    join(build, 'release.json'),
    JSON.stringify({ sourceRevision: revision, scoringVersion: '2026-10-v4' })
  );
  return { root, repo, bare, build };
}
function publish(build: string, repo: string, source = revision) {
  return spawnSync('bash', [sync, build, repo], { env: { ...process.env, SOURCE_REVISION: source }, encoding: 'utf8' });
}

test('publishing pushes only built files, removes obsolete assets, and preserves the public workflow and independent preview', () => {
  const f = fixture();
  try {
    const result = publish(f.build, f.repo);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(git(f.bare, 'show', 'main:site/index.html'), 'New release');
    assert.equal(git(f.bare, 'show', 'main:site/assets/current.js'), 'current asset');
    assert.equal(git(f.bare, 'ls-tree', 'main', 'site/assets/old.js'), '');
    assert.equal(git(f.bare, 'show', 'main:README.md'), 'Public deployment repository');
    assert.equal(git(f.bare, 'show', 'main:.github/workflows/pages.yml'), 'Keep this workflow');
    assert.equal(git(f.bare, 'show', 'main:site/astalum-dev/index.html'), 'Independent preview');
    const changed = git(f.bare, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'main').split('\n');
    assert.ok(changed.every((path) => path.startsWith('site/')));
    assert.ok(!changed.some((path) => path.startsWith('src/') || path.startsWith('worker/')));
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('an identical release creates no extra commit or deployment push', () => {
  const f = fixture();
  try {
    assert.equal(publish(f.build, f.repo).status, 0);
    const first = git(f.bare, 'rev-parse', 'main');
    const result = publish(f.build, f.repo);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /already up to date/);
    assert.equal(git(f.bare, 'rev-parse', 'main'), first);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('a mismatched artifact is rejected before changing or pushing any public file', () => {
  const f = fixture();
  try {
    const before = git(f.bare, 'rev-parse', 'main');
    const result = publish(f.build, f.repo, 'b'.repeat(40));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /does not match/);
    assert.equal(git(f.bare, 'rev-parse', 'main'), before);
    assert.equal(readFileSync(join(f.repo, 'site', 'index.html'), 'utf8'), 'Old release');
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('publishing refuses a destination branch other than main', () => {
  const f = fixture();
  try {
    git(f.repo, 'switch', '-c', 'preview');
    assert.notEqual(publish(f.build, f.repo).status, 0);
    assert.equal(readFileSync(join(f.repo, 'site', 'index.html'), 'utf8'), 'Old release');
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
