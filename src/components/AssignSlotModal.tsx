import { ArrowRight, Check, X } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import type { Barista, UnassignedOrder } from '../types';

interface AssignSlotModalProps {
  bayId: number | null;
  targetOrder: UnassignedOrder | null;
  baristas: Barista[];
  unassignedOrders: UnassignedOrder[];
  onClose: () => void;
  onAssign: (orderId: string, targetBayId: number) => void;
}

export const AssignSlotModal: React.FC<AssignSlotModalProps> = ({
  bayId,
  targetOrder,
  baristas,
  unassignedOrders,
  onClose,
  onAssign,
}) => {
  const [selectedOrderUid, setSelectedOrderUid] = useState<string>(
    targetOrder
      ? targetOrder.ticketUid || targetOrder.id
      : unassignedOrders[0]?.ticketUid || unassignedOrders[0]?.id || ''
  );
  const [selectedBayId, setSelectedBayId] = useState<number>(
    bayId ?? (targetOrder?.preferredBaristaId || targetOrder?.recommendedBayIds[0] || 1)
  );

  const currentBay = baristas.find((b) => b.id === selectedBayId);
  const selectedOrder = unassignedOrders.find((order) => (order.ticketUid || order.id) === selectedOrderUid);

  return (
    <div className="fixed top-[56px] right-0 bottom-0 z-50 pointer-events-none select-none">
      <div className="context-sheet pointer-events-auto bg-white w-[min(440px,44vw)] min-w-[360px] h-full border-l border-slate-300 shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-[#f8fafc]">
          <h3 className="text-base font-bold text-slate-900">
            {bayId ? `ドリッパー ${bayId} (${currentBay?.name}) にオーダー割当` : 'オーダーの割当'}
          </h3>
          <button
            onClick={onClose}
            className="w-11 h-11 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 touch-manipulation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          {/* 1. Select Order */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">割り当てる未割当オーダー:</label>
            {unassignedOrders.length === 0 ? (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded text-slate-500">
                未割当オーダーがありません
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                {unassignedOrders.map((ord) => {
                  const uid = ord.ticketUid || ord.id;
                  const isSelected = selectedOrderUid === uid;
                  return (
                    <div
                      key={uid}
                      onClick={() => {
                        setSelectedOrderUid(uid);
                        if (ord.preferredBaristaId) setSelectedBayId(ord.preferredBaristaId);
                      }}
                      className={`p-2.5 rounded-lg border flex items-center justify-between cursor-pointer transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/70 shadow-xs ring-1 ring-blue-400'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[16px] font-black text-slate-900">{ord.id}</span>
                          {ord.cupCount > 1 && (
                            <span className="bg-amber-500 text-white text-[10px] font-mono font-bold px-1.5 py-0.5 rounded leading-none">
                              {ord.cupCount}杯
                            </span>
                          )}
                          {ord.totalItemsInOrder && ord.totalItemsInOrder > 1 && (
                            <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold px-1 py-0.5 rounded leading-none">
                              [{ord.itemIndex}/{ord.totalItemsInOrder}]
                            </span>
                          )}
                          <span className="font-bold text-slate-800">{ord.beanName}</span>
                          {ord.preferredBaristaId && (
                            <span className="rounded bg-violet-700 px-1.5 py-0.5 text-[11px] font-black text-white">
                              指名 {ord.preferredBaristaId}
                            </span>
                          )}
                          <span className="text-[10px] bg-slate-200 text-slate-700 font-semibold px-1.5 py-0.5 rounded">
                            {ord.badgeTag}
                          </span>
                        </div>
                        {ord.orderNotes && (
                          <div className="text-[10.5px] text-slate-500 mt-0.5 font-medium">{ord.orderNotes}</div>
                        )}
                        <div className="text-[11px] text-slate-500 mt-1">標準予測: {ord.predictedTimeStr}</div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. Select Bay */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">割当先のドリッパー（抽出担当者）:</label>
            <div className="grid grid-cols-3 gap-2">
              {baristas.map((b) => (
                <button
                  key={b.id}
                  disabled={Boolean(selectedOrder?.preferredBaristaId && selectedOrder.preferredBaristaId !== b.id)}
                  onClick={() => setSelectedBayId(b.id)}
                  className={`min-h-[72px] p-2 rounded-lg border text-left flex flex-col justify-between transition-all touch-manipulation ${
                    selectedBayId === b.id
                      ? 'border-[#059669] bg-[#ecfdf5] shadow-xs ring-1 ring-[#059669]'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-25 disabled:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-900">ドリッパー {b.id}</span>
                  </div>
                  <div className="font-bold text-slate-800 mt-1">{b.name}</div>
                  <div className="text-[10px] text-slate-500">待機 {b.queue.length}件</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-[#f8fafc] flex items-center justify-between">
          <button
            onClick={onClose}
            className="min-h-[44px] px-4 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs touch-manipulation"
          >
            キャンセル
          </button>
          <button
            disabled={!selectedOrderUid}
            onClick={() => {
              if (selectedOrderUid) {
                onAssign(selectedOrderUid, selectedBayId);
                onClose();
              }
            }}
            className="min-h-[44px] px-4 rounded-lg bg-[#006c4a] hover:bg-[#005137] disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer touch-manipulation"
          >
            <span>割当を確定</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
