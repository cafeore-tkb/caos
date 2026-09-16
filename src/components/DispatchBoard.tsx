import React, { useRef, useEffect, useState } from 'react';
import { Sparkles, X, ChevronLeft, ChevronRight, RotateCcw, Clock } from 'lucide-react';
import { Barista, BeanCode, OrderTicket } from '../types';
import { BayLaneRow } from './BayLaneRow';

interface DispatchBoardProps {
  baristas: Barista[];
  highlightFilter: BeanCode | null;
  selectedOrderId: string | null;
  onSelectOrder: (orderId: string) => void;
  onAdvanceBay: (bayId: number) => void;
  onOpenTicketDetail: (ticket: OrderTicket) => void;
  onOpenEmptySlot: (bayId: number) => void;
  simTimeSec: number;
}

// 07:50:00 to 08:25:00 (35 minutes = 2100 seconds)
const TIMELINE_START_SEC = 7 * 3600 + 50 * 60; // 28200
const TIMELINE_END_SEC = 8 * 3600 + 25 * 60; // 30300
const PIXELS_PER_SEC = 1.2; // 1 min = 72px
const TIMELINE_WIDTH_PX = (TIMELINE_END_SEC - TIMELINE_START_SEC) * PIXELS_PER_SEC; // 2520px
const STICKY_LEFT_WIDTH = 290; // 195px barista + 95px action

