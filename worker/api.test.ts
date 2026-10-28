import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import test from 'node:test';
import { allowedBay, type GameAction, gameReducer, scoreGame, startGame } from '../src/training/engine';

const base = process.env.TEST_API_URL ?? 'http://localhost:8787';
const nonce = process.env.TEST_NONCE ?? crypto.randomUUID().replaceAll('-', '').slice(0, 9);
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
test('public rankings accept a display name only after scoring, group names across devices, and preserve run ownership', async () => {
  const nameA = `確認A_${nonce}`,
    nameB = `確認B_${nonce}`;
  const initial = await request('/rankings?mode=fast');
  assert.equal(initial.status, 200, JSON.stringify(initial.data));
  assert.equal((await request('/runs', { mode: 'fast' })).status, 401);
  assert.equal((await request('/health', undefined, undefined, 'https://unrelated.invalid')).status, 403);
  const a = await request('/session', {}),
    b = await request('/session', {});
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.notEqual(a.data.token, b.data.token);
  assert.deepEqual(Object.keys(a.data.player), ['id']);
  if (process.env.TEST_QA_MANIFEST)
    writeFileSync(
      process.env.TEST_QA_MANIFEST,
      JSON.stringify({ deviceIds: [a.data.player.id, b.data.player.id], displayNames: [nameA, nameB] })
    );
  const run = await request('/runs', { mode: 'fast' }, a.data.token);
  assert.equal(run.status, 200);
  assert.equal(
    (await request('/rankings?mode=fast')).data.totalPlayers,
    initial.data.totalPlayers,
    'starting a game must not publish or inflate the cohort'
  );
  const finish = { actions: [{ type: 'finish' }], displayName: nameA };
  assert.equal((await request(`/runs/${run.data.id}/submit`, finish, b.data.token)).status, 404);
  assert.equal((await request(`/runs/${run.data.id}/submit`, { ...finish, score: 100 }, a.data.token)).status, 400);
  assert.equal(
    (await request(`/runs/${run.data.id}/submit`, { ...finish, displayName: ' ' }, a.data.token)).status,
    400
  );
  assert.equal(
    (await request(`/runs/${run.data.id}/submit`, { ...finish, displayName: 'a'.repeat(31) }, a.data.token)).status,
    400
  );
  assert.equal(
    (await request(`/runs/${run.data.id}/submit`, { actions: [{ type: 'finish' }] }, a.data.token)).status,
    400
  );
  assert.equal(
    (
      await request(
        `/runs/${run.data.id}/submit`,
        { ...finish, actions: [{ type: 'set-lane', bayId: 1, name: 'X', senior: true }, { type: 'finish' }] },
        a.data.token
      )
    ).status,
    400
  );
  const saved = await request(`/runs/${run.data.id}/submit`, { ...finish, displayName: `  ${nameA}  ` }, a.data.token);
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.result.score, 0);
  assert.equal((await request(`/runs/${run.data.id}/submit`, finish, a.data.token)).status, 200);
  assert.equal(
    (await request(`/runs/${run.data.id}/submit`, { ...finish, displayName: nameB }, a.data.token)).status,
    409
  );
  const runB = await request('/runs', { mode: 'fast' }, b.data.token);
  assert.equal(
    (
      await request(
        `/runs/${runB.data.id}/submit`,
        { displayName: nameA, actions: [{ type: 'tick', seconds: 600 }] },
        b.data.token
      )
    ).status,
    400
  );
  assert.equal((await request(`/runs/${runB.data.id}/submit`, finish, b.data.token)).status, 200);
  const ranks = await request('/rankings?mode=fast');
  assert.equal(
    ranks.data.totalPlayers,
    initial.data.totalPlayers + 1,
    'the same display name counts once across devices'
  );
  const rowA = ranks.data.players.find((r: { display_name: string }) => r.display_name === nameA);
  assert.equal(rowA.attempts, 2);
  assert.equal(rowA.assessment.population, ranks.data.totalPlayers);
  assert.equal(rowA.assessment.policy, '95-and-top10-v1');
  assert.ok(!JSON.stringify(ranks.data).includes(a.data.token));
  assert.ok(!JSON.stringify(ranks.data).includes('password_hash'));
  assert.ok(!JSON.stringify(ranks.data).includes('username'));
  const paidRun = await request('/runs', { mode: 'fast' }, a.data.token);
  let state = startGame(paidRun.data.scenario, paidRun.data.seed);
  const first = state.unassigned[0],
    bay = state.bays.find((v) => allowedBay(first, v));
  assert.ok(bay);
  const actions = [
    { type: 'assign', key: first.ticketUid ?? '', bayId: bay.id },
    { type: 'start', bayId: bay.id },
    { type: 'tick', seconds: 300 },
    { type: 'complete', bayId: bay.id },
    { type: 'finish' },
  ] as const;
  for (const action of actions) state = gameReducer(state, action);
  await new Promise((resolve) => setTimeout(resolve, 20500));
  const paid = await request(`/runs/${paidRun.data.id}/submit`, { displayName: nameB, actions }, a.data.token);
  assert.equal(paid.status, 200, JSON.stringify(paid.data));
  assert.deepEqual(paid.data.result, scoreGame(state));
  assert.ok(paid.data.result.business.revenue > 0);
  const final = await request('/rankings?mode=fast&metric=business');
  assert.equal(final.data.totalPlayers, initial.data.totalPlayers + 2);
  assert.equal(
    final.data.players.find((r: { display_name: string }) => r.display_name === nameB).business_score,
    paid.data.result.business.score
  );
  assert.equal(
    final.data.players.find((r: { display_name: string }) => r.display_name === nameA).score,
    0,
    'a new name on a shared device must not rename previous scores'
  );
  const profileA = await request(`/profile?name=${encodeURIComponent(nameA)}`);
  assert.equal(profileA.status, 200);
  assert.equal(profileA.data.stats.find((s: { mode: string }) => s.mode === 'fast').attempts, 2);
  assert.equal((await request(`/runs/${paidRun.data.id}/grade`)).status, 401);
  assert.equal((await request(`/runs/${paidRun.data.id}/grade`, undefined, b.data.token)).status, 404);
  const grade = await request(`/runs/${paidRun.data.id}/grade`, undefined, a.data.token);
  assert.equal(grade.status, 200);
  assert.equal(grade.data.assessment.grade, 'D');
  assert.equal(grade.data.assessment.population, final.data.totalPlayers);
  const fullRun = await request('/runs', { mode: 'full' }, a.data.token);
  assert.equal(fullRun.status, 200);
  assert.equal(fullRun.data.scenario.scoring, 'forecast');
  assert.equal(fullRun.data.scenario.orders.length, 44);
  let full = startGame(fullRun.data.scenario, fullRun.data.seed);
  assert.equal(full.arrived.length, 8);
  assert.equal(Object.keys(full.cups).length, 66);
  const fullActions: GameAction[] = [];
  for (const card of [...full.unassigned]) {
    const bay = full.bays.filter((b) => allowedBay(card, b)).sort((a, b) => a.queue.length - b.queue.length)[0];
    assert.ok(bay);
    const action = { type: 'assign' as const, key: card.ticketUid ?? '', bayId: bay.id };
    fullActions.push(action);
    full = gameReducer(full, action);
  }
  fullActions.push({ type: 'finish' });
  full = gameReducer(full, { type: 'finish' });
  const forecast = await request(
    `/runs/${fullRun.data.id}/submit`,
    { displayName: nameA, actions: fullActions },
    a.data.token
  );
  assert.equal(forecast.status, 200, JSON.stringify(forecast.data));
  assert.deepEqual(forecast.data.result, scoreGame(full));
  assert.equal(forecast.data.result.forecast.actualDone, 0);
  assert.equal(forecast.data.result.forecast.projectedDone, 12);
  assert.equal(forecast.data.result.total, 66);
  assert.ok(forecast.data.result.score <= 79, 'unarrived cups cannot earn a passing score through forecasts');
});

test('recreated modes are issued with a fixed order timeline and seven minutes already queued', async () => {
  const session = await request('/session', {});
  assert.equal(session.status, 200);
  for (const [mode, count, initial] of [
    ['butchi', 37, 8],
    ['shawn', 42, 10],
  ] as const) {
    const first = await request('/runs', { mode }, session.data.token);
    const second = await request('/runs', { mode }, session.data.token);
    assert.equal(first.status, 200, JSON.stringify(first.data));
    assert.equal(second.status, 200, JSON.stringify(second.data));
    assert.equal(first.data.scenario.orders.length, count);
    assert.equal(startGame(first.data.scenario).arrived.length, initial);
    assert.deepEqual(first.data.scenario, second.data.scenario);
    assert.equal((await request(`/rankings?mode=${mode}`)).status, 200);
  }
});
