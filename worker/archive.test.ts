import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import test from 'node:test';
import { SCORING_VERSION } from '../src/training/engine';
import type { GradeAssessment } from '../src/training/grades';
import type { Ranking } from '../src/training/rankingClient';
import type { RunSummary } from '../src/training/runSummary';
import worker, { type Env } from './index';

function fixture() {
  const db = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('./migrations/', import.meta.url))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    db.exec(readFileSync(new URL(`./migrations/${file}`, import.meta.url), 'utf8'));
  db.exec(
    "INSERT INTO players VALUES ('owner','owner','Old Master','','',1); INSERT INTO participants VALUES ('a','Old Master',1),('b','Other Master',1);"
  );
  const insert = (id: string, participant: string, version: string, score: number, business = 1000) =>
    db
      .prepare(
        'INSERT INTO runs(id,player_id,mode,seed,rules_version,started_at,completed_at,score,done,total,quality,elapsed_sec,passed,result_json,trace_hash,business_score,revenue,participant_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
      )
      .run(
        id,
        'owner',
        'full',
        12,
        version,
        1,
        2,
        score,
        60,
        60,
        60,
        1800,
        Number(score >= 80),
        'original result',
        'original trace',
        business,
        business,
        participant
      );
  const storage = {
    prepare(sql: string) {
      let params: SQLInputValue[] = [];
      return {
        bind(...values: SQLInputValue[]) {
          params = values;
          return this;
        },
        async all() {
          return { results: db.prepare(sql).all(...params), success: true };
        },
        async first() {
          return db.prepare(sql).get(...params) ?? null;
        },
      };
    },
  };
  const env = { DB: storage as unknown as Env['DB'], ALLOWED_ORIGINS: 'https://cafeore-tkb.github.io' };
  const get = async <T = Ranking>(path: string, token?: string) => {
    const response = await worker.fetch(
      new Request(`https://ranking.test${path}`, {
        headers: { Origin: env.ALLOWED_ORIGINS, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      }),
      env
    );
    return { status: response.status, body: (await response.json()) as T };
  };
  return { db, insert, get };
}

test('old records remain visible, with separate ranks and cohorts across scoring versions', async () => {
  const f = fixture();
  try {
    f.insert('old-a', 'a', '2026-10-v3', 95);
    f.insert('old-a-2', 'a', '2026-10-v3', 92);
    f.insert('old-b', 'b', '2026-10-v3', 89);
    const before = f.db.prepare('SELECT * FROM runs ORDER BY id').all();
    const fallback = await f.get('/rankings?mode=full');
    assert.equal(fallback.status, 200);
    assert.equal(fallback.body.rulesVersion, '2026-10-v3');
    assert.equal(fallback.body.totalPlayers, 2);
    assert.equal(fallback.body.showingPreviousRules, true);
    assert.equal(fallback.body.players[0].score, 95);
    f.insert('new-a', 'a', SCORING_VERSION, 70, 2000);
    const all = await f.get('/rankings?mode=full&rulesVersion=all');
    assert.equal(all.status, 200);
    assert.equal(all.body.players.length, 3);
    const previous = all.body.players.filter((r) => r.rulesVersion === '2026-10-v3');
    const current = all.body.players.filter((r) => r.rulesVersion === SCORING_VERSION);
    assert.deepEqual(
      previous.map((r) => r.rank),
      [1, 2]
    );
    assert.equal(current[0].rank, 1);
    assert.equal(previous[0].assessment.population, 2);
    assert.equal(current[0].assessment.population, 1);
    const previousVersion = all.body.availableVersions?.find((v) => v.rulesVersion === '2026-10-v3');
    assert.ok(previousVersion);
    assert.equal(previousVersion.attempts, 3);
    const filtered = await f.get('/rankings?mode=full&rulesVersion=2026-10-v3&metric=business');
    assert.equal(filtered.body.players.length, 2);
    const profile = await f.get<{
      stats: {
        mode: string;
        attempts: number;
        best: number;
        business_best: number;
        bestRulesVersion: string;
        bestBusinessRulesVersion: string;
        assessment: GradeAssessment;
      }[];
    }>('/profile?name=Old%20Master');
    const full = profile.body.stats.find((s: { mode: string }) => s.mode === 'full');
    assert.ok(full);
    assert.equal(full.attempts, 3);
    assert.equal(full.best, 95);
    assert.equal(full.business_best, 2000);
    assert.equal(full.bestRulesVersion, '2026-10-v3');
    assert.equal(full.bestBusinessRulesVersion, SCORING_VERSION);
    assert.equal(full.assessment.population, 2);
    assert.deepEqual(f.db.prepare("SELECT * FROM runs WHERE id LIKE 'old-%' ORDER BY id").all(), before);
  } finally {
    f.db.close();
  }
});

