import { useEffect, useMemo, useRef, useState } from 'react';
import type { ControlViewMode, ControlViewProps } from '../../components/ControlWorkspace';
import type { OrderTicket, UnassignedOrder } from '../../types';
import type { CaosCard } from '../common';
import { ControlWorkspace as CurrentWorkspace } from '../components/ControlWorkspace';
import { FloatingWindowsProvider } from '../components/FloatingWindows';
import { OrderChatPanel } from '../components/OrderChatPanel';
import { OrderSearchPanel } from '../components/OrderSearchPanel';
import { CurrentLanesContext } from '../hooks/useCaosLanes';
import { useCardMenu } from '../hooks/useCardMenu';
import type { CommentAnchor } from '../hooks/useCommentPopupPosition';
import { OrderHighlightsContext, useOrderHighlightState } from '../hooks/useOrderHighlights';
import { useOrderSearch } from '../hooks/useOrderSearch';
import { selectedComments } from '../logic/cards';
import type { BoardComment } from '../logic/comments';
import { nextAvailableBays } from '../logic/queue';
import { scrollCardIntoView } from '../utils/scrollToCard';
import { AssignPanel } from './AssignPanel';
import { convertBoard } from './convertBoard';
import { CommentPopup, FreshCommentsContext, OpenCommentsContext, StampReplyContext } from './OrderComments';

