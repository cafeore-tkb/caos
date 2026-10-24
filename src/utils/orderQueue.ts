import type { OrderTicket, UnassignedOrder } from '../types';

export const ticketKey = (ticket: OrderTicket) => ticket.ticketUid || `${ticket.id}-${ticket.itemIndex || 1}`;

// 同じメニュー・同じ指名の1杯同士だけを、2杯の同時抽出へ統合できる（入れ直しは除く）。
export const canMergeDripUnits = (first: UnassignedOrder, second: UnassignedOrder) =>
  (first.ticketUid || first.id) !== (second.ticketUid || second.id) &&
  !first.isRebrew &&
  !second.isRebrew &&
  first.cupCount === 1 &&
  second.cupCount === 1 &&
  first.beanCode === second.beanCode &&
  first.beanName === second.beanName &&
  first.preferredBaristaId === second.preferredBaristaId;

export const orderNumber = (id: string) => Number(id.match(/\d+/)?.[0]) || Number.MAX_SAFE_INTEGER;

export const arrangeQueue = (queue: OrderTicket[], coefficient: number, nowSec: number, activateFirst = false) => {
  const existingActive = !activateFirst ? queue.find((ticket) => ticket.status === 'brewing') : undefined;
  const scheduled = queue
    .filter((ticket) => ticket !== existingActive)
    .map((ticket) => ({ ...ticket, status: 'scheduled' as const }));
  const ordered = existingActive ? [existingActive, ...scheduled] : scheduled;
  if (ordered.length === 0) return ordered;

  const shouldActivateFirst = activateFirst;
  const first = shouldActivateFirst
    ? {
        ...ordered[0],
        status: 'brewing' as const,
        startTimeSec: nowSec,
        timeRemainingSec: Math.round(ordered[0].totalDurationSec * coefficient),
      }
    : (existingActive ?? ordered[0]);
  if (!first) return [];
  const result: OrderTicket[] = [first];
  const firstEnd =
    first.status === 'brewing'
      ? Math.max(nowSec, (first.startTimeSec ?? nowSec) + first.totalDurationSec)
      : (first.startTimeSec ?? nowSec + 10) + first.totalDurationSec;
  let cursor = firstEnd;

  for (const ticket of ordered.slice(1)) {
    const startTimeSec = cursor + 15;
    result.push({ ...ticket, status: 'scheduled', startTimeSec, timeRemainingSec: undefined });
    cursor = startTimeSec + ticket.totalDurationSec;
  }
  return result;
};

export const reanchorQueueInOrder = (queue: OrderTicket[], coefficient: number, nowSec: number) => {
  if (queue.length === 0) return queue;
  const firstWasBrewing = queue[0].status === 'brewing';
  const first: OrderTicket = firstWasBrewing
    ? { ...queue[0] }
    : {
        ...queue[0],
        status: 'brewing',
        startTimeSec: nowSec,
        timeRemainingSec: Math.round(queue[0].totalDurationSec * coefficient),
      };
  const result = [first];
  let cursor = Math.max(nowSec, (first.startTimeSec ?? nowSec) + first.totalDurationSec);
  queue.slice(1).forEach((ticket) => {
    const startTimeSec = cursor + 15;
    result.push({ ...ticket, status: 'scheduled', startTimeSec, timeRemainingSec: undefined });
    cursor = startTimeSec + ticket.totalDurationSec;
  });
  return result;
};

// Seconds until the dripper has finished everything already queued, using the
// same 15-second changeover gap as the scheduler.
export const queueWaitSeconds = (queue: OrderTicket[], coefficient: number) =>
  queue.reduce(
    (sum, ticket, index) =>
      sum +
      (index === 0
        ? (ticket.timeRemainingSec ?? Math.round(ticket.totalDurationSec * coefficient))
        : ticket.totalDurationSec + 15),
    0
  );

export const splitIntoDripUnits = (orders: UnassignedOrder[]) => {
  const totalOrderCups = orders.reduce((sum, order) => sum + order.cupCount, 0);
  const units = orders.flatMap((order) => {
    const parts: UnassignedOrder[] = [];
    let remaining = order.cupCount;
    let part = 1;
    while (remaining > 0) {
      const cups = Math.min(2, remaining);
      parts.push({
        ...order,
        ticketUid: `${order.ticketUid || order.id.replace('#', '')}-part${part}`,
        cupCount: cups,
        badgeTag: `${cups}杯 ${order.badgeTag.replace(/^\d+杯\s*/, '')}`,
      });
      remaining -= cups;
      part += 1;
    }
    return parts;
  });
  return units.map((unit, index) => ({
    ...unit,
    itemIndex: index + 1,
    totalItemsInOrder: units.length,
    totalOrderCups,
  }));
};

