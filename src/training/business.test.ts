import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { type GameState, gameReducer, parseScenario, scoreGame, startGame } from './engine';
import { itemPrice } from './master';
import { randomScenario } from './randomScenario';
import { appendReplay, replayRun } from './replay';

const scenario = (items: { name: string; quantity: number; nominee?: number }[]) =>
  parseScenario({
    schemaVersion: 1,
    kind: 'synthetic',
    mode: 'fast',
    title: '採点確認',
    durationSec: 600,
    orders: items.map((item, index) => ({ orderId: index + 1, atSec: 0, items: [item] })),
  });
const assign = (state: GameState, bayId: number, index = 0) =>
  gameReducer(state, {
    type: 'assign',
    key: state.unassigned[index].ticketUid ?? '',
    bayId,
  });
const brew = (state: GameState, bayId: number) => {
  const duration = state.bays[bayId - 1].queue[0].totalDurationSec;
  state = gameReducer(state, { type: 'start', bayId });
  state = gameReducer(state, { type: 'tick', seconds: duration });
  return gameReducer(state, { type: 'complete', bayId });
};
test('sales count coffee with sound quality once; nomination and limited bonuses use completed cups', () => {
  const input = scenario([{ name: 'アロマナティーボ', quantity: 2, nominee: 1 }]);
  let state = brew(assign(startGame({ ...input, mode: 'middle', durationSec: 1200 }, 1), 1), 1);
  let result = scoreGame(state);
  assert.equal(result.business.revenue, itemPrice('アロマナティーボ') * 2);
  assert.deepEqual(
    result.business.bonuses.map((b) => b.count),
    [2, 2, 0]
  );
  const original = result.business.score;
  state = gameReducer(state, { type: 'rebrew-cups', cupIds: [Object.keys(state.cups)[0]], reason: '確認' });
  state = brew(assign(state, 1), 1);
  result = scoreGame(state);
  assert.equal(result.business.score, original, 'remaking one cup cannot duplicate sales or bonuses');
  let early = assign(startGame(scenario([{ name: '余音ブレンド', quantity: 1 }])), 1);
  early = gameReducer(early, { type: 'start', bayId: 1 });
  early = gameReducer(early, { type: 'complete', bayId: 1 });
  assert.equal(scoreGame(early).business.score, 0, 'poor quality earns neither sales nor bonuses');
});
test('merge bonus requires two original cups to finish in the same sound batch, without farming', () => {
  const input = scenario([
    { name: '余音ブレンド', quantity: 1 },
    { name: '余音ブレンド', quantity: 1 },
  ]);
  let state = startGame(input);
  state = gameReducer(state, {
    type: 'merge',
    first: state.unassigned[0].ticketUid ?? '',
    second: state.unassigned[1].ticketUid ?? '',
  });
  const merged = state.unassigned[0];
  state = gameReducer(state, { type: 'split', key: merged.ticketUid ?? '', cupId: merged.trainingCupIds?.[0] ?? '' });
  state = gameReducer(state, {
    type: 'merge',
    first: state.unassigned[0].ticketUid ?? '',
    second: state.unassigned[1].ticketUid ?? '',
  });
  const result = scoreGame(brew(assign(state, 2), 2));
  assert.equal(result.business.bonuses[2].points, 100);
  assert.equal(result.business.revenue, itemPrice('余音ブレンド') * 2);
  let split = startGame(input);
  split = gameReducer(split, {
    type: 'merge',
    first: split.unassigned[0].ticketUid ?? '',
    second: split.unassigned[1].ticketUid ?? '',
  });
  const card = split.unassigned[0];
  split = gameReducer(split, { type: 'split', key: card.ticketUid ?? '', cupId: card.trainingCupIds?.[0] ?? '' });
  split = brew(assign(split, 2), 2);
  split = brew(assign(split, 3), 3);
  assert.equal(scoreGame(split).business.bonuses[2].points, 0, 'split cups do not retain an earned merge bonus');
});
test('single iced cups favour available seniors; busy seniors and nominations do not penalize the operator', () => {
  const input = scenario([{ name: 'アイスコーヒー', quantity: 1 }]);
  const junior = scoreGame(brew(assign(startGame(input), 2), 2));
  const senior = scoreGame(brew(assign(startGame(input), 1), 1));
  assert.deepEqual(junior.iceAllocation, { opportunities: 1, senior: 0 });
  assert.equal(junior.score, 79);
  assert.equal(senior.score, 100);
  const nominated = scenario([{ name: 'アイスコーヒー', quantity: 1, nominee: 2 }]);
  assert.equal(scoreGame(brew(assign(startGame(nominated), 2), 2)).score, 100);
  let busy = startGame(
    scenario([
      { name: '余音ブレンド', quantity: 2 },
      { name: '余音ブレンド', quantity: 2 },
      { name: 'アイスコーヒー', quantity: 1 },
    ])
  );
  busy = assign(assign(busy, 1), 6);
  busy = brew(assign(busy, 2), 2);
  assert.deepEqual(scoreGame(busy).iceAllocation, { opportunities: 0, senior: 0 });
});
test('seeded orders vary while preserving mode workload, revenue ceiling and rare-order frequency; replay agrees', () => {
  for (const mode of ['fast', 'middle', 'full']) {
    const template = parseScenario(
      JSON.parse(readFileSync(new URL(`../../public/training/${mode}.json`, import.meta.url), 'utf8'))
    );
    const basket = (input: typeof template) =>
      input.orders
        .map((o) =>
          JSON.stringify({
            ...o,
            atSec: 0,
            orderId: 0,
            items: o.items.map((i) => ({ ...i, nominee: i.nominee ? true : undefined })),
          })
        )
        .sort();
    const a = randomScenario(template, 1),
      b = randomScenario(template, 2);
    assert.deepEqual(a, randomScenario(template, 1));
    assert.notDeepEqual(a.orders, b.orders);
    assert.deepEqual(basket(a), basket(template));
    assert.deepEqual(basket(b), basket(template));
    const trace: Parameters<typeof appendReplay>[0] = [];
    let state = startGame(a, 1);
    const action = { type: 'finish' } as const;
    appendReplay(trace, action);
    state = gameReducer(state, action);
    assert.deepEqual(replayRun(a, 1, trace).result, scoreGame(state));
  }
});

test('merging two assigned iced singles exempts the completed two-cup batch from single-cup allocation', () => {
  let state = startGame(
    scenario([
      { name: 'アイスコーヒー', quantity: 1 },
      { name: 'アイスコーヒー', quantity: 1 },
    ])
  );
  state = assign(assign(state, 2), 3);
  const first = state.bays[1].queue[0],
    second = state.bays[2].queue[0];
  state = gameReducer(state, { type: 'merge', first: first.ticketUid ?? '', second: second.ticketUid ?? '' });
  const target = state.bays.find((bay) => bay.queue[0]?.cupCount === 2);
  assert.ok(target);
  state = brew(state, target.id);
  assert.deepEqual(scoreGame(state).iceAllocation, { opportunities: 0, senior: 0 });
  assert.equal(scoreGame(state).business.bonuses[2].points, 100);
});
