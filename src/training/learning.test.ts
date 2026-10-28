import assert from 'node:assert/strict';
import test from 'node:test';
import { convertBoard } from '../current-caos/bridge/convertBoard';
import { type GameState, gameReducer, scoreGame, startGame } from './engine';
import { createResult, HISTORY_KEY, LEGACY_KEY, parseHistory, readHistory, saveResult } from './history';
import { LESSONS, lessonComplete } from './tutorial';

const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};
const lesson = (id: string) => {
  const found = LESSONS.find((entry) => entry.id === id);
  assert.ok(found);
  return found;
};
const board = (state: GameState) =>
  convertBoard({
    baristas: state.bays,
    unassignedOrders: state.unassigned,
    currentTimeSec: state.nowSec,
    clockOriginMs: Date.UTC(2026, 9, 19, 1),
  } as Parameters<typeof convertBoard>[0]);

test('results retain details across reload, migrate old scores once and deduplicate a saved result', () => {
  const store = memory();
  store.setItem(LEGACY_KEY, JSON.stringify([{ mode: 'fast', score: 70, at: '2026-10-19T01:00:00Z' }]));
  const entry = createResult(lesson('assign').setup(), '2026-10-25T01:00:00Z', 'new');
  assert.equal(saveResult(entry, store).saved, true);
  saveResult(entry, store);
  const read = readHistory(store);
  assert.equal(read.length, 2);
  assert.equal(read[0].score, 70);
  assert.equal(read[0].detail, undefined);
  assert.deepEqual(read[1], JSON.parse(JSON.stringify(entry)));
});
test('history is bounded to 100 attempts and corrupted old data does not hide valid new results', () => {
  const store = memory();
  const entry = createResult(lesson('finish').setup(), '2026-10-25T01:00:00Z', 'entry');
  store.setItem(HISTORY_KEY, JSON.stringify(Array.from({ length: 105 }, (_, i) => ({ ...entry, id: String(i) }))));
  store.setItem(LEGACY_KEY, 'broken json');
  assert.equal(readHistory(store).length, 100);
  assert.equal(readHistory(store)[0].id, '5');
  assert.equal(parseHistory('{bad').length, 0);
  assert.equal(
    parseHistory(
      JSON.stringify([
        { ...entry, score: 101 },
        { ...entry, at: 'bad' },
        { ...entry, mode: 'unknown' },
      ])
    ).length,
    0
  );
});
test('storage denial and full quota leave a recoverable in-memory result and report failure', () => {
  const entry = createResult(lesson('finish').setup(), '2026-10-25T01:00:00Z', 'entry');
  const broken = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('full');
    },
  };
  assert.deepEqual(readHistory(broken), []);
  assert.equal(saveResult(entry, broken).saved, false);
  assert.deepEqual(saveResult(entry, broken).entries, [entry]);
});
test('malformed detail falls back to a score-only history entry', () => {
  const entry = createResult(lesson('assign').setup(), '2026-10-25T01:00:00Z', 'entry');
  const parsed = parseHistory(JSON.stringify([{ ...entry, detail: { result: { categories: [] } } }]));
  assert.equal(parsed[0].score, entry.score);
  assert.equal(parsed[0].detail, undefined);
});
test('old results remain readable and a damaged score review does not remove the saved score or action log', () => {
  const entry = createResult(lesson('assign').setup(), '2026-10-29T01:00:00Z', 'review');
  const old = JSON.parse(JSON.stringify(entry));
  delete old.detail.result.review;
  assert.ok(parseHistory(JSON.stringify([old]))[0].detail);
  const damaged = JSON.parse(JSON.stringify(entry));
  damaged.detail.result.review.deductions = [{ timeline: 'broken' }];
  const restored = parseHistory(JSON.stringify([damaged]))[0];
  assert.equal(restored.score, entry.score);
  assert.deepEqual(restored.detail?.events, entry.detail?.events);
  assert.equal(restored.detail?.result.review, undefined);
});
test('tutorial states are fresh, never auto-complete and only observed interactions unlock the first steps', () => {
  for (const item of LESSONS) {
    assert.equal(lessonComplete(item, item.setup(), []), false, item.id);
    assert.deepEqual(item.setup(), item.setup(), item.id);
  }
  const first = lesson('overview');
  assert.equal(lessonComplete(first, first.setup(), ['view:c', 'view:current', 'highlight', 'lane']), true);
  const orders = lesson('orders');
  assert.equal(lessonComplete(orders, orders.setup(), ['search', 'unfinished', 'all', 'comments', 'reply']), true);
});
test('assignment, constraints, merge/split and timed completion tutorials are solvable with real actions', () => {
  let state = lesson('assign').setup();
  state = gameReducer(state, { type: 'assign', key: state.unassigned[0].ticketUid ?? '', bayId: 2 });
  assert.ok(lessonComplete(lesson('assign'), state, []));
  state = lesson('conditions').setup();
  for (const card of state.unassigned)
    state = gameReducer(state, { type: 'assign', key: card.ticketUid ?? '', bayId: card.preferredBaristaId ?? 1 });
  assert.ok(lessonComplete(lesson('conditions'), state, []));
  state = lesson('merge').setup();
  state = gameReducer(state, {
    type: 'merge',
    first: state.unassigned[0].ticketUid ?? '',
    second: state.unassigned[1].ticketUid ?? '',
  });
  state = gameReducer(state, {
    type: 'split',
    key: state.unassigned[0].ticketUid ?? '',
    cupId: state.unassigned[0].trainingCupIds?.[0] ?? '',
  });
  assert.ok(lessonComplete(lesson('merge'), state, []));
  state = lesson('finish').setup();
  state = gameReducer(state, { type: 'tick', seconds: 300 });
  state = gameReducer(state, { type: 'complete', bayId: 2 });
  assert.ok(lessonComplete(lesson('finish'), state, []));
});
test('queue lesson requires undo, restart, movement and returning a card', () => {
  const item = lesson('queue');
  let state = item.setup();
  state = gameReducer(state, { type: 'unstart', bayId: 2 });
  state = gameReducer(state, { type: 'start', bayId: 2 });
  state = gameReducer(state, { type: 'move', key: state.bays[1].queue[1].ticketUid ?? '', bayId: 3 });
  assert.equal(lessonComplete(item, state, []), false);
  state = gameReducer(state, { type: 'return', key: state.bays[2].queue[0].ticketUid ?? '' });
  assert.ok(lessonComplete(item, state, []));
});
test('discard uses the current upstream eligibility and removes only the original, preserving remake scoring', () => {
  let state = lesson('discard').setup();
  const converted = board(state);
  const source = state.bays[1].queue[0];
  const candidates = converted.looks.get(source.ticketUid ?? '')?.discardCandidates ?? [];
  assert.equal(candidates.length, 1);
  assert.equal(scoreGame(state).done, 0);
  state = gameReducer(state, {
    type: 'discard',
    key: source.ticketUid ?? '',
    cupIds: candidates.map((cup) => cup.cupId),
  });
  assert.equal(state.bays[1].queue.length, 0);
  assert.equal(
    state.bays.flatMap((bay) => bay.pastTickets ?? []).filter((card) => card.ticketUid === source.ticketUid).length,
    1
  );
  assert.equal(state.bays[2].queue[0].isRebrew, true);
  state = gameReducer(state, { type: 'tick', seconds: 300 });
  state = gameReducer(state, { type: 'complete', bayId: 3 });
  assert.ok(lessonComplete(lesson('discard'), state, []));
  assert.equal(scoreGame(state).done, 1);
  assert.equal(scoreGame(state).total, 1);
});
test('arbitrary original cups cannot be discarded and queued split leaves the unaffected cup in place', () => {
  let state = lesson('queue').setup();
  const source = state.bays[1].queue[0];
  assert.equal(
    gameReducer(state, { type: 'discard', key: source.ticketUid ?? '', cupIds: source.trainingCupIds ?? [] }),
    state
  );
  const card = state.bays[1].queue[1];
  state = gameReducer(state, { type: 'return', key: card.ticketUid ?? '' });
  state = gameReducer(state, { type: 'return', key: state.bays[1].queue[1].ticketUid ?? '' });
  state = gameReducer(state, {
    type: 'merge',
    first: state.unassigned[0].ticketUid ?? '',
    second: state.unassigned[1].ticketUid ?? '',
  });
  state = gameReducer(state, { type: 'assign', key: state.unassigned[0].ticketUid ?? '', bayId: 2 });
  const queued = state.bays[1].queue[1];
  state = gameReducer(state, { type: 'split', key: queued.ticketUid ?? '', cupId: queued.trainingCupIds?.[0] ?? '' });
  assert.equal(state.unassigned.length, 1);
  assert.equal(state.bays[1].queue[1].cupCount, 1);
  assert.equal(Object.keys(state.cups).length, 3);
});
test('emergency lesson is guaranteed and only passes after a properly finished remake', () => {
  let state = lesson('emergency').setup();
  assert.equal(state.emergencies[0].status, 'pending');
  state = gameReducer(state, {
    type: 'rebrew',
    key: state.emergencies[0].sourceKey ?? '',
    incidentId: 1,
    cupCount: 1,
    bayId: 3,
    reason: '抽出ミス',
    interrupt: true,
  });
  assert.equal(lessonComplete(lesson('emergency'), state, []), false);
  state = gameReducer(state, { type: 'tick', seconds: 300 });
  state = gameReducer(state, { type: 'complete', bayId: 3 });
  assert.ok(lessonComplete(lesson('emergency'), state, []));
});