/** Latest CaOS placement: front, queue front, or before/after a card. */
export function insertTicket(
  queue: OrderTicket[],
  ticket: OrderTicket,
  place: import('../current-caos/common').CaosPlace | undefined,
  nowSec: number
) {
  const movedCurrent = queue.find((card) => ticketKey(card) === ticketKey(ticket))?.status === 'brewing';
  const rest = queue.filter((card) => ticketKey(card) !== ticketKey(ticket));
  let index = rest.length;
  if (place === 'front') index = 0;
  else if (place === 'queueFront')
    index = Math.min(queue.some((card) => card.status === 'brewing') ? 1 : 0, rest.length);
  else if (place) {
    const key = 'beforeKey' in place ? place.beforeKey : place.afterKey;
    const found = rest.findIndex((card) => ticketKey(card) === key);
    if (found >= 0) index = found + ('afterKey' in place ? 1 : 0);
  }
  if (queue.findIndex((card) => ticketKey(card) === ticketKey(ticket)) === index) return queue;
  const starts = rest.length === 0 || (index === 0 && rest.some((card) => card.status === 'brewing'));
  const ordered = rest.map((card) =>
    starts && card.status === 'brewing'
      ? { ...card, status: 'scheduled' as const, startTimeSec: undefined, timeRemainingSec: undefined }
      : card
  );
  if (movedCurrent && index > 0 && ordered[0]) {
    ordered[0] = {
      ...ordered[0],
      status: 'brewing',
      startTimeSec: nowSec,
      timeRemainingSec: ordered[0].totalDurationSec,
    };
  }
  ordered.splice(index, 0, {
    ...ticket,
    status: starts ? 'brewing' : 'scheduled',
    startTimeSec: starts ? nowSec : undefined,
    timeRemainingSec: starts ? ticket.totalDurationSec : undefined,
  });
  return ordered;
}

export const sourceCupsOf = (card: OrderTicket | UnassignedOrder) =>
  card.sourceCups ??
  Array.from({ length: card.cupCount }, (_, index) => ({
    id: card.trainingCupIds?.[index] ?? `${card.ticketUid ?? card.id}:${index}`,
    orderId: card.sourceOrderIds?.[index] ?? card.id,
    orderedAtSec: card.orderedAtSec,
  }));

export function mergeBoardCards(
  bays: import('../types').Barista[],
  orders: UnassignedOrder[],
  firstKey: string,
  secondKey: string
) {
  const find = (key: string) =>
    orders.find((card) => (card.ticketUid ?? card.id) === key) ??
    bays.flatMap((bay) => bay.queue).find((card) => ticketKey(card) === key);
  let first = find(firstKey);
  let second = find(secondKey);
  if (first && 'status' in first && first.status === 'brewing') [first, second] = [second, first];
  if (
    !first ||
    !second ||
    first === second ||
    first.cupCount !== 1 ||
    second.cupCount !== 1 ||
    first.beanName !== second.beanName ||
    Boolean(first.isRebrew) !== Boolean(second.isRebrew) ||
    (first.preferredBaristaId && second.preferredBaristaId && first.preferredBaristaId !== second.preferredBaristaId)
  )
    return null;
  const targetBay = bays.find((bay) => bay.queue.some((card) => ticketKey(card) === (second.ticketUid ?? second.id)));
  const nominee = first.preferredBaristaId ?? second.preferredBaristaId;
  if (targetBay && nominee && nominee !== targetBay.id) return null;
  const sourceOrderIds = [
    ...new Set([...(first.sourceOrderIds ?? [first.id]), ...(second.sourceOrderIds ?? [second.id])]),
  ].sort((a, b) => orderNumber(a) - orderNumber(b));
  const merged = {
    ...second,
    id: sourceOrderIds.join('+'),
    cupCount: 2,
    preferredBaristaId: nominee,
    sourceOrderIds,
    trainingCupIds: [...(second.trainingCupIds ?? []), ...(first.trainingCupIds ?? [])],
    sourceCups: [...sourceCupsOf(second), ...sourceCupsOf(first)],
    ...('totalDurationSec' in second ? { totalDurationSec: 360 } : { badgeTag: '2杯 統合' }),
  };
  const remove = (card: { ticketUid?: string; id: string }) =>
    (card.ticketUid ?? card.id) !== (first.ticketUid ?? first.id);
  return {
    bays: bays.map((bay) => ({
      ...bay,
      queue: bay.queue
        .filter(remove)
        .map((card) => (ticketKey(card) === (second.ticketUid ?? second.id) ? (merged as OrderTicket) : card)),
    })),
    orders: orders
      .filter(remove)
      .map((card) =>
        (card.ticketUid ?? card.id) === (second.ticketUid ?? second.id) ? (merged as UnassignedOrder) : card
      ),
    merged,
    targetBay,
    joinedIds: first.trainingCupIds ?? [],
  };
}
