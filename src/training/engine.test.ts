import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CONTROL_VIEWS, ControlWorkspace } from '../components/ControlWorkspace';
import { canMergeDripUnits } from '../utils/orderQueue';
import {
  allowedBay,
  type GameMode,
  type GameState,
  gameReducer,
  MODES,
  parseScenario,
  scoreGame,
  startGame,
} from './engine';
import { itemPrice, needsBrew, seniorOnly, TRAINING_MASTER } from './master';

const load = (mode: GameMode) =>
  parseScenario(JSON.parse(readFileSync(new URL(`../../public/training/${mode}.json`, import.meta.url), 'utf8')));
const single = (name = '余音ブレンド', quantity = 1) =>
  parseScenario({
    schemaVersion: 1,
    kind: 'synthetic',
    mode: 'fast',
    title: 'test',
    durationSec: 600,
    orders: [{ orderId: 1, atSec: 0, items: [{ name, quantity }] }],
  });
const assign = (state: GameState, bayId = 1) =>
  gameReducer(state, { type: 'assign', key: state.unassigned[0].ticketUid ?? '', bayId });

function runService(mode: GameMode) {
  let state = startGame(load(mode));
  while (state.status === 'active') {
    for (const bay of state.bays) {
      if (bay.queue[0]?.timeRemainingSec === 0) state = gameReducer(state, { type: 'complete', bayId: bay.id });
    }
    for (const card of state.unassigned) {
      const bay = state.bays
        .filter((entry) => allowedBay(card, entry))
        .sort(
          (a, b) =>
            a.queue.reduce((sum, ticket) => sum + (ticket.timeRemainingSec ?? ticket.totalDurationSec), 0) +
            (!seniorOnly(card.beanName) && a.canHandleSpecial ? 150 : 0) -
            b.queue.reduce((sum, ticket) => sum + (ticket.timeRemainingSec ?? ticket.totalDurationSec), 0) -
            (!seniorOnly(card.beanName) && b.canHandleSpecial ? 150 : 0)
        )[0];
      state = gameReducer(state, { type: 'assign', key: card.ticketUid ?? '', bayId: bay.id });
    }
    state = gameReducer(state, { type: 'tick', seconds: 1 });
  }
  return state;
}

