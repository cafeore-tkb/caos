import { MessageSquareText, X } from 'lucide-react';
import { createContext, useContext } from 'react';
import type { CaosCard } from '../common';
import { type CommentAnchor, useCommentPopupPosition } from '../hooks/useCommentPopupPosition';
import { type CardLooks, orderNoLabel } from '../logic/cards';
import { type BoardComment, commentKey } from '../logic/comments';

// Read-only counterparts of current main's marks and list. Training comments stay
// visible for the order; no reply controls or production messaging are connected.
export const FreshCommentsContext = createContext<readonly BoardComment[]>([]);
export const OpenCommentsContext = createContext<((label: string, anchor?: HTMLElement) => void) | null>(null);

export function OrderCommentBadge({
  cards,
  looks,
  orderNo,
}: {
  cards: readonly CaosCard[];
  looks: CardLooks;
  orderNo?: number;
}) {
  const comments = new Map(
    cards
      .flatMap((card) => looks.get(card.key)?.comments ?? [])
      .filter((comment) => orderNo === undefined || comment.orderNo === orderNo)
      .map((comment) => [commentKey(comment), comment])
  );
  if (!comments.size) return null;
  const label = [...new Set([...comments.values()].map((comment) => comment.orderNo))]
    .map((no) => `#${orderNoLabel(no)}`)
    .join('+');
  return <CommentMark count={comments.size} label={label} className="h-6 w-6 shrink-0" />;
}

export function CommentMark({
  count,
  label,
  className = '-top-2 -left-2 absolute z-20 h-7 w-7 border-2 border-white shadow-sm',
}: {
  count: number;
  label: string;
  className?: string;
}) {
  const open = useContext(OpenCommentsContext);
  if (!count) return null;
  const title = `${label} コメント ${count}件`;
  const look = `bg-(color:--caos-comment) flex shrink-0 items-center justify-center rounded-full text-white ${className}`;
  const icon = <MessageSquareText className="h-3/5 w-3/5" />;
  if (!open)
    return (
      <span role="img" aria-label={title} title={title} className={look}>
        {icon}
      </span>
    );
  return (
    <button
      type="button"
      aria-label={`${title}を見る`}
      title={title}
      className={`touch-manipulation ${look}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        open(label, event.currentTarget);
      }}
    >
      {icon}
    </button>
  );
}

const authors = { cashier: 'レジ', master: 'マスター', serve: '提供', others: '連絡' };
export function CommentList({
  comments = [],
  className = '',
}: {
  comments?: readonly BoardComment[];
  className?: string;
}) {
  const withNo = new Set(comments.map((comment) => comment.orderId)).size > 1;
  if (!comments.length) return null;
  return (
    <ul className={`grid gap-1 ${className}`}>
      {comments.map((comment) => (
        <li
          key={commentKey(comment)}
          className="border-(color:--caos-comment) bg-(color:--caos-comment-soft) flex items-start gap-2 rounded-lg border px-2 py-1.5 font-bold text-[14px] text-slate-900"
        >
          <MessageSquareText className="text-(color:--caos-comment) mt-0.5 h-4 w-4 shrink-0" />
          <span className="shrink-0 font-black">
            {withNo && `#${orderNoLabel(comment.orderNo)} `}
            {authors[comment.author]}
          </span>
          <span className="min-w-0 whitespace-pre-wrap break-words">{comment.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function CommentPopup({
  label,
  comments,
  anchor,
  onClose,
}: {
  label: string;
  comments: readonly BoardComment[];
  anchor?: CommentAnchor;
  onClose: () => void;
}) {
  const popup = useCommentPopupPosition(anchor);
  return (
    <section
      ref={popup.ref}
      data-comment-dock
      aria-label={`${label} のコメント`}
      style={anchor ? popup.style : { position: 'fixed', right: 8, bottom: 8, width: 340 }}
      className="border-(color:--caos-comment) fixed z-[150] w-[340px] max-w-[calc(100vw-16px)] rounded-lg border-2 bg-white p-2 shadow-lg"
    >
      <header className="mb-1 flex items-center gap-2">
        <MessageSquareText className="text-(color:--caos-comment) h-4 w-4" />
        <h3 className="text-(color:--caos-comment) min-w-0 flex-1 font-black text-sm">{label} のコメント</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="コメントを閉じる"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded hover:bg-slate-100"
        >
          <X size={18} />
        </button>
      </header>
      <CommentList comments={comments} className="max-h-[40vh] overflow-y-auto" />
    </section>
  );
}
