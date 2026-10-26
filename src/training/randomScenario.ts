import type { Scenario } from './engine';
import { needsBrew, seniorOnly } from './master';

/** Shuffle whole baskets: every seed has the same total cups, prices and rare-order frequency. */
export function randomScenario(template: Scenario, seed: number): Scenario {
  let value = (seed ^ 0x9e3779b9) >>> 0;
  const random = () => {
    value += 0x6d2b79f5;
    let n = value;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
  // Keep the size and restricted-order slots: a short course must not become impossible through a late two-cup draw.
  const signature = (order: Scenario['orders'][number]) =>
    JSON.stringify(
      order.items.map((item) => [item.quantity, item.nominee ?? 0, seniorOnly(item.name), needsBrew(item.name)])
    );
  const pools = new Map<string, Scenario['orders']>();
  for (const order of template.orders) pools.set(signature(order), [...(pools.get(signature(order)) ?? []), order]);
  for (const pool of pools.values())
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  return {
    ...template,
    orders: template.orders.map((slot, index) => {
      const pool = pools.get(signature(slot));
      const order = pool?.pop() ?? slot;
      const previous = template.orders[index - 1]?.atSec ?? 0;
      const jitter = index === 0 ? 0 : Math.floor(random() * Math.min(16, Math.max(1, slot.atSec - previous)));
      return {
        ...order,
        items: order.items.map((item) => ({ ...item })),
        orderId: slot.orderId,
        atSec: slot.atSec - jitter,
      };
    }),
  };
}
