import type { Scenario } from './engine';
import { needsBrew, seniorOnly } from './master';

/** Swap coffee names, preserving quantities, restricted slots, inventory and revenue per seed. */
export function randomScenario(template: Scenario, seed: number): Scenario {
  if (template.kind === 'recreated') return structuredClone(template);
  let value = (seed ^ 0x9e3779b9) >>> 0;
  const random = () => {
    value += 0x6d2b79f5;
    let n = value;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
  // Equal quantities keep product totals and revenue equal. Limited coffee stays in senior-only slots.
  const signature = (item: Scenario['orders'][number]['items'][number]) => `${item.quantity}:${seniorOnly(item.name)}`;
  const pools = new Map<string, string[]>();
  for (const order of template.orders)
    for (const item of order.items) {
      if (!needsBrew(item.name)) continue;
      const key = signature(item);
      pools.set(key, [...(pools.get(key) ?? []), item.name]);
    }
  for (const pool of pools.values())
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  return {
    ...template,
    orders: template.orders.map((slot, index) => {
      const previous = template.orders[index - 1]?.atSec ?? 0;
      const jitter = index === 0 ? 0 : Math.floor(random() * Math.min(16, Math.max(1, slot.atSec - previous)));
      return {
        ...slot,
        items: slot.items.map((item) => ({
          ...item,
          name: needsBrew(item.name) ? (pools.get(signature(item))?.pop() ?? item.name) : item.name,
        })),
        atSec: slot.atSec - jitter,
      };
    }),
  };
}
