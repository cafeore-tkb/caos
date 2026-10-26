import { type GameAction, type GameState, gameReducer, startGame } from './engine';
import { seniorOnly, TRAINING_MASTER } from './master';

export interface Lesson {
  id: string;
  title: string;
  description: string;
  steps: { label: string; done: (state: GameState, interactions: string[]) => boolean }[];
  setup: () => GameState;
}
const coffee = '余音ブレンド';
const limited = TRAINING_MASTER.items.find((item) => seniorOnly(item.name))?.name ?? 'アロマナティーボ';
const event = (type: string) => (state: GameState) => state.events.some((entry) => entry.kind === type);
const ui = (kind: string) => (_state: GameState, interactions: string[]) => interactions.includes(kind);
const base = (items = [{ name: coffee, quantity: 1 }], orders = 1) =>
  startGame(
    {
      schemaVersion: 1,
      kind: 'synthetic',
      mode: 'middle',
      title: '操作チュートリアル',
      durationSec: 1200,
      orders: Array.from({ length: orders }, (_, i) => ({
        orderId: i + 1,
        atSec: 0,
        items,
        comments: i === 0 ? ['同じ注文はまとめて受け取ります。'] : [],
      })),
    },
    1
  );
const prepare = (state: GameState, actions: GameAction[]) => {
  const prepared = actions.reduce(gameReducer, { ...state, emergencies: [] });
  return { ...prepared, events: [], notice: '' };
};
const assign = (state: GameState, index: number, bayId: number): GameAction => ({
  type: 'assign',
  key: state.unassigned[index].ticketUid ?? '',
  bayId,
});
export const LESSONS: Lesson[] = [
  {
    id: 'overview',
    title: '表示を切り替える',
    description: '時間軸・待ち列・注文番号',
    setup: () => prepare(base(), []),
    steps: [
      { label: 'キューに切替', done: ui('view:c') },
      { label: 'タイムラインに切替', done: ui('view:current') },
      { label: '注文番号を押す', done: ui('highlight') },
      { label: '担当番号を押す', done: ui('lane') },
    ],
  },
  {
    id: 'orders',
    title: '注文を探す',
    description: '番号検索・コメント・返信',
    setup: () => prepare(base(), []),
    steps: [
      { label: '001を探す', done: ui('search') },
      { label: '未提供を開く', done: ui('unfinished') },
      { label: '一覧を開く', done: ui('all') },
      { label: 'コメントを開く', done: ui('comments') },
      { label: '返信する', done: ui('reply') },
    ],
  },
  {
    id: 'assign',
    title: '担当へ割り当てる',
    description: 'カードを選び、2番へ',
    setup: () => prepare(base(), []),
    steps: [{ label: '2番に割り当てる', done: (state) => state.bays[1].queue[0]?.status === 'brewing' }],
  },
  {
    id: 'conditions',
    title: '指名・限定豆を振り分ける',
    description: '指名は指定先、限定豆は★へ',
    setup: () =>
      prepare(
        base([
          { name: coffee, quantity: 1, ...{ nominee: 4 } },
          { name: limited, quantity: 1 },
        ]),
        []
      ),
    steps: [
      {
        label: '指名は4番へ',
        done: (state) => state.bays[3].queue.some((card) => card.preferredBaristaId === 4),
      },
      {
        label: '限定豆は★へ',
        done: (state) =>
          [state.bays[0], state.bays[5]].some((bay) => bay.queue.some((card) => seniorOnly(card.beanName))),
      },
    ],
  },
  {
    id: 'queue',
    title: '待ち列を調整する',
    description: '開始を戻す・移動・未割当へ',
    setup: () => {
      const state = base(undefined, 3);
      return prepare(state, [assign(state, 0, 2), assign(state, 1, 2), assign(state, 2, 2)]);
    },
    steps: [
      { label: '未着手に戻す', done: event('unstart') },
      { label: '抽出を始める', done: event('start') },
      { label: '待機を3番へ移す', done: event('move') },
      { label: '未割当に戻す', done: event('return') },
    ],
  },
  {
    id: 'merge',
    title: 'まとめる・分ける',
    description: '同じ商品の1杯を統合・分離',
    setup: () => prepare(base(undefined, 2), []),
    steps: [
      { label: '1杯ずつを統合', done: event('merge') },
      { label: '1杯ずつに分ける', done: event('split') },
    ],
  },
  {
    id: 'finish',
    title: '抽出を完了する',
    description: '時間を見て「終える」',
    setup: () => {
      const state = base();
      return prepare(state, [assign(state, 0, 2)]);
    },
    steps: [
      {
        label: '時間を進めて完了',
        done: (state) =>
          Object.values(state.cups).some((cup) => cup.completedSec !== undefined && (cup.brewRatio ?? 0) >= 0.9),
      },
    ],
  },
  {
    id: 'emergency',
    title: '緊急で淹れ直す',
    description: 'カップ・理由を選び、担当へ割当',
    setup: () => {
      const state = base();
      let prepared = prepare(state, [assign(state, 0, 2)]);
      prepared = {
        ...prepared,
        emergencies: [{ id: 1, cupId: Object.keys(prepared.cups)[0], willOccur: true, status: 'armed' }],
      };
      return gameReducer(prepared, { type: 'tick', seconds: 225 });
    },
    steps: [
      { label: '淹れ直しを手配', done: event('rebrew') },
      {
        label: '淹れ直しを完了',
        done: (state) => state.emergencies.some((trial) => trial.status === 'resolved'),
      },
    ],
  },
  {
    id: 'discard',
    title: '元の抽出を破棄する',
    description: '元を破棄し、淹れ直しを完了',
    setup: () => {
      const state = base();
      const prepared = prepare(state, [assign(state, 0, 2), { type: 'tick', seconds: 225 }]);
      return prepare(prepared, [
        {
          type: 'rebrew',
          key: prepared.bays[1].queue[0].ticketUid ?? '',
          cupCount: 1,
          bayId: 3,
          interrupt: false,
          reason: '抽出ミス',
        },
      ]);
    },
    steps: [
      { label: '元の抽出を破棄', done: event('discard') },
      {
        label: '淹れ直しを完了',
        done: (state) =>
          Object.values(state.cups).every((cup) => cup.completedSec !== undefined && (cup.brewRatio ?? 0) >= 0.9),
      },
    ],
  },
  {
    id: 'shift',
    title: 'シフトを交代する',
    description: '通知・予定の交代・予定外の交代',
    setup: () => {
      const state = prepare(base(), []);
      return { ...state, scenario: { ...state.scenario, durationSec: 2400 } };
    },
    steps: [
      { label: '10分前の通知', done: (state) => state.nowSec >= 60 },
      { label: '5分前の通知', done: (state) => state.nowSec >= 360 },
      { label: '11時へ進む', done: (state) => state.nowSec >= 660 },
      { label: '予定の人へ交代', done: ui('shift:scheduled') },
      { label: '予定外の人へ交代', done: ui('shift:typed') },
      { label: '別の担当者と入れ替える', done: ui('shift:swap') },
      { label: '担当を空きにする', done: ui('shift:clear') },
      { label: '候補から担当を戻す', done: ui('shift:restore') },
    ],
  },
];
export const lessonComplete = (lesson: Lesson, state: GameState, interactions: string[]) =>
  lesson.steps.every((step) => step.done(state, interactions));