export const DispatchBoard: React.FC<DispatchBoardProps> = ({
  baristas,
  highlightFilter,
  selectedOrderId,
  onSelectOrder,
  onAdvanceBay,
  onOpenTicketDetail,
  onOpenEmptySlot,
  simTimeSec,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [hasInitializedScroll, setHasInitializedScroll] = useState(false);
  const [isPastView, setIsPastView] = useState(false);

  // Position of current NOW cursor along timeline
  const nowX = (simTimeSec - TIMELINE_START_SEC) * PIXELS_PER_SEC;

  // On mount, center on NOW cursor
  useEffect(() => {
    if (scrollContainerRef.current && !hasInitializedScroll) {
      const targetScroll = Math.max(0, nowX - 420);
      scrollContainerRef.current.scrollLeft = targetScroll;
      setHasInitializedScroll(true);
    }
  }, [nowX, hasInitializedScroll]);

  // Track scroll position to indicate if viewing past
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const currentLeft = scrollContainerRef.current.scrollLeft;
    // If scrolled significantly to the left of NOW
    setIsPastView(currentLeft < nowX - 600);
  };

  // Quick jump navigation
  const scrollToSeconds = (sec: number) => {
    if (!scrollContainerRef.current) return;
    const targetX = (sec - TIMELINE_START_SEC) * PIXELS_PER_SEC;
    scrollContainerRef.current.scrollTo({
      left: Math.max(0, targetX - 380),
      behavior: 'smooth',
    });
  };

  const scrollToNow = () => {
    scrollToSeconds(simTimeSec);
  };

  const scrollRewind10Min = () => {
    scrollToSeconds(simTimeSec - 600);
  };

  const scrollRewind5Min = () => {
    scrollToSeconds(simTimeSec - 300);
  };

  const scrollForward5Min = () => {
    scrollToSeconds(simTimeSec + 300);
  };

  // Generate timeline markers every 1 minute, with major labels every 5 minutes
  const timeMarkers = [];
  for (let sec = TIMELINE_START_SEC; sec <= TIMELINE_END_SEC; sec += 60) {
    const m = Math.floor(sec / 60) % 60;
    const h = Math.floor(sec / 3600) % 24;
    const isMajor = m % 5 === 0;
    const left = (sec - TIMELINE_START_SEC) * PIXELS_PER_SEC;

    timeMarkers.push({
      sec,
      timeStr: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`,
      minuteStr: `:${m.toString().padStart(2, '0')}`,
      isMajor,
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
    <div className="bg-white rounded-lg border border-[#cbd5e1] shadow-xs flex flex-col relative overflow-hidden">
      {/* 1. Interactive Ribbon / Navigation Toolbar */}
      <div className="px-3 py-1.5 bg-[#f1f5f9] border-b border-[#e2e8f0] flex items-center justify-between gap-2 flex-wrap text-xs select-none">
        {/* Left: Rewind & Timeline Navigation Controls */}
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-slate-700 flex items-center gap-1 mr-1">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>タイムライン操作:</span>
          </span>

          <button
            onClick={scrollRewind10Min}
            className="px-2 py-1 bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-300 rounded font-semibold text-slate-700 flex items-center gap-1 transition-all touch-manipulation cursor-pointer shadow-2xs"
            title="10分前のオーダー履歴を表示"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-slate-500" />
            <span>10分前 (07:54)</span>
          </button>

          <button
            onClick={scrollRewind5Min}
            className="px-2 py-1 bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-300 rounded font-semibold text-slate-700 flex items-center gap-1 transition-all touch-manipulation cursor-pointer shadow-2xs"
            title="5分前のオーダー履歴を表示"
          >
            <ChevronLeft className="w-3 h-3 text-slate-500" />
            <span>5分前</span>
          </button>

          <button
            onClick={scrollToNow}
            className="px-2.5 py-1 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-bold rounded flex items-center gap-1 transition-all shadow-2xs touch-manipulation cursor-pointer"
            title="現在時刻(NOW)へ移動"
          >
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            <span>現在 (NOW)</span>
          </button>

          <button
            onClick={scrollForward5Min}
            className="px-2 py-1 bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-300 rounded font-semibold text-slate-700 flex items-center gap-1 transition-all touch-manipulation cursor-pointer shadow-2xs"
            title="5分先の予定を表示"
          >
            <span>5分後</span>
            <ChevronRight className="w-3 h-3 text-slate-500" />
          </button>

          {isPastView && (
            <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded text-[11px] font-bold flex items-center gap-1 animate-pulse">
              <RotateCcw className="w-3 h-3" />
              <span>過去の抽出履歴を表示中</span>
            </span>
          )}
        </div>

        {/* Right: Swipe instruction for iPad */}
        <div className="text-slate-500 text-[11px] font-medium hidden md:flex items-center gap-1">
          <span>👈 タイムラインは左右にスワイプして自由に巻き戻し/先読みできます 👉</span>
        </div>
      </div>

      {/* 2. Linked Order Highlight Banner (when an order is selected) */}
      {selectedOrderId && (
        <div className="bg-amber-500 text-white px-3 py-1.5 flex items-center justify-between text-xs font-bold shadow-xs select-none">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1 bg-amber-600 px-2 py-0.5 rounded font-mono font-black text-sm">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{selectedOrderId}</span>
            </span>
            <span>同一オーダー連動ハイライト中:</span>
            <span className="bg-amber-600/90 text-amber-100 px-2 py-0.5 rounded font-normal">
              {matchingTickets.length > 0
                ? matchingTickets
                    .map((m) => `Bay ${m.bayNumber} ${m.baristaName}: ${m.beanName} ${m.cupCount}杯`)
                    .join(' ＋ ')
                : 'オーダー詳細表示'}
            </span>
          </div>

          <button
            onClick={() => onSelectOrder('')}
            className="px-2 py-0.5 bg-amber-700 hover:bg-amber-800 rounded flex items-center gap-1 text-[11px] font-bold cursor-pointer transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            <span>ハイライト解除</span>
          </button>
        </div>
      )}

      {/* 3. Master Synchronized Horizontal Scroll Container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="overflow-x-auto overflow-y-hidden select-none touch-pan-x"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div style={{ width: `${STICKY_LEFT_WIDTH + TIMELINE_WIDTH_PX}px` }}>
          {/* 3A. Synchronized Timeline Scale Header */}
          <div className="h-[38px] bg-[#f8fafc] border-b border-[#e2e8f0] flex items-center text-[11px] font-mono font-medium text-slate-500 relative">
            {/* Sticky Left Header Cell (290px = 195px Barista + 95px Action) */}
            <div className="sticky left-0 z-30 w-[290px] shrink-0 h-full px-3 text-[11px] font-sans font-bold text-slate-500 flex items-center justify-between bg-[#f8fafc] border-r border-[#cbd5e1] shadow-[2px_0_6px_rgba(0,0,0,0.04)]">
              <span>ベイ / バリスタ</span>
              <span>操作</span>
            </div>

            {/* Scrollable Ruler Track with Ticks & Labels */}
            <div
              className="relative h-full"
              style={{ width: `${TIMELINE_WIDTH_PX}px` }}
            >
              {timeMarkers.map((marker) => (
                <div
                  key={marker.sec}
                  className="absolute top-0 bottom-0 flex flex-col justify-between"
                  style={{ left: `${marker.left}px` }}
                >
                  <div
                    className={`h-[7px] w-[1px] ${
                      marker.isMajor ? 'bg-slate-400 h-[10px]' : 'bg-slate-300'
                    }`}
                  />
                  {marker.isMajor ? (
                    <span className="font-bold text-slate-800 -translate-x-1/2 text-[11px]">
                      {marker.timeStr}
                    </span>
                  ) : (
                    <span className="text-slate-400 -translate-x-1/2 text-[9px]">
                      {marker.minuteStr}
                    </span>
                  )}
                  <div
                    className={`h-[7px] w-[1px] ${
                      marker.isMajor ? 'bg-slate-400 h-[10px]' : 'bg-slate-300'
                    }`}
                  />
                </div>
              ))}

              {/* Red Header NOW Indicator Pill */}
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-30 bg-[#ef4444] text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-md flex items-center gap-1 pointer-events-none"
                style={{ left: `${nowX}px` }}
              >
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                <span>NOW</span>
              </div>
            </div>
          </div>

          {/* 3B. Synchronized Bay Rows Container */}
          <div className="relative divide-y divide-[#e2e8f0]">
            {/* Global Synchronized Red Vertical NOW Guideline */}
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-[#ef4444] pointer-events-none z-10 shadow-xs"
              style={{ left: `${STICKY_LEFT_WIDTH + nowX}px` }}
            >
              <div className="w-2.5 h-2.5 -ml-[4px] -mt-[1px] bg-[#ef4444] rounded-full shadow-md" />
            </div>

            {baristas.map((barista) => (
              <BayLaneRow
                key={barista.id}
                barista={barista}
                highlightFilter={highlightFilter}
                selectedOrderId={selectedOrderId}
                onSelectOrder={onSelectOrder}
                onAdvanceBay={onAdvanceBay}
                onOpenTicketDetail={onOpenTicketDetail}
                onOpenEmptySlot={onOpenEmptySlot}
                timelineStartSec={TIMELINE_START_SEC}
                pixelsPerSec={PIXELS_PER_SEC}
                timelineWidthPx={TIMELINE_WIDTH_PX}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