export function LegacyBoard(props: ControlViewProps & { mode: ControlViewMode }) {
  const firstSeen = useRef(new Map<string, number>());
  const [replies, setReplies] = useState<BoardComment[]>([]);
  const board = useMemo(
    () => convertBoard({ ...props, orderComments: [...(props.orderComments ?? []), ...replies] }, firstSeen.current),
    [props, replies]
  );
  const highlight = useOrderHighlightState(board.cards, 'standalone', (key) => scrollCardIntoView(key));
  const latestCards = useRef(board.cards);
  latestCards.current = board.cards;
  useEffect(() => {
    if (!props.selectedOrderId) return;
    highlight.selectLabel(props.selectedOrderId);
    for (const card of latestCards.current.filter((card) =>
      card.cups.some((cup) => props.selectedOrderId?.split('+').includes(`#${String(cup.orderNo).padStart(3, '0')}`))
    ))
      scrollCardIntoView(card.key);
  }, [props.selectedOrderId, highlight.selectLabel]);
  const [tab, setTab] = useState<'unassigned' | 'unfinished'>('unassigned');
  const [laneInfo, setLaneInfo] = useState<number | null>(null);
  const [viewingComments, setViewingComments] = useState<{ label: string; anchor?: CommentAnchor } | null>(null);
  const openComments = (label: string, anchor?: HTMLElement) => {
    props.onInteraction?.('comments');
    setViewingComments({
      label,
      anchor: anchor ? { element: anchor, rect: anchor.getBoundingClientRect() } : undefined,
    });
  };
  const [folded, setFolded] = useState(false);
  const [digits, setDigits] = useState('');
  const search = useOrderSearch({
    digits: props.searchOpen ? digits : null,
    open: (value) => {
      setDigits(value);
      props.onOpenSearch?.();
    },
    setDigits,
    close: () => {
      props.onCloseSearch?.();
      if (Number(digits) === 1 && board.orders.some((order) => order.orderId === 1)) props.onInteraction?.('search');
    },
    selectOrder: (label) => {
      props.onSelectOrder(label ?? '');
    },
    keyboardEnabled: Boolean(props.onOpenSearch),
    view: props.mode,
    orders: board.orders,
    cards: board.cards,
    lanes: board.lanes,
    comments: new Map(
      board.orders.map((order) => [order.id, board.comments.filter((comment) => comment.orderId === order.id)])
    ),
    nowMs: board.nowMs,
  });
  const original = (card: CaosCard) => board.originals.get(card.key);
  const cardMenu = useCardMenu({
    onRun: (card, action) => {
      const input = original(card);
      if (!input) return;
      if (action === 'start' || action === 'finish') card.dripper !== null && props.onAdvanceBay(card.dripper);
      else if (action === 'unstart') card.dripper !== null && props.onUnstartBay?.(card.dripper);
      else if (action === 'unassign') props.onReturnToUnassigned(input as OrderTicket);
      else if (action.startsWith('assign:')) props.onMoveTicket(input as OrderTicket, Number(action.slice(7)));
    },
    onEmergency: (card) => {
      const input = original(card);
      if (input) props.onRequestRebrew(input as OrderTicket, card.dripper ?? 0);
    },
    onComments: openComments,
  });
  return (
    <div
      className="caos-root h-full min-h-0"
      onClickCapture={(event) => {
        if (event.target instanceof Element) {
          if (event.target.closest('[data-order-highlight-card]')) props.onInteraction?.('highlight');
          if (event.target.closest('[role="tab"]')?.textContent?.includes('一覧')) props.onInteraction?.('all');
        }
      }}
    >
      <OrderHighlightsContext.Provider value={props.mode === 'current' ? highlight : null}>
        <CurrentLanesContext.Provider
          value={{
            bays: props.baristas,
            editable: props.onOpenLane !== undefined,
            onOpen: (id) => {
              if (props.onOpenLane) props.onOpenLane(id);
              else {
                setLaneInfo(id);
                props.onInteraction?.('lane');
              }
            },
          }}
        >
          <FloatingWindowsProvider>
            <StampReplyContext.Provider
              value={{
                sending: false,
                send: async (orderId, text) => {
                  const order = board.cards.flatMap((card) => card.cups).find((cup) => cup.orderId === orderId);
                  if (!order || !text.trim()) return false;
                  setReplies((previous) => [
                    ...previous,
                    {
                      orderId,
                      orderNo: order.orderNo,
                      author: 'master',
                      text: text.trim().slice(0, 200),
                      createdAt: new Date(board.nowMs + replies.length + 1),
                    },
                  ]);
                  props.onInteraction?.('reply');
                  return true;
                },
              }}
            >
              <FreshCommentsContext.Provider value={board.comments}>
                <OpenCommentsContext.Provider value={openComments}>
                  <CurrentWorkspace
                    mode={props.mode === 'current' ? 'a' : 'c'}
                    lanes={board.lanes}
                    unassignedOrders={board.cards.filter((card) => card.status === 'unassigned')}
                    looks={board.looks}
                    orders={board.orders}
                    commentsPanel={
                      props.mode === 'c' && viewingComments ? (
                        <OrderChatPanel
                          label={viewingComments.label}
                          comments={selectedComments(board.cards, board.looks, viewingComments.label)}
                          onClose={() => setViewingComments(null)}
                        />
                      ) : undefined
                    }
                    unassignedFold={{ folded, toggle: () => setFolded((previous) => !previous) }}
                    nextAvailable={nextAvailableBays(board.lanes, board.nowMs)}
                    nowMs={board.nowMs}
                    selectedOrderId={props.selectedOrderId}
                    timelineCommand={
                      props.timelineCommand?.direction === 'now'
                        ? { direction: 'now', id: props.timelineCommand.id }
                        : null
                    }
                    onSelectOrder={(label) => props.onSelectOrder(label ?? '')}
                    cardMenu={cardMenu}
                    onHoldCard={(card) => {
                      const input = original(card);
                      if (input)
                        card.status === 'queued'
                          ? props.onOpenTicketDetail(input as OrderTicket)
                          : props.onRequestRebrew(input as OrderTicket, card.dripper ?? 0);
                    }}
                    onOpenEmptySlot={props.onOpenEmptySlot}
                    onOpenLane={(id) => {
                      if (props.onOpenLane) props.onOpenLane(id);
                      else {
                        setLaneInfo(id);
                        props.onInteraction?.('lane');
                      }
                    }}
                    onAssignToBay={(card, bayId, place) => {
                      const input = original(card);
                      if (input) props.onAssignToBay(input as UnassignedOrder, bayId, place);
                    }}
                    onMoveTicket={(card, bayId, place) => {
                      const input = original(card);
                      if (input) props.onMoveTicket(input as OrderTicket, bayId, place);
                    }}
                    onReturnToUnassigned={(card) => {
                      const input = original(card);
                      if (input) props.onReturnToUnassigned(input as OrderTicket);
                    }}
                    onMergeOrders={props.onMergeOrders}
                    onSplitCup={(card, cupId) =>
                      props.onSplitCup?.(card.key, card.cups.find((cup) => cup.id === cupId)?.cupId ?? cupId)
                    }
                    unfinished={{
                      tab,
                      onSelectTab: (value) => {
                        setTab(value);
                        props.onInteraction?.(value);
                      },
                      rows: board.rows,
                      badge: board.rows.filter((row) => row.late).length,
                      selectedOrderId: props.selectedOrderId,
                      onSelectOrder: (no) => props.onSelectOrder(`#${String(no).padStart(3, '0')}`),
                    }}
                  />
                  {viewingComments && props.mode === 'current' && (
                    <CommentPopup
                      key={viewingComments.label}
                      label={viewingComments.label}
                      anchor={viewingComments.anchor}
                      comments={selectedComments(board.cards, board.looks, viewingComments.label)}
                      onClose={() => setViewingComments(null)}
                    />
                  )}
                  {props.searchOpen && (
                    <OrderSearchPanel
                      digits={digits}
                      found={search.found}
                      pending={search.pending}
                      looks={board.looks}
                      onKey={search.press}
                      onClose={search.finish}
                    />
                  )}
                  {props.emptyBay !== null && props.emptyBay !== undefined && (
                    <AssignPanel
                      bayId={props.emptyBay}
                      lanes={board.lanes}
                      unassignedOrders={board.cards.filter((card) => card.status === 'unassigned')}
                      looks={board.looks}
                      onClose={() => props.onCloseEmptySlot?.()}
                      onAssign={(card, bayId) => {
                        const input = original(card);
                        if (input) props.onAssignToBay(input as UnassignedOrder, bayId);
                      }}
                    />
                  )}
                  {laneInfo !== null && (
                    <aside
                      className="absolute top-16 right-3 z-[100] w-80 rounded-xl border border-slate-300 bg-white p-5 shadow-xl"
                      aria-label="ドリッパーの情報"
                    >
                      <button type="button" className="float-right min-h-11 px-3" onClick={() => setLaneInfo(null)}>
                        閉じる
                      </button>
                      <h2 className="font-black">
                        {laneInfo}番 {props.baristas.find((bay) => bay.id === laneInfo)?.name}
                      </h2>
                      <p className="mt-4 text-sm">1・6番は上級生。限定豆を担当できます。</p>
                    </aside>
                  )}
                </OpenCommentsContext.Provider>
              </FreshCommentsContext.Provider>
            </StampReplyContext.Provider>
          </FloatingWindowsProvider>
        </CurrentLanesContext.Provider>
      </OrderHighlightsContext.Provider>
    </div>
  );
}