test('partial original discard preserves the other cup and both cups receive credit only once', () => {
  const scenario = lesson('finish').setup().scenario;
  let state: GameState = {
    ...startGame({ ...scenario, orders: [{ ...scenario.orders[0], items: [{ name: '余音ブレンド', quantity: 2 }] }] }),
    emergencies: [],
  };
  state = gameReducer(state, { type: 'assign', key: state.unassigned[0].ticketUid ?? '', bayId: 2 });
  state = gameReducer(state, { type: 'tick', seconds: 270 });
  const source = state.bays[1].queue[0];
  state = gameReducer(state, {
    type: 'rebrew',
    key: source.ticketUid ?? '',
    cupCount: 1,
    bayId: 3,
    interrupt: false,
    reason: '抽出ミス',
  });
  const projected = board(state);
  const candidates = projected.looks.get(source.ticketUid ?? '')?.discardCandidates ?? [];
  assert.equal(candidates.length, 1);
  assert.equal(projected.rows[0].cups, 2, 'an original and its remake do not increase the order quantity');
  state = gameReducer(state, {
    type: 'discard',
    key: source.ticketUid ?? '',
    cupIds: candidates.map((cup) => cup.cupId),
  });
  assert.equal(state.bays[1].queue[0].cupCount, 1);
  assert.equal(state.bays[1].queue[0].trainingCupIds?.length, 1);
  assert.equal(state.bays[2].queue[0].cupCount, 1);
  state = gameReducer(state, { type: 'tick', seconds: 300 });
  state = gameReducer(state, { type: 'complete', bayId: 2 });
  assert.equal(scoreGame(state).done, 1);
  state = gameReducer(state, { type: 'complete', bayId: 3 });
  assert.equal(scoreGame(state).done, 2);
  assert.equal(scoreGame(state).quality, 2);
  assert.equal(scoreGame(state).total, 2);
});

