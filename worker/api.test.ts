import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedBay, gameReducer, scoreGame, startGame } from '../src/training/engine';

const base = process.env.TEST_API_URL ?? 'http://localhost:8787';
const nonce = process.env.TEST_NONCE ?? crypto.randomUUID().replaceAll('-', '').slice(0, 9);
const password = crypto.randomUUID();
async function request(
  path: string,
  data?: unknown,
  token?: string,
  origin = process.env.TEST_ORIGIN ?? 'http://localhost:3041'
) {
  const response = await fetch(`${base}${path}`, {
    signal: AbortSignal.timeout(20000),
    method: data === undefined ? 'GET' : 'POST',
    headers: {
      Origin: origin,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return { status: response.status, data: await response.json() };
}
test('shared rankings authenticate, recompute, deduplicate and isolate player identities', async () => {
  assert.equal((await request('/health')).status, 200);
  assert.equal((await request('/rankings')).status, 401);
  assert.equal((await request('/health', undefined, undefined, 'https://unrelated.invalid')).status, 403);
  const a = await request('/register', { username: `qa_${nonce}_a`, displayName: '動作確認A', password });
  const b = await request('/register', { username: `qa_${nonce}_b`, displayName: '動作確認B', password });
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.notEqual(a.data.token, b.data.token);
  assert.equal((await request('/register', { username: `QA_${nonce}_A`, displayName: '別名', password })).status, 409);
  assert.equal((await request('/login', { username: `qa_${nonce}_a`, password: 'wrong-password' })).status, 401);
  const restored = await request('/login', { username: `qa_${nonce}_a`, password });
  assert.equal(restored.status, 200);
  assert.equal(restored.data.player.id, a.data.player.id);
  const run = await request('/runs', { mode: 'fast' }, a.data.token);
  assert.equal(run.status, 200);
  assert.equal(
    (await request(`/runs/${run.data.id}/submit`, { actions: [{ type: 'finish' }] }, b.data.token)).status,
    404
  );
  assert.equal(
    (await request(`/runs/${run.data.id}/submit`, { actions: [{ type: 'finish' }], score: 100 }, a.data.token)).status,
    400
  );
  assert.equal(
    (
      await request(
        `/runs/${run.data.id}/submit`,
        { actions: [{ type: 'set-lane', bayId: 1, name: 'X', senior: true }, { type: 'finish' }] },
        a.data.token
      )
    ).status,
    400
  );
  const saved = await request(`/runs/${run.data.id}/submit`, { actions: [{ type: 'finish' }] }, a.data.token);
  assert.equal(saved.status, 200);
  assert.equal(saved.data.result.score, 0);
  assert.equal(saved.data.result.business.score, 0);
  assert.equal(saved.data.result.business.revenue, 0);
  assert.equal(
    (await request(`/runs/${run.data.id}/submit`, { actions: [{ type: 'finish' }] }, a.data.token)).status,
    200
  );
  assert.equal(
    (
      await request(
        `/runs/${run.data.id}/submit`,
        { actions: [{ type: 'tick', seconds: 1 }, { type: 'finish' }] },
        a.data.token
      )
    ).status,
    409
  );
  const runB = await request('/runs', { mode: 'fast' }, b.data.token);
  assert.equal(
    (await request(`/runs/${runB.data.id}/submit`, { actions: [{ type: 'tick', seconds: 600 }] }, b.data.token)).status,
    400
  );
  assert.equal(
    (await request(`/runs/${runB.data.id}/submit`, { actions: [{ type: 'finish' }] }, b.data.token)).status,
    200
  );
  const rankA = await request('/rankings?mode=fast', undefined, a.data.token),
    rankB = await request('/rankings?mode=fast', undefined, b.data.token);
  assert.equal(rankA.status, 200, JSON.stringify(rankA.data));
  assert.equal(rankB.status, 200, JSON.stringify(rankB.data));
  assert.deepEqual(rankA.data.players, rankB.data.players);
  const rowA = rankA.data.players.find((r: { player_id: string }) => r.player_id === a.data.player.id),
    rowB = rankB.data.players.find((r: { player_id: string }) => r.player_id === b.data.player.id);
  const business = await request('/rankings?mode=fast&metric=business', undefined, a.data.token);
  assert.equal(business.status, 200, JSON.stringify(business.data));
  assert.equal(business.data.metric, 'business');
  assert.equal(
    business.data.players.find((r: { player_id: string }) => r.player_id === a.data.player.id).business_score,
    0
  );
  assert.equal(rowA.assessment.grade, 'D');
  assert.equal(rowA.assessment.population, rankA.data.totalPlayers);
  assert.equal(rowA.score, 0);
  assert.equal(rowA.rank, rowB.rank);
  assert.equal(rowA.attempts, 1);
  assert.ok(!JSON.stringify(rankA.data).includes('password_hash'));
  assert.ok(!JSON.stringify(rankA.data).includes(a.data.token));
  const paidRun = await request('/runs', { mode: 'fast' }, a.data.token);
  let state = startGame(paidRun.data.scenario, paidRun.data.seed);
  const first = state.unassigned[0];
  const bay = state.bays.find((v) => allowedBay(first, v));
  assert.ok(bay);
  const actions = [
    { type: 'assign', key: first.ticketUid ?? '', bayId: bay.id },
    { type: 'start', bayId: bay.id },
    { type: 'tick', seconds: 300 },
    { type: 'complete', bayId: bay.id },
    { type: 'finish' },
  ] as const;
  for (const action of actions) state = gameReducer(state, action);
  // Respect the public ten-times speed limit; no test-only scoring or clock bypass.
  await new Promise((resolve) => setTimeout(resolve, 20500));
  const paid = await request(`/runs/${paidRun.data.id}/submit`, { actions }, a.data.token);
  assert.equal(paid.status, 200, JSON.stringify(paid.data));
  const grade = await request(`/runs/${paidRun.data.id}/grade`, undefined, a.data.token);
  assert.equal(grade.status, 200);
  assert.equal(grade.data.assessment.grade, 'D');
  assert.equal(
    grade.data.assessment.population,
    rankA.data.totalPlayers,
    'repeat attempts cannot inflate the class size'
  );
  assert.equal((await request(`/runs/${paidRun.data.id}/grade`, undefined, b.data.token)).status, 404);
  assert.equal(
    (await request('/runs/00000000-0000-0000-0000-000000000000/grade', undefined, a.data.token)).status,
    404
  );
  assert.deepEqual(paid.data.result, scoreGame(state));
  assert.ok(paid.data.result.business.revenue > 0);
  const paidRanking = await request('/rankings?mode=fast&metric=business', undefined, b.data.token);
  assert.equal(
    paidRanking.data.players.find((r: { player_id: string }) => r.player_id === a.data.player.id).business_score,
    paid.data.result.business.score
  );
  const me = await request('/me', undefined, a.data.token);
  assert.equal(me.data.stats.find((s: { mode: string }) => s.mode === 'fast').attempts, 2);
  assert.equal(me.data.stats.find((s: { mode: string }) => s.mode === 'fast').assessment.grade, 'D');
  assert.equal((await request('/logout', {}, a.data.token)).status, 200);
  assert.equal((await request('/me', undefined, a.data.token)).status, 401);
  assert.equal((await request('/me', undefined, restored.data.token)).status, 200);
});
