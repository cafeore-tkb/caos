import { writeFileSync } from 'node:fs';
import { type GameMode, MODES, parseScenario, type ScenarioOrder } from '../src/training/engine';
import { TRAINING_MASTER } from '../src/training/master';

// Deterministic synthetic orders. Never reads production order/customer data.
for (const mode of Object.keys(MODES) as GameMode[]) {
  const config = MODES[mode];
  const names = TRAINING_MASTER.items
    .filter((item) => TRAINING_MASTER.item_types.find((type) => type.name === item.item_type)?.needs_brew)
    .map((item) => item.name);
  const orders: ScenarioOrder[] = Array.from({ length: config.count }, (_, i) => {
    const name =
      mode === 'fast'
        ? ['余音ブレンド', '珈琲・俺ブレンド', 'ケニア', 'アイスコーヒー'][i % 4]
        : names[(i * 7 + Math.floor(i / 4)) % names.length];
    const limited = ['アロマナティーボ', 'チロソ'].includes(name);
    const items: ScenarioOrder['items'] = [
      {
        name,
        quantity: i % 5 === 3 ? 3 : i % 3 === 1 ? 2 : 1,
        ...(mode !== 'fast' && i % 6 === 2 ? { nominee: limited ? 6 : (i % 6) + 1 } : {}),
      },
    ];
    if (mode !== 'fast' && i % 4 === 1) items.push({ name: names[(i * 3) % names.length], quantity: 1 });
    if (i % 7 === 4) items.push({ name: 'アイスミルク', quantity: 1 });
    if (i % 9 === 5) items.push({ name: 'コースター', quantity: 1 });
    if (i % 11 === 7) items.push({ name: '缶バッジ', quantity: 1 });
    // Full mode has paired arrivals (a short rush), followed by room to recover.
    const atSec =
      mode === 'full'
        ? Math.floor(i / 2) * Math.floor((config.durationSec - 420) / Math.ceil(config.count / 2)) + (i % 2) * 8
        : Math.floor((i * (config.durationSec - 300)) / (config.count - 1));
    return { orderId: i + 1, atSec, items };
  });
  const scenario = parseScenario({
    schemaVersion: 1,
    kind: 'synthetic',
    mode,
    title: `${config.label}・架空の営業シナリオ`,
    durationSec: config.durationSec,
    orders,
  });
  writeFileSync(new URL(`../public/training/${mode}.json`, import.meta.url), `${JSON.stringify(scenario, null, 2)}\n`);
}
