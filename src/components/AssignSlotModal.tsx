import React, { useState } from 'react';
import { X, ArrowRight, Check } from 'lucide-react';
import { Barista, UnassignedOrder } from '../types';

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
    targetOrder ? (targetOrder.ticketUid || targetOrder.id) : (unassignedOrders[0]?.ticketUid || unassignedOrders[0]?.id || '')
  );
  const [selectedBayId, setSelectedBayId] = useState<number>(
    bayId ?? (targetOrder?.recommendedBayIds[0] || 1)
  );

  const currentBay = baristas.find((b) => b.id === selectedBayId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 select-none">
      <div className="bg-white w-full max-w-md rounded-xl border border-slate-300 shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-[#f8fafc]">
          <h3 className="text-base font-bold text-slate-900">
            {bayId ? `ベイ ${bayId} (${currentBay?.name}) にオーダー割当` : 'オーダーのベイ配分'}
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          {/* 1. Select Order */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">
              割り当てる未割当オーダー:
            </label>
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
                      onClick={() => setSelectedOrderUid(uid)}
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
                          <span className="text-[10px] bg-slate-200 text-slate-700 font-semibold px-1.5 py-0.5 rounded">{ord.badgeTag}</span>
                        </div>
                        {ord.orderNotes && (
                          <div className="text-[10.5px] text-slate-500 mt-0.5 font-medium">
                            {ord.orderNotes}
                          </div>
                        )}
                        <div className="text-[11px] text-slate-500 mt-1">
                          標準予測: {ord.predictedTimeStr} | 推奨: {ord.recommendedBaristas}
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="w-4 h-4 text-blue-600 shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. Select Bay */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">
              投入先のベイ (バリスタ):
            </label>
            <div className="grid grid-cols-3 gap-2">
              {baristas.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSelectedBayId(b.id)}
                  className={`p-2 rounded-lg border text-left flex flex-col justify-between transition-all ${
                    selectedBayId === b.id
                      ? 'border-[#059669] bg-[#ecfdf5] shadow-xs ring-1 ring-[#059669]'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-900">ベイ{b.id}</span>
                    <span className="text-[10px] font-mono text-emerald-700 font-semibold">
                      ×{b.coefficient}
                    </span>
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
            className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium text-xs"
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
            className="px-4 py-2 rounded-md bg-[#006c4a] hover:bg-[#005137] disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <span>割当を確定</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
