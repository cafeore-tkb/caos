import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { gameReducer, parseScenario, startGame } from './engine';
import { randomScenario } from './randomScenario';

for (const [mode, count, initial, first, last] of [
  ['butchi', 37, 8, 66, 102],
  ['shawn', 42, 10, 892, 933],
] as const) {
  test(`${mode}: recreated window starts with seven minutes of orders already queued`, () => {
    const raw = readFileSync(new URL(`../../public/training/${mode}.json`, import.meta.url), 'utf8');
    const scenario = parseScenario(JSON.parse(raw));
    assert.equal(scenario.kind, 'recreated');
    assert.equal(scenario.queueLeadSec, 420);
    assert.equal(scenario.orders.length, count);
    assert.equal(scenario.orders[0].orderId, first);
    assert.equal(scenario.orders.at(-1)?.orderId, last);
    assert.equal(scenario.durationSec, 1800);
    assert.equal(startGame(scenario).arrived.length, initial);
    assert.equal(gameReducer(startGame(scenario), { type: 'tick', seconds: 1800 }).arrived.length, count);
    assert.doesNotMatch(
      raw,
      /createdAt|servedAt|readyAt|billingAmount|2025-|トートセット|縁ブレンド|ライチ|トラジャ|ブルマン|ピンクブルボン|も花も香/
    );
    assert.deepEqual(randomScenario(scenario, 1), scenario);
    assert.deepEqual(randomScenario(scenario, 999), scenario);
    const copy = randomScenario(scenario, 10);
    copy.orders[0].items[0].quantity++;
    assert.notDeepEqual(copy, scenario);
  });
}
