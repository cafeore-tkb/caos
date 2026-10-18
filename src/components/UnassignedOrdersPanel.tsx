import { ClipboardList, Combine, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { seniorOnly } from '../training/master';
import type { Barista, UnassignedOrder } from '../types';
import { canMergeDripUnits } from '../utils/orderQueue';
import { OperationalCard } from './OperationalCard';
import { ScrollArea } from './ScrollArea';

interface UnassignedOrdersPanelProps {
  orders: UnassignedOrder[];
  baristas: Barista[];
  nextAvailable: { bayNumber: number; seconds: number; isStandby: boolean }[];
  layout?: 'strip' | 'sidebar';
  selectedOrderId?: string | null;
  onSelectOrder?: (orderId: string) => void;
  onSelectQueueOrder?: (order: UnassignedOrder) => void;
  onClearSelection?: () => void;
  onAssignToBay: (order: UnassignedOrder, bayId: number) => void;
  onMergeOrders?: (firstUid: string, secondUid: string) => void;
}
const keyOf = (card: UnassignedOrder) => card.ticketUid ?? card.id;
export const UnassignedOrdersPanel: React.FC<UnassignedOrdersPanelProps> = ({
  orders,
  baristas,
  layout = 'strip',
  selectedOrderId,
  onSelectOrder,
  onSelectQueueOrder,
  onClearSelection,
  onAssignToBay,
  onMergeOrders,
}) => {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [trackSlot, setTrackSlot] = useState<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{ order: UnassignedOrder; x: number; y: number } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const suppress = useRef(false);
  const picked = orders.find((card) => keyOf(card) === selectedKey);
  const sidebar = layout === 'sidebar';
  useEffect(() => {
    if (selectedKey && !picked) setSelectedKey(null);
  }, [picked, selectedKey]);
  const groups = new Map<string, UnassignedOrder[]>();
  for (const order of orders) groups.set(order.id, [...(groups.get(order.id) ?? []), order]);
  const allowed = (order: UnassignedOrder, bay: Barista) =>
    (!order.preferredBaristaId || order.preferredBaristaId === bay.id) &&
    (!seniorOnly(order.beanName) || bay.canHandleSpecial);
  const clear = () => {
    setSelectedKey(null);
    onClearSelection?.();
  };
  const select = (order: UnassignedOrder) => {
    if (picked && onMergeOrders && canMergeDripUnits(picked, order)) {
      onMergeOrders(keyOf(picked), keyOf(order));
      clear();
      return;
    }
    if (selectedKey === keyOf(order)) {
      clear();
      return;
    }
    setSelectedKey(keyOf(order));
    if (onSelectQueueOrder) onSelectQueueOrder(order);
    else onSelectOrder?.(order.id);
  };
  const assign = (order: UnassignedOrder, bay: Barista) => {
    if (!allowed(order, bay)) return;
    onAssignToBay(order, bay.id);
    clear();
  };
  return (
    <section
      className="flex h-full min-h-0 flex-col rounded-lg border border-slate-300 bg-white"
      aria-label="未割当の注文"
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-3">
        <ClipboardList size={16} />
        <h2 className="shrink-0 text-[15px] font-black">未割当</h2>
        <span className="shrink-0 text-[12px] font-bold">
          {groups.size}件 <small>{orders.reduce((sum, order) => sum + order.cupCount, 0)}杯</small>
        </span>
        {!sidebar && <div ref={setTrackSlot} className="ml-2 h-5 min-w-12 flex-1" />}
        {picked && (
          <button
            type="button"
            className="ml-auto grid min-h-9 min-w-9 place-items-center"
            onClick={clear}
            aria-label="注文の選択を解除"
          >
            <X size={16} />
          </button>
        )}
      </header>
      {orders.length === 0 ? (
        <p className="py-8 text-center text-[13px] font-bold text-slate-400">未割当の注文はありません</p>
      ) : (
        <ScrollArea
          axis={sidebar ? 'y' : 'x'}
          {...(!sidebar ? { trackSlot } : {})}
          className="flex-1"
          scrollerClassName={sidebar ? 'space-y-2 p-3' : 'flex items-start gap-2 p-3'}
        >
          {[...groups].map(([id, cards]) => (
            <article
              key={id}
              className={
                sidebar ? 'rounded-lg border border-slate-200 p-2' : 'h-full w-[196px] shrink-0 overflow-y-auto'
              }
            >
              <h3 className="mb-2 text-[12px] font-black text-slate-600">注文 {id}</h3>
              <div className={sidebar ? 'grid grid-cols-2 gap-2' : 'flex flex-col gap-2'}>
                {cards.map((order) => {
                  const selected = selectedKey === keyOf(order);
                  const merge = Boolean(picked && onMergeOrders && canMergeDripUnits(picked, order));
                  return (
                    <div key={keyOf(order)} className="relative" data-unassigned-uid={keyOf(order)}>
                      <button
                        type="button"
                        aria-label={`${order.id} ${order.beanName} ${order.cupCount}杯を選択`}
                        className={`relative h-[94px] w-full ${selected ? 'touch-none' : 'touch-pan-y'}`}
                        onClick={() => {
                          if (suppress.current) {
                            suppress.current = false;
                            return;
                          }
                          select(order);
                        }}
                        onPointerDown={(event) => {
                          if (event.button !== 0 && event.pointerType === 'mouse') return;
                          start.current = { x: event.clientX, y: event.clientY };
                          suppress.current = false;
                          event.currentTarget.setPointerCapture(event.pointerId);
                        }}
                        onPointerMove={(event) => {
                          if (!start.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
                          const dx = event.clientX - start.current.x;
                          const dy = event.clientY - start.current.y;
                          if (Math.hypot(dx, dy) < 12 || (!selected && Math.abs(dy) > Math.abs(dx))) return;
                          setDrag({ order, x: event.clientX, y: event.clientY });
                        }}
                        onPointerUp={(event) => {
                          if (event.currentTarget.hasPointerCapture(event.pointerId))
                            event.currentTarget.releasePointerCapture(event.pointerId);
                          if (drag) {
                            suppress.current = true;
                            const target = document
                              .elementsFromPoint(event.clientX, event.clientY)
                              .map((element) => element.closest<HTMLElement>('[data-bay-target]'))
                              .find(Boolean);
                            const bay = baristas.find((entry) => entry.id === Number(target?.dataset.bayTarget));
                            if (bay) assign(order, bay);
                          }
                          start.current = null;
                          setDrag(null);
                        }}
                        onPointerCancel={() => {
                          start.current = null;
                          setDrag(null);
                        }}
                      >
                        <OperationalCard
                          card={order}
                          size="queue"
                          selected={selected || selectedOrderId === order.id}
                        />
                        {merge && (
                          <span className="absolute inset-0 flex items-center justify-center gap-1 rounded-lg border-2 border-blue-600 bg-blue-50/95 text-[13px] font-black text-blue-800">
                            <Combine size={16} />
                            統合する
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </ScrollArea>
      )}
      {picked && (
        <div
          className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 p-2"
          aria-label={`${picked.id}の割当先`}
        >
          <span className={`truncate text-[12px] font-black ${sidebar ? 'w-full' : ''}`}>
            {picked.id} {picked.beanName} →
          </span>
          <div className="grid grid-cols-6 gap-1">
            {baristas.map((bay) => (
              <button
                type="button"
                key={bay.id}
                data-bay-target={bay.id}
                disabled={!allowed(picked, bay)}
                aria-label={`${picked.id}を${bay.id}番に割当`}
                onClick={() => assign(picked, bay)}
                className="min-h-11 min-w-11 rounded-md border border-slate-300 bg-white font-mono text-[18px] font-black disabled:bg-slate-100 disabled:text-slate-300"
              >
                {bay.id}
              </button>
            ))}
          </div>
        </div>
      )}
      {drag &&
        createPortal(
          <div
            aria-hidden
            className="pointer-events-none fixed z-[1000] h-[94px] w-[196px] opacity-90 shadow-2xl"
            style={{ left: drag.x - 98, top: drag.y - 47 }}
          >
            <OperationalCard card={drag.order} selected />
          </div>,
          document.body
        )}
    </section>
  );
};
