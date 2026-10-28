import assert from 'node:assert/strict';
import test from 'node:test';
import { convertBoard } from '../current-caos/bridge/convertBoard';
import { type GameState, gameReducer, startGame } from './engine';

const setup = () =>
  startGame({
    schemaVersion: 1,
    kind: 'synthetic',
    mode: 'fast',
    title: '操作の確認',
    durationSec: 600,
    orders: [1, 2, 3].map((orderId) => ({ orderId, atSec: 0, items: [{ name: '余音ブレンド', quantity: 1 }] })),
  });
const key = (card: { ticketUid?: string }) => card.ticketUid ?? '';
const active = (state: GameState) => [...state.unassigned, ...state.bays.flatMap((bay) => bay.queue)];
const project = (state: GameState) =>
  convertBoard({
    baristas: state.bays,
    unassignedOrders: state.unassigned,
    currentTimeSec: state.nowSec,
    clockOriginMs: Date.UTC(2026, 9, 28, 1),
  } as Parameters<typeof convertBoard>[0]);
const conserved = (state: GameState) => {
  const cards = active(state);
  assert.equal(new Set(cards.map(key)).size, cards.length, 'every visible card has a unique key');
  assert.deepEqual(cards.flatMap((card) => card.trainingCupIds ?? []).sort(), Object.keys(state.cups).sort());
  assert.deepEqual(
    project(state).orders.map((order) => order.orderId),
    [1, 2, 3]
  );
};

test('a returned scheduled card can be merged and split repeatedly without losing either order', () => {
  let state = setup();
  state = gameReducer(state, { type: 'assign', key: key(state.unassigned[2]), bayId: 2 });
  const returnedKey = key(state.unassigned[0]);
  state = gameReducer(state, { type: 'assign', key: returnedKey, bayId: 2 });
  state = gameReducer(state, { type: 'return', key: returnedKey });
  for (let round = 0; round < 3; round++) {
    state = gameReducer(state, { type: 'merge', first: key(state.unassigned[0]), second: key(state.unassigned[1]) });
    const merged = state.unassigned[0];
    state = gameReducer(state, { type: 'split', key: key(merged), cupId: merged.trainingCupIds?.[0] ?? '' });
    conserved(state);
    assert.equal(state.unassigned.length, 2);
  }
});

test('splitting a queued batch made from previously split cards never duplicates card keys or order labels', () => {
  let state = setup();
  state = gameReducer(state, { type: 'assign', key: key(state.unassigned[2]), bayId: 2 });
  state = gameReducer(state, { type: 'merge', first: key(state.unassigned[0]), second: key(state.unassigned[1]) });
  const card = state.unassigned[0];
  state = gameReducer(state, { type: 'split', key: key(card), cupId: card.trainingCupIds?.[0] ?? '' });
  for (const part of state.unassigned) state = gameReducer(state, { type: 'assign', key: key(part), bayId: 2 });
  state = gameReducer(state, {
    type: 'merge',
    first: key(state.bays[1].queue[2]),
    second: key(state.bays[1].queue[1]),
  });
  const queued = state.bays[1].queue[1];
  state = gameReducer(state, { type: 'split', key: key(queued), cupId: queued.trainingCupIds?.[0] ?? '' });
  conserved(state);
  assert.equal(state.unassigned.length, 1);
  assert.equal(state.bays[1].queue[1].sourceOrderIds?.length ?? 1, 1);
  assert.equal(state.bays[1].queue[1].id, state.bays[1].queue[1].sourceCups?.[0].orderId);
});

test('an emergency registered after a delayed brew start exposes the original trash control', () => {
  let state = setup();
  state = gameReducer(state, { type: 'tick', seconds: 30 });
  const sourceKey = key(state.unassigned[0]);
  state = gameReducer(state, { type: 'assign', key: sourceKey, bayId: 2 });
  state = gameReducer(state, { type: 'tick', seconds: 225 });
  const ids = state.bays[1].queue[0].trainingCupIds ?? [];
  state = gameReducer(state, { type: 'rebrew-cups', cupIds: ids, reason: 'こぼした' });
  const board = project(state);
  assert.equal(board.looks.get(sourceKey)?.discardCandidates?.length, 1);
  state = gameReducer(state, { type: 'discard', key: sourceKey, cupIds: ids });
  assert.equal(state.bays[1].queue.length, 0);
  assert.deepEqual(state.unassigned.find((card) => card.isRebrew)?.trainingCupIds, ids);
});
