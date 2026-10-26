import assert from 'node:assert/strict';
import test from 'node:test';
import { gameReducer } from './engine';
import { nextShift, SHIFT_ORIGIN_MS, shiftClock, shiftReminder } from './shifts';
import { LESSONS, lessonComplete } from './tutorial';

const lesson = LESSONS.find((l) => l.id === 'shift');
assert.ok(lesson);
test('hourly handoff previews start 10 minutes before and do not automatically change names', () => {
  assert.equal(shiftClock(0), '10:49');
  assert.equal(shiftReminder(SHIFT_ORIGIN_MS), null);
  assert.equal(nextShift(1, 0, '担当A'), null);
  assert.equal(shiftReminder(SHIFT_ORIGIN_MS + 60_000), 'シフト交換10分前');
  assert.equal(nextShift(1, 60, '担当A')?.name, '佐藤');
  assert.equal(shiftReminder(SHIFT_ORIGIN_MS + 360_000), 'シフト交換5分前');
  assert.equal(shiftClock(660), '11:00');
  assert.equal(nextShift(1, 660, '担当A'), null);
  let state = lesson.setup();
  state = gameReducer(state, { type: 'tick', seconds: 660 });
  assert.equal(state.bays[0].name, '担当A');
  assert.equal(shiftReminder(SHIFT_ORIGIN_MS + 660_000), null);
});
test('changing or swapping names preserves the drippers and their current work', () => {
  const lesson = LESSONS.find((l) => l.id === 'queue');
  assert.ok(lesson);
  let state = lesson.setup();
  const original = state.bays[1].queue;
  state = gameReducer(state, { type: 'set-lane', bayId: 2, name: '佐藤', senior: true });
  assert.equal(state.bays[1].name, '佐藤');
  assert.equal(state.bays[1].queue, original);
  state = gameReducer(state, { type: 'swap-lanes', first: 1, second: 2 });
  assert.equal(state.bays[0].name, '佐藤');
  assert.equal(state.bays[1].queue, original);
  state = gameReducer(state, { type: 'set-lane', bayId: 1, name: '', senior: false });
  assert.equal(state.bays[0].name, '');
  assert.equal(state.bays[0].canHandleSpecial, false);
});
test('shift lesson requires scheduled, unscheduled, swap, clear and restore actions', () => {
  const state = gameReducer(lesson.setup(), { type: 'tick', seconds: 1260 });
  const interactions = ['shift:scheduled', 'shift:typed', 'shift:swap', 'shift:clear', 'shift:restore'];
  assert.ok(lessonComplete(lesson, state, interactions));
  for (const missing of interactions)
    assert.equal(
      lessonComplete(
        lesson,
        state,
        interactions.filter((s) => s !== missing)
      ),
      false
    );
});
