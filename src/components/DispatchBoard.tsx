import { RotateCcw, Sparkles, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { Barista, BeanCode, OrderTicket } from '../types';
import { BayLaneRow } from './BayLaneRow';

interface DispatchBoardProps {
  baristas: Barista[];
  highlightFilter: BeanCode | null;
  selectedOrderId: string | null;
  onSelectOrder: (orderId: string) => void;
  onAdvanceBay: (bayId: number) => void;
  onOpenTicketDetail: (ticket: OrderTicket) => void;
  actionTicketKey?: string | null;
  onMoveTicket: (ticket: OrderTicket, bayId: number) => void;
  onReturnToUnassigned: (ticket: OrderTicket) => void;
  onCloseTicketAction: () => void;
  onRequestRebrew: (ticket: OrderTicket, bayId: number) => void;
  onOpenEmptySlot: (bayId: number) => void;
  simTimeSec: number;
  timelineCommand: { direction: 'back' | 'now' | 'forward'; id: number } | null;
}

const PIXELS_PER_SEC = 1.2; // 1 min = 72px
const STICKY_LEFT_WIDTH = 290; // 195px barista + 95px action
// 90 seconds of past context remains visible to the left of NOW.
const NOW_VIEWPORT_OFFSET = 90 * PIXELS_PER_SEC;

export const DispatchBoard: React.FC<DispatchBoardProps> = ({
  baristas,
  highlightFilter,
  selectedOrderId,
  onSelectOrder,
  onAdvanceBay,
  onOpenTicketDetail,
  actionTicketKey,
  onMoveTicket,
  onReturnToUnassigned,
  onCloseTicketAction,
  onRequestRebrew,
  onOpenEmptySlot,
  simTimeSec,
  timelineCommand,
}) => {
  // Build a rolling 12-hour timeline from the current real-world hour.
  const timelineStartSec = Math.floor(simTimeSec / 3600) * 3600;
  const timelineEndSec = timelineStartSec + 12 * 3600;
  const timelineWidthPx = (timelineEndSec - timelineStartSec) * PIXELS_PER_SEC;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [hasInitializedScroll, setHasInitializedScroll] = useState(false);
  const [isPastView, setIsPastView] = useState(false);

  const _formatClock = (seconds: number) => {
    const normalized = ((seconds % 86400) + 86400) % 86400;
    const hours = Math.floor(normalized / 3600);
    const minutes = Math.floor((normalized % 3600) / 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  // Position of current NOW cursor along timeline
  const nowX = (simTimeSec - timelineStartSec) * PIXELS_PER_SEC;

  // Keep NOW at one fixed screen position; the timeline moves underneath it.
  useEffect(() => {
    if (!scrollContainerRef.current || isPastView) return;
    scrollContainerRef.current.scrollLeft = Math.max(0, nowX - NOW_VIEWPORT_OFFSET);
    if (!hasInitializedScroll) setHasInitializedScroll(true);
  }, [nowX, hasInitializedScroll, isPastView]);

  // Track scroll position to indicate if viewing past
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const currentLeft = scrollContainerRef.current.scrollLeft;
    // If scrolled significantly to the left of NOW
    setIsPastView(currentLeft < nowX - 600);
  };

  useEffect(() => {
    if (!timelineCommand) return;
    const targetSec =
      timelineCommand.direction === 'back'
        ? simTimeSec - 300
        : timelineCommand.direction === 'forward'
          ? simTimeSec + 300
          : simTimeSec;
    const targetX = (targetSec - timelineStartSec) * PIXELS_PER_SEC;
    scrollContainerRef.current?.scrollTo({
      left: Math.max(0, targetX - 380),
      behavior: 'smooth',
    });
  }, [timelineCommand, simTimeSec, timelineStartSec]);

  // Generate timeline markers every 1 minute, with major labels every 5 minutes
  const timeMarkers = [];
  for (let sec = timelineStartSec; sec <= timelineEndSec; sec += 60) {
    const m = Math.floor(sec / 60) % 60;
    const h = Math.floor(sec / 3600) % 24;
    const isMajor = m % 5 === 0;
    const left = (sec - timelineStartSec) * PIXELS_PER_SEC;

    timeMarkers.push({
      sec,
      timeStr: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`,
      minuteStr: `:${m.toString().padStart(2, '0')}`,
      isMajor,
      isHour: m === 0,
      left,
    });
  }

  // Find all cards matching selectedOrderId to summarize
  const matchingTickets: { baristaName: string; beanName: string; cupCount: number; bayNumber: number }[] = [];
  if (selectedOrderId) {
    baristas.forEach((b) => {
      [...(b.pastTickets || []), ...b.queue].forEach((t) => {
        if (t.id === selectedOrderId) {
          matchingTickets.push({
            baristaName: b.name,
            bayNumber: b.bayNumber,
            beanName: t.beanName,
            cupCount: t.cupCount,
          });
        }
      });
    });
  }

  return (
    <div className="bg-white rounded-lg border border-[#cbd5e1] shadow-xs flex flex-col relative overflow-hidden shrink-0">
      {isPastView && (
        <div className="h-[28px] px-3 bg-amber-50 border-b border-amber-200 text-amber-900 text-[11px] font-bold flex items-center gap-1">
          <RotateCcw className="w-3 h-3" />
          <span>過去の抽出履歴を表示中</span>
        </div>
      )}

      {/* 2. Linked Order Highlight Banner (when an order is selected) */}
      {selectedOrderId && (
        <div className="h-[42px] bg-amber-500 text-white px-3 flex items-center justify-between text-xs font-bold shadow-xs select-none">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1 bg-amber-600 px-2 py-0.5 rounded font-mono font-black text-[20px]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{selectedOrderId}</span>
            </span>
            <span>連動:</span>
            <span className="bg-amber-600/90 text-amber-100 px-2 py-0.5 rounded font-normal">
              {matchingTickets.length > 0
                ? matchingTickets
                    .map((m) => `ドリッパー ${m.bayNumber} ${m.baristaName}: ${m.beanName} ${m.cupCount}杯`)
                    .join(' ＋ ')
                : 'オーダー詳細表示'}
            </span>
          </div>

          <button
            onClick={() => onSelectOrder('')}
            className="min-w-[52px] min-h-[34px] px-2 bg-amber-700 hover:bg-amber-800 rounded-lg flex items-center justify-center gap-1 text-[11px] font-bold cursor-pointer transition-colors touch-manipulation"
          >
            <X className="w-3.5 h-3.5" />
            <span>解除</span>
          </button>
        </div>
      )}

      {/* 3. Master Synchronized Horizontal Scroll Container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="overflow-x-auto overflow-y-hidden select-none touch-auto overscroll-x-contain"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="relative" style={{ width: `${STICKY_LEFT_WIDTH + timelineWidthPx}px` }}>
          {/* 3A. Synchronized Timeline Scale Header */}
          <div className="h-[30px] bg-[#f8fafc] border-b border-[#e2e8f0] flex items-center text-[11px] font-mono font-medium text-slate-500 relative">
            {/* Sticky Left Header Cell (290px = 95px Action + 195px Barista) */}
            <div className="sticky left-0 z-[60] w-[290px] shrink-0 h-full text-[11px] font-sans font-bold text-slate-500 flex items-center bg-[#f8fafc] border-r border-[#cbd5e1] shadow-[4px_0_10px_rgba(15,23,42,0.08)] isolate">
              <span className="w-[95px] px-3 text-center">操作</span>
              <span className="w-[195px] px-3 border-l border-slate-200">ドリッパー / 抽出担当</span>
            </div>

            {/* Scrollable Ruler Track with Ticks & Labels */}
            <div className="relative h-full" style={{ width: `${timelineWidthPx}px` }}>
              {timeMarkers.map((marker) => (
                <div
                  key={marker.sec}
                  className="absolute top-0 bottom-0 flex flex-col justify-between"
                  style={{ left: `${marker.left}px` }}
                >
                  <div
                    className={`h-[7px] ${
                      marker.isHour
                        ? 'bg-slate-700 h-[12px] w-[2px]'
                        : marker.isMajor
                          ? 'bg-slate-400 h-[10px] w-[1px]'
                          : 'bg-slate-300 w-[1px]'
                    }`}
                  />
                  {marker.isMajor ? (
                    <span className="font-bold text-slate-800 -translate-x-1/2 text-[11px]">{marker.timeStr}</span>
                  ) : (
                    <span className="text-slate-400 -translate-x-1/2 text-[9px]">{marker.minuteStr}</span>
                  )}
                  <div
                    className={`h-[7px] ${
                      marker.isHour
                        ? 'bg-slate-700 h-[12px] w-[2px]'
                        : marker.isMajor
                          ? 'bg-slate-400 h-[10px] w-[1px]'
                          : 'bg-slate-300 w-[1px]'
                    }`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 3B. Synchronized Bay Rows Container */}
          <div className="relative divide-y divide-[#e2e8f0]">
            {[...baristas]
              .sort((a, b) => a.bayNumber - b.bayNumber)
              .map((barista) => (
                <BayLaneRow
                  key={barista.id}
                  barista={barista}
                  highlightFilter={highlightFilter}
                  selectedOrderId={selectedOrderId}
                  onSelectOrder={onSelectOrder}
                  onAdvanceBay={onAdvanceBay}
                  onOpenTicketDetail={onOpenTicketDetail}
                  actionTicketKey={actionTicketKey}
                  onMoveTicket={onMoveTicket}
                  onReturnToUnassigned={onReturnToUnassigned}
                  onCloseTicketAction={onCloseTicketAction}
                  onRequestRebrew={onRequestRebrew}
                  onOpenEmptySlot={onOpenEmptySlot}
                  timelineStartSec={timelineStartSec}
                  pixelsPerSec={PIXELS_PER_SEC}
                  timelineWidthPx={timelineWidthPx}
                  simTimeSec={simTimeSec}
                />
              ))}
          </div>
          {timeMarkers
            .filter((marker) => marker.isHour)
            .map((marker) => (
              <div
                key={`hour-line-${marker.sec}`}
                className="absolute top-[30px] bottom-0 z-20 w-[2px] bg-slate-500/70 pointer-events-none"
                style={{ left: `${STICKY_LEFT_WIDTH + marker.left}px` }}
                aria-hidden="true"
              />
            ))}
        </div>
        <div
          className="absolute bottom-0 z-40 w-[2px] bg-red-500 pointer-events-none"
          style={{
            left: `${STICKY_LEFT_WIDTH + NOW_VIEWPORT_OFFSET}px`,
            top: selectedOrderId ? '86px' : '44px',
          }}
          aria-hidden="true"
        >
          <div className="absolute top-1 -translate-x-1/2 rounded-md bg-red-500 px-2 py-0.5 text-[10px] font-black text-white shadow-sm">
            NOW
          </div>
        </div>
      </div>
    </div>
  );
};
