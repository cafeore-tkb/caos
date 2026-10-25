import assert from 'node:assert/strict';
import test from 'node:test';
import { bayPadPlacement } from '../current-caos/logic/bayPadPlacement';
import { overlapArea, placeTour, tourArrow } from './tourGeometry';
import { tourHint } from './tourHints';
import { LESSONS } from './tutorial';

test('every tutorial step has targeted floating guidance', () => {
  for (const lesson of LESSONS)
    for (let step = 0; step < lesson.steps.length; step++) {
      const hint = tourHint(lesson, step, lesson.setup(), 'current');
      assert.ok(hint.message.length > 0 && hint.message.length <= 48, `${lesson.id}:${step}`);
      assert.ok(hint.queries.length > 0, `${lesson.id}:${step}`);
      for (const query of hint.queries) assert.ok(query.selector);
    }
});
test('floating panel stays inside tablet and desktop bounds without covering the target', () => {
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    for (const target of [
      { x: 160, y: 15, width: 44, height: 44 },
      { x: 16, y: viewport.height - 92, width: 180, height: 68 },
      { x: viewport.width - 150, y: 260, width: 130, height: 44 },
    ]) {
      const panel = placeTour(target, { width: 338, height: 280 }, viewport);
      assert.ok(panel.x >= 12 && panel.y >= 12);
      assert.ok(panel.x + panel.width <= viewport.width - 12);
      assert.ok(panel.y + panel.height <= viewport.height - 12);
      assert.equal(overlapArea(panel, target), 0);
    }
  }
});
test('guide avoids an existing form when another clear placement is available', () => {
  const viewport = { width: 1280, height: 720 };
  const target = { x: 610, y: 240, width: 100, height: 44 };
  const form = { x: 750, y: 80, width: 480, height: 550 };
  const panel = placeTour(target, { width: 338, height: 280 }, viewport, [form]);
  assert.equal(overlapArea(panel, target), 0);
  assert.equal(overlapArea(panel, form), 0);
});
test('arrow ends at the control edge and remains outside the control hit area', () => {
  const target = { x: 500, y: 300, width: 120, height: 60 };
  for (const panel of [
    { x: 100, y: 240, width: 300, height: 230 },
    { x: 750, y: 240, width: 300, height: 230 },
    { x: 400, y: 20, width: 300, height: 200 },
    { x: 400, y: 450, width: 300, height: 200 },
  ]) {
    const arrow = tourArrow(panel, target);
    assert.ok(!/NaN|Infinity/.test(arrow.path));
    assert.ok(
      arrow.end.x < target.x ||
        arrow.end.x > target.x + target.width ||
        arrow.end.y < target.y ||
        arrow.end.y > target.y + target.height
    );
    assert.ok(arrow.start.x >= panel.x && arrow.start.x <= panel.x + panel.width);
    assert.ok(arrow.start.y >= panel.y && arrow.start.y <= panel.y + panel.height);
  }
});

test('a target inside a rebrew form keeps the whole form free of the guide', () => {
  const form = { x: 930, y: 110, width: 338, height: 600 };
  const target = { x: 965, y: 350, width: 260, height: 44 };
  const panel = placeTour(target, { width: 338, height: 250 }, { width: 1280, height: 720 }, [form]);
  assert.equal(overlapArea(panel, form), 0);
  assert.equal(overlapArea(panel, target), 0);
});
test('completion positions without a target do not require a fictitious arrow', () => {
  const panel = placeTour(null, { width: 338, height: 220 }, { width: 1024, height: 768 });
  assert.ok(panel.x > 12 && panel.y > 12);
});
test('pointing to one assignment choice leaves both rows of choices visible', () => {
  const target = { x: 970, y: 181, width: 27, height: 28 };
  const rows = [
    { x: 935, y: 177, width: 96, height: 36 },
    { x: 935, y: 275, width: 96, height: 36 },
  ];
  const panel = placeTour(target, { width: 338, height: 250 }, { width: 1280, height: 720 }, rows);
  for (const row of rows) assert.equal(overlapArea(panel, row), 0);
});

test('assignment choices stay inside desktop and iPad viewports at both scroll edges', () => {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1024, height: 768 },
  ]) {
    for (const top of [-20, 70, 200, viewport.height - 70, viewport.height - 10]) {
      for (const left of [-30, 20, viewport.width - 60]) {
        const rows = bayPadPlacement({ left, top, bottom: top + 62, width: 180 }, viewport);
        assert.equal(rows.length, 2);
        for (const row of rows) {
          assert.ok(row.top >= 4);
          assert.ok(row.top + row.height <= viewport.height - 4);
          assert.ok(row.left >= 4);
          assert.ok(row.left + row.width <= viewport.width - 4);
        }
        assert.ok(rows[0].top + rows[0].height < rows[1].top);
      }
    }
  }
});
