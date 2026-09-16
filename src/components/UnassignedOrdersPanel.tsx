import React from 'react';
import { ClipboardList, ArrowRight, Sparkles } from 'lucide-react';
import { UnassignedOrder } from '../types';

interface UnassignedOrdersPanelProps {
  orders: UnassignedOrder[];
  selectedOrderId?: string | null;
  onSelectOrder?: (orderId: string) => void;
  onAssignOrder: (order: UnassignedOrder) => void;
}

export const UnassignedOrdersPanel: React.FC<UnassignedOrdersPanelProps> = ({
  orders,
  selectedOrderId,
  onSelectOrder,
  onAssignOrder,
}) => {
  const totalCups = orders.reduce((sum, o) => sum + o.cupCount, 0);

  return (
    <div className="bg-white rounded-lg border border-[#cbd5e1] p-3 shadow-xs flex-1 flex flex-col justify-between overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-red-500" />
          <h2 className="text-[14px] font-bold text-[#0f172a] tracking-tight">
            未割当・待機キュー
          </h2>
          <span className="bg-red-50 text-red-600 border border-red-200 text-[11px] font-bold px-2 py-0.5 rounded-full font-mono">
            {orders.length} 件 / 計 {totalCups} 杯 (最大12件)
          </span>
        </div>
        <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
          カードをタップして任意のベイへ配分 / 連動確認
        </span>
      </div>

      {/* Responsive Grid for up to 12 Orders with Touch-friendly Horizontal/Vertical Scroll */}
      <div className="max-h-[220px] overflow-y-auto pr-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {orders.map((order) => {
            const isSelected = selectedOrderId === order.id;

            let cardStyle = 'bg-[#eff6ff] border-[#bfdbfe] text-[#1e3a8a]';
            let badgeStyle = 'bg-[#0f172a] text-white';
            let idColor = 'text-[#1e40af]';
            let btnStyle = 'bg-white hover:bg-blue-100 text-blue-700 border-blue-200 active:bg-blue-200';

            if (order.cardColor === 'peach') {
              cardStyle = 'bg-[#ffedd5] border-[#fed7aa] text-[#7c2d12]';
              idColor = 'text-[#c2410c]';
              btnStyle = 'bg-white hover:bg-orange-100 text-orange-700 border-orange-200 active:bg-orange-200';
            } else if (order.cardColor === 'cyan') {
              cardStyle = 'bg-[#e0f2fe] border-[#bae6fd] text-[#0369a1]';
              idColor = 'text-[#0284c7]';
              btnStyle = 'bg-white hover:bg-sky-100 text-sky-700 border-sky-200 active:bg-sky-200';
            } else if (order.cardColor === 'emerald') {
              cardStyle = 'bg-[#064e3b] border-[#047857] text-white';
              badgeStyle = 'bg-[#022c22] text-emerald-300 border border-emerald-600';
              idColor = 'text-white';
              btnStyle = 'bg-[#065f46] hover:bg-[#047857] text-white border-emerald-600 active:bg-emerald-800';
            }

            return (
              <div
                key={order.ticketUid || order.id}
                id={`unassigned-${(order.ticketUid || order.id).replace('#', '')}`}
                onClick={() => {
                  if (onSelectOrder) onSelectOrder(order.id);
                  onAssignOrder(order);
                }}
                className={`rounded-lg border p-3 flex flex-col justify-between transition-all hover:shadow-md cursor-pointer touch-manipulation active:scale-[0.98] select-none relative ${cardStyle} ${
                  isSelected
                    ? 'ring-4 ring-amber-400 border-amber-500 shadow-lg scale-[1.02] z-10'
                    : ''
                }`}
              >
                {/* Linked Order Highlight Pill */}
                {isSelected && (
                  <div className="absolute -top-2.5 left-2 bg-amber-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1 z-20">
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>連動選択中</span>
                  </div>
                )}

                {/* Top row: Big ID and Cup/Badge tag */}
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`font-mono text-[22px] font-black ${idColor} tracking-tight leading-none`}>
                        {order.id}
                      </span>
                      {order.cupCount > 1 && (
                        <span className="bg-amber-500 text-white text-[11px] font-mono font-black px-1.5 py-0.5 rounded leading-none shadow-2xs">
                          {order.cupCount}杯
                        </span>
                      )}
                      {order.totalItemsInOrder && order.totalItemsInOrder > 1 && (
                        <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold px-1.5 py-0.5 rounded leading-none">
                          [{order.itemIndex}/{order.totalItemsInOrder}] 計{order.totalOrderCups}杯
                        </span>
                      )}
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded leading-none shrink-0 ${badgeStyle}`}>
                      {order.badgeTag}
                    </span>
                  </div>

                  {/* Coffee Name - Clean display without cut off */}
                  <h3 className="font-bold text-[13px] leading-snug truncate" title={order.beanName}>
                    {order.beanName}
                  </h3>

                  {order.orderNotes && (
                    <div className="text-[10.5px] opacity-85 truncate mt-0.5 font-medium">
                      {order.orderNotes}
                    </div>
                  )}

                  {/* Standard Forecast Time */}
                  <div className="text-[11px] opacity-90 mt-1 flex items-center gap-1">
                    <span className="text-[10px] opacity-80">標準予測:</span>
                    <span className="font-mono font-bold">{order.predictedTimeStr}</span>
                  </div>
                </div>

                {/* Bottom Recommendation & Touch Button */}
                <div className="flex items-center justify-between pt-2 mt-2 border-t border-black/10">
                  <div className="text-[11px] font-semibold truncate max-w-[140px]" title={order.recommendedBaristas}>
                    {order.recommendedBaristas}
                  </div>

                  <button
                    id={`btn-assign-${(order.ticketUid || order.id).replace('#', '')}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAssignOrder(order);
                    }}
                    className={`min-w-[32px] min-h-[32px] rounded-md flex items-center justify-center border shadow-2xs transition-all active:scale-90 shrink-0 touch-manipulation cursor-pointer ${btnStyle}`}
                    title={`${order.id} を推奨ベイに割り当て`}
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}

          {orders.length === 0 && (
            <div className="col-span-full py-8 text-center text-slate-400 text-xs border border-dashed rounded-md">
              未割当オーダーはありません。全件各ベイに配分済みです。
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


