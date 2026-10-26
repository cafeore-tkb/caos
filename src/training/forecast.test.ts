import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { convertBoard } from '../current-caos/bridge/convertBoard';
import { laneTimes } from '../current-caos/logic/queue';
import { type GameAction, gameReducer, parseScenario, scoreGame, startGame } from './engine';
import { needsBrew } from './master';
import { randomScenario } from './randomScenario';
import { replayRun, SCORING_VERSION } from './replay';

const input = (later = 0) =>
  parseScenario({
    schemaVersion: 1,
    kind: 'synthetic',
    mode: 'full',
    scoring: 'forecast',
    title: '完了予測',
    durationSec: 1800,
    orders: [
      { orderId: 1, atSec: 0, items: [{ name: '余音ブレンド', quantity: 1 }] },
      { orderId: 2, atSec: later, items: [{ name: 'ケニア', quantity: 1 }] },
    ],
  });
const assign = (state: ReturnType<typeof startGame>, bayId: number) =>
  gameReducer(state, { type: 'assign', key: state.unassigned[0].ticketUid ?? '', bayId });

test('full starts with eight orders and twelve brew cups; random seeds retain the opening backlog', () => {
  const template = parseScenario(
    JSON.parse(readFileSync(new URL('../../public/training/full.json', import.meta.url), 'utf8'))
  );
  for (let seed = 0; seed < 20; seed++) {
    const scenario = randomScenario(template, seed);
    const opening = scenario.orders.filter((o) => o.atSec === 0);
    assert.equal(opening.length, 8);
    assert.equal(
      opening
        .flatMap((o) => o.items)
        .filter((i) => needsBrew(i.name))
        .reduce((sum, i) => sum + i.quantity, 0),
      12
    );
    assert.equal(startGame(scenario, seed).arrived.length, 8);
  }
});
test('all assigned orders finish the run with timeline predictions without waiting for actual brewing', () => {
  let state = startGame(input(), 5); // both emergency draws are skipped
  const trace: GameAction[] = [];
  for (const bayId of [1, 2]) {
    const action = { type: 'assign' as const, key: state.unassigned[0].ticketUid ?? '', bayId };
    trace.push(action);
    state = gameReducer(state, action);
  }
  assert.equal(state.status, 'finished');
  assert.equal(state.nowSec, 0);
  assert.ok(Object.values(state.cups).every((cup) => cup.completedSec === undefined));
  const result = scoreGame(state);
  assert.equal(result.rulesVersion, SCORING_VERSION);
  assert.deepEqual(result.forecast, { endSec: 300, overtimeSec: 0, actualDone: 0, projectedDone: 2, targetSec: 1800 });
  assert.equal(result.score, 100);
  assert.deepEqual(replayRun(input(), 5, trace).result, result);
});
test('unarrived and unassigned orders are never projected as finished, and idle play earns zero', () => {
  const scenario = input(600);
  const first = assign(startGame(scenario, 5), 1);
  assert.equal(first.status, 'active');
  const finished = gameReducer(first, { type: 'finish' });
  const result = scoreGame(finished);
  assert.equal(result.done, 1);
  assert.equal(result.total, 2);
  assert.equal(result.ready, false);
  assert.ok(result.score <= 79);
  assert.equal(scoreGame(gameReducer(startGame(scenario, 5), { type: 'finish' })).score, 0);
});
test('longer queues lose prediction points, using the visible timeline and keeping the 30-minute clock', () => {
  let late = gameReducer(startGame(input(), 5), { type: 'tick', seconds: 1700 });
  late = assign(assign(late, 1), 1);
  const result = scoreGame(late);
  const visibleEnd = Math.max(
    ...late.bays.flatMap((b) => b.queue.map((c) => (c.startTimeSec ?? 0) + c.totalDurationSec))
  );
  assert.equal(result.forecast?.endSec, visibleEnd);
  assert.equal(result.forecast?.overtimeSec, visibleEnd - 1800);
  assert.equal(late.nowSec, 1700);
  assert.ok(result.categories[1].points < 25);
  assert.ok(result.score < 100);
});
test('an actual short extraction cannot be repaired by projecting the remaining queue', () => {
  let state = assign(startGame(input(), 5), 1);
  state = gameReducer(state, { type: 'start', bayId: 1 });
  state = gameReducer(state, { type: 'tick', seconds: 60 });
  state = gameReducer(state, { type: 'complete', bayId: 1 });
  state = assign(state, 2);
  assert.equal(scoreGame(state).quality, 1);
  assert.equal(scoreGame(state).ready, false);
  assert.ok(scoreGame(state).score <= 79);
});
test('encountered emergencies prevent automatic completion until handled; future incidents never penalize early completion', () => {
  let state = assign(startGame(input(600), 0), 1);
  state = gameReducer(state, { type: 'tick', seconds: 600 });
  assert.ok(state.emergencies.some((e) => e.status === 'pending'));
  state = assign(state, 2);
  assert.equal(state.status, 'active');
  state = gameReducer(state, { type: 'finish' });
  assert.equal(scoreGame(state).ready, false);
  assert.ok(scoreGame(state).score <= 79);
  const early = assign(assign(startGame(input(), 0), 1), 2);
  assert.equal(early.status, 'finished');
  assert.equal(scoreGame(early).score, 100);
});
test('predicted completion agrees with production timeline positioning, including changeover gaps and overdue brews', () => {
  let state = assign(startGame(input(), 5), 1);
  state = gameReducer(state, { type: 'tick', seconds: 450 });
  state = assign(state, 1);
  const noop = () => {};
  const projection = convertBoard({
    baristas: state.bays,
    unassignedOrders: state.unassigned,
    nextAvailable: [],
    selectedOrderId: null,
    actionTicketKey: null,
    currentTimeSec: state.nowSec,
    clockOriginMs: 0,
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
  const endMs = Math.max(...projection.lanes.flatMap((lane) => laneTimes(lane, projection.nowMs).map((t) => t.endMs)));
  assert.equal(scoreGame(state).forecast?.endSec, endMs / 1000);
});
