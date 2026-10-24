import type { GameState } from './engine';
import { seniorOnly } from './master';
import type { Lesson } from './tutorial';

export interface TourQuery {
  selector: string;
  text?: string;
  starts?: string;
  empty?: boolean;
  valueNot?: string;
}
export interface TourHint {
  message: string;
  queries: TourQuery[];
  advanceTime?: boolean;
}
const q = (selector: string, text?: string): TourQuery => ({ selector, text });
const button = (text: string) => q('button', text);
const tab = (starts: string): TourQuery => ({ selector: '[role="tab"]', starts });
const view = (mode: string) => q(`[data-tour-view="${mode}"]`);
const card = (key: string | undefined) => q(`[data-search-key="${(key ?? 'missing').replace(/["\\]/g, '\\$&')}"]`);
const assigned = (key: string | undefined, bay: number) => q(`${card(key).selector} button[data-bay-target="${bay}"]`);
const pendingCard = (state: GameState) =>
  state.bays.flatMap((bay) => bay.queue).find((ticket) => ticket.status === 'scheduled') ??
  state.bays.flatMap((bay) => bay.queue)[0];
const brewing = (state: GameState) =>
  state.bays.flatMap((bay) => bay.queue).find((ticket) => ticket.status === 'brewing' && ticket.trainingCupIds?.length);

function finishHint(state: GameState): TourHint {
  const ticket = brewing(state);
  if (ticket && (ticket.timeRemainingSec ?? 1) > 0)
    return {
      message:
        '赤枠のカードで残り時間を確認しましょう。このガイドの「抽出時間を進める」で待ち時間を短縮できます。時間が来ても自動完了にはなりません。',
      queries: [card(ticket.ticketUid)],
      advanceTime: true,
    };
  return {
    message: '赤枠のカードの商品名側を押し、出てきた「終える」を押してください。新しい淹れ直しも同じ操作で完了します。',
    queries: [q('button[aria-label="終える（待機の先頭を始める）"]'), card(ticket?.ticketUid)],
  };
}

