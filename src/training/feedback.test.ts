import assert from 'node:assert/strict';
import test from 'node:test';
import { type GameState, gameReducer, scoreGame, startGame } from './engine';

function setup(orders = [{ orderId: 41, atSec: 0, items: [{ name: '余音ブレンド', quantity: 1 }] }]) {
  return startGame({ schemaVersion: 1, kind: 'synthetic', mode: 'fast', title: '振り返り', durationSec: 600, orders });
}
const assign = (state: GameState, bayId = 2) =>
  gameReducer(state, { type: 'assign', key: state.unassigned[0].ticketUid ?? '', bayId });
const complete = (state: GameState, seconds: number, bayId = 2) =>
  gameReducer(gameReducer(state, { type: 'tick', seconds }), { type: 'complete', bayId });
function reconciles(state: GameState) {
  const result = scoreGame(state),
    review = result.review;
  const sum = review.deductions.reduce((total, row) => total + row.points, 0);
  assert.ok(Math.abs(sum - review.categoryLoss - review.penaltyPoints) < 1e-8, 'every lost point has an explanation');
  assert.ok(
    Math.abs(100 - sum + review.minimumAdjustment + review.roundingAdjustment - review.capPoints - result.score) < 1e-8,
    'rounding, zero floor and 79-point cap reconcile with the displayed score'
  );
  assert.equal(review.gates.length === 0, result.ready);
  return result;
}

test('an early completion names the exact order, elapsed extraction and actual action timeline', () => {
  const result = reconciles(complete(assign(setup()), 60));
  const row = result.review.deductions.find((row) => row.category === '抽出時間を守る');
  assert.ok(row);
  assert.deepEqual(row.orderIds, [41]);
  assert.equal(row.points, 20);
  assert.match(row.reason, /60秒で終了.*270秒必要/);
  assert.ok(row.timeline.some((moment) => moment.atSec === 60 && moment.kind === 'actual'));
  assert.ok(row.timeline.some((moment) => moment.atSec === 0 && moment.label === '抽出開始'));
  assert.equal(result.review.capPoints, 0, 'an unmet gate is not claimed as extra loss below 79');
});

test('late completion and separate finish times explain their own losses for the same order', () => {
  let state = startGame(
    {
      schemaVersion: 1,
      kind: 'synthetic',
      mode: 'middle',
      title: '仕上がり',
      durationSec: 1200,
      orders: [
        {
          orderId: 41,
          atSec: 0,
          items: [
            { name: '余音ブレンド', quantity: 1 },
            { name: '珈琲・俺ブレンド', quantity: 1 },
          ],
        },
      ],
    },
    5
  );
  state = assign(assign(state));
  state = complete(complete(state, 300), 300);
  const result = reconciles(state);
  const late = result.review.deductions.find((row) => row.category === '8分以内の提供準備');
  assert.deepEqual(late?.orderIds, [41]);
  assert.match(late?.reason ?? '', /10:00.*2:00/);
  assert.equal(late?.points, 12.5);
  const apart = result.review.deductions.find((row) => row.category === '同じ注文をそろえて仕上げる');
  assert.match(apart?.reason ?? '', /5:00/);
  assert.equal(apart?.points, 10);
});

test('a rejected nomination identifies the order and separates the two-point loss from the cap', () => {
  let state = startGame({
    schemaVersion: 1,
    kind: 'synthetic',
    mode: 'fast',
    title: '指名',
    durationSec: 600,
    orders: [{ orderId: 52, atSec: 0, items: [{ name: '余音ブレンド', quantity: 1, nominee: 1 }] }],
  });
  state = assign(state, 2);
  state = complete(assign(state, 1), 300, 1);
  const result = reconciles(state);
  assert.equal(result.score, 79);
  assert.equal(result.review.penaltyPoints, 2);
  assert.equal(result.review.capPoints, 19);
  assert.deepEqual(result.review.deductions[0].orderIds, [52]);
  assert.equal(result.review.deductions[0].timeline[0].kind, 'actual');
  assert.deepEqual(result.review.gates[0].orderIds, [52]);
});

