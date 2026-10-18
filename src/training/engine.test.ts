import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { convertBoard } from '../current-caos/bridge/convertBoard';
import { selectedComments } from '../current-caos/logic/cards';
import { CONTROL_VIEWS } from '../utils/controlViews';
import { arrangeQueue, canMergeDripUnits, insertTicket } from '../utils/orderQueue';
import { trainingComments } from './comments';
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

const required = <T>(value: T | null | undefined): T => {
  assert.ok(value !== null && value !== undefined);
  return value;
};

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
    assert.ok((scenario.orders.at(-1)?.atSec ?? Infinity) <= scenario.durationSec - 390);
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
  state = gameReducer(state, { type: 'tick', seconds: 60 });
  state = gameReducer(state, { type: 'complete', bayId: 1 });
  const score = scoreGame(state);
  assert.equal(score.score, 45);
  assert.equal(score.quality, 0);
  assert.equal(score.passed, false);
});
test('proper brewing, ready state and finish preserve the full score', () => {
  let state = assign(startGame(single()));
  state = gameReducer(state, { type: 'tick', seconds: 300 });
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
  state = gameReducer(state, { type: 'tick', seconds: 300 });
  state = gameReducer(state, { type: 'complete', bayId: 1 });
  assert.equal(scoreGame(state).score, 79);
  const data = single();
  data.orders[0].items[0].nominee = 4;
  assert.equal(assign(startGame(data), 2).violations, 1);
});
test('late service and unsynchronized order lose their own categories', () => {
  let state = assign(startGame({ ...single('余音ブレンド', 3), mode: 'middle', durationSec: 1200 }));
  state = gameReducer(state, { type: 'tick', seconds: 500 });
  state = gameReducer(state, { type: 'complete', bayId: 1 });
  state = assign(state, 2);
  state = gameReducer(state, { type: 'tick', seconds: 300 });
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
  state = gameReducer(state, { type: 'merge', first: required(first.ticketUid), second: required(second.ticketUid) });
  assert.equal(state.unassigned.length, 1);
  assert.equal(state.unassigned[0].trainingCupIds?.length, 2);
  state = assign(state);
  state = gameReducer(state, { type: 'tick', seconds: 360 });
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
  assert.equal(
    gameReducer(state, { type: 'merge', first: required(first.ticketUid), second: required(second.ticketUid) }),
    state
  );
});
test('moving a brewing card restarts it, and returning a card does not lose a cup', () => {
  let state = assign(startGame(single()));
  state = gameReducer(state, { type: 'tick', seconds: 100 });
  const key = required(state.bays[0].queue[0].ticketUid);
  state = gameReducer(state, { type: 'move', key, bayId: 2 });
  assert.equal(state.bays[1].queue[0].timeRemainingSec, 300);
  state = gameReducer(state, { type: 'return', key });
  assert.equal(state.unassigned.length, 1);
  assert.equal(state.unassigned[0].trainingCupIds?.length, 1);
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

function project(state: GameState) {
  const noop = () => {};
  return convertBoard({
    baristas: state.bays,
    unassignedOrders: state.unassigned,
    nextAvailable: [],
    selectedOrderId: null,
    actionTicketKey: null,
    currentTimeSec: state.nowSec,
    orderComments: trainingComments(state, Date.UTC(2026, 9, 19, 1)),
    clockOriginMs: Date.UTC(2026, 9, 19, 1),
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
  });
}

test('A and C are the only adopted views and share the same current card projection', () => {
  const state = assign(startGame(single()), 2);
  const before = JSON.stringify(state);
  assert.deepEqual(Object.values(CONTROL_VIEWS), ['A', 'C']);
  const projection = project(state);
  assert.equal(projection.lanes[1].brewing?.cups[0].item.abbr, 'よいん');
  assert.equal(projection.lanes[1].brewing?.orderNo, 1);
  assert.equal(JSON.stringify(state), before);
  assert.equal(scoreGame(state).done, 0);
});

test('unstart pauses brewing until explicitly started; completion advances the next card', () => {
  let state = assign(startGame(single('余音ブレンド', 3)));
  state = assign(state);
  state = gameReducer(state, { type: 'unstart', bayId: 1 });
  assert.equal(state.bays[0].queue[0].status, 'scheduled');
  state = gameReducer(state, { type: 'tick', seconds: 20 });
  assert.equal(state.bays[0].queue[0].status, 'scheduled');
  state = gameReducer(state, { type: 'start', bayId: 1 });
  state = gameReducer(state, { type: 'tick', seconds: 360 });
  state = gameReducer(state, { type: 'complete', bayId: 1 });
  assert.equal(state.bays[0].queue[0].status, 'brewing');
  assert.equal(state.bays[0].queue[0].timeRemainingSec, 300);
});

test('merging an unassigned cup into a running batch retains identity and checks late-joined quality', () => {
  const data = single();
  data.orders.push({ ...data.orders[0], orderId: 2 });
  let state = assign(startGame(data));
  const key = required(state.bays[0].queue[0].ticketUid);
  state = gameReducer(state, { type: 'tick', seconds: 90 });
  state = gameReducer(state, { type: 'merge', first: required(state.unassigned[0].ticketUid), second: key });
  assert.equal(state.bays[0].queue[0].cupCount, 2);
  assert.equal(state.unassigned.length, 0);
  state = gameReducer(state, { type: 'tick', seconds: 270 });
  state = gameReducer(state, { type: 'complete', bayId: 1 });
  assert.equal(scoreGame(state).done, 2);
  assert.equal(scoreGame(state).quality, 1, 'late-added cup cannot inherit earlier brewing time');
});

test('splitting a combined card preserves cup ids and original order numbers', () => {
  const data = single();
  data.orders.push({ ...data.orders[0], orderId: 2 });
  let state = startGame(data);
  state = gameReducer(state, {
    type: 'merge',
    first: required(state.unassigned[0].ticketUid),
    second: required(state.unassigned[1].ticketUid),
  });
  const card = state.unassigned[0];
  state = gameReducer(state, { type: 'split', key: required(card.ticketUid), cupId: required(card.trainingCupIds)[0] });
  assert.deepEqual(state.unassigned.map((entry) => entry.id).sort(), ['#001', '#002']);
  assert.equal(new Set(state.unassigned.flatMap((entry) => entry.trainingCupIds)).size, 2);
});

test('placement preserves manual queue order, keeps the current brew, and follows main when moving it down', () => {
  let state = startGame(single('余音ブレンド', 5));
  state = assign(assign(assign(state)));
  const queue = state.bays[0].queue;
  const moved = insertTicket(queue, queue[2], 'queueFront', 45);
  assert.deepEqual(
    moved.map((card) => card.ticketUid),
    [queue[0].ticketUid, queue[2].ticketUid, queue[1].ticketUid]
  );
  assert.equal(moved[0].startTimeSec, 0);
  assert.deepEqual(
    arrangeQueue(moved, 1, 45).map((card) => card.ticketUid),
    moved.map((card) => card.ticketUid),
    'reanchoring does not undo a manual placement'
  );
  const lowered = insertTicket(queue, queue[0], 'queueFront', 45);
  assert.equal(lowered[0].ticketUid, queue[1].ticketUid);
  assert.equal(lowered[0].status, 'brewing');
  assert.equal(lowered[0].startTimeSec, 45);
  assert.equal(lowered[1].status, 'scheduled');
  assert.equal(insertTicket(queue, queue[0], 'front', 45), queue, 'same place does not reset a brew');
});

test('merged visual cups retain their original order and arrival time even when order ids are sorted', () => {
  const data = single();
  data.orders.push({ ...data.orders[0], orderId: 2, atSec: 30 });
  let state = gameReducer(startGame(data), { type: 'tick', seconds: 30 });
  state = gameReducer(state, {
    type: 'merge',
    first: required(state.unassigned[0].ticketUid),
    second: required(state.unassigned[1].ticketUid),
  });
  const card = state.unassigned[0];
  assert.deepEqual(card.sourceOrderIds, ['#001', '#002']);
  assert.deepEqual(
    card.sourceCups?.map((cup) => [cup.id, cup.orderId, cup.orderedAtSec]),
    [
      ['2:0:0', '#002', 30],
      ['1:0:0', '#001', 0],
    ]
  );
  state = gameReducer(state, { type: 'split', key: required(card.ticketUid), cupId: required(card.trainingCupIds)[0] });
  assert.deepEqual(state.unassigned.map((entry) => entry.sourceCups?.[0].orderId).sort(), ['#001', '#002']);
});

test('remaking a completed cup clears its credit and cannot award a third cup for a two-cup order', () => {
  let state = assign(startGame({ ...single('余音ブレンド', 2), mode: 'middle', durationSec: 1200 }));
  state = gameReducer(state, { type: 'tick', seconds: 360 });
  state = gameReducer(state, { type: 'complete', bayId: 1 });
  const key = required(state.bays[0].pastTickets?.[0].ticketUid);
  state = gameReducer(state, { type: 'rebrew', key, cupCount: 1, bayId: null, interrupt: false, reason: 'こぼれ' });
  assert.equal(scoreGame(state).done, 1);
  assert.equal(state.unassigned[0].sourceCups?.length, 1);
  state = assign(state, 2);
  state = gameReducer(state, { type: 'tick', seconds: 300 });
  state = gameReducer(state, { type: 'complete', bayId: 2 });
  assert.equal(scoreGame(state).done, 2);
  assert.equal(scoreGame(state).quality, 2);
  assert.equal(scoreGame(state).total, 2);
});

test('continuing the original brew after a remake never credits the remade cup early', () => {
  let state = assign(startGame(single()));
  const key = required(state.bays[0].queue[0].ticketUid);
  state = gameReducer(state, { type: 'tick', seconds: 60 });
  state = gameReducer(state, { type: 'rebrew', key, cupCount: 1, bayId: 2, interrupt: false, reason: '異物混入' });
  state = gameReducer(state, { type: 'tick', seconds: 240 });
  state = gameReducer(state, { type: 'complete', bayId: 1 });
  assert.equal(scoreGame(state).done, 0);
  state = gameReducer(state, { type: 'tick', seconds: 60 });
  state = gameReducer(state, { type: 'complete', bayId: 2 });
  assert.equal(scoreGame(state).done, 1);
  assert.equal(scoreGame(state).score, 100);
});

test('all default scenarios mix nomination, limited coffee and comments at moderate frequencies', () => {
  const nominees = new Set<number>();
  for (const mode of Object.keys(MODES) as GameMode[]) {
    const { orders } = load(mode);
    const nominated = orders.filter((order) => order.items.some((item) => item.nominee));
    const limited = orders.filter((order) => order.items.some((item) => seniorOnly(item.name)));
    const commented = orders.filter((order) => order.comments?.length);
    assert.ok(nominated.length / orders.length >= 0.2 && nominated.length / orders.length <= 0.35, mode);
    assert.ok(limited.length / orders.length >= 0.15 && limited.length / orders.length <= 0.3, mode);
    assert.ok(commented.length / orders.length >= 0.25 && commented.length / orders.length <= 0.4, mode);
    for (const order of nominated) for (const item of order.items) if (item.nominee) nominees.add(item.nominee);
  }
  assert.ok(nominees.size >= 4, 'nominations exercise different lanes');
});

test('optional comments are validated, normalized and copied without breaking older JSON', () => {
  const old = single();
  assert.equal(old.orders[0].comments, undefined);
  const input = single();
  input.orders[0].comments = ['  複数杯は一緒にお願いします。  '];
  const parsed = parseScenario(input);
  assert.deepEqual(parsed.orders[0].comments, ['複数杯は一緒にお願いします。']);
  input.orders[0].comments[0] = 'changed';
  assert.equal(parsed.orders[0].comments?.[0], '複数杯は一緒にお願いします。');
  for (const comments of [null, '文字列のみ', [''], ['   '], [1], ['a'.repeat(201)], ['1', '2', '3', '4']])
    assert.throws(() => parseScenario({ ...single(), orders: [{ ...single().orders[0], comments }] }), /コメント/);
});

test('comments appear on arrival and retain original orders after merging, moving and splitting', () => {
  const data = single();
  data.orders[0].comments = ['一緒にお渡しします。'];
  data.orders.push({ ...data.orders[0], orderId: 2, atSec: 30, comments: ['待機了承済みです。'] });
  let state = startGame(data);
  assert.deepEqual(
    trainingComments(state, 0).map((comment) => comment.orderNo),
    [1]
  );
  state = gameReducer(state, { type: 'tick', seconds: 30 });
  assert.equal(trainingComments(state, 0)[1].createdAt.getTime(), 30000);
  state = gameReducer(state, {
    type: 'merge',
    first: required(state.unassigned[0].ticketUid),
    second: required(state.unassigned[1].ticketUid),
  });
  state = assign(state, 2);
  let board = project(state);
  assert.deepEqual(
    selectedComments(board.cards, board.looks, '#001+#002').map((comment) => comment.text),
    ['一緒にお渡しします。', '待機了承済みです。']
  );
  assert.deepEqual(
    board.rows.map((row) => row.comments.map((comment) => comment.orderNo)),
    [[1], [2]],
    'unfinished rows do not duplicate merged comments'
  );
  const key = required(state.bays[1].queue[0].ticketUid);
  state = gameReducer(state, { type: 'return', key });
  state = gameReducer(state, { type: 'split', key, cupId: required(state.unassigned[0].trainingCupIds)[0] });
  board = project(state);
  for (const card of board.cards)
    assert.deepEqual(
      board.looks.get(card.key)?.comments?.map((comment) => comment.orderNo),
      [card.orderNo]
    );
  assert.equal(scoreGame(state).total, 2);
});
