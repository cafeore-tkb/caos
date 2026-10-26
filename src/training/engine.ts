import { type CaosPlace, caosBrewSec } from '../current-caos/common';
import type { Barista, OrderTicket, UnassignedOrder } from '../types';
import { insertTicket, mergeBoardCards } from '../utils/orderQueue';
import { itemAbbr, itemCode, itemPrice, itemType, masterItem, needsBrew, seniorOnly } from './master';

export type GameMode = 'fast' | 'middle' | 'full';
export const MODES = {
  fast: {
    label: 'ファスト',
    durationSec: 600,
    count: 6,
    emergencyChances: 0,
    description: '少量の注文で基本操作。',
    target: '基本操作',
  },
  middle: {
    label: 'ミドル',
    durationSec: 1200,
    count: 12,
    emergencyChances: 1,
    description: '指名・限定豆を並行して対応。',
    target: '並行判断',
  },
  full: {
    label: 'フル',
    durationSec: 1800,
    count: 20,
    emergencyChances: 2,
    description: '混雑・緊急対応まで総合練習。',
    target: '店舗運営',
  },
} as const;
export interface ScenarioOrder {
  orderId: number;
  atSec: number;
  comments?: string[];
  items: { name: string; quantity: number; nominee?: number }[];
}
export interface Scenario {
  schemaVersion: 1;
  kind: 'synthetic';
  mode: GameMode;
  title: string;
  durationSec: number;
  orders: ScenarioOrder[];
}
export interface CupResult {
  id: string;
  orderId: number;
  name: string;
  arrivedSec: number;
  nominee?: number;
  completedSec?: number;
  brewRatio?: number;
  joinedAtSec?: number;
  completedBayId?: number;
  completedBatch?: string;
  mergedWith?: string;
  iceDecision?: { opportunity: boolean; senior: boolean };
}
export interface GameEvent {
  id: number;
  atSec: number;
  kind: string;
  message: string;
}
export interface EmergencyTrial {
  id: number;
  cupId: string | null;
  willOccur: boolean;
  status: 'armed' | 'skipped' | 'pending' | 'rebrewing' | 'resolved';
  sourceKey?: string;
  triggeredAtSec?: number;
  resolvedAtSec?: number;
}
export interface GameState {
  randomSeed: number;
  emergencies: EmergencyTrial[];
  scenario: Scenario;
  nowSec: number;
  status: 'active' | 'finished';
  paused: boolean;
  bays: Barista[];
  unassigned: UnassignedOrder[];
  cups: Record<string, CupResult>;
  arrived: number[];
  events: GameEvent[];
  violations: number;
  notice: string;
}
export type GameAction =
  | { type: 'tick'; seconds: number }
  | { type: 'pause' }
  | { type: 'set-lane'; bayId: number; name: string; senior: boolean }
  | { type: 'swap-lanes'; first: number; second: number }
  | { type: 'finish' }
  | { type: 'assign'; key: string; bayId: number; place?: CaosPlace }
  | { type: 'complete'; bayId: number }
  | { type: 'start'; bayId: number }
  | { type: 'unstart'; bayId: number }
  | { type: 'split'; key: string; cupId: string }
  | { type: 'discard'; key: string; cupIds: string[] }
  | { type: 'rebrew-cups'; cupIds: string[]; reason: string }
  | { type: 'cancel-emergency'; key: string }
  | {
      type: 'rebrew';
      key: string;
      cupCount: number;
      cupIds?: string[];
      bayId: number | null;
      interrupt: boolean;
      reason: string;
      incidentId?: number;
    }
  | { type: 'move'; key: string; bayId: number; place?: CaosPlace }
  | { type: 'return'; key: string }
  | { type: 'merge'; first: string; second: string };

export function parseScenario(input: unknown): Scenario {
  if (!input || typeof input !== 'object') throw new Error('シナリオの形式が違います');
  const value = input as Scenario;
  if (
    value.schemaVersion !== 1 ||
    value.kind !== 'synthetic' ||
    !Object.hasOwn(MODES, value.mode) ||
    !Number.isInteger(value.durationSec) ||
    value.durationSec !== MODES[value.mode].durationSec ||
    typeof value.title !== 'string' ||
    !Array.isArray(value.orders) ||
    value.orders.length === 0 ||
    value.orders.length > 200
  ) {
    throw new Error('モード・時間・注文数を確認してください');
  }
  const seen = new Set<number>();
  for (const order of value.orders) {
    if (
      !Number.isInteger(order.orderId) ||
      order.orderId < 1 ||
      order.orderId > 9999 ||
      seen.has(order.orderId) ||
      !Number.isInteger(order.atSec) ||
      order.atSec < 0 ||
      order.atSec > value.durationSec - 390 ||
      !Array.isArray(order.items) ||
      order.items.length < 1 ||
      order.items.length > 12
    )
      throw new Error('注文番号・到着時刻が不正です（最後の6分30秒は仕上げ時間です）');
    if (
      order.comments !== undefined &&
      (!Array.isArray(order.comments) ||
        order.comments.length > 3 ||
        order.comments.some(
          (comment) => typeof comment !== 'string' || comment.trim().length === 0 || comment.length > 200
        ))
    )
      throw new Error('コメントは1件200文字以内、1注文3件までにしてください');
    seen.add(order.orderId);
    for (const item of order.items) {
      if (
        !masterItem(item.name) ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 6 ||
        (item.nominee !== undefined && (!Number.isInteger(item.nominee) || item.nominee < 1 || item.nominee > 6)) ||
        (seniorOnly(item.name) && item.nominee !== undefined && ![1, 6].includes(item.nominee))
      )
        throw new Error('商品・数量・指名を確認してください');
    }
  }
  if (!value.orders.some((order) => order.items.some((item) => needsBrew(item.name))))
    throw new Error('抽出が必要な注文を1件以上含めてください');
  // Copy and sort: imported order never controls arrival order or mutates the caller.
  return {
    ...value,
    orders: value.orders
      .map((order) => ({
        ...order,
        ...(order.comments ? { comments: order.comments.map((comment) => comment.trim()) } : {}),
        items: order.items.map((item) => ({ ...item })),
      }))
      .sort((a, b) => a.atSec - b.atSec || a.orderId - b.orderId),
  };
}