test('production emergency cup selection keeps the chosen cup, reason and original brew', () => {
  let state = lesson('merge').setup();
  for (const card of [...state.unassigned])
    state = gameReducer(state, { type: 'assign', key: card.ticketUid ?? '', bayId: 2 });
  const first = state.bays[1].queue[0];
  const second = state.bays[1].queue[1];
  const selected = second.trainingCupIds?.[0] ?? '';
  state = gameReducer(state, { type: 'rebrew-cups', cupIds: [selected], reason: 'ラベル再発行' });
  assert.deepEqual(state.unassigned[0].trainingCupIds, [selected]);
  assert.equal(state.unassigned[0].rebrewReason, 'ラベル再発行');
  assert.equal(state.bays[1].queue[0].ticketUid, first.ticketUid);
  assert.equal(state.bays[1].queue[0].status, 'brewing');
  assert.equal(board(state).cards.find((card) => card.emergency)?.cups[0].emergencyReason, 'ラベル再発行');
  const before = state;
  assert.equal(gameReducer(state, { type: 'rebrew-cups', cupIds: [selected, 'missing'], reason: '' }), before);
  assert.equal(gameReducer(state, { type: 'rebrew-cups', cupIds: [selected, selected], reason: '' }), before);
});

test('emergencies can be registered from unassigned orders with an optional reason, then cancelled', () => {
  let state = lesson('assign').setup();
  const original = state.unassigned[0];
  const ids = original.trainingCupIds ?? [];
  state = gameReducer(state, { type: 'rebrew-cups', cupIds: ids, reason: '' });
  assert.equal(state.unassigned[0].isRebrew, true);
  assert.equal(state.unassigned[0].rebrewReason, '');
  assert.deepEqual(state.unassigned[0].trainingCupIds, ids);
  assert.equal(state.unassigned[1].trainingCupIds?.length, 0);
  state = gameReducer(state, { type: 'cancel-emergency', key: state.unassigned[0].ticketUid ?? '' });
  assert.equal(state.unassigned.length, 1);
  assert.deepEqual(state.unassigned[0].trainingCupIds, ids);
  assert.equal(state.unassigned[0].ticketUid, original.ticketUid);
});