test('previous completed-run grades retain ownership protection and use their actual scoring version', async () => {
  const f = fixture();
  try {
    const id = '12345678-1234-1234-1234-123456789012';
    f.insert(id, 'a', '2026-10-v3', 95);
    f.insert('other-old', 'b', '2026-10-v3', 89);
    const token = 'a'.repeat(64);
    f.db
      .prepare('INSERT INTO sessions VALUES (?,?,?)')
      .run(createHash('sha256').update(token).digest('hex'), 'owner', Date.now() + 60000);
    assert.equal((await f.get(`/runs/${id}/grade`)).status, 401);
    const grade = await f.get<{ assessment: GradeAssessment }>(`/runs/${id}/grade`, token);
    assert.equal(grade.status, 200);
    assert.equal(grade.body.assessment.population, 2);
    const me = await f.get<{ stats: { best: number; assessment: GradeAssessment }[] }>('/me', token);
    assert.equal(me.status, 200);
    assert.equal(me.body.stats[0].best, 95);
    assert.equal(me.body.stats[0].assessment.population, 2);
  } finally {
    f.db.close();
  }
});

test('public result uses the selected best run, preserves old scores and hides private replay data', async () => {
  const f = fixture();
  try {
    const id = '22345678-1234-1234-1234-123456789012';
    f.insert(id, 'a', '2026-10-v3', 95);
    const ranking = await f.get('/rankings?mode=full&rulesVersion=all');
    assert.equal(ranking.body.players[0].run_id, id);
    const old = await f.get<RunSummary>(`/results/${id}`);
    assert.equal(old.status, 200);
    assert.equal(old.body.score, 95);
    assert.equal(old.body.conditions, null);
    assert.deepEqual(old.body.categories, []);
    const currentId = '32345678-1234-1234-1234-123456789012';
    f.insert(currentId, 'a', SCORING_VERSION, 70);
    const draw = await f.get<RunSummary>(`/results/${currentId}`);
    assert.equal(draw.body.conditions?.source, 'draw');
    assert.equal(draw.body.conditions?.roster.length, 6);
    assert.equal(draw.body.conditions?.emergencies.length, 2);
    assert.ok(draw.body.conditions);
    const conditions = {
      ...draw.body.conditions,
      source: 'saved',
      emergencies: [{ id: 1, drawn: true, status: 'resolved', orderId: 76, bayId: 3, reason: '異物混入', atSec: 300 }],
    };
    f.db.prepare('UPDATE runs SET result_json=? WHERE id=?').run(
      JSON.stringify({
        conditions,
        categories: [{ label: '抽出時間', points: 15, max: 20, detail: '45 / 60杯' }],
        penalties: 2,
        feedback: ['古い注文を優先。'],
        seed: 'must not leak',
        trace: 'private',
      }),
      currentId
    );
    const saved = await f.get<RunSummary>(`/results/${currentId}`);
    assert.equal(saved.body.conditions?.source, 'saved');
    assert.equal(saved.body.conditions?.emergencies[0].status, 'resolved');
    assert.equal(saved.body.categories[0].points, 15);
    assert.equal(saved.body.penalties, 2);
    for (const hidden of ['seed', 'trace', 'player_id', 'trainingBrewFactors', 'token'])
      assert.ok(!JSON.stringify(saved.body).includes(hidden));
    assert.equal((await f.get('/results/42345678-1234-1234-1234-123456789012')).status, 404);
    f.db.prepare('UPDATE runs SET completed_at=NULL WHERE id=?').run(currentId);
    assert.equal((await f.get(`/results/${currentId}`)).status, 404);
  } finally {
    f.db.close();
  }
});
