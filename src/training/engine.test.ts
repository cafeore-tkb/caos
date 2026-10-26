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
import { itemPrice, itemType, needsBrew, seniorOnly, TRAINING_MASTER } from './master';
import { randomScenario } from './randomScenario';

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

function runService(mode: GameMode, seed = 1, variedSeed?: number) {
  let state = startGame(variedSeed !== undefined ? randomScenario(load(mode), variedSeed) : load(mode), seed);
  while (state.status === 'active') {
    for (const incident of state.emergencies.filter((trial) => trial.status === 'pending')) {
      const source = state.bays
        .flatMap((bay) => [...bay.queue, ...(bay.pastTickets ?? [])])
        .find((card) => card.ticketUid === incident.sourceKey);
      assert.ok(source);
      const bay = state.bays
        .filter((entry) => allowedBay(source, entry))
        .sort((a, b) => {
          const load = (entry: typeof a) =>
            entry.queue.reduce((sum, card) => sum + (card.timeRemainingSec ?? card.totalDurationSec), 0) -
            (source.cupCount === 1 && entry.queue.includes(source) ? (source.timeRemainingSec ?? 0) : 0);
          return load(a) - load(b);
        })[0];
      state = gameReducer(state, {
        type: 'rebrew',
        key: required(source.ticketUid),
        cupCount: 1,
        bayId: bay.id,
        interrupt: source.cupCount === 1,
        reason: '抽出ミス',
        incidentId: incident.id,
      });
    }
    for (const bay of state.bays) {
      if (bay.queue[0]?.status === 'scheduled') state = gameReducer(state, { type: 'start', bayId: bay.id });
      if (bay.queue[0]?.timeRemainingSec === 0) state = gameReducer(state, { type: 'complete', bayId: bay.id });
    }
    for (const card of state.unassigned) {
      const bay = state.bays
        .filter((entry) => allowedBay(card, entry))
        .sort(
          (a, b) =>
            a.queue.reduce((sum, ticket) => sum + (ticket.timeRemainingSec ?? ticket.totalDurationSec), 0) +
            (a.canHandleSpecial
              ? itemType(card.beanName)?.iced_brew && card.cupCount === 1
                ? -60
                : !seniorOnly(card.beanName)
                  ? 150
                  : 0
              : 0) -
            b.queue.reduce((sum, ticket) => sum + (ticket.timeRemainingSec ?? ticket.totalDurationSec), 0) -
            (b.canHandleSpecial
              ? itemType(card.beanName)?.iced_brew && card.cupCount === 1
                ? -60
                : !seniorOnly(card.beanName)
                  ? 150
                  : 0
              : 0)
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
  assert.deepEqual(Object.keys(CONTROL_VIEWS), ['current', 'c']);
  assert.deepEqual(Object.values(CONTROL_VIEWS), ['タイムライン', 'キュー']);
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

test('replacing every original cup cannot credit it before the remake completes', () => {
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

test('all default scenarios keep nomination, limited coffee and comments occasional', () => {
  const nominees = new Set<number>();
  for (const mode of Object.keys(MODES) as GameMode[]) {
    const { orders } = load(mode);
    const nominated = orders.filter((order) => order.items.some((item) => item.nominee));
    const limited = orders.filter((order) => order.items.some((item) => seniorOnly(item.name)));
    const commented = orders.filter((order) => order.comments?.length);
    assert.ok(nominated.length / orders.length >= 0.1 && nominated.length / orders.length <= 0.2, mode);
    assert.ok(limited.length / orders.length >= 0.05 && limited.length / orders.length <= 0.2, mode);
    assert.ok(commented.length / orders.length >= 0.1 && commented.length / orders.length <= 0.2, mode);
    for (const order of nominated) for (const item of order.items) if (item.nominee) nominees.add(item.nominee);
  }
  assert.ok(nominees.size >= 3, 'nominations exercise different lanes');
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

const emergencyScenario = (mode: 'middle' | 'full', quantity = 1) =>
  parseScenario({ ...single('余音ブレンド', quantity), mode, durationSec: MODES[mode].durationSec });

test('mode probabilities are fixed at session start, independent, deterministic and replayable', () => {
  assert.equal(startGame(single(), 0).emergencies.length, 0);
  assert.equal(startGame(emergencyScenario('middle'), 0).emergencies.length, 1);
  const data = emergencyScenario('full', 2);
  const combinations = [0, 0, 0];
  const joint = new Set<string>();
  for (let seed = 0; seed < 2000; seed++) {
    const state = startGame(data, seed);
    assert.equal(state.emergencies.length, 2);
    const enabled = state.emergencies.map((trial) => trial.willOccur);
    combinations[enabled.filter(Boolean).length]++;
    joint.add(enabled.join(','));
    assert.deepEqual(startGame(data, state.randomSeed), state);
  }
  assert.equal(joint.size, 4, 'full mode can draw neither, either, or both incidents');
  assert.ok(combinations[0] > 400 && combinations[0] < 600);
  assert.ok(combinations[1] > 850 && combinations[1] < 1150);
  assert.ok(combinations[2] > 400 && combinations[2] < 600);
});

test('a one-cup incident triggers once at 75 percent, using brewing time rather than game time', () => {
  let state = startGame(emergencyScenario('middle'), 0);
  state = gameReducer(state, { type: 'tick', seconds: 100 });
  assert.equal(state.emergencies[0].status, 'armed', 'unassigned coffee never triggers');
  state = assign(state);
  state = gameReducer(state, { type: 'tick', seconds: 224 });
  assert.equal(state.emergencies[0].status, 'armed');
  state = gameReducer(state, { type: 'pause' });
  const paused = state;
  assert.equal(gameReducer(state, { type: 'tick', seconds: 100 }), paused);
  state = gameReducer(state, { type: 'pause' });
  state = gameReducer(state, { type: 'tick', seconds: 1 });
  assert.equal(state.emergencies[0].status, 'pending');
  assert.equal(state.emergencies[0].triggeredAtSec, 325);
  const key = required(state.bays[0].queue[0].ticketUid);
  assert.equal(
    gameReducer(state, { type: 'return', key }).unassigned.length,
    0,
    'pending source stays available for the response form'
  );
  state = gameReducer(state, { type: 'tick', seconds: 100 });
  state = gameReducer(state, { type: 'complete', bayId: 1 });
  assert.equal(scoreGame(state).done, 0, 'ignoring an incident cannot credit the damaged cup');
  assert.equal(state.events.filter((event) => event.kind === 'emergency').length, 1);
});

test('two-cup boundary, skipped draw and coarse ticks preserve incident timing and source', () => {
  const data = emergencyScenario('middle', 2);
  let state = assign(startGame(data, 0));
  state = gameReducer(state, { type: 'tick', seconds: 269 });
  assert.equal(state.emergencies[0].status, 'armed');
  state = gameReducer(state, { type: 'tick', seconds: 1 });
  assert.equal(state.emergencies[0].triggeredAtSec, 270);
  const coarse = gameReducer(assign(startGame(data, 0)), { type: 'tick', seconds: 360 });
  assert.equal(coarse.emergencies[0].triggeredAtSec, 270);
  assert.equal(coarse.events.find((event) => event.kind === 'emergency')?.atSec, 270);
  const skipped = gameReducer(assign(startGame(data, 1)), { type: 'tick', seconds: 360 });
  assert.equal(skipped.emergencies[0].status, 'skipped');
  assert.equal(skipped.events.filter((event) => event.kind === 'emergency').length, 0);
});

test('incident response retains scoring identity and requires a properly completed remake', () => {
  let state = assign(startGame(emergencyScenario('middle'), 0));
  state = gameReducer(state, { type: 'tick', seconds: 225 });
  const source = state.bays[0].queue[0];
  const incident = state.emergencies[0];
  state = gameReducer(state, {
    type: 'rebrew',
    key: required(source.ticketUid),
    cupCount: 1,
    bayId: 2,
    interrupt: true,
    reason: '抽出ミス',
    incidentId: incident.id,
  });
  assert.equal(state.emergencies[0].status, 'rebrewing');
  assert.equal(state.bays[1].queue[0].isRebrew, true);
  assert.equal(state.bays[0].pastTickets?.[0].isInterrupted, true);
  assert.equal(scoreGame(state).total, 1);
  state = gameReducer(state, { type: 'tick', seconds: 300 });
  state = gameReducer(state, { type: 'complete', bayId: 2 });
  assert.equal(state.emergencies[0].status, 'resolved');
  assert.equal(scoreGame(state).done, 1);
  assert.equal(scoreGame(state).score, 75, 'the original order wait remains in the timing score');
  assert.equal(project(state).cards.length, 1, 'discarded original is not a second completed serving');
});

test('partially interrupting a two-cup batch returns every unaffected cup for reassignment', () => {
  let state = assign(startGame(emergencyScenario('middle', 2), 0));
  state = gameReducer(state, { type: 'tick', seconds: 270 });
  state = gameReducer(state, {
    type: 'rebrew',
    key: required(state.bays[0].queue[0].ticketUid),
    cupCount: 1,
    bayId: null,
    interrupt: true,
    reason: '抽出ミス',
    incidentId: 1,
  });
  assert.equal(state.unassigned.length, 2);
  assert.equal(new Set(state.unassigned.flatMap((card) => card.trainingCupIds)).size, 2);
  state = assign(state, 1);
  state = assign(state, 2);
  state = gameReducer(state, { type: 'tick', seconds: 300 });
  state = gameReducer(state, { type: 'complete', bayId: 1 });
  state = gameReducer(state, { type: 'complete', bayId: 2 });
  assert.equal(scoreGame(state).done, 2);
  assert.equal(state.emergencies[0].status, 'resolved');
});

test('every incident draw outcome still permits a competent operator to pass the standard modes', () => {
  for (const mode of ['middle', 'full'] as const) {
    const choices = new Map<string, number>();
    for (let seed = 0; seed < 100; seed++)
      choices.set(
        startGame(load(mode), seed)
          .emergencies.map((trial) => trial.willOccur)
          .join(','),
        seed
      );
    assert.equal(choices.size, mode === 'middle' ? 2 : 4);
    for (const [draw, seed] of choices) {
      const state = runService(mode, seed);
      assert.ok(scoreGame(state).score >= 80, `${mode} ${draw}: ${scoreGame(state).score}`);
      assert.ok(state.emergencies.filter((trial) => trial.willOccur).every((trial) => trial.status === 'resolved'));
    }
  }
});

test('moving a cup restarts the 75 percent clock without redrawing its chance', () => {
  let state = assign(startGame(emergencyScenario('middle'), 0));
  const initial = state.emergencies[0].willOccur;
  state = gameReducer(state, { type: 'tick', seconds: 100 });
  state = gameReducer(state, { type: 'move', key: required(state.bays[0].queue[0].ticketUid), bayId: 2 });
  state = gameReducer(state, { type: 'tick', seconds: 224 });
  assert.equal(state.emergencies[0].status, 'armed');
  state = gameReducer(state, { type: 'tick', seconds: 1 });
  assert.equal(state.emergencies[0].willOccur, initial);
  assert.equal(state.emergencies[0].triggeredAtSec, 325);
});

test('two incidents sharing one batch keep the remaining source reachable after partial interruption', () => {
  let state = assign(startGame(emergencyScenario('full', 2), 0));
  state = gameReducer(state, { type: 'tick', seconds: 270 });
  assert.equal(state.emergencies.filter((trial) => trial.status === 'pending').length, 2);
  state = gameReducer(state, {
    type: 'rebrew',
    key: required(state.bays[0].queue[0].ticketUid),
    cupCount: 1,
    bayId: 2,
    interrupt: true,
    reason: '抽出ミス',
    incidentId: 1,
  });
  const pending = required(state.emergencies.find((trial) => trial.status === 'pending'));
  assert.equal(pending.sourceKey, state.unassigned[0].ticketUid);
  state = assign(state, 3);
  state = gameReducer(state, {
    type: 'rebrew',
    key: required(pending.sourceKey),
    cupCount: 1,
    bayId: 4,
    interrupt: true,
    reason: '抽出ミス',
    incidentId: pending.id,
  });
  state = gameReducer(state, { type: 'tick', seconds: 300 });
  state = gameReducer(state, { type: 'complete', bayId: 2 });
  state = gameReducer(state, { type: 'complete', bayId: 4 });
  assert.equal(state.emergencies.filter((trial) => trial.status === 'resolved').length, 2);
  assert.equal(scoreGame(state).done, 2);
});

test('finishing an incident remake too early keeps it pending until a successful second attempt', () => {
  let state = assign(startGame(emergencyScenario('middle'), 0));
  state = gameReducer(state, { type: 'tick', seconds: 225 });
  state = gameReducer(state, {
    type: 'rebrew',
    key: required(state.bays[0].queue[0].ticketUid),
    cupCount: 1,
    bayId: 2,
    interrupt: true,
    reason: '抽出ミス',
    incidentId: 1,
  });
  state = gameReducer(state, { type: 'tick', seconds: 60 });
  state = gameReducer(state, { type: 'complete', bayId: 2 });
  assert.equal(state.emergencies[0].status, 'pending');
  assert.equal(scoreGame(state).passed, false);
  state = gameReducer(state, {
    type: 'rebrew',
    key: required(state.emergencies[0].sourceKey),
    cupCount: 1,
    bayId: 3,
    interrupt: true,
    reason: '抽出ミス',
    incidentId: 1,
  });
  state = gameReducer(state, { type: 'tick', seconds: 300 });
  state = gameReducer(state, { type: 'complete', bayId: 3 });
  assert.equal(state.emergencies[0].status, 'resolved');
  assert.equal(scoreGame(state).done, 1);
  assert.equal(scoreGame(state).total, 1);
});

test('varied basket orders remain playable with the same emergency draw', () => {
  for (const mode of ['fast', 'middle', 'full'] as const)
    for (let seed = 0; seed < 12; seed++) {
      const result = scoreGame(runService(mode, 1, seed));
      assert.ok(result.score >= 80, `${mode} seed ${seed}: ${result.score}; ${JSON.stringify(result.iceAllocation)}`);
    }
});
