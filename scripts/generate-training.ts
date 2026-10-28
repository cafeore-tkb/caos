import { writeFileSync } from 'node:fs';
import { MODES, parseScenario, type ScenarioOrder } from '../src/training/engine';
import { seniorOnly, TRAINING_MASTER } from '../src/training/master';

// Deterministic synthetic orders. Never reads production order/customer data.
const MIX = {
  fast: { nominated: [4], limited: [4], commented: [0] },
  middle: { nominated: [1, 9], limited: [7], commented: [0, 9] },
  full: { nominated: [3, 21, 37], limited: [15, 37], commented: [0, 21, 37] },
} satisfies Record<'fast' | 'middle' | 'full', { nominated: number[]; limited: number[]; commented: number[] }>;
const brewNames = TRAINING_MASTER.items
  .filter((item) => TRAINING_MASTER.item_types.find((type) => type.name === item.item_type)?.needs_brew)
  .map((item) => item.name);
const regularNames = brewNames.filter((name) => !seniorOnly(name));
const limitedNames = brewNames.filter(seniorOnly);
const nominees = [4, 2, 5, 3, 6, 1];

for (const mode of ['fast', 'middle', 'full'] as const) {
  const config = MODES[mode];
  const mix = MIX[mode];
  const orders: ScenarioOrder[] = Array.from({ length: config.count }, (_, i) => {
    const limitedIndex = mix.limited.indexOf(i);
    const name =
      limitedIndex >= 0
        ? limitedNames[limitedIndex % limitedNames.length]
        : mode === 'fast'
          ? ['余音ブレンド', '珈琲・俺ブレンド', 'ケニア', 'アイスコーヒー'][i % 4]
          : regularNames[(i * 3 + Math.floor(i / 4)) % regularNames.length];
    const nomineeIndex = mix.nominated.indexOf(i);
    const nominee =
      nomineeIndex < 0
        ? undefined
        : seniorOnly(name)
          ? nomineeIndex % 2 === 0
            ? 6
            : 1
          : nominees[nomineeIndex % nominees.length];
    const items: ScenarioOrder['items'] = [
      {
        name,
        quantity: mode === 'full' ? (i % 4 === 3 ? 2 : 1) : i % 5 === 3 ? 3 : i % 3 === 1 ? 2 : 1,
        ...(nominee ? { nominee } : {}),
      },
    ];
    if (mode !== 'fast' && i % 4 === 1) {
      const otherNames = regularNames.filter((entry) => entry !== name);
      items.push({ name: otherNames[(i * 2) % otherNames.length], quantity: 1 });
    }
    if (i % 7 === 4) items.push({ name: 'アイスミルク', quantity: 1 });
    if (i % 9 === 5) items.push({ name: 'コースター', quantity: 1 });
    if (i % 11 === 7) items.push({ name: '缶バッジ', quantity: 1 });
    const comment = nominee
      ? `${nominee}番の方への指名です。少し待てる旨はお伝え済みです。`
      : seniorOnly(name)
        ? '限定コーヒーの注文です。上級生の方へ割当をお願いします。'
        : i === 0
          ? '同じ注文の商品は、そろえてお渡しします。'
          : items.some((item) => item.quantity > 1) || items.length > 1
            ? '複数杯の注文です。なるべく一緒に仕上げてください。'
            : 'お客様は席でお待ちです。準備ができたら注文番号でお呼びください。';
    // Full mode has paired arrivals (a short rush), followed by room to recover.
    const atSec =
      mode === 'full'
        ? i < 8
          ? 0
          : 60 +
            Math.floor((i - 8) / 2) * Math.floor((config.durationSec - 480) / Math.ceil((config.count - 8) / 2)) +
            (i % 2) * 8
        : Math.floor((i * (config.durationSec - (mode === 'middle' ? 480 : 420))) / (config.count - 1));
    return { orderId: i + 1, atSec, items, ...(mix.commented.includes(i) ? { comments: [comment] } : {}) };
  });
  const scenario = parseScenario({
    schemaVersion: 1,
    kind: 'synthetic',
    mode,
    title: `${config.label}・架空の営業シナリオ`,
    durationSec: config.durationSec,
    ...(mode === 'full' ? { scoring: 'forecast' } : {}),
    orders,
  });
  writeFileSync(new URL(`../public/training/${mode}.json`, import.meta.url), `${JSON.stringify(scenario, null, 2)}\n`);
}
