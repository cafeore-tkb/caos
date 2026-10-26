import assert from 'node:assert/strict';
import test from 'node:test';
import { type GameAction, gameReducer, scoreGame, startGame } from './engine';
import { appendReplay, replayRun } from './replay';
import { LESSONS } from './tutorial';

const lesson = LESSONS.find((l) => l.id === 'assign');
assert.ok(lesson);
const scenario = lesson.setup().scenario;
test('server replay recomputes the score and coalesced clock ticks preserve it', () => {
  let state = startGame(scenario, 42);
  const key = state.unassigned[0].ticketUid ?? '';
  const actions: GameAction[] = [
    { type: 'assign', key, bayId: 2 },
    ...Array.from({ length: 300 }, () => ({ type: 'tick' as const, seconds: 1 })),
    { type: 'complete', bayId: 2 },
    { type: 'finish' },
  ];
  const compact: GameAction[] = [];
  for (const action of actions) {
    state = gameReducer(state, action);
    appendReplay(compact, action);
  }
  assert.equal(compact.length, 4);
  const replay = replayRun(scenario, 42, compact);
  assert.deepEqual(replay.result, scoreGame(state));
  assert.equal(replay.result.score, 100);
});
test('ranked replay rejects incomplete games, extra scores, malformed actions and post-finish events', () => {
  for (const input of [
    [],
    [{ type: 'tick', seconds: -1 }],
    [{ type: 'finish', score: 100 }],
    [{ type: 'set-lane', bayId: 1, name: 'cheat', senior: true }],
    [{ type: 'tick', seconds: 1 }],
    [{ type: 'finish' }, { type: 'finish' }],
  ])
    assert.throws(() => replayRun(scenario, 1, input));
  assert.equal(replayRun(scenario, 1, [{ type: 'finish' }]).result.score, 0);
});

test('canonical service including emergency remakes replays identically in every mode', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseScenario, allowedBay } = await import('./engine');
  for (const mode of ['fast', 'middle', 'full']) {
    const input = parseScenario(
      JSON.parse(readFileSync(new URL(`../../public/training/${mode}.json`, import.meta.url), 'utf8'))
    );
    let state = startGame(input, 1);
    const trace: GameAction[] = [];
    const dispatch = (action: GameAction) => {
      if (state.status === 'finished') return;
      state = gameReducer(state, action);
      appendReplay(trace, action);
    };
    while (state.status === 'active') {
      for (const trial of state.emergencies.filter((e) => e.status === 'pending'))
        if (trial.cupId) dispatch({ type: 'rebrew-cups', cupIds: [trial.cupId], reason: '抽出ミス' });
      for (const card of [...state.unassigned]) {
        if (!card.trainingCupIds?.length) continue;
        const bay = state.bays
          .filter((b) => allowedBay(card, b))
          .sort(
            (a, b) =>
              a.queue.reduce((s, c) => s + (c.timeRemainingSec ?? c.totalDurationSec), 0) -
              b.queue.reduce((s, c) => s + (c.timeRemainingSec ?? c.totalDurationSec), 0)
          )[0];
        if (bay) dispatch({ type: 'assign', key: card.ticketUid ?? '', bayId: bay.id });
      }
      for (const bay of state.bays)
        if (bay.queue[0]?.status === 'brewing' && (bay.queue[0].timeRemainingSec ?? 1) <= 0)
          dispatch({ type: 'complete', bayId: bay.id });
      dispatch({ type: 'tick', seconds: 5 });
    }
    assert.deepEqual(replayRun(input, 1, trace).result, scoreGame(state), mode);
  }
});
