import { MessageCircle } from 'lucide-react';
import { createContext } from 'react';
import type { BoardComment } from '../logic/comments';
export const FreshCommentsContext = createContext<BoardComment[]>([]);
export const CommentMark = ({ count, label, className }: { count: number; label: string; className?: string }) => count ? <span title={`${label} コメント${count}件`} className={className}><MessageCircle size={16} /></span> : null;
export const OrderCommentBadge = (_props: { cards: unknown; looks: unknown; orderNo: number }) => null;
export const CommentList = ({ comments, className }: { comments: readonly BoardComment[]; className?: string }) => <div className={className}>{comments.map((comment) => <p key={`${comment.orderId}-${comment.createdAt.toISOString()}-${comment.text}`}>{comment.text}</p>)}</div>;
