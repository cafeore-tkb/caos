import type { Barista, OrderTicket, UnassignedOrder } from '../types';
import { itemAbbr, itemCode, masterItem, needsBrew, seniorOnly } from './master';

export type GameMode = 'fast' | 'middle' | 'full';
export const MODES = {
  fast: {
    label: 'ファスト',
    durationSec: 600,
    count: 10,
    description: '基本の割当と完了。少量の注文で操作を身につける。',
    target: '基本操作',
  },
  middle: {
    label: 'ミドル',
    durationSec: 1200,
    count: 24,
    description: 'アイス・限定豆・指名・複数杯を並行してさばく。',
    target: '並行判断',
  },
  full: {
    label: 'フル',
    durationSec: 1800,
    count: 42,
    description: '注文の集中、分割、同時仕上げまで含めた店舗運営の総合練習。',
    target: '店舗運営',
  },
} as const;
export interface ScenarioOrder {
  orderId: number;
  atSec: number;
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
}
export interface GameEvent {
  id: number;
  atSec: number;
  kind: string;
  message: string;
}
export interface GameState {
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
  | { type: 'assign'; key: string; bayId: number }
  | { type: 'complete'; bayId: number }
  | { type: 'move'; key: string; bayId: number }
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
      order.atSec > value.durationSec - 240 ||
      !Array.isArray(order.items) ||
      order.items.length < 1 ||
      order.items.length > 12
    )
      throw new Error('注文番号・到着時刻が不正です（最後の4分は仕上げ時間です）');
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
      .map((order) => ({ ...order, items: order.items.map((item) => ({ ...item })) }))
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
export const brewDuration = (name: string, cups: number) =>
  (cups === 2 ? 195 : 135) +
  (seniorOnly(name) ? 30 : 0) +
  (itemCode(name) === 'ICE' || itemCode(name) === 'MILK' ? 15 : 0);
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
          id: `#${String(order.orderId).padStart(3, '0')}`,
          ticketUid: `game-${order.orderId}-${itemIndex}-${offset}`,
          beanName: item.name,
          beanCode: itemCode(item.name),
          cupCount: count,
          trainingCupIds: Array.from({ length: count }, (_, i) => `${order.orderId}:${itemIndex}:${offset + i}`),
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
export function startGame(input: Scenario): GameState {
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
  return arrive({
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
function schedule(bay: Barista, nowSec: number): Barista {
  let cursor = nowSec;
  const queue = bay.queue.map((ticket, index) => {
    const start = index === 0 ? (ticket.status === 'brewing' ? (ticket.startTimeSec ?? nowSec) : nowSec) : cursor;
    cursor = Math.max(nowSec, start + ticket.totalDurationSec);
    return {
      ...ticket,
      status: index === 0 ? ('brewing' as const) : ('scheduled' as const),
      startTimeSec: start,
      timeRemainingSec: index === 0 ? Math.max(0, start + ticket.totalDurationSec - nowSec) : undefined,
    };
  });
  return { ...bay, queue, status: queue.length ? 'brewing' : 'standby' };
}
const toUnassigned = (ticket: OrderTicket): UnassignedOrder => ({
  ...ticket,
  badgeTag: `${ticket.cupCount}杯`,
  predictedTimeStr: `${ticket.totalDurationSec}秒`,
  recommendedBaristas: '条件に合う担当者',
  recommendedBayIds: ticket.preferredBaristaId ? [ticket.preferredBaristaId] : [1, 2, 3, 4, 5, 6],
  cardColor: 'blue',
});

export function gameReducer(state: GameState, action: GameAction): GameState {
  if (state.status === 'finished') return state;
  if (action.type === 'finish')
    return withEvent({ ...state, status: 'finished', paused: false }, 'finish', '採点しました');
  if (action.type === 'pause') return { ...state, paused: !state.paused };
  if (state.paused) return state;
  if (action.type === 'tick') {
    if (!Number.isFinite(action.seconds) || action.seconds <= 0) return state;
    const nowSec = Math.min(state.scenario.durationSec, state.nowSec + Math.floor(action.seconds));
    const next = arrive({ ...state, nowSec, bays: state.bays.map((bay) => schedule(bay, nowSec)) });
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
          entry.id === bay.id ? schedule({ ...entry, queue: [...entry.queue, ticket] }, state.nowSec) : entry
        ),
      },
      'assign',
      `${order.id} ${itemAbbr(order.beanName)} → ${bay.id}番`
    );
  }
  if (action.type === 'complete') {
    const bay = state.bays.find((entry) => entry.id === action.bayId);
    const ticket = bay?.queue[0];
    if (!bay || !ticket) return state;
    const ratio = (state.nowSec - (ticket.startTimeSec ?? state.nowSec)) / ticket.totalDurationSec;
    const cups = { ...state.cups };
    for (const id of ticket.trainingCupIds ?? [])
      cups[id] = { ...cups[id], completedSec: state.nowSec, brewRatio: ratio };
    return withEvent(
      {
        ...state,
        cups,
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
                state.nowSec
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
    const target = action.type === 'move' ? state.bays.find((bay) => bay.id === action.bayId) : undefined;
    if (action.type === 'move' && (!target || !allowedBay(ticket, target)))
      return rejected(state, '指名・上級生のみの条件を確認してください');
    const from = state.bays.find((bay) => bay.queue.includes(ticket));
    if (target?.id === from?.id) return state;
    const bays = state.bays.map((bay) =>
      schedule(
        {
          ...bay,
          queue: [
            ...bay.queue.filter((card) => keyOf(card) !== action.key),
            ...(bay.id === target?.id ? [{ ...ticket, status: 'scheduled' as const, startTimeSec: undefined }] : []),
          ],
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
  const first = state.unassigned.find((card) => keyOf(card) === action.first);
  const second = state.unassigned.find((card) => keyOf(card) === action.second);
  if (
    !first ||
    !second ||
    first === second ||
    first.cupCount !== 1 ||
    second.cupCount !== 1 ||
    first.beanName !== second.beanName ||
    first.preferredBaristaId !== second.preferredBaristaId
  )
    return state;
  const sourceOrderIds = [
    ...new Set([...(first.sourceOrderIds ?? [first.id]), ...(second.sourceOrderIds ?? [second.id])]),
  ].sort();
  const merged = {
    ...first,
    id: sourceOrderIds.join('+'),
    ticketUid: `merge-${keyOf(first)}-${keyOf(second)}`,
    cupCount: 2,
    trainingCupIds: [...(first.trainingCupIds ?? []), ...(second.trainingCupIds ?? [])],
    sourceOrderIds,
  };
  return withEvent(
    { ...state, unassigned: [...state.unassigned.filter((card) => card !== first && card !== second), merged] },
    'merge',
    `${sourceOrderIds.join(' + ')}を2杯抽出に統合`
  );
}

export function scoreGame(state: GameState) {
  const cups = Object.values(state.cups);
  const total = cups.length;
  const done = cups.filter((cup) => cup.completedSec !== undefined);
  const good = done.filter((cup) => (cup.brewRatio ?? 0) >= 0.9);
  const timely = good.filter((cup) => (cup.completedSec ?? 0) - cup.arrivedSec <= 360);
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
      label: '6分以内の提供準備',
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
  const ready = ratio(done.length) >= 0.9 && ratio(good.length, done.length) >= 0.95 && state.violations === 0;
  const raw = Math.max(
    0,
    Math.min(100, Math.round(categories.reduce((sum, category) => sum + category.points, 0) - penalties))
  );
  const score = ready ? raw : Math.min(79, raw);
  const feedback = [
    done.length < total
      ? `未完了が${total - done.length}杯あります。空いている担当者へ早めに分散しましょう。`
      : '全杯の抽出を完了できました。',
    good.length < done.length
      ? '「次へ」を早く押しすぎています。残り時間を見て抽出品質を守りましょう。'
      : '完了した杯の抽出時間は適切でした。',
    timely.length < good.length
      ? '6分を超えた杯があります。注文の古い順とレーンの空きを確認しましょう。'
      : '品質を満たした杯はすべて6分以内に準備できました。',
    together.length < groups.size
      ? '複数杯の注文は仕上がりの差を60秒以内に。統合と並行抽出を使いましょう。'
      : '同一注文の仕上がりがそろっています。',
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
