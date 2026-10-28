import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { emergencyGuidance } from './emergencyGuidance';
import { allowedBay, freshBays, gameReducer, parseScenario, startGame } from './engine';
import { randomScenario } from './randomScenario';
import { simulatedRoster } from './roster';

const scenario = (mode = 'full') =>
  parseScenario(JSON.parse(readFileSync(new URL(`../../public/training/${mode}.json`, import.meta.url), 'utf8')));

test('seeded hot-only and senior draws follow the caps and approximately 25 percent probability', () => {
  const hotCounts = [0, 0, 0];
  let extra = 0;
  for (let seed = 0; seed < 10000; seed++) {
    const bays = simulatedRoster(freshBays(), seed);
    const hot = bays.filter((bay) => bay.hotOnly);
    assert.ok(hot.length <= 2);
    assert.ok(hot.every((bay) => [2, 3, 4].includes(bay.id) && !bay.canHandleSpecial));
    assert.ok([2, 3].includes(bays.filter((bay) => bay.canHandleSpecial).length));
    if (bays.filter((bay) => bay.canHandleSpecial).length === 3) extra++;
    for (const bay of hot) hotCounts[bay.id - 2]++;
    for (const bay of bays)
      for (const factor of Object.values(bay.trainingBrewFactors ?? {})) {
        assert.ok(factor >= (bay.canHandleSpecial ? 0.9 : 0.97));
        assert.ok(factor <= (bay.canHandleSpecial ? 0.97 : 1.07));
      }
  }
  for (const count of [...hotCounts, extra]) assert.ok(count > 2250 && count < 2750, String(count));
  assert.deepEqual(simulatedRoster(freshBays(), 12), simulatedRoster(freshBays(), 12));
  assert.notDeepEqual(simulatedRoster(freshBays(), 12), simulatedRoster(freshBays(), 13));
});

test('advanced modes simulate staff; basic modes keep fixed tutorial-friendly staff', () => {
  for (const mode of ['full', 'butchi', 'shawn'])
    assert.ok(startGame(scenario(mode), 5).bays.every((bay) => bay.trainingBrewFactors));
  for (const mode of ['fast', 'middle'])
    assert.ok(startGame(scenario(mode), 5).bays.every((bay) => !bay.trainingBrewFactors && !bay.hotOnly));
});

test('hot-only assignees cannot take iced coffee or iced milk coffee and nominations remain playable', () => {
  const hot = { ...freshBays()[1], hotOnly: true };
  assert.equal(allowedBay({ beanName: 'アイスコーヒー' }, hot), false);
  assert.equal(allowedBay({ beanName: 'アイスオレ' }, hot), false);
  assert.equal(allowedBay({ beanName: '余音ブレンド' }, hot), true);
  const template = scenario();
  for (let seed = 0; seed < 1000; seed++) {
    const input = randomScenario(template, seed);
    const state = startGame(input, seed);
    for (const order of input.orders)
      for (const item of order.items)
        if (item.nominee) {
          assert.ok(
            allowedBay({ beanName: item.name, preferredBaristaId: item.nominee }, state.bays[item.nominee - 1]),
            `${seed}: ${item.name}`
          );
        }
  }
});

test('single and double cup factors affect timing once, and moving uses the new assignee', () => {
  let state = startGame(scenario('butchi'), 42);
  const card = state.unassigned.find((entry) => entry.cupCount === 1 && entry.beanName === '余音ブレンド');
  assert.ok(card);
  state = gameReducer(state, { type: 'assign', key: card.ticketUid ?? '', bayId: 1 });
  const duration = Math.round(300 * (state.bays[0].trainingBrewFactors?.one ?? 1));
  assert.equal(state.bays[0].queue[0].totalDurationSec, duration);
  state = gameReducer(state, { type: 'start', bayId: 1 });
  state = gameReducer(state, { type: 'tick', seconds: 30 });
  assert.equal(state.bays[0].queue[0].timeRemainingSec, duration - 30);
  state = gameReducer(state, { type: 'move', key: card.ticketUid ?? '', bayId: 5 });
  assert.equal(
    state.bays[4].queue[0].totalDurationSec,
    Math.round(300 * (state.bays[4].trainingBrewFactors?.one ?? 1))
  );
});

test('emergency guide targets the actual card action, never registers a remake on behalf of the player', () => {
  let state = startGame(scenario('butchi'), 0);
  const card = state.unassigned.find((entry) => entry.trainingCupIds?.length);
  assert.ok(card);
  state.emergencies = [
    { id: 1, cupId: card.trainingCupIds?.[0] ?? null, willOccur: true, status: 'armed', reason: '異物混入' },
  ];
  state = gameReducer(state, { type: 'assign', key: card.ticketUid ?? '', bayId: 1 });
  state = gameReducer(state, { type: 'start', bayId: 1 });
  state = gameReducer(state, { type: 'tick', seconds: Math.ceil(state.bays[0].queue[0].totalDurationSec * 0.75) });
  const guide = emergencyGuidance(state);
  assert.ok(guide);
  assert.ok(guide.title.includes('1stで異物混入'));
  assert.ok(
    guide.queries.some((q) => q.selector.includes(card.ticketUid ?? '') && q.selector.includes('緊急（淹れ直し）'))
  );
  assert.equal(state.emergencies[0].status, 'pending');
  assert.ok(!state.unassigned.some((entry) => entry.isRebrew));
});

test('two-cup brewing uses its own factor and splitting recalculates single-cup duration', () => {
  const input = parseScenario({
    schemaVersion: 1,
    kind: 'synthetic',
    mode: 'full',
    title: '二杯',
    durationSec: 1800,
    orders: [{ orderId: 1, atSec: 0, items: [{ name: '余音ブレンド', quantity: 2 }] }],
  });
  let state = startGame(input, 42);
  const card = state.unassigned[0];
  state = gameReducer(state, { type: 'assign', key: card.ticketUid ?? '', bayId: 1 });
  assert.equal(
    state.bays[0].queue[0].totalDurationSec,
    Math.round(360 * (state.bays[0].trainingBrewFactors?.two ?? 1))
  );
  state = gameReducer(state, { type: 'unstart', bayId: 1 });
  state = gameReducer(state, { type: 'split', key: card.ticketUid ?? '', cupId: card.trainingCupIds?.[0] ?? '' });
  assert.ok(
    state.bays[0].queue.every(
      (entry) => entry.totalDurationSec === Math.round(300 * (state.bays[0].trainingBrewFactors?.one ?? 1))
    )
  );
});