export function tourHint(lesson: Lesson, step: number, state: GameState, mode: string): TourHint {
  const first = state.unassigned[0];
  switch (lesson.id) {
    case 'overview':
      return [
        {
          message: 'まずCを押してみましょう。担当者ごとの「ドリップ中」と待ち列を、横並びで確認できます。',
          queries: [view('c')],
        },
        {
          message: 'Aを押して時間軸に戻ります。表示を変えても注文や抽出状態はそのままです。',
          queries: [view('current')],
        },
        {
          message: 'カードの注文番号「001」を押してください。同じ注文に属するカードが色付きの枠で強調されます。',
          queries: [q('[data-order-highlight-number]')],
        },
        {
          message: '左端の担当番号を押して、担当者の情報を確認します。★のある1・6番は上級生限定の豆を担当できます。',
          queries: [button('1st 空き')],
        },
      ][step];
    case 'orders':
      return [
        {
          message: '番号欄に「001」を入力して「探す」を押します。注文番号から対象を見つけて強調できます。',
          queries: [{ selector: '.training-order-search input', valueNot: '001' }, q('.training-order-search button')],
        },
        {
          message: '「未提供」タブを押してください。仕上がりを待つ注文と、待ち時間・コメントを確認する場所です。',
          queries: [tab('未提供')],
        },
        {
          message:
            mode === 'c'
              ? '「一覧」を押すと、到着済みの全注文と準備状態を見られます。'
              : 'Cを押してから、右側の「一覧」タブを開いてください。',
          queries: mode === 'c' ? [tab('一覧')] : [view('c')],
        },
        {
          message: '「未割当」に戻り、注文番号の横の吹き出しを押してください。Cでは右側にコメントチャットが開きます。',
          queries: [q('button[aria-label^="コメント "][aria-label$="件を見る"]'), tab('未割当')],
        },
        {
          message:
            '「OK」などのスタンプを押して返信してみましょう。「文章で返信」も使えます。返信はこの練習内だけに記録されます。',
          queries: [
            button('「OK」と返す'),
            q('button[aria-label^="コメント "][aria-label$="件を見る"]'),
            tab('未割当'),
          ],
        },
      ][step];
    case 'assign':
      return {
        message:
          '赤枠のカードの商品名側を押し、出てきた配置先「2」を押してください。空いている列では抽出が自動で始まります。',
        queries: [assigned(first?.ticketUid, 2), card(first?.ticketUid)],
      };
    case 'conditions': {
      const input = state.unassigned.find((entry) =>
        step === 0 ? entry.preferredBaristaId === 4 : seniorOnly(entry.beanName)
      );
      const bay = step === 0 ? 4 : 1;
      return {
        message:
          step === 0
            ? '「4th 指名」のカードを開き、4番に配置してください。指名と違う担当へは割り当てられません。'
            : '「上級生のみ」のカードを開き、★のある1番か6番へ配置しましょう。矢印は1番を示しています。',
        queries: [assigned(input?.ticketUid, bay), card(input?.ticketUid)],
      };
    }
    case 'queue':
      return [
        {
          message: '抽出中のカードを押し、「未着手に戻す」を押します。開始から1分未満なら取り消せます。',
          queries: [button('未着手に戻す'), card(state.bays[1].queue[0]?.ticketUid)],
        },
        {
          message: '戻した先頭のカードを押し、「始める」を押してください。待機したままでは抽出の時計は進みません。',
          queries: [button('始める'), card(state.bays[1].queue[0]?.ticketUid)],
        },
        {
          message:
            '待機カードを押し、「3 に再割当」で別の担当へ移してみましょう。長押しの詳細からも担当者を変更できます。',
          queries: [
            q('button[aria-label="3 に再割当"]'),
            q('[data-tour-move="3"]'),
            card(pendingCard(state)?.ticketUid),
          ],
        },
        {
          message: '残っている待機カードを押して「未割当に戻す」を選びます。注文は消えず、配置前の一覧に戻ります。',
          queries: [button('未割当に戻す'), card(pendingCard(state)?.ticketUid)],
        },
      ][step];
    case 'merge':
      return step === 0
        ? {
            message:
              '1杯のカードの商品名側を押し、もう一方の「統合する」を押します。同じ商品の2杯をまとめて抽出できます。',
            queries: [q('[data-merge-tap="true"]'), card(first?.ticketUid)],
          }
        : {
            message: '統合したカードの商品名側を押し、出てきた「分ける」を押してください。1杯ずつのカードへ戻せます。',
            queries: [button('分ける'), card(first?.ticketUid)],
          };
    case 'finish':
      return finishHint(state);
    case 'emergency':
      return step > 0
        ? finishHint(state)
        : {
            message:
              '通知から手配を開き、矢印の欄を順番に選んでください。理由・杯数・割当先・元の抽出を中断するかどうかは、自分で判断します。',
            queries: [
              ...['入れ直しの理由', '入れ直しの杯数', '入れ直しの割当先', '現在の抽出の扱い'].map((label) => ({
                selector: `select[aria-label="${label}"]`,
                empty: true,
              })),
              button('この内容で入れ直す'),
              button('入れ直しを手配'),
            ],
          };
    case 'discard':
      return step > 0
        ? finishHint(state)
        : {
            message:
              '元の抽出の赤枠のアイコンを押し、確認画面で対象の杯を確かめて破棄します。新しい淹れ直しのカードは残ります。',
            queries: [button('元の1杯を破棄'), q('button[aria-label^="淹れ直し登録済み："]')],
          };
    default:
      return { message: lesson.steps[step]?.label ?? '操作を確認しましょう。', queries: [] };
  }
}

export function findTourTarget(queries: TourQuery[], root: ParentNode = document): HTMLElement | null {
  for (const query of queries) {
    for (const element of root.querySelectorAll<HTMLElement>(query.selector)) {
      if (element.closest('[data-training-tour]')) continue;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || getComputedStyle(element).visibility === 'hidden') continue;
      const label = element.getAttribute('aria-label') ?? element.textContent?.trim() ?? '';
      if (query.text && label !== query.text) continue;
      if (query.starts && !label.startsWith(query.starts)) continue;
      if (query.empty && (!(element instanceof HTMLSelectElement) || element.value !== '')) continue;
      if (query.valueNot !== undefined && element instanceof HTMLInputElement && element.value === query.valueNot)
        continue;
      if (element instanceof HTMLButtonElement && element.disabled) continue;
      return element;
    }
  }
  return null;
}