test('ice advice describes the choice at dispatch time and the half-to-seniors gate', () => {
  const state = complete(
    assign(setup([{ orderId: 63, atSec: 0, items: [{ name: 'アイスコーヒー', quantity: 1 }] }])),
    300
  );
  const result = reconciles(state);
  const row = result.review.deductions.find((row) => row.category === 'アイス1杯を上級生へ');
  assert.deepEqual(row?.orderIds, [63]);
  assert.match(row?.reason ?? '', /2番.*60秒以内/);
  assert.equal(row?.points, 10);
  assert.ok(result.review.gates.some((gate) => gate.reason.includes('半数以上')));
});

test('forecast advice points to the last order and marks future starts and finishes as predictions', () => {
  let state = startGame(
    {
      schemaVersion: 1,
      kind: 'synthetic',
      mode: 'full',
      scoring: 'forecast',
      title: '完了見込み',
      durationSec: 1800,
      orders: [71, 72].map((orderId) => ({ orderId, atSec: 0, items: [{ name: '余音ブレンド', quantity: 1 }] })),
    },
    5
  );
  state = gameReducer(state, { type: 'tick', seconds: 1700 });
  state = assign(assign(state, 1), 1);
  const before = JSON.stringify(state.cups);
  const result = reconciles(state);
  assert.equal(JSON.stringify(state.cups), before, 'review never writes projections over actual records');
  const row = result.review.deductions.find((row) => row.category === '完了予測の速さ');
  assert.deepEqual(row?.orderIds, [72]);
  assert.ok(row?.timeline.some((moment) => moment.kind === 'forecast' && moment.atSec === result.forecast?.endSec));
  assert.ok(row?.timeline.some((moment) => moment.kind === 'forecast' && moment.label === '抽出開始'));
  assert.ok(row?.timeline.some((moment) => moment.kind === 'target' && moment.atSec === result.forecast?.targetSec));
});

test('unarrived orders are described as future orders, and every zero-score loss is accounted for', () => {
  const state = setup([{ orderId: 83, atSec: 180, items: [{ name: '余音ブレンド', quantity: 1 }] }]);
  const result = reconciles(state);
  assert.equal(result.score, 0);
  const row = result.review.deductions.find((row) => row.category === '仕上げた杯数');
  assert.match(row?.reason ?? '', /届く前/);
  assert.equal(row?.timeline[0].kind, 'target');
  assert.ok(!row?.timeline.some((moment) => moment.kind === 'actual'));
  reconciles({ ...state, violations: 20 });
});

test('a sound run has no lost points or fabricated improvement claims', () => {
  const result = reconciles(complete(assign(setup()), 300));
  assert.equal(result.score, 100);
  assert.deepEqual(result.review.deductions, []);
  assert.deepEqual(result.review.gates, []);
});
test('unfinished feedback distinguishes unassigned, queued and brewing cups without inventing a start', () => {
  let state = setup(
    [41, 42, 43].map((orderId) => ({ orderId, atSec: 0, items: [{ name: '余音ブレンド', quantity: 1 }] }))
  );
  state = assign(assign(state));
  state = gameReducer(state, { type: 'tick', seconds: 300 });
  const rows = reconciles(state).review.deductions.filter((row) => row.category === '仕上げた杯数');
  assert.match(rows.find((row) => row.orderIds[0] === 41)?.reason ?? '', /「終える」を押していません/);
  assert.match(rows.find((row) => row.orderIds[0] === 42)?.reason ?? '', /順番を待って/);
  assert.match(rows.find((row) => row.orderIds[0] === 43)?.reason ?? '', /担当が決まっていない/);
  assert.ok(
    rows
      .find((row) => row.orderIds[0] === 41)
      ?.timeline.some((moment) => moment.label === '抽出開始' && moment.kind === 'actual')
  );
  assert.ok(!rows.find((row) => row.orderIds[0] === 42)?.timeline.some((moment) => moment.label === '抽出開始'));
});
