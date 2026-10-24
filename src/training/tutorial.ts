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
    title: '盤面を見渡す',
    description:
      'Aは時間軸、Cはドリップ中と待ち列を表示します。同じ注文を選ぶと色付きの枠で追えます。担当番号から上級生の条件も確認しましょう。',
    setup: () => prepare(base(), []),
    steps: [
      { label: 'C（キュー）に切り替える', done: ui('view:c') },
      { label: 'A（タイムライン）に戻す', done: ui('view:current') },
      { label: '注文カードの番号を押して強調する', done: ui('highlight') },
      { label: '担当番号を押して情報を確認する', done: ui('lane') },
    ],
  },
  {
    id: 'orders',
    title: '注文とコメントを確認する',
    description:
      '未割当は配置前のカード、未提供は仕上がりを待つ注文です。Cの「一覧」では全注文の状態を確認できます。吹き出しからコメントを開き、OKなどの返信を練習しましょう。返信は練習内だけに残ります。',
    setup: () => prepare(base(), []),
    steps: [
      { label: '番号欄で001を探す', done: ui('search') },
      { label: '未提供タブを開く', done: ui('unfinished') },
      { label: 'Cに切り替えて「一覧」を開く', done: ui('all') },
      { label: '未割当に戻り、コメントの吹き出しを開く', done: ui('comments') },
      { label: 'コメントにスタンプか文章で返信する', done: ui('reply') },
    ],
  },
  {
    id: 'assign',
    title: '空いている担当へ割り当てる',
    description:
      '未割当のカードを押すと1〜6の配置先が出ます。通常豆を2番へ配置しましょう。空の列では自動で抽出が始まります。ドラッグで列へ置くこともできます。',
    setup: () => prepare(base(), []),
    steps: [
      { label: '注文を2番に割り当て、抽出中にする', done: (state) => state.bays[1].queue[0]?.status === 'brewing' },
    ],
  },
  {
    id: 'conditions',
    title: '指名と上級生限定を守る',
    description:
      '指名のカードは指定された番号へ。上級生限定の豆は★のある1・6番へ。通常豆を先に使い切らず、条件のある注文の配置先を確保します。',
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
        label: '4番指名のカードを4番に配置する',
        done: (state) => state.bays[3].queue.some((card) => card.preferredBaristaId === 4),
      },
      {
        label: '上級生限定のカードを1番か6番に配置する',
        done: (state) =>
          [state.bays[0], state.bays[5]].some((bay) => bay.queue.some((card) => seniorOnly(card.beanName))),
      },
    ],
  },
  {
    id: 'queue',
    title: '開始を戻す・待ち列を調整する',
    description:
      'カードを押すと操作トレーが出ます。開始から1分未満は「未着手に戻す」、戻した先頭は「始める」で再開。待機カードは長押しで担当変更・未割当に戻す操作ができます。抽出中の移動は時計がリセットされます。',
    setup: () => {
      const state = base(undefined, 3);
      return prepare(state, [assign(state, 0, 2), assign(state, 1, 2), assign(state, 2, 2)]);
    },
    steps: [
      { label: '抽出中のカードを未着手に戻す', done: event('unstart') },
      { label: '先頭の抽出を始める', done: event('start') },
      { label: '待機のカードを別の担当へ移す', done: event('move') },
      { label: 'カードを未割当に戻す', done: event('return') },
    ],
  },
  {
    id: 'merge',
    title: '同じ商品の1杯を統合・分離する',
    description:
      '同じ商品の1杯カードを開き、もう一方の「統合する」を押すと2杯をまとめて抽出できます。統合後は未割当カードの商品名側を押して開き、「分ける」で1杯ずつに戻せます。指名条件が矛盾する組合せは統合できません。',
    setup: () => prepare(base(undefined, 2), []),
    steps: [
      { label: '2枚の1杯カードを統合する', done: event('merge') },
      { label: '統合したカードから1杯を外す', done: event('split') },
    ],
  },
  {
    id: 'finish',
    title: '時間を見て抽出を完了する',
    description:
      '1杯は5分、2杯は6分が目安です。ここでは「抽出時間を進める」で待ち時間を短縮できます。時間が来たらカードの「終える」を押します。残り0秒だけでは完了になりません。',
    setup: () => {
      const state = base();
      return prepare(state, [assign(state, 0, 2)]);
    },
    steps: [
      {
        label: '抽出時間を進め、予定時間を確保して「終える」を押す',
        done: (state) =>
          Object.values(state.cups).some((cup) => cup.completedSec !== undefined && (cup.brewRatio ?? 0) >= 0.9),
      },
    ],
  },
  {
    id: 'emergency',
    title: '緊急淹れ直しを手配する',
    description:
      '抽出後半のトラブルです。「入れ直しを手配」から理由・杯数・担当・元の抽出の扱いを選びます。中断と継続は状況に合わせて判断し、赤い緊急カードも最後まで抽出します。このレッスンでは必ず1件発生します。',
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
      { label: '通知から淹れ直しを手配する', done: event('rebrew') },
      {
        label: '新しい緊急カードの抽出時間を確保して完了する',
        done: (state) => state.emergencies.some((trial) => trial.status === 'resolved'),
      },
    ],
  },
  {
    id: 'discard',
    title: '淹れ直し元を確認して破棄する',
    description:
      '今回は元の抽出を続けたまま、別の担当へ淹れ直しを登録済みです。2番のカードの破棄アイコンを押し、確認画面で対象の杯を確かめて破棄してください。新しい淹れ直しは残し、時間を進めて完了します。ゲーム後は採点内訳と履歴で振り返ります。',
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
      { label: '確認画面から、淹れ直し済みの元抽出を破棄する', done: event('discard') },
      {
        label: '残した新しい淹れ直しの抽出を完了する',
        done: (state) =>
          Object.values(state.cups).every((cup) => cup.completedSec !== undefined && (cup.brewRatio ?? 0) >= 0.9),
      },
    ],
  },
];
export const lessonComplete = (lesson: Lesson, state: GameState, interactions: string[]) =>
  lesson.steps.every((step) => step.done(state, interactions));
