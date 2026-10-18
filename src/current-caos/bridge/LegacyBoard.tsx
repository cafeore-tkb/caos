import { useMemo, useRef, useState } from 'react';
import type { ControlViewMode, ControlViewProps } from '../../components/ControlWorkspace';
import type { OrderTicket, UnassignedOrder } from '../../types';
import type { CaosCard } from '../common';
import { ControlWorkspace as CurrentWorkspace } from '../components/ControlWorkspace';
import { FloatingWindowsProvider } from '../components/FloatingWindows';
import { CurrentLanesContext } from '../hooks/useCaosLanes';
import { useCardMenu } from '../hooks/useCardMenu';
import { nextAvailableBays } from '../logic/queue';
import { convertBoard } from './convertBoard';

export function LegacyBoard(props: ControlViewProps & { mode: ControlViewMode }) {
  const firstSeen = useRef(new Map<string, number>());
  const board = useMemo(() => convertBoard(props, firstSeen.current), [props]);
  const [tab, setTab] = useState<'unassigned' | 'unfinished'>('unassigned');
  const [laneInfo, setLaneInfo] = useState<number | null>(null);
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
    onComments: (label) => props.onSelectOrder(label),
  });
  return (
    <div className="caos-root h-full min-h-0">
      <CurrentLanesContext.Provider
        value={{
          bays: props.baristas,
          editable: props.onOpenLane !== undefined,
          onOpen: (id) => {
            if (props.onOpenLane) props.onOpenLane(id);
            else setLaneInfo(id);
          },
        }}
      >
        <FloatingWindowsProvider>
          <CurrentWorkspace
            mode={props.mode === 'current' ? 'a' : 'c'}
            lanes={board.lanes}
            unassignedOrders={board.cards.filter((card) => card.status === 'unassigned')}
            looks={board.looks}
            nextAvailable={nextAvailableBays(board.lanes, board.nowMs)}
            nowMs={board.nowMs}
            selectedOrderId={props.selectedOrderId}
            timelineCommand={
              props.timelineCommand?.direction === 'now' ? { direction: 'now', id: props.timelineCommand.id } : null
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
              else setLaneInfo(id);
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
            onSplitCup={(card, cupId) => props.onSplitCup?.(card.key, cupId)}
            unfinished={{
              tab,
              onSelectTab: setTab,
              rows: board.rows,
              badge: board.rows.filter((row) => row.late).length,
              selectedOrderId: props.selectedOrderId,
              onSelectOrder: (no) => props.onSelectOrder(`#${String(no).padStart(3, '0')}`),
            }}
          />
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
              <p className="mt-4 text-sm">訓練中は担当者の構成が固定です。1・6番は上級生として限定豆を担当できます。</p>
            </aside>
          )}
        </FloatingWindowsProvider>
      </CurrentLanesContext.Provider>
    </div>
  );
}