test('cancelling an unstarted emergency restores the pending incident; a started remake cannot be cancelled', () => {
  let state = lesson('emergency').setup();
  const ids = state.bays[1].queue[0].trainingCupIds ?? [];
  state = gameReducer(state, { type: 'rebrew-cups', cupIds: ids, reason: '抽出ミス' });
  assert.equal(state.emergencies[0].status, 'rebrewing');
  state = gameReducer(state, { type: 'cancel-emergency', key: state.unassigned[0].ticketUid ?? '' });
  assert.equal(state.emergencies[0].status, 'pending');
  assert.deepEqual(state.bays[1].queue[0].trainingCupIds, ids);
  state = gameReducer(state, { type: 'rebrew-cups', cupIds: ids, reason: '抽出ミス' });
  const key = state.unassigned[0].ticketUid ?? '';
  state = gameReducer(state, { type: 'assign', key, bayId: 3 });
  assert.equal(gameReducer(state, { type: 'cancel-emergency', key }), state);
  state = gameReducer(state, { type: 'tick', seconds: 300 });
  state = gameReducer(state, { type: 'complete', bayId: 3 });
  assert.equal(state.emergencies[0].status, 'resolved');
  assert.equal(scoreGame(state).done, 1);
});

test('a partial remake of a merged card preserves the exact selected cup and other orders', () => {
  let state = lesson('merge').setup();
  state = gameReducer(state, {
    type: 'merge',
    first: state.unassigned[0].ticketUid ?? '',
    second: state.unassigned[1].ticketUid ?? '',
  });
  state = gameReducer(state, { type: 'assign', key: state.unassigned[0].ticketUid ?? '', bayId: 2 });
  const source = state.bays[1].queue[0];
  const selected = source.trainingCupIds?.[1] ?? '';
  state = gameReducer(state, { type: 'rebrew-cups', cupIds: [selected], reason: '少しこぼれた' });
  assert.deepEqual(state.unassigned[0].trainingCupIds, [selected]);
  assert.equal(
    state.unassigned[0].sourceCups?.[0].orderId,
    source.sourceCups?.find((cup) => cup.id === selected)?.orderId
  );
  assert.deepEqual(
    state.bays[1].queue[0].trainingCupIds,
    source.trainingCupIds?.filter((id) => id !== selected)
  );
  assert.equal(state.bays[1].queue[0].cupCount, 2);
  assert.equal(state.bays[1].queue[0].status, 'brewing');
  assert.equal(Object.keys(state.cups).length, 2);
});

test('cancelling a remake after completion restores the original cup and its score', () => {
  let state = lesson('finish').setup();
  state = gameReducer(state, { type: 'tick', seconds: 300 });
  state = gameReducer(state, { type: 'complete', bayId: 2 });
  const completed = state;
  state = gameReducer(state, { type: 'rebrew-cups', cupIds: Object.keys(state.cups), reason: '' });
  assert.equal(scoreGame(state).done, 0);
  state = gameReducer(state, { type: 'cancel-emergency', key: state.unassigned[0].ticketUid ?? '' });
  assert.equal(scoreGame(state).done, scoreGame(completed).done);
  assert.equal(scoreGame(state).quality, scoreGame(completed).quality);
  const original = board(state).cards.find((card) => !card.emergency);
  assert.equal(original?.cups.length, 1);
  assert.equal(original?.status, 'done');
});

test('cancelling after original discard keeps the cup available for a new brew', () => {
  let state = lesson('emergency').setup();
  const key = state.bays[1].queue[0].ticketUid ?? '';
  const ids = state.bays[1].queue[0].trainingCupIds ?? [];
  state = gameReducer(state, { type: 'rebrew-cups', cupIds: ids, reason: '抽出ミス' });
  const remakeKey = state.unassigned[0].ticketUid ?? '';
  state = gameReducer(state, { type: 'discard', key, cupIds: ids });
  state = gameReducer(state, { type: 'cancel-emergency', key: remakeKey });
  assert.equal(state.unassigned.length, 1);
  assert.equal(state.unassigned[0].isRebrew, false);
  assert.deepEqual(state.unassigned[0].trainingCupIds, ids);
  assert.equal(state.emergencies[0].sourceKey, state.unassigned[0].ticketUid);
  assert.equal(state.emergencies[0].status, 'pending');
});
