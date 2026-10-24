import { MessageSquareText, X } from 'lucide-react';
import { CommentList } from '../components/OrderComments';
import { type CommentAnchor, useCommentPopupPosition } from '../hooks/useCommentPopupPosition';
import type { BoardComment } from '../logic/comments';

export { FreshCommentsContext, OpenCommentsContext, StampReplyContext } from '../components/OrderComments';
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
