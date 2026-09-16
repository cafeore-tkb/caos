import React, { useRef, useState } from 'react';
import { ClipboardList, Sparkles } from 'lucide-react';
import { UnassignedOrder } from '../types';

interface UnassignedOrdersPanelProps {
  orders: UnassignedOrder[];
  selectedOrderId?: string | null;
  selectedBeanCode?: UnassignedOrder['beanCode'] | null;
  onSelectOrder?: (orderId: string) => void;
  onSelectQueueOrder?: (order: UnassignedOrder) => void;
  onAssignToBay: (order: UnassignedOrder, bayId: number) => void;
}

export const UnassignedOrdersPanel: React.FC<UnassignedOrdersPanelProps> = ({
  orders,
  selectedOrderId,
  selectedBeanCode,
  onSelectOrder,
  onSelectQueueOrder,
  onAssignToBay,
}) => {
  const suppressNextClick = useRef(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [openPadUid, setOpenPadUid] = useState<string | null>(null);
  const [hoveredBay, setHoveredBay] = useState<number | null>(null);

  const orderUid = (order: UnassignedOrder) => order.ticketUid || order.id;
  const bayAtPoint = (clientX: number, clientY: number) => {
    const target = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-bay-target]');
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
  const orderRanks = new Map<string, number>();
  orders.forEach((order) => {
    if (!orderRanks.has(order.id)) orderRanks.set(order.id, orderRanks.size + 1);
  });

  return (
    <div className="h-full bg-white rounded-lg border border-[#cbd5e1] p-2 shadow-xs flex flex-col overflow-hidden">
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
        </div>
      </div>

      {/* Responsive Grid for up to 12 Orders with Touch-friendly Horizontal/Vertical Scroll */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full grid grid-cols-6 grid-rows-1 gap-1.5">
          {orders.slice(0, 6).map((order, orderIndex) => {
            const isSelected = selectedOrderId === order.id;
            const isSameBean = Boolean(
              selectedBeanCode && !isSelected && selectedBeanCode === order.beanCode
            );
            const queuePosition = orderRanks.get(order.id);

            let cardStyle = 'bg-[#eff6ff] border-[#bfdbfe] text-[#1e3a8a]';
            let badgeStyle = 'bg-[#0f172a] text-white';
            let idColor = 'text-[#1e40af]';

            if (order.cardColor === 'peach') {
              cardStyle = 'bg-[#ffedd5] border-[#fed7aa] text-[#7c2d12]';
              idColor = 'text-[#c2410c]';
            } else if (order.cardColor === 'cyan') {
              cardStyle = 'bg-[#e0f2fe] border-[#bae6fd] text-[#0369a1]';
              idColor = 'text-[#0284c7]';
            } else if (order.cardColor === 'emerald') {
              cardStyle = 'bg-[#064e3b] border-[#047857] text-white';
              badgeStyle = 'bg-[#022c22] text-emerald-300 border border-emerald-600';
              idColor = 'text-white';
            }

            return (
              <div
                key={order.ticketUid || order.id}
                id={`unassigned-${(order.ticketUid || order.id).replace('#', '')}`}
                onClick={() => {
                  if (suppressNextClick.current) {
                    suppressNextClick.current = false;
                    return;
                  }
                  if (onSelectQueueOrder) onSelectQueueOrder(order);
                  else if (onSelectOrder) onSelectOrder(order.id);
                  setOpenPadUid(orderUid(order));
                }}
                onPointerDown={(event) => {
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
                  setHoveredBay(bayAtPoint(event.clientX, event.clientY));
                }}
                onPointerUp={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }
                  const start = dragStart.current;
                  const moved = start ? Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 12 : false;
                  const bayId = moved ? bayAtPoint(event.clientX, event.clientY) : null;
                  dragStart.current = null;
                  if (bayId) {
                    suppressNextClick.current = true;
                    assignToBay(order, bayId);
                  }
                }}
                className={`rounded-lg border p-2 min-h-0 flex flex-col justify-between transition-all hover:shadow-md cursor-pointer touch-manipulation active:scale-[0.98] select-none relative ${openPadUid === orderUid(order) ? 'overflow-visible z-40' : 'overflow-hidden'} ${cardStyle} ${
                  isSelected
                    ? 'ring-4 ring-amber-400 border-amber-500 shadow-lg scale-[1.02] z-10'
                    : isSameBean
                    ? 'ring-2 ring-amber-300 border-amber-400 shadow-sm'
                    : ''
                }`}
              >
                {openPadUid === orderUid(order) && (
                  <div className={`absolute left-0 right-0 h-[104px] z-30 grid grid-cols-3 grid-rows-2 gap-1 rounded-xl bg-slate-950/95 p-1.5 shadow-xl ${orderIndex < 6 ? 'top-0' : 'bottom-0'}`} aria-label={`${order.id}の割当先`}>
                    {[1, 2, 3, 4, 5, 6].map((bayId) => (
                      <button
                        key={bayId}
                        type="button"
                        data-bay-target={bayId}
                        onClick={(event) => {
                          event.stopPropagation();
                          assignToBay(order, bayId);
                        }}
                        disabled={Boolean(order.preferredBaristaId && order.preferredBaristaId !== bayId)}
                        className={`min-h-[44px] rounded-lg border text-[20px] font-mono font-black transition-colors touch-none disabled:bg-slate-700 disabled:text-slate-500 disabled:border-slate-700 ${hoveredBay === bayId ? 'border-white bg-blue-500 text-white' : order.preferredBaristaId === bayId ? 'border-violet-300 bg-violet-600 text-white' : 'border-slate-500 bg-white text-slate-950'}`}
                      >
                        {bayId}
                      </button>
                    ))}
                  </div>
                )}
                {/* Linked Order Highlight Pill */}
                {isSelected && (
                  <div className="absolute -top-2.5 left-2 bg-amber-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1 z-20">
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>連動選択中</span>
                  </div>
                )}

                {isSameBean && (
                  <div className="absolute -top-2.5 right-2 bg-amber-200 text-amber-950 border border-amber-400 text-[9px] font-black px-2 py-0.5 rounded-full shadow-xs">
                    同じ豆
                  </div>
                )}

                {/* Top row: Big ID and Cup/Badge tag */}
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="w-6 h-6 rounded bg-slate-900 text-white flex items-center justify-center font-mono text-[12px] font-black leading-none">
                        {queuePosition}
                      </span>
                      <span className={`font-mono text-[25px] font-black ${idColor} tracking-tight leading-none`}>
                        {order.id}
                      </span>
                    </div>
                    <span className={`text-[12px] font-black px-2 py-1 rounded leading-none shrink-0 ${order.preferredBaristaId ? 'bg-violet-700 text-white' : badgeStyle}`}>
                      {order.preferredBaristaId ? `指名 ${order.preferredBaristaId}` : `${order.cupCount}杯`}
                    </span>
                  </div>

                  {/* Coffee Name - Clean display without cut off */}
                  <h3 className="font-bold text-[15px] leading-snug truncate" title={order.beanName}>
                    {order.beanName} ×{order.cupCount}
                  </h3>
                </div>
              </div>
            );
          })}

          {orders.length === 0 && (
            <div className="col-span-full py-8 text-center text-slate-400 text-xs border border-dashed rounded-md">
              未割当オーダーはありません。全件各ドリッパーに配分済みです。
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
