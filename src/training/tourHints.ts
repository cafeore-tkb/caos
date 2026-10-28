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
const assignmentPanel = (bay: number) => [
  q(`.caos-side-panel:has([data-assignment-bay="${bay}"][aria-pressed="true"]) button`, '割当を確定'),
  q(`.caos-side-panel button[data-assignment-bay="${bay}"]`),
];
const pendingCard = (state: GameState) =>
  state.bays.flatMap((bay) => bay.queue).find((ticket) => ticket.status === 'scheduled') ??
  state.bays.flatMap((bay) => bay.queue)[0];
const brewing = (state: GameState) =>
  state.bays.flatMap((bay) => bay.queue).find((ticket) => ticket.status === 'brewing' && ticket.trainingCupIds?.length);

function finishHint(state: GameState): TourHint {
  const ticket = brewing(state);
  if (ticket && (ticket.timeRemainingSec ?? 1) > 0)
    return {
      message: '「時間を進める」で残り0秒に。',
      queries: [card(ticket.ticketUid)],
      advanceTime: true,
    };
  return {
    message: 'カードの商品名 →「終える」。',
    queries: [q('button[aria-label="終える（待機の先頭を始める）"]'), card(ticket?.ticketUid)],
  };
}

export function tourHint(lesson: Lesson, step: number, state: GameState, mode: string): TourHint {
  const first = state.unassigned[0];
  switch (lesson.id) {
    case 'overview':
      return [
        {
          message: '「待ち列」で、担当ごとに淹れる順番を確認できます。',
          queries: [view('c')],
        },
        {
          message: '「タイムライン」で、いつ淹れ終わるかを確認できます。',
          queries: [view('current')],
        },
        {
          message: '「001」を押すと、同じ注文を強調。',
          queries: [q('[data-order-highlight-number]')],
        },
        {
          message: '担当番号から情報を確認。★は上級生。',
          queries: [button('1st 空き')],
        },
      ][step];
    case 'orders':
      return [
        {
          message: '「番号」→「1」。注文を確認して閉じる。',
          queries: [
            q('[aria-label="注文番号で探す"]:has([aria-label="#001 の今"]) button[aria-label="閉じる"]'),
            q('[aria-label="注文番号で探す"] button', '1'),
            q('[data-tour-search]'),
          ],
        },
        {
          message: '「未提供」で待ち時間を確認。',
          queries: [tab('未提供')],
        },
        {
          message:
            mode === 'c' ? '「一覧」で全注文を確認しましょう。' : '「待ち列」を押し、次に「一覧」を開きましょう。',
          queries: mode === 'c' ? [tab('一覧')] : [view('c')],
        },
        {
          message: '「未割当」→ 吹き出しでコメント確認。',
          queries: [q('button[aria-label^="コメント "][aria-label$="件を見る"]'), tab('未割当')],
        },
        {
          message: '「OK」で返信。文章でも返せます。',
          queries: [
            button('「OK」と返す'),
            q('button[aria-label^="コメント "][aria-label$="件を見る"]'),
            tab('未割当'),
          ],
        },
      ][step];
    case 'assign':
      return {
        message: '商品名 →「2」。空きなら自動で開始。',
        queries: [...assignmentPanel(2), assigned(first?.ticketUid, 2), card(first?.ticketUid)],
      };
    case 'conditions': {
      const input = state.unassigned.find((entry) =>
        step === 0 ? entry.preferredBaristaId === 4 : seniorOnly(entry.beanName)
      );
      const bay = step === 0 ? 4 : 1;
      return {
        message: step === 0 ? '指名カードの商品名 →「4」。' : '限定豆は★の1・6番へ。矢印は1番。',
        queries: [...assignmentPanel(bay), assigned(input?.ticketUid, bay), card(input?.ticketUid)],
      };
    }
    case 'queue':
      return [
        {
          message: 'カード →「未着手に戻す」。開始1分未満のみ。',
          queries: [button('未着手に戻す'), card(state.bays[1].queue[0]?.ticketUid)],
        },
        {
          message: 'カード →「始める」で再開。',
          queries: [button('始める'), card(state.bays[1].queue[0]?.ticketUid)],
        },
        {
          message: '待機カード →「3 に再割当」。',
          queries: [
            q('button[aria-label="3 に再割当"]'),
            q('[data-tour-move="3"]'),
            card(pendingCard(state)?.ticketUid),
          ],
        },
        {
          message: '待機カード →「未割当に戻す」。',
          queries: [button('未割り当に戻す'), button('未割当に戻す'), card(pendingCard(state)?.ticketUid)],
        },
      ][step];
    case 'merge':
      return step === 0
        ? {
            message: '商品名 → もう1枚の「統合する」。',
            queries: [q('[data-merge-tap="true"]'), card(first?.ticketUid)],
          }
        : {
            message: '商品名 →「分ける」で1杯ずつに。',
            queries: [button('分ける'), card(first?.ticketUid)],
          };
    case 'finish':
      return finishHint(state);
    case 'emergency': {
      const remake = state.unassigned.find((card) => card.isRebrew);
      return step > 0
        ? remake
          ? {
              message: '淹れ直しカードの商品名 → 担当番号。',
              queries: [assigned(remake.ticketUid, 3), card(remake.ticketUid)],
            }
          : finishHint(state)
        : {
            message: 'カップを選び、理由 → 赤い確定ボタン。',
            queries: [q('form button[type="submit"]'), button('抽出ミス'), button('淹れ直しを手配')],
          };
    }
    case 'shift': {
      const nameButton = q('[data-change-dripper="1"]');
      if (step < 3)
        return {
          message: [
            '10:49。10:50へ進み、交代予告を確認。',
            '「次：名前」が出たら、タップ即交代。誤タップ注意！',
            '5分前は赤く強調。交代直前の10:59へ。',
          ][step],
          queries:
            step === 1 ? [nameButton, q('[data-tour-shift-notice]')] : [q('[data-tour-shift-notice]'), nameButton],
          advanceTime: true,
        };
      if (step < 9)
        return {
          message: `${step - 2}番の担当者枠を1回タップ。それだけで交代完了。`,
          queries: [q(`[data-change-dripper="${step - 2}"]`)],
        };
      if (step === 9)
        return {
          message: '予定外なら交代後にもう1回タップ。「B4」→「田中」。',
          queries: [q('[data-lane-candidate="田中"]'), button('B4'), nameButton],
        };
      if (step === 10 && state.nowSec < 1260)
        return {
          message: '予告は11:00に消えます。次は11:10の交代を練習。',
          queries: [nameButton],
          advanceTime: true,
        };
      if (step === 10)
        return {
          message: '予告がなければ担当名 →「中村」→「この名前にする」。',
          queries: [button('この名前にする'), q('input[aria-label="担当者の名前"]'), nameButton],
        };
      if (step === 11)
        return {
          message: '担当名 →「2nd」で、別レーンの人と入れ替え。',
          queries: [q('[data-lane-swap="2"]'), nameButton],
        };
      if (step === 12)
        return {
          message: '担当名 →「空きにする」。人が抜けたときに。',
          queries: [button('空きにする'), nameButton],
        };
      return {
        message: '担当者なし →「佐藤」で担当を戻します。',
        queries: [q('[data-lane-candidate="佐藤"]'), nameButton],
      };
    }
    case 'discard':
      return step > 0
        ? finishHint(state)
        : {
            message: '赤枠の破棄ボタン → 元の1杯を確認。',
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
