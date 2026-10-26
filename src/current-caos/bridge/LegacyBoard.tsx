import { useEffect, useMemo, useRef, useState } from 'react';
import type { ControlViewMode, ControlViewProps } from '../../components/ControlWorkspace';
import type { OrderTicket, UnassignedOrder } from '../../types';
import type { CaosCard } from '../common';
import { ControlWorkspace as CurrentWorkspace } from '../components/ControlWorkspace';
import { FloatingWindowsProvider } from '../components/FloatingWindows';
import { LaneChangeDialog } from '../components/LaneChangeDialog';
import { OrderChatPanel } from '../components/OrderChatPanel';
import { OrderSearchPanel } from '../components/OrderSearchPanel';
import { LanePanel, RebrewPanel, TicketDetailPanel } from '../components/TicketPanels';
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
  const [changingLane, setChangingLane] = useState<number | null>(null);
  const [shiftSettings, setShiftSettings] = useState(false);
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
  const panelCard = props.panelTicketKey ? board.cards.find((card) => card.key === props.panelTicketKey) : undefined;
  const panelLane = board.lanes.find((lane) => lane.id === panelCard?.dripper);
  const infoLane = board.lanes.find((lane) => lane.id === laneInfo);
  const move = {
    onMoveTicket: (card: CaosCard, bayId: number, place?: import('../common').CaosPlace) => {
      const input = original(card);
      if (input) props.onMoveTicket(input as OrderTicket, bayId, place);
    },
    onReturnToUnassigned: (card: CaosCard) => {
      const input = original(card);
      if (input) props.onReturnToUnassigned(input as OrderTicket);
    },
  };
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
            editable: Boolean(props.shift) || props.onOpenLane !== undefined,
            feed: props.shift?.feed ?? null,
            nowMs: board.nowMs,
            onPick: props.shift?.onPick,
            onChange: props.shift ? (id) => setChangingLane(id) : undefined,
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
                    onCancelEmergency={
                      props.onCancelEmergency ? (card) => props.onCancelEmergency?.(card.key) : undefined
                    }
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
                  {panelCard &&
                    props.onClosePanel &&
                    (panelCard.status === 'queued' ? (
                      <TicketDetailPanel
                        ticket={panelCard}
                        look={board.looks.get(panelCard.key)}
                        lane={panelLane}
                        onClose={props.onClosePanel}
                        {...move}
                        onSplitCup={(card, cupId) => props.onSplitCup?.(card.key, cupId)}
                        onCancelEmergency={
                          props.onCancelEmergency ? (card) => props.onCancelEmergency?.(card.key) : undefined
                        }
                      />
                    ) : props.onAddEmergency ? (
                      <RebrewPanel
                        key={panelCard.key}
                        card={panelCard}
                        look={board.looks.get(panelCard.key)}
                        lane={panelLane}
                        orders={board.orders}
                        practice
                        onClose={props.onClosePanel}
                        move={move}
                        onAdd={(cups, reason) =>
                          props.onAddEmergency?.(
                            cups.map((cup) => cup.cupId),
                            reason
                          ) ?? Promise.resolve(null)
                        }
                      />
                    ) : null)}
                  {props.shift && changingLane !== null && board.lanes.find((lane) => lane.id === changingLane) && (
                    <LaneChangeDialog
                      lane={{
                        dripper: changingLane,
                        name: props.baristas.find((bay) => bay.id === changingLane)?.name ?? '',
                        senior: Boolean(props.baristas.find((bay) => bay.id === changingLane)?.canHandleSpecial),
                      }}
                      lanes={props.baristas.map((bay) => ({
                        dripper: bay.id,
                        name: bay.name,
                        senior: Boolean(bay.canHandleSpecial),
                      }))}
                      shiftFeed={{ feed: props.shift.feed, feedKey: '練習シフト', loading: false, error: null }}
                      nowMs={board.nowMs}
                      onPick={(name, senior) => {
                        props.shift?.onPick(changingLane, name, senior);
                        setChangingLane(null);
                      }}
                      onSwap={(other) => {
                        props.shift?.onSwap(changingLane, other);
                        setChangingLane(null);
                      }}
                      onOpenSettings={() => setShiftSettings(true)}
                      onClose={() => setChangingLane(null)}
                    />
                  )}
                  {shiftSettings && (
                    <aside
                      data-caos-layer
                      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4"
                    >
                      <section className="max-w-md rounded-xl bg-white p-6 text-slate-950" aria-label="練習用シフト">
                        <h2 className="font-black text-xl">シフトの予定</h2>
                        <p className="my-3">10:00–11:00 → 11:00–12:00</p>
                        <p>本番は設定の「合言葉」で予定を読み込みます。予定がなくても、名前入力で交代できます。</p>
                        <button
                          type="button"
                          className="mt-4 min-h-11 rounded bg-slate-950 px-5 text-white"
                          onClick={() => setShiftSettings(false)}
                        >
                          閉じる
                        </button>
                      </section>
                    </aside>
                  )}
                  {infoLane && (
                    <LanePanel
                      lane={infoLane}
                      onClose={() => setLaneInfo(null)}
                      onMoveQueue={(from, to) => {
                        for (const card of board.lanes.find((lane) => lane.id === from)?.queued ?? [])
                          move.onMoveTicket(card, to);
                      }}
                    />
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
