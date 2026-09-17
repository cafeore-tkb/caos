import React, { useEffect, useRef, useState } from 'react';
import { ClipboardList, Sparkles } from 'lucide-react';
import { UnassignedOrder } from '../types';
import { MENU_PRESENTATION } from '../utils/menuPresentation';

interface UnassignedOrdersPanelProps {
  orders: UnassignedOrder[];
  nextAvailable: { bayNumber: number; seconds: number; isStandby: boolean }[];
  selectedOrderId?: string | null;
  onSelectOrder?: (orderId: string) => void;
  onSelectQueueOrder?: (order: UnassignedOrder) => void;
  onClearSelection?: () => void;
  onAssignToBay: (order: UnassignedOrder, bayId: number) => void;
  onMergeOrders?: (firstUid: string, secondUid: string) => void;
}

export const UnassignedOrdersPanel: React.FC<UnassignedOrdersPanelProps> = ({
  orders,
  nextAvailable,
  selectedOrderId,
  onSelectOrder,
  onSelectQueueOrder,
  onClearSelection,
  onAssignToBay,
  onMergeOrders,
}) => {
  const suppressNextClick = useRef(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [openPadUid, setOpenPadUid] = useState<string | null>(null);
  const [hoveredBay, setHoveredBay] = useState<number | null>(null);
  const [dragVisual, setDragVisual] = useState<{ uid: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!openPadUid) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      const openCard = document.querySelector(`[data-unassigned-uid="${openPadUid}"]`);
      if (openCard?.contains(target)) return;
      if (target.closest('[data-merge-candidate="true"]')) return;
      setOpenPadUid(null);
      setHoveredBay(null);
      onClearSelection?.();
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress);
  }, [openPadUid, onClearSelection]);

  const orderUid = (order: UnassignedOrder) => order.ticketUid || order.id;
  const bayAtPoint = (clientX: number, clientY: number) => {
    const target = document.elementsFromPoint(clientX, clientY)
      .map((element) => element.closest<HTMLElement>('[data-bay-target]'))
      .find((element) => {
        const bayId = Number(element?.dataset.bayTarget);
        return element && bayId >= 1 && bayId <= 6;
      });
    const bayId = Number(target?.dataset.bayTarget);
    return bayId >= 1 && bayId <= 6 ? bayId : null;
  };

  const assignToBay = (order: UnassignedOrder, bayId: number) => {
    if (order.preferredBaristaId && order.preferredBaristaId !== bayId) return;
    onAssignToBay(order, bayId);
    setOpenPadUid(null);
    setHoveredBay(null);
  };
  const totalCups = orders.reduce((sum, o) => sum + o.cupCount, 0);
  const formatRemaining = (seconds: number) =>
    `${Math.floor(Math.max(0, seconds) / 60)}:${(Math.max(0, seconds) % 60).toString().padStart(2, '0')}`;

  return (
    <div className="h-full bg-white rounded-lg border border-[#cbd5e1] p-2 shadow-xs flex flex-col overflow-visible">
      {/* Header */}
      <div className="h-[34px] flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-red-500" />
          <h2 className="text-[16px] font-black text-[#0f172a] tracking-tight">
            未割当
          </h2>
          <span className="bg-red-50 text-red-600 border border-red-200 text-[11px] font-bold px-2 py-0.5 rounded-full font-mono">
            {orders.length} 件 / {totalCups} 杯
          </span>
          <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
            <span className="ml-1">次に空く:</span>
            {nextAvailable.map((item, index) => (
              <span key={item.bayNumber} className={`rounded border px-1.5 py-0.5 font-mono whitespace-nowrap ${index === 0 ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-300 bg-white text-slate-700'}`}>
                #{item.bayNumber} {item.isStandby ? '待機' : formatRemaining(item.seconds)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Responsive Grid for up to 12 Orders with Touch-friendly Horizontal/Vertical Scroll */}
      <div className="flex-1 min-h-0 overflow-visible">
        <div className="h-full grid grid-cols-6 grid-rows-2 gap-1.5">
          {orders.slice(0, 12).map((order, orderIndex) => {
            const menu = MENU_PRESENTATION[order.beanCode];
            const visibleOrders = orders.slice(0, 12);
            const isOrderBoundary = orderIndex > 0 && visibleOrders[orderIndex - 1]?.id !== order.id;
            const openOrder = orders.find((candidate) => orderUid(candidate) === openPadUid);
            const isMergeCandidate = Boolean(
              openOrder &&
              orderUid(openOrder) !== orderUid(order) &&
              openOrder.cupCount === 1 &&
              order.cupCount === 1 &&
              openOrder.beanCode === order.beanCode &&
              openOrder.preferredBaristaId === order.preferredBaristaId
            );
            const isSelected = selectedOrderId === order.id;
            const cardStyle = order.preferredBaristaId
              ? 'bg-violet-50 border-violet-300 text-slate-900'
              : `${menu.cardClass} ${menu.family === 'premium' ? 'text-white' : 'text-slate-900'}`;
            const idColor = order.preferredBaristaId ? 'text-violet-700' : menu.family === 'premium' ? 'text-white' : 'text-slate-950';

            return (
              <div
                key={order.ticketUid || order.id}
                id={`unassigned-${(order.ticketUid || order.id).replace('#', '')}`}
                data-unassigned-uid={orderUid(order)}
                data-merge-candidate={isMergeCandidate ? 'true' : undefined}
                onClick={() => {
                  if (suppressNextClick.current) {
                    suppressNextClick.current = false;
                    return;
                  }
                  if (isMergeCandidate && openPadUid && onMergeOrders) {
                    onMergeOrders(openPadUid, orderUid(order));
                    setOpenPadUid(null);
                    setHoveredBay(null);
                    return;
                  }
                  if (onSelectQueueOrder) onSelectQueueOrder(order);
                  else if (onSelectOrder) onSelectOrder(order.id);
                  setOpenPadUid(orderUid(order));
                }}
                onPointerDown={(event) => {
                  if (isMergeCandidate) return;
                  if ((event.target as HTMLElement).closest('button[data-bay-target]')) return;
                  if (event.pointerType === 'mouse' && event.button !== 0) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragStart.current = { x: event.clientX, y: event.clientY };
                  setOpenPadUid(orderUid(order));
                  setHoveredBay(null);
                }}
                onPointerMove={(event) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                  const start = dragStart.current;
                  if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 12) return;
                  const bayId = bayAtPoint(event.clientX, event.clientY);
                  setHoveredBay(bayId);
                  setDragVisual({ uid: orderUid(order), x: event.clientX - start.x, y: event.clientY - start.y });
                }}
                onPointerUp={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }
                  const start = dragStart.current;
                  const moved = start ? Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 12 : false;
                  const bayId = moved ? bayAtPoint(event.clientX, event.clientY) : null;
                  dragStart.current = null;
                  setDragVisual(null);
                  if (bayId) {
                    suppressNextClick.current = true;
                    assignToBay(order, bayId);
                  }
                }}
                onPointerCancel={() => {
                  dragStart.current = null;
                  setDragVisual(null);
                  setHoveredBay(null);
                }}
                style={dragVisual?.uid === orderUid(order) ? { transform: `translate3d(${dragVisual.x}px, ${dragVisual.y}px, 0)` } : undefined}
                className={`rounded-lg border p-2 min-h-0 flex flex-col justify-between transition-[box-shadow,border-color] hover:shadow-md cursor-grab active:cursor-grabbing touch-none select-none relative ${dragVisual?.uid === orderUid(order) ? 'overflow-hidden z-[120] scale-[1.03] opacity-90 shadow-2xl ring-2 ring-blue-500' : openPadUid === orderUid(order) ? 'overflow-visible z-40' : 'overflow-hidden'} ${cardStyle} ${
                  isSelected
                    ? 'ring-4 ring-amber-400 border-amber-500 shadow-lg z-10'
                    : ''
                }`}
              >
                {dragVisual?.uid === orderUid(order) && hoveredBay && (
                  <div className="absolute right-1 top-1 z-[130] rounded-full bg-blue-700 px-2 py-1 font-mono text-[12px] font-black text-white shadow-md pointer-events-none">
                    → {hoveredBay}
                  </div>
                )}
                {isOrderBoundary && (
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-slate-500" aria-hidden="true" />
                )}
                {isMergeCandidate && (
                  <div className="absolute inset-0 z-20 rounded-lg border-2 border-blue-500 bg-blue-50/90 pointer-events-none flex items-end justify-center p-1">
                    <span className="rounded bg-blue-600 px-2 py-1 text-[11px] font-black text-white shadow-sm">＋ 2杯にまとめる</span>
                  </div>
                )}
                {openPadUid === orderUid(order) && (
                  <>
                    <div className="absolute -top-[38px] left-0 right-0 z-30 grid h-[34px] grid-cols-3 gap-1 rounded-lg bg-slate-950 p-1 shadow-xl" aria-label={`${order.id}の割当先 1から3`}>
                      {[1, 2, 3].map((bayId) => (
                        <button
                          key={bayId}
                          type="button"
                          data-bay-target={bayId}
                          onClick={(event) => {
                            event.stopPropagation();
                            assignToBay(order, bayId);
                          }}
                          disabled={Boolean(order.preferredBaristaId && order.preferredBaristaId !== bayId)}
                          className={`h-full rounded-md border text-[17px] font-mono font-black transition-colors touch-none disabled:bg-slate-700 disabled:text-slate-500 disabled:border-slate-700 ${hoveredBay === bayId ? 'border-white bg-blue-500 text-white' : order.preferredBaristaId === bayId ? 'border-violet-300 bg-violet-600 text-white' : 'border-slate-300 bg-white text-slate-950'}`}
                        >
                          {bayId}
                        </button>
                      ))}
                    </div>
                    <div className="absolute -bottom-[38px] left-0 right-0 z-30 grid h-[34px] grid-cols-3 gap-1 rounded-lg bg-slate-950 p-1 shadow-xl" aria-label={`${order.id}の割当先 4から6`}>
                      {[4, 5, 6].map((bayId) => (
                      <button
                        key={bayId}
                        type="button"
                        data-bay-target={bayId}
                        onClick={(event) => {
                          event.stopPropagation();
                          assignToBay(order, bayId);
                        }}
                        disabled={Boolean(order.preferredBaristaId && order.preferredBaristaId !== bayId)}
                        className={`h-full rounded-md border text-[17px] font-mono font-black transition-colors touch-none disabled:bg-slate-700 disabled:text-slate-500 disabled:border-slate-700 ${hoveredBay === bayId ? 'border-white bg-blue-500 text-white' : order.preferredBaristaId === bayId ? 'border-violet-300 bg-violet-600 text-white' : 'border-slate-300 bg-white text-slate-950'}`}
                      >
                        {bayId}
                      </button>
                      ))}
                    </div>
                  </>
                )}
                {/* Linked Order Highlight Pill */}
                {isSelected && (
                  <div className="absolute -top-2.5 left-2 bg-amber-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1 z-20">
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>連動選択中</span>
                  </div>
                )}

                {/* Top row: Big ID and Cup/Badge tag */}
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`font-mono text-[25px] font-black ${idColor} tracking-tight leading-none`}>
                        {order.id}
                      </span>
                      {order.totalItemsInOrder && !(order.totalItemsInOrder === 1 && order.totalOrderCups === 1) && (
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-mono font-black text-slate-700 whitespace-nowrap">
                          {order.itemIndex}/{order.totalItemsInOrder}・計{order.totalOrderCups}杯
                        </span>
                      )}
                    </div>
                    <span className={`text-[17px] font-mono font-black px-2.5 py-1 rounded-md leading-none shrink-0 ${order.preferredBaristaId ? 'bg-violet-700 text-white' : 'bg-slate-950 text-white'}`}>
                      {order.cupCount}杯
                    </span>
                  </div>

                  {/* Coffee Name - Clean display without cut off */}
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-[15px] leading-snug truncate" title={order.beanName}>{order.beanName} ×{order.cupCount}</h3>
                    {order.preferredBaristaId && <span className="text-[12px] font-black text-violet-700 whitespace-nowrap">指名 {order.preferredBaristaId}</span>}
                  </div>
                </div>
              </div>
            );
          })}

          {orders.length === 0 && (
            <div className="col-span-full py-8 text-center text-slate-400 text-xs border border-dashed rounded-md">
              レジからのオーダーを待っています
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