test('all three synthetic scenarios use the supplied master and allow a competent operator to pass', () => {
  for (const mode of Object.keys(MODES) as GameMode[]) {
    const scenario = load(mode);
    assert.equal(scenario.orders.length, MODES[mode].count);
    const state = runService(mode);
    const score = scoreGame(state);
    assert.ok(score.done / score.total >= 0.9, `${mode}: at least 90 percent of cups are finished`);
    assert.ok(score.score >= 80, `${mode}: ${score.score}`);
    assert.equal(score.passed, true);
    assert.ok(scenario.orders.at(-1).atSec <= scenario.durationSec - 240);
  }
});
test('idle, early finish and unarrived orders cannot inflate the score', () => {
  for (const mode of Object.keys(MODES) as GameMode[]) {
    const state = startGame(load(mode));
    assert.equal(scoreGame(gameReducer(state, { type: 'finish' })).score, 0);
    assert.equal(scoreGame(gameReducer(state, { type: 'tick', seconds: 9999 })).score, 0);
    assert.equal(scoreGame(state).total, Object.values(state.cups).length);
  }
});
test('finishing immediately yields at most 45 points even if every cup is clicked through', () => {
  let state = assign(startGame(single()));
  state = gameReducer(state, { type: 'complete', bayId: 1 });
  const score = scoreGame(state);
  assert.equal(score.score, 45);
  assert.equal(score.quality, 0);
  assert.equal(score.passed, false);
});
test('proper brewing, ready state and finish preserve the full score', () => {
  let state = assign(startGame(single()));
  state = gameReducer(state, { type: 'tick', seconds: 135 });
  assert.equal(state.bays[0].queue[0].timeRemainingSec, 0);
  assert.equal(scoreGame(state).done, 0, 'completion requires operator action');
  state = gameReducer(state, { type: 'complete', bayId: 1 });
  assert.equal(scoreGame(state).score, 100);
  state = gameReducer(state, { type: 'finish' });
  assert.equal(gameReducer(state, { type: 'tick', seconds: 5 }), state);
  assert.equal(gameReducer(state, { type: 'complete', bayId: 1 }), state);
});
test('pause freezes clock, arrivals and actions; restarting begins with a fresh board', () => {
  const initial = startGame(load('middle'));
  const paused = gameReducer(initial, { type: 'pause' });
  assert.equal(gameReducer(paused, { type: 'tick', seconds: 100 }), paused);
  assert.equal(assign(paused), paused);
  assert.deepEqual(startGame(load('middle')), initial);
});
test('senior and nomination violations are blocked and cap a nominal 98 at 79', () => {
  let state = startGame(single('アロマナティーボ'));
  state = assign(state, 3);
  assert.equal(state.violations, 1);
  assert.equal(state.unassigned.length, 1);
  state = assign(state, 1);
  state = gameReducer(state, { type: 'tick', seconds: 165 });
  state = gameReducer(state, { type: 'complete', bayId: 1 });
  assert.equal(scoreGame(state).score, 79);
  const data = single();
  data.orders[0].items[0].nominee = 4;
  assert.equal(assign(startGame(data), 2).violations, 1);
});
test('late service and unsynchronized order lose their own categories', () => {
  let state = assign(startGame(single('余音ブレンド', 3)));
  state = gameReducer(state, { type: 'tick', seconds: 365 });
  state = gameReducer(state, { type: 'complete', bayId: 1 });
  state = assign(state, 2);
  state = gameReducer(state, { type: 'tick', seconds: 135 });
  state = gameReducer(state, { type: 'complete', bayId: 2 });
  const score = scoreGame(state);
  assert.equal(score.categories[1].points, 0);
  assert.equal(score.categories[3].points, 0);
  assert.ok(score.score < 80);
});
test('same-item merge preserves cup identity and scores both original orders', () => {
  const data = single();
  data.orders.push({ ...data.orders[0], orderId: 2 });
  let state = startGame(data);
  const [first, second] = state.unassigned;
  state = gameReducer(state, { type: 'merge', first: first.ticketUid, second: second.ticketUid });
  assert.equal(state.unassigned.length, 1);
  assert.equal(state.unassigned[0].trainingCupIds.length, 2);
  state = assign(state);
  state = gameReducer(state, { type: 'tick', seconds: 195 });
  state = gameReducer(state, { type: 'complete', bayId: 1 });
  assert.equal(scoreGame(state).score, 100);
  assert.equal(scoreGame(state).done, 2);
});
test('two different limited beans cannot merge despite sharing SP code', () => {
  const data = single('アロマナティーボ');
  data.orders.push({ ...data.orders[0], orderId: 2, items: [{ name: 'チロソ', quantity: 1 }] });
  const state = startGame(data);
  const [first, second] = state.unassigned;
  assert.equal(canMergeDripUnits(first, second), false);
  assert.equal(gameReducer(state, { type: 'merge', first: first.ticketUid, second: second.ticketUid }), state);
});
test('moving a brewing card restarts it, and returning a card does not lose a cup', () => {
  let state = assign(startGame(single()));
  state = gameReducer(state, { type: 'tick', seconds: 100 });
  const key = state.bays[0].queue[0].ticketUid;
  state = gameReducer(state, { type: 'move', key, bayId: 2 });
  assert.equal(state.bays[1].queue[0].timeRemainingSec, 135);
  state = gameReducer(state, { type: 'return', key });
  assert.equal(state.unassigned.length, 1);
  assert.equal(state.unassigned[0].trainingCupIds.length, 1);
  assert.equal(scoreGame(state).done, 0);
});
test('splitting 5 cups yields 2+2+1 and preserves total and distinct cup ids', () => {
  const state = startGame(single('余音ブレンド', 5));
  assert.deepEqual(
    state.unassigned.map((card) => card.cupCount),
    [2, 2, 1]
  );
  assert.equal(new Set(state.unassigned.flatMap((card) => card.trainingCupIds)).size, 5);
  assert.ok(state.unassigned.every((card) => card.totalOrderCups === 5));
});
test('master item flags determine brew needs and menu mapping', () => {
  assert.equal(TRAINING_MASTER.items.length, 12);
  assert.equal(needsBrew('アイスミルク'), false);
  assert.equal(needsBrew('コースター'), false);
  assert.equal(needsBrew('アイスオレ'), true);
  assert.equal(itemPrice('キリマン'), 400);
  const data = single();
  data.orders[0].items.push({ name: 'アイスミルク', quantity: 6 });
  assert.equal(Object.values(startGame(data).cups).length, 1);
});
test('parser rejects malformed, conflicting and unknown input; sorts out-of-order arrivals', () => {
  for (const invalid of [null, {}, { ...single(), orders: [] }, { ...single(), durationSec: 1 }])
    assert.throws(() => parseScenario(invalid));
  const duplicate = single();
  duplicate.orders.push(duplicate.orders[0]);
  assert.throws(() => parseScenario(duplicate));
  const unknown = single();
  unknown.orders[0].items[0].name = '未知';
  assert.throws(() => parseScenario(unknown));
  const late = single();
  late.orders[0].atSec = 599;
  assert.throws(() => parseScenario(late));
  const limited = single('チロソ');
  limited.orders[0].items[0].nominee = 2;
  assert.throws(() => parseScenario(limited));
  const reversed = single();
  reversed.orders[0].atSec = 100;
  reversed.orders.push({ ...reversed.orders[0], atSec: 0, orderId: 2 });
  assert.equal(parseScenario(reversed).orders[0].orderId, 2);
});

// Render both adopted views over the same in-progress state. Rendering must not
// change the board/score, and neither deprecated choice can be selected.
test('A and C are the only adopted views and render the same active order without changing scoring', () => {
  const state = assign(startGame(single()), 2);
  const before = JSON.stringify(state);
  assert.deepEqual(Object.values(CONTROL_VIEWS), ['A', 'C']);
  const noop = () => {};
  for (const mode of Object.keys(CONTROL_VIEWS) as (keyof typeof CONTROL_VIEWS)[]) {
    const html = renderToStaticMarkup(
      createElement(ControlWorkspace, {
        mode,
        baristas: state.bays,
        unassignedOrders: state.unassigned,
        nextAvailable: [],
        selectedOrderId: null,
        actionTicketKey: null,
        currentTimeSec: state.nowSec,
        timelineCommand: null,
        onSelectOrder: noop,
        onAdvanceBay: noop,
        onOpenTicketDetail: noop,
        onMoveTicket: noop,
        onReturnToUnassigned: noop,
        onCloseTicketAction: noop,
        onRequestRebrew: noop,
        onOpenEmptySlot: noop,
        onAssignToBay: noop,
        onMergeOrders: noop,
      })
    );
    assert.ok(html.includes('#001'));
    assert.ok(html.includes('よいん'));
    assert.ok(html.includes('2番 次へ'));
    assert.equal(JSON.stringify(state), before);
    assert.equal(scoreGame(state).done, 0);
  }
});
