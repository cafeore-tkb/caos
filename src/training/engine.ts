import { type CaosPlace, caosBrewSec } from '../current-caos/common';
import type { Barista, OrderTicket, UnassignedOrder } from '../types';
import { insertTicket, mergeBoardCards } from '../utils/orderQueue';
import { itemAbbr, itemCode, masterItem, needsBrew, seniorOnly } from './master';

export type GameMode = 'fast' | 'middle' | 'full';
export const MODES = {
  fast: {
    label: 'ファスト',
    durationSec: 600,
    count: 6,
    emergencyChances: 0,
    description: '基本の割当と完了。少量の注文で操作を身につける。',
    target: '基本操作',
  },
  middle: {
    label: 'ミドル',
    durationSec: 1200,
    count: 12,
    emergencyChances: 1,
    description: 'アイス・限定豆・指名・複数杯を並行してさばく。',
    target: '並行判断',
  },
  full: {
    label: 'フル',
    durationSec: 1800,
    count: 20,
    emergencyChances: 2,
    description: '注文の集中、分割、同時仕上げまで含めた店舗運営の総合練習。',
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
  | { type: 'finish' }
  | { type: 'assign'; key: string; bayId: number; place?: CaosPlace }
  | { type: 'complete'; bayId: number }
  | { type: 'start'; bayId: number }
  | { type: 'unstart'; bayId: number }
  | { type: 'split'; key: string; cupId: string }
  | {
      type: 'rebrew';
      key: string;
      cupCount: number;
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
const toUnassigned = (ticket: OrderTicket): UnassignedOrder => ({
  ...ticket,
  badgeTag: `${ticket.cupCount}杯`,
  predictedTimeStr: `${ticket.totalDurationSec}秒`,
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
      `${ticket.id} 緊急淹れ直しが必要です。担当者と元抽出の扱いを選んで手配してください`
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
  if (action.type === 'rebrew') {
    const source = state.bays
      .flatMap((bay) => [...bay.queue, ...(bay.pastTickets ?? [])])
      .find((card) => keyOf(card) === action.key);
    if (
      !source ||
      !action.reason.trim() ||
      !Number.isInteger(action.cupCount) ||
      action.cupCount < 1 ||
      action.cupCount > source.cupCount
    )
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
    const ids = (
      incident?.cupId ? [incident.cupId, ...originalIds.filter((id) => id !== incident.cupId)] : originalIds
    ).slice(0, action.cupCount);
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
      rebrewOfTicketUid: source.ticketUid,
      orderedAtSec: state.nowSec,
      badgeTag: `${action.cupCount}杯 入れ直し`,
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
          : action.interrupt || remaining.length === 0
            ? []
            : [
                {
                  ...card,
                  trainingCupIds: remaining,
                  sourceCups: card.sourceCups?.filter((cup) => remaining.includes(cup.id)),
                  cupCount: remaining.length,
                  totalDurationSec: brewDuration(card.beanName, remaining.length),
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
            ...(sourceHere && (action.interrupt || remaining.length === 0)
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
                    isInterrupted: true,
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
        unassigned: [...state.unassigned, ...returned, ...(target ? [] : [remake])],
      },
      'rebrew',
      `${source.id} ${action.cupCount}杯 入れ直し：${action.reason}`
    );
  }
  if (action.type === 'split') {
    const card = state.unassigned.find((entry) => keyOf(entry) === action.key);
    if (card?.cupCount !== 2 || !card.trainingCupIds?.includes(action.cupId)) return state;
    const parts = card.trainingCupIds.map((id) => ({
      ...card,
      id: `#${String(state.cups[id].orderId).padStart(3, '0')}`,
      ticketUid: `split-${id}`,
      sourceOrderIds: undefined,
      cupCount: 1,
      trainingCupIds: [id],
      sourceCups: card.sourceCups?.filter((cup) => cup.id === id),
      badgeTag: '1杯',
    }));
    return withEvent(
      { ...state, unassigned: [...state.unassigned.filter((entry) => entry !== card), ...parts] },
      'split',
      `${card.id}を1杯ずつに分離`
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
  const cups = { ...state.cups };
  if ('status' in result.merged && result.merged.status === 'brewing')
    for (const id of result.joinedIds) cups[id] = { ...cups[id], joinedAtSec: state.nowSec };
  return withEvent(
    { ...state, cups, bays: result.bays.map((bay) => schedule(bay, state.nowSec)), unassigned: result.orders },
    'merge',
    `${result.merged.id}を2杯抽出に統合`
  );
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
  const categories = [
    { label: '仕上げた杯数', points: 45 * ratio(done.length), max: 45, detail: `${done.length} / ${total}杯` },
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
  ];
  const penalties = Math.min(20, state.violations * 2);
  const emergencyPending = state.emergencies.filter(
    (trial) => trial.status === 'pending' || trial.status === 'rebrewing'
  ).length;
  const ready =
    ratio(done.length) >= 0.9 &&
    ratio(good.length, done.length) >= 0.95 &&
    state.violations === 0 &&
    emergencyPending === 0;
  const raw = Math.max(
    0,
    Math.min(100, Math.round(categories.reduce((sum, category) => sum + category.points, 0) - penalties))
  );
  const score = ready ? raw : Math.min(79, raw);
  const feedback = [
    done.length < total
      ? `未完了が${total - done.length}杯あります。空いている担当者へ早めに分散しましょう。`
      : '全杯の抽出を完了できました。',
    done.length === 0
      ? '抽出を完了すると、経過した抽出時間から品質を評価します。'
      : good.length < done.length
        ? '「終える」を早く押しすぎています。残り時間を見て抽出品質を守りましょう。'
        : '完了した杯の抽出時間は適切でした。',
    good.length === 0
      ? '品質を満たして完了した杯から、提供準備の速さも評価します。'
      : timely.length < good.length
        ? '8分を超えた杯があります。注文の古い順とレーンの空きを確認しましょう。'
        : '品質を満たした杯はすべて8分以内に準備できました。',
    together.length < groups.size
      ? '複数杯の注文は仕上がりの差を60秒以内に。統合と並行抽出を使いましょう。'
      : '同一注文の仕上がりがそろっています。',
    ...(emergencyPending ? [`緊急淹れ直しが${emergencyPending}件未完了です。手配した杯の抽出を終えましょう。`] : []),
    ...(state.violations ? ['指名と上級生のみの条件を確認しましょう。'] : []),
  ];
  return {
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