export const freshBays = (): Barista[] =>
  Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    bayNumber: index + 1,
    name: `担当${String.fromCharCode(65 + index)}`,
    canHandleSpecial: index === 0 || index === 5,
    coefficient: 1,
    coefficientColor: 'blue',
    status: 'standby',
    remainingStr: '空き',
    iconType: 'cup',
    queue: [],
    pastTickets: [],
  }));
const keyOf = (card: { ticketUid?: string; id: string }) => card.ticketUid ?? card.id;
export const brewDuration = (_name: string, cups: number) => caosBrewSec(cups);
export const allowedBay = (card: { preferredBaristaId?: number; beanName: string }, bay: Barista) =>
  (!card.preferredBaristaId || card.preferredBaristaId === bay.id) &&
  (!seniorOnly(card.beanName) || bay.canHandleSpecial === true);

function arrive(state: GameState): GameState {
  const incoming = state.scenario.orders.filter(
    (order) => order.atSec <= state.nowSec && !state.arrived.includes(order.orderId)
  );
  if (incoming.length === 0) return state;
  const cards: UnassignedOrder[] = [];
  for (const order of incoming) {
    const dripItems = order.items.filter((item) => needsBrew(item.name));
    const total = dripItems.reduce((sum, item) => sum + item.quantity, 0);
    const parts = dripItems.flatMap((item, itemIndex) => {
      const units: UnassignedOrder[] = [];
      for (let offset = 0; offset < item.quantity; offset += 2) {
        const count = Math.min(2, item.quantity - offset);
        units.push({
          orderedAtSec: order.atSec,
          id: `#${String(order.orderId).padStart(3, '0')}`,
          ticketUid: `game-${order.orderId}-${itemIndex}-${offset}`,
          beanName: item.name,
          beanCode: itemCode(item.name),
          cupCount: count,
          trainingCupIds: Array.from({ length: count }, (_, i) => `${order.orderId}:${itemIndex}:${offset + i}`),
          sourceCups: Array.from({ length: count }, (_, i) => ({
            id: `${order.orderId}:${itemIndex}:${offset + i}`,
            orderId: `#${String(order.orderId).padStart(3, '0')}`,
            orderedAtSec: order.atSec,
          })),
          preferredBaristaId: item.nominee,
          totalOrderCups: total,
          badgeTag: `${count}杯`,
          predictedTimeStr: `${brewDuration(item.name, count)}秒`,
          recommendedBaristas: '条件に合う担当者',
          recommendedBayIds: item.nominee ? [item.nominee] : seniorOnly(item.name) ? [1, 6] : [1, 2, 3, 4, 5, 6],
          cardColor: 'blue',
          orderNotes: order.items.map((entry) => `${itemAbbr(entry.name)} ${entry.quantity}`).join(' / '),
        });
      }
      return units;
    });
    cards.push(...parts.map((card, index) => ({ ...card, itemIndex: index + 1, totalItemsInOrder: parts.length })));
  }
  return {
    ...state,
    unassigned: [...state.unassigned, ...cards],
    arrived: [...state.arrived, ...incoming.map((o) => o.orderId)],
  };
}
export function startGame(input: Scenario, seed = 1): GameState {
  const scenario = parseScenario(input);
  const cups: Record<string, CupResult> = {};
  for (const order of scenario.orders) {
    order.items
      .filter((item) => needsBrew(item.name))
      .forEach((item, index) => {
        for (let i = 0; i < item.quantity; i++) {
          const id = `${order.orderId}:${index}:${i}`;
          cups[id] = { id, orderId: order.orderId, name: item.name, arrivedSec: order.atSec, nominee: item.nominee };
        }
      });
  }
  let randomState = seed >>> 0;
  const random = () => {
    // Mulberry32: draw once per opportunity, outside the tick reducer; record the seed for replay.
    randomState += 0x6d2b79f5;
    let value = randomState;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const candidates = Object.keys(cups);
  const chanceCount = MODES[scenario.mode].emergencyChances;
  const used = new Set<string>();
  const emergencies: EmergencyTrial[] = Array.from({ length: chanceCount }, (_, index) => {
    const draw = random();
    const preferred = Math.max(0, Math.ceil((candidates.length * (index + 1)) / (chanceCount + 2)) - 1);
    const cupId =
      [...candidates.slice(preferred), ...candidates.slice(0, preferred)].find((id) => !used.has(id)) ?? null;
    if (cupId) used.add(cupId);
    const willOccur = cupId !== null && draw < 0.5;
    return { id: index + 1, cupId, willOccur, status: willOccur ? 'armed' : 'skipped' };
  });
  return arrive({
    randomSeed: seed >>> 0,
    emergencies,
    scenario,
    nowSec: 0,
    status: 'active',
    paused: false,
    bays: freshBays(),
    unassigned: [],
    cups,
    arrived: [],
    events: [],
    violations: 0,
    notice: '',
  });
}
const withEvent = (state: GameState, kind: string, message: string): GameState => ({
  ...state,
  notice: message,
  events: [...state.events, { id: state.events.length, atSec: state.nowSec, kind, message }],
});
const rejected = (state: GameState, message: string) =>
  withEvent({ ...state, violations: state.violations + 1 }, 'rejected', message);
function schedule(bay: Barista, nowSec: number, startFirst = false): Barista {
  let cursor = nowSec;
  const queue = bay.queue.map((ticket, index) => {
    const brewing = index === 0 && (startFirst || ticket.status === 'brewing');
    const start = brewing
      ? ticket.status === 'brewing'
        ? (ticket.startTimeSec ?? nowSec)
        : nowSec
      : cursor + (index === 0 ? 10 : 15);
    cursor = Math.max(nowSec, start + ticket.totalDurationSec);
    return {
      ...ticket,
      status: brewing ? ('brewing' as const) : ('scheduled' as const),
      startTimeSec: start,
      timeRemainingSec: brewing ? Math.max(0, start + ticket.totalDurationSec - nowSec) : undefined,
    };
  });
  return { ...bay, queue, status: queue.some((ticket) => ticket.status === 'brewing') ? 'brewing' : 'standby' };
}
const toUnassigned = (ticket: OrderTicket | UnassignedOrder): UnassignedOrder => ({
  ...ticket,
  badgeTag: `${ticket.cupCount}杯`,
  predictedTimeStr: `${'totalDurationSec' in ticket ? ticket.totalDurationSec : brewDuration(ticket.beanName, ticket.cupCount)}秒`,
  recommendedBaristas: '条件に合う担当者',
  recommendedBayIds: ticket.preferredBaristaId ? [ticket.preferredBaristaId] : [1, 2, 3, 4, 5, 6],
  cardColor: 'blue',
});

function advanceEmergencies(state: GameState, previousSec: number): GameState {
  const due = state.emergencies
    .filter((trial) => trial.status === 'armed')
    .flatMap((trial) => {
      const ticket = state.bays
        .flatMap((bay) => bay.queue)
        .find((card) => card.status === 'brewing' && trial.cupId && card.trainingCupIds?.includes(trial.cupId));
      if (!ticket) return [];
      const atSec = Math.max(
        previousSec,
        Math.ceil(
          Math.max(ticket.startTimeSec ?? state.nowSec, state.cups[trial.cupId ?? '']?.joinedAtSec ?? 0) +
            ticket.totalDurationSec * 0.75
        )
      );
      return state.nowSec >= atSec ? [{ trial, ticket, atSec }] : [];
    })
    .sort((a, b) => a.atSec - b.atSec || a.trial.id - b.trial.id);
  let next = state;
  for (const { trial, ticket, atSec } of due) {
    next = withEvent(
      {
        ...next,
        emergencies: next.emergencies.map((entry) =>
          entry.id === trial.id
            ? { ...entry, status: 'pending', sourceKey: keyOf(ticket), triggeredAtSec: atSec }
            : entry
        ),
      },
      'emergency',
      `${ticket.id} 緊急淹れ直しが必要です。カップを選んで手配してください`
    );
    next.events[next.events.length - 1] = { ...next.events[next.events.length - 1], atSec };
  }
  return next;
}
const pendingFor = (state: GameState, ticket: OrderTicket | UnassignedOrder) =>
  state.emergencies.some(
    (trial) => trial.status === 'pending' && trial.cupId && ticket.trainingCupIds?.includes(trial.cupId)
  );

export function gameReducer(state: GameState, action: GameAction): GameState {
  if (state.status === 'finished') return state;
  if (action.type === 'finish')
    return withEvent({ ...state, status: 'finished', paused: false }, 'finish', '採点しました');
  if (action.type === 'pause') return { ...state, paused: !state.paused };
  if (state.paused) return state;
  if (action.type === 'set-lane')
    return withEvent(
      {
        ...state,
        bays: state.bays.map((bay) =>
          bay.id === action.bayId
            ? { ...bay, name: action.name.trim().slice(0, 40), canHandleSpecial: action.senior }
            : bay
        ),
      },
      'shift',
      '担当者を交代しました'
    );
  if (action.type === 'swap-lanes') {
    const first = state.bays.find((bay) => bay.id === action.first),
      second = state.bays.find((bay) => bay.id === action.second);
    if (!first || !second || first === second) return state;
    return withEvent(
      {
        ...state,
        bays: state.bays.map((bay) =>
          bay === first
            ? { ...bay, name: second.name, canHandleSpecial: second.canHandleSpecial }
            : bay === second
              ? { ...bay, name: first.name, canHandleSpecial: first.canHandleSpecial }
              : bay
        ),
      },
      'shift',
      '担当者を入れ替えました'
    );
  }
  if (action.type === 'tick') {
    if (!Number.isFinite(action.seconds) || action.seconds <= 0) return state;
    const nowSec = Math.min(state.scenario.durationSec, state.nowSec + Math.floor(action.seconds));
    const next = advanceEmergencies(
      arrive({ ...state, nowSec, bays: state.bays.map((bay) => schedule(bay, nowSec)) }),
      state.nowSec
    );
    return nowSec >= state.scenario.durationSec
      ? withEvent({ ...next, status: 'finished' }, 'finish', '制限時間に達しました')
      : next;
  }
  if (action.type === 'assign') {
    const order = state.unassigned.find((card) => keyOf(card) === action.key);
    const bay = state.bays.find((entry) => entry.id === action.bayId);
    if (!order || !bay) return state;
    if (!allowedBay(order, bay)) return rejected(state, '指名・上級生のみの条件を確認してください');
    const ticket: OrderTicket = {
      ...order,
      status: 'scheduled',
      totalDurationSec: brewDuration(order.beanName, order.cupCount),
    };
    return withEvent(
      {
        ...state,
        cups: recordIceDecision(state, order, bay),
        unassigned: state.unassigned.filter((card) => keyOf(card) !== action.key),
        bays: state.bays.map((entry) =>
          entry.id === bay.id
            ? schedule({ ...entry, queue: insertTicket(entry.queue, ticket, action.place, state.nowSec) }, state.nowSec)
            : entry
        ),
      },
      'assign',
      `${order.id} ${itemAbbr(order.beanName)} → ${bay.id}番`
    );
  }
  if (action.type === 'start' || action.type === 'unstart') {
    const bay = state.bays.find((entry) => entry.id === action.bayId);
    const ticket = bay?.queue[0];
    if (!ticket || !bay) return state;
    if (action.type === 'start' && ticket.status === 'brewing') return state;
    if (
      action.type === 'unstart' &&
      (ticket.status !== 'brewing' || state.nowSec - (ticket.startTimeSec ?? state.nowSec) >= 60)
    )
      return state;
    const updated =
      action.type === 'start'
        ? schedule(bay, state.nowSec, true)
        : schedule(
            {
              ...bay,
              queue: bay.queue.map((card, index) =>
                index === 0
                  ? { ...card, status: 'scheduled', startTimeSec: undefined, timeRemainingSec: undefined }
                  : card
              ),
            },
            state.nowSec
          );
    return withEvent(
      { ...state, bays: state.bays.map((entry) => (entry.id === bay.id ? updated : entry)) },
      action.type,
      `${ticket.id} ${action.type === 'start' ? '抽出を開始' : '未着手に戻す'}`
    );
  }
  if (action.type === 'rebrew-cups') {
    const sources = [...state.unassigned, ...state.bays.flatMap((bay) => [...bay.queue, ...(bay.pastTickets ?? [])])];
    if (
      !action.cupIds.length ||
      new Set(action.cupIds).size !== action.cupIds.length ||
      action.cupIds.some((id) => !sources.some((card) => card.trainingCupIds?.includes(id)))
    )
      return state;
    let next = state;
    for (const source of sources) {
      const cupIds = action.cupIds.filter((id) => source.trainingCupIds?.includes(id));
      if (cupIds.length)
        next = gameReducer(next, {
          type: 'rebrew',
          key: keyOf(source),
          cupCount: cupIds.length,
          cupIds,
          bayId: null,
          interrupt: false,
          reason: action.reason,
        });
    }
    return next;
  }
  if (action.type === 'cancel-emergency') {
    const remake = [...state.unassigned, ...state.bays.flatMap((bay) => bay.queue)].find(
      (card) => keyOf(card) === action.key
    );
    if (
      !remake?.isRebrew ||
      (!state.unassigned.includes(remake as UnassignedOrder) && 'status' in remake && remake.status !== 'scheduled')
    )
      return state;
    const ids = remake.trainingCupIds ?? [];
    const original = [
      ...state.unassigned,
      ...state.bays.flatMap((bay) => [...bay.queue, ...(bay.pastTickets ?? [])]),
    ].find((card) => keyOf(card) === remake.rebrewOfTicketUid);
    const recoveredIds = ids.filter((id) => !original || original.discardedCupIds?.includes(id));
    const restoredIds = ids.filter((id) => !recoveredIds.includes(id));
    const recovered: UnassignedOrder | null = !recoveredIds.length
      ? null
      : {
          ...toUnassigned(remake),
          ticketUid: `cancelled-${action.key}-${state.events.length}`,
          isRebrew: false,
          rebrewReason: undefined,
          rebrewOfTicketUid: undefined,
          discardedCupIds: undefined,
          trainingCupIds: recoveredIds,
          sourceCups: remake.sourceCups?.filter((cup) => recoveredIds.includes(cup.id)),
          cupCount: recoveredIds.length,
        };
    const restore = <T extends OrderTicket | UnassignedOrder>(card: T): T => {
      if (keyOf(card) !== remake.rebrewOfTicketUid || !restoredIds.length) return card;
      const sourceCups = [
        ...new Map(
          [...(card.sourceCups ?? []), ...(remake.sourceCups?.filter((cup) => restoredIds.includes(cup.id)) ?? [])].map(
            (cup) => [cup.id, cup]
          )
        ).values(),
      ];
      return {
        ...card,
        trainingCupIds: [...new Set([...(card.trainingCupIds ?? []), ...restoredIds])],
        sourceCups,
        cupCount: sourceCups.length || card.cupCount,
        isInterrupted: false,
      };
    };
    const cups = { ...state.cups };
    const bays = state.bays.map((bay) => {
      const pastTickets = (bay.pastTickets ?? []).map((card) => {
        const restored = restore(card);
        if (restored !== card)
          for (const id of restoredIds)
            cups[id] = {
              ...cups[id],
              completedSec: card.completedAtSec,
              brewRatio:
                ((card.completedAtSec ?? state.nowSec) - (card.startTimeSec ?? state.nowSec)) / card.totalDurationSec,
            };
        return restored;
      });
      return schedule(
        { ...bay, pastTickets, queue: bay.queue.filter((card) => keyOf(card) !== action.key).map(restore) },
        state.nowSec
      );
    });
    return withEvent(
      {
        ...state,
        cups,
        bays,
        unassigned: [
          ...state.unassigned.filter((card) => keyOf(card) !== action.key).map(restore),
          ...(recovered ? [recovered] : []),
        ],
        emergencies: state.emergencies.map((trial) =>
          trial.status === 'rebrewing' && trial.sourceKey === action.key
            ? {
                ...trial,
                status: 'pending',
                sourceKey:
                  trial.cupId && recoveredIds.includes(trial.cupId) ? recovered?.ticketUid : remake.rebrewOfTicketUid,
              }
            : trial
        ),
      },
      'cancel-emergency',
      `${remake.id} 淹れ直しを取り消し`
    );
  }
  if (action.type === 'rebrew') {
    const source = [
      ...state.unassigned,
      ...state.bays.flatMap((bay) => [...bay.queue, ...(bay.pastTickets ?? [])]),
    ].find((card) => keyOf(card) === action.key);
    if (!source || !Number.isInteger(action.cupCount) || action.cupCount < 1 || action.cupCount > source.cupCount)
      return state;
    const target = state.bays.find((bay) => bay.id === action.bayId);
    if (action.bayId !== null && (!target || !allowedBay(source, target)))
      return rejected(state, '指名・上級生のみの条件を確認してください');
    const incident = state.emergencies.find(
      (trial) =>
        trial.status === 'pending' &&
        (action.incidentId === undefined || trial.id === action.incidentId) &&
        trial.cupId &&
        source.trainingCupIds?.includes(trial.cupId)
    );
    if (action.incidentId !== undefined && !incident) return state;
    const originalIds = source.trainingCupIds ?? [];
    const ids =
      action.cupIds ??
      (incident?.cupId ? [incident.cupId, ...originalIds.filter((id) => id !== incident.cupId)] : originalIds).slice(
        0,
        action.cupCount
      );
    if (new Set(ids).size !== ids.length || ids.some((id) => !originalIds.includes(id))) return state;
    const remaining = originalIds.filter((id) => !ids.includes(id));
    if (ids.length !== action.cupCount) return state;
    const cups = { ...state.cups };
    for (const id of ids)
      cups[id] = { ...cups[id], completedSec: undefined, brewRatio: undefined, joinedAtSec: undefined };
    const remake: UnassignedOrder = {
      ...toUnassigned(source),
      ticketUid: `rebrew-${source.ticketUid}-${state.events.length}`,
      trainingCupIds: ids,
      sourceCups: source.sourceCups?.filter((cup) => ids.includes(cup.id)),
      cupCount: action.cupCount,
      isRebrew: true,
      rebrewReason: action.reason.trim().slice(0, 100),
      rebrewOfTicketUid: source.ticketUid,
      orderedAtSec: state.nowSec,
      badgeTag: `${action.cupCount}杯 淹れ直し`,
    };
    const returned: UnassignedOrder[] = [];
    const bays = state.bays.map((bay) => {
      const sourceHere = bay.queue.find((card) => keyOf(card) === action.key);
      if (sourceHere && action.interrupt && remaining.length)
        returned.push({
          ...toUnassigned(source),
          ticketUid: `recovered-${source.ticketUid}-${state.events.length}`,
          trainingCupIds: remaining,
          sourceCups: source.sourceCups?.filter((cup) => remaining.includes(cup.id)),
          cupCount: remaining.length,
          badgeTag: `${remaining.length}杯 中断後の再割当`,
        });
      let queue = bay.queue.flatMap((card) =>
        keyOf(card) !== action.key
          ? [card]
          : action.interrupt
            ? []
            : [
                {
                  ...card,
                  trainingCupIds: remaining,
                  sourceCups: card.sourceCups,
                  cupCount: card.cupCount,
                  totalDurationSec: card.totalDurationSec,
                },
              ]
      );
      if (bay.id === target?.id)
        queue = insertTicket(
          queue,
          { ...remake, status: 'scheduled', totalDurationSec: brewDuration(remake.beanName, remake.cupCount) },
          undefined,
          state.nowSec
        );
      return schedule(
        {
          ...bay,
          queue,
          pastTickets: [
            ...(sourceHere && action.interrupt
              ? [
                  {
                    ...sourceHere,
                    status: 'completed' as const,
                    completedAtSec: state.nowSec,
                    isInterrupted: true,
                    trainingCupIds: [],
                  },
                ]
              : []),
            ...(bay.pastTickets ?? []).map((card) =>
              keyOf(card) === action.key
                ? {
                    ...card,
                    trainingCupIds: (card.trainingCupIds ?? []).filter((id) => !ids.includes(id)),
                    sourceCups: card.sourceCups?.filter((cup) => !ids.includes(cup.id)),
                    cupCount: remaining.length,
                    isInterrupted: remaining.length === 0,
                  }
                : card
            ),
          ],
        },
        state.nowSec
      );
    });
    return withEvent(
      {
        ...state,
        cups,
        bays,
        emergencies: state.emergencies.map((trial) =>
          trial.status === 'pending' && trial.cupId && ids.includes(trial.cupId)
            ? { ...trial, status: 'rebrewing', sourceKey: remake.ticketUid }
            : trial.status === 'pending' &&
                trial.cupId &&
                returned.some((card) => card.trainingCupIds?.includes(trial.cupId ?? ''))
              ? {
                  ...trial,
                  sourceKey: returned.find((card) => card.trainingCupIds?.includes(trial.cupId ?? ''))?.ticketUid,
                }
              : trial
        ),
        unassigned: [
          ...(target ? [] : [remake]),
          ...state.unassigned.map((card) =>
            keyOf(card) === action.key ? { ...card, trainingCupIds: remaining } : card
          ),
          ...returned,
        ],
      },
      'rebrew',
      `${source.id} ${action.cupCount}杯 淹れ直し：${action.reason}`
    );
  }
  if (action.type === 'split') {
    const card =
      state.unassigned.find((entry) => keyOf(entry) === action.key) ??
      state.bays
        .flatMap((bay) => bay.queue)
        .find((entry) => keyOf(entry) === action.key && entry.status === 'scheduled');
    if (card?.cupCount !== 2 || !card.trainingCupIds?.includes(action.cupId)) return state;
    const parts = card.trainingCupIds.map((id) => ({
      ...toUnassigned(card as OrderTicket),
      id: `#${String(state.cups[id].orderId).padStart(3, '0')}`,
      ticketUid: `split-${id}`,
      sourceOrderIds: undefined,
      cupCount: 1,
      trainingCupIds: [id],
      sourceCups: card.sourceCups?.filter((cup) => cup.id === id),
      badgeTag: '1杯',
    }));
    return withEvent(
      {
        ...state,
        bays: state.bays.map((bay) =>
          schedule(
            {
              ...bay,
              queue: bay.queue.map((entry) =>
                entry !== card
                  ? entry
                  : {
                      ...entry,
                      cupCount: 1,
                      trainingCupIds: entry.trainingCupIds?.filter((id) => id !== action.cupId),
                      sourceCups: entry.sourceCups?.filter((cup) => cup.id !== action.cupId),
                      totalDurationSec: brewDuration(entry.beanName, 1),
                    }
              ),
            },
            state.nowSec
          )
        ),
        unassigned: [
          ...state.unassigned.filter((entry) => entry !== card),
          ...('status' in card ? parts.filter((part) => part.trainingCupIds.includes(action.cupId)) : parts),
        ],
      },
      'split',
      `${card.id}を1杯ずつに分離`
    );
  }
  if (action.type === 'discard') {
    const source = state.bays.flatMap((bay) => bay.queue).find((card) => keyOf(card) === action.key);
    const remakes = [
      ...state.unassigned,
      ...state.bays.flatMap((bay) => [...bay.queue, ...(bay.pastTickets ?? [])]),
    ].filter((card) => card.isRebrew && card.rebrewOfTicketUid === action.key);
    if (
      !source ||
      !action.cupIds.length ||
      new Set(action.cupIds).size !== action.cupIds.length ||
      action.cupIds.some(
        (id) =>
          source.trainingCupIds?.includes(id) ||
          !source.sourceCups?.some((cup) => cup.id === id) ||
          !remakes.some((card) => card.sourceCups?.some((cup) => cup.id === id))
      )
    )
      return state;
    const remaining = source.sourceCups?.filter((cup) => !action.cupIds.includes(cup.id)) ?? [];
    return withEvent(
      {
        ...state,
        bays: state.bays.map((bay) =>
          schedule(
            {
              ...bay,
              queue: bay.queue.flatMap((card) =>
                keyOf(card) !== action.key
                  ? [card]
                  : remaining.length
                    ? [
                        {
                          ...card,
                          cupCount: remaining.length,
                          sourceCups: remaining,
                          discardedCupIds: [...new Set([...(card.discardedCupIds ?? []), ...action.cupIds])],
                          totalDurationSec: brewDuration(card.beanName, remaining.length),
                        },
                      ]
                    : []
              ),
              pastTickets: [
                ...(bay.pastTickets ?? []),
                ...(!remaining.length && bay.queue.includes(source)
                  ? [
                      {
                        ...source,
                        status: 'completed' as const,
                        completedAtSec: state.nowSec,
                        isInterrupted: true,
                        discardedCupIds: [...new Set([...(source.discardedCupIds ?? []), ...action.cupIds])],
                        trainingCupIds: [],
                      },
                    ]
                  : []),
              ],
            },
            state.nowSec
          )
        ),
      },
      'discard',
      `${source.id} 淹れ直し登録済みの元抽出 ${action.cupIds.length}杯を破棄`
    );
  }
  if (action.type === 'complete') {
    const bay = state.bays.find((entry) => entry.id === action.bayId);
    const ticket = bay?.queue[0];
    if (!bay || !ticket || ticket.status !== 'brewing' || state.nowSec - (ticket.startTimeSec ?? state.nowSec) < 60)
      return state;
    if (pendingFor(state, ticket)) return withEvent(state, 'notice', 'この注文の緊急淹れ直しを先に手配してください');
    const ratio = (state.nowSec - (ticket.startTimeSec ?? state.nowSec)) / ticket.totalDurationSec;
    const cups = { ...state.cups };
    for (const id of ticket.trainingCupIds ?? [])
      cups[id] = {
        ...cups[id],
        completedSec: state.nowSec,
        completedBayId: bay.id,
        completedBatch: `${bay.id}:${state.nowSec}:${[...(ticket.trainingCupIds ?? [])].sort().join(',')}`,
        brewRatio:
          (state.nowSec - Math.max(ticket.startTimeSec ?? state.nowSec, cups[id].joinedAtSec ?? 0)) /
          ticket.totalDurationSec,
      };
    return withEvent(
      {
        ...state,
        cups,
        emergencies: state.emergencies.map((trial) =>
          trial.status === 'rebrewing' && trial.cupId && ticket.trainingCupIds?.includes(trial.cupId)
            ? (cups[trial.cupId].brewRatio ?? 0) >= 0.9
              ? { ...trial, status: 'resolved', resolvedAtSec: state.nowSec }
              : { ...trial, status: 'pending', sourceKey: keyOf(ticket) }
            : trial
        ),
        bays: state.bays.map((entry) =>
          entry.id === bay.id
            ? schedule(
                {
                  ...entry,
                  queue: entry.queue.slice(1),
                  pastTickets: [
                    ...(entry.pastTickets ?? []),
                    { ...ticket, status: 'completed', completedAtSec: state.nowSec, endTimeSec: state.nowSec },
                  ],
                },
                state.nowSec,
                true
              )
            : entry
        ),
      },
      ratio < 0.9 ? 'early' : 'complete',
      `${ticket.id} ${ticket.cupCount}杯 完了${ratio < 0.9 ? '（抽出が短すぎます：品質点に反映）' : ''}`
    );
  }
  if (action.type === 'move' || action.type === 'return') {
    const ticket = state.bays.flatMap((bay) => bay.queue).find((card) => keyOf(card) === action.key);
    if (!ticket) return state;
    if (pendingFor(state, ticket)) return withEvent(state, 'notice', 'この注文の緊急淹れ直しを先に手配してください');
    const target = action.type === 'move' ? state.bays.find((bay) => bay.id === action.bayId) : undefined;
    if (action.type === 'move' && (!target || !allowedBay(ticket, target)))
      return rejected(state, '指名・上級生のみの条件を確認してください');
    const from = state.bays.find((bay) => bay.queue.includes(ticket));
    if (target?.id === from?.id && action.type === 'move' && !action.place) return state;
    const bays = state.bays.map((bay) =>
      schedule(
        {
          ...bay,
          queue:
            bay.id === target?.id
              ? insertTicket(
                  bay.queue,
                  { ...ticket, status: 'scheduled', startTimeSec: undefined, timeRemainingSec: undefined },
                  action.type === 'move' ? action.place : undefined,
                  state.nowSec
                )
              : bay.queue.filter((card) => keyOf(card) !== action.key),
        },
        state.nowSec
      )
    );
    return withEvent(
      {
        ...state,
        bays,
        cups: target ? recordIceDecision(state, ticket, target) : state.cups,
        unassigned: action.type === 'return' ? [...state.unassigned, toUnassigned(ticket)] : state.unassigned,
      },
      action.type,
      `${ticket.id} ${target ? `${target.id}番へ移動` : '未割当に戻す'}${ticket.status === 'brewing' ? '（抽出時間をリセット）' : ''}`
    );
  }
  const result = mergeBoardCards(state.bays, state.unassigned, action.first, action.second);
  if (!result) return state;
  if (pendingFor(state, result.merged)) return withEvent(state, 'notice', '緊急淹れ直しの手配前には統合できません');
  if (result.targetBay && !allowedBay(result.merged, result.targetBay))
    return rejected(state, '指名・上級生のみの条件を確認してください');
  const cups = result.targetBay ? recordIceDecision(state, result.merged, result.targetBay) : { ...state.cups };
  const mergedIds = result.merged.trainingCupIds ?? [];
  for (const id of mergedIds) cups[id] = { ...cups[id], mergedWith: mergedIds.find((other) => other !== id) };
  if ('status' in result.merged && result.merged.status === 'brewing')
    for (const id of result.joinedIds) cups[id] = { ...cups[id], joinedAtSec: state.nowSec };
  return withEvent(
    { ...state, cups, bays: result.bays.map((bay) => schedule(bay, state.nowSec)), unassigned: result.orders },
    'merge',
    `${result.merged.id}を2杯抽出に統合`
  );
}

// Judge the available alternatives at dispatch time. A nominated cup has no choice.
function recordIceDecision(state: GameState, card: UnassignedOrder | OrderTicket, target: Barista) {
  const cups = { ...state.cups };
  const wait = (bay: Barista) =>
    bay.queue
      .filter((ticket) => keyOf(ticket) !== keyOf(card))
      .reduce(
        (sum, ticket) =>
          sum +
          (ticket.status === 'brewing'
            ? Math.max(0, ticket.totalDurationSec - (state.nowSec - (ticket.startTimeSec ?? state.nowSec)))
            : ticket.totalDurationSec),
        0
      );
  const eligible = itemType(card.beanName)?.iced_brew && card.cupCount === 1 && !card.preferredBaristaId;
  const opportunity = Boolean(
    eligible && state.bays.some((bay) => bay.canHandleSpecial && wait(bay) <= wait(target) + 60)
  );
  for (const id of card.trainingCupIds ?? [])
    cups[id] = {
      ...cups[id],
      iceDecision: { opportunity, senior: Boolean(target.canHandleSpecial) },
    };
  return cups;
}

export function scoreGame(state: GameState) {
  const cups = Object.values(state.cups);
  const total = cups.length;
  const done = cups.filter((cup) => cup.completedSec !== undefined);
  const good = done.filter((cup) => (cup.brewRatio ?? 0) >= 0.9);
  const timely = good.filter((cup) => (cup.completedSec ?? 0) - cup.arrivedSec <= 480);
  const groups = new Map<number, CupResult[]>();
  for (const cup of cups) groups.set(cup.orderId, [...(groups.get(cup.orderId) ?? []), cup]);
  const together = [...groups.values()].filter(
    (group) =>
      group.every((cup) => cup.completedSec !== undefined && (cup.brewRatio ?? 0) >= 0.9) &&
      Math.max(...group.map((cup) => cup.completedSec ?? 0)) - Math.min(...group.map((cup) => cup.completedSec ?? 0)) <=
        60
  );
  const ratio = (n: number, d = total) => (d === 0 ? 0 : n / d);
  const iceChoices = done.filter((cup) => cup.iceDecision?.opportunity);
  const seniorIce = iceChoices.filter((cup) => cup.iceDecision?.senior);
  const iceRatio = iceChoices.length ? seniorIce.length / iceChoices.length : done.length ? 1 : 0;
  const categories = [
    { label: '仕上げた杯数', points: 35 * ratio(done.length), max: 35, detail: `${done.length} / ${total}杯` },
    {
      label: '8分以内の提供準備',
      points: 25 * ratio(timely.length),
      max: 25,
      detail: `${timely.length} / ${total}杯（品質を満たした杯のみ）`,
    },
    {
      label: '抽出品質',
      points: 20 * ratio(good.length),
      max: 20,
      detail: `${good.length} / ${total}杯（予定時間の90%以上）`,
    },
    {
      label: '同一注文の仕上がり',
      points: 10 * ratio(together.length, groups.size),
      max: 10,
      detail: `${together.length} / ${groups.size}件（全杯を60秒以内の差で仕上げ）`,
    },
    {
      label: 'アイス1杯の配分',
      points: 10 * iceRatio,
      max: 10,
      detail: iceChoices.length
        ? `上級生へ ${seniorIce.length} / ${iceChoices.length}杯（上級生の待ち時間が＋60秒以内の場面）`
        : '指名・2杯抽出・上級生が忙しい場面は対象外',
    },
  ];
  const penalties = Math.min(20, state.violations * 2);
  const emergencyPending = state.emergencies.filter(
    (trial) => trial.status === 'pending' || trial.status === 'rebrewing'
  ).length;
  const ready =
    ratio(done.length) >= 0.9 &&
    ratio(good.length, done.length) >= 0.95 &&
    state.violations === 0 &&
    emergencyPending === 0 &&
    (iceChoices.length === 0 || iceRatio >= 0.5);
  const raw = Math.max(
    0,
    Math.min(100, Math.round(categories.reduce((sum, category) => sum + category.points, 0) - penalties))
  );
  const score = ready ? raw : Math.min(79, raw);
  const feedback = [
    done.length < total ? `残り${total - done.length}杯。空いている担当へ分散。` : '全杯完了。',
    done.length === 0
      ? 'まず抽出を完了しましょう。'
      : good.length < done.length
        ? '完了が早すぎます。残り時間を確認。'
        : '抽出時間は適切。',
    good.length === 0
      ? '品質を守り、8分以内に準備。'
      : timely.length < good.length
        ? '8分超過あり。古い注文を優先。'
        : '品質を守り、全杯8分以内。',
    together.length < groups.size ? '同じ注文は60秒差以内に仕上げる。' : '同じ注文をそろえて完了。',
    ...(emergencyPending ? [`緊急${emergencyPending}件が未完了。淹れ直しを完了。`] : []),
    ...(state.violations ? ['指名先と★を確認。'] : []),
    ...(iceChoices.length && iceRatio < 0.5 ? ['アイス1杯は、余裕のある上級生へ。対象杯の半数以上が必要。'] : []),
  ];
  // Each original cup contributes once, even after a remake. Only sound completed cups earn sales/bonuses.
  const revenue = good.reduce((sum, cup) => sum + itemPrice(cup.name), 0);
  const nominated = good.filter((cup) => cup.nominee !== undefined && cup.nominee === cup.completedBayId).length;
  const limited = good.filter((cup) => seniorOnly(cup.name)).length;
  const mergedBatches = new Set(
    good
      .filter((cup) => {
        const partner = good.find((other) => other.id === cup.mergedWith);
        return (
          partner &&
          partner.mergedWith === cup.id &&
          partner.completedBatch === cup.completedBatch &&
          cup.completedBatch
        );
      })
      .map((cup) => cup.completedBatch)
  );
  const bonuses = [
    { label: '指名', count: nominated, unit: 100, points: nominated * 100 },
    { label: '限定', count: limited, unit: 150, points: limited * 150 },
    { label: '2杯統合', count: mergedBatches.size, unit: 100, points: mergedBatches.size * 100 },
  ];
  const business = { revenue, bonuses, score: revenue + bonuses.reduce((sum, bonus) => sum + bonus.points, 0) };
  return {
    rulesVersion: '2026-10-v2',
    business,
    iceAllocation: { opportunities: iceChoices.length, senior: seniorIce.length },
    score,
    passed: score >= 80,
    categories,
    penalties,
    done: done.length,
    total,
    quality: good.length,
    ready,
    feedback,
    label:
      score >= 80
        ? '店舗運営を任せられるレベル'
        : score >= 60
          ? 'サポート付きで運営できるレベル'
          : '基本操作から練習しましょう',
  };
}
