import type { BoardComment } from '../current-caos/logic/comments';
import type { GameState } from './engine';

/** Only comments for arrived orders enter the board; ids match each original order after merging. */
export function trainingComments(state: GameState, originMs: number): BoardComment[] {
  return state.scenario.orders
    .filter((order) => state.arrived.includes(order.orderId))
    .flatMap((order) =>
      (order.comments ?? []).map((text) => ({
        orderId: `#${String(order.orderId).padStart(3, '0')}`,
        orderNo: order.orderId,
        author: 'cashier' as const,
        text,
        createdAt: new Date(originMs + order.atSec * 1000),
      }))
    );
}
