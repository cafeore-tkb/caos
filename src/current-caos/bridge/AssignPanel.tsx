import { type CaosCard, caosBrewSec, caosDripperAllowed, dripperLabel } from '@cafeore/common';
import { ArrowRight } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { LaneBadge } from '../components/BoardParts';
import { OrderCard } from '../components/OrderCard';
import { useCaosLanes } from '../hooks/useCaosLanes';
import { type CardLooks, orderCount } from '../logic/cards';
import { unsupportedDrip } from '../logic/dripSupport';
import { clockLabel } from '../logic/format';
import type { Lane } from '../logic/lanes';
import { SidePanel } from './SidePanel';

/** パネルの下の「キャンセル」と確定のボタン */
const PanelFooter: React.FC<{
  onCancel: () => void;
  children: React.ReactNode;
}> = ({ onCancel, children }) => (
  <div className="flex shrink-0 items-center justify-between gap-2 border-slate-200 border-t bg-slate-50 px-4 py-3">
    <button
      type="button"
      onClick={onCancel}
      className="min-h-[44px] touch-manipulation rounded-lg border border-slate-300 bg-white px-4 font-bold text-slate-700 text-xs hover:bg-slate-100"
    >
      キャンセル
    </button>
    {children}
  </div>
);

// 空きスロットから開く割当。未割当のカードとドリッパーを選んで確定する
export const AssignPanel: React.FC<{
  /** 空きスロットを押したドリッパー */
  bayId: number;
  lanes: Lane[];
  unassignedOrders: CaosCard[];
  looks: CardLooks;
  onClose: () => void;
  onAssign: (card: CaosCard, targetBayId: number) => void;
}> = ({ bayId, lanes, unassignedOrders, looks, onClose, onAssign }) => {
  const [selectedOrderUid, setSelectedOrderUid] = useState(unassignedOrders[0]?.key ?? '');
  const [selectedBayId, setSelectedBayId] = useState(bayId);
  const { lanes: assignees, shiftFeed } = useCaosLanes();
  const selectedOrder = unassignedOrders.find((order) => order.key === selectedOrderUid);
  // 指名の番号のあるカードは、その番号のドリッパーだけ選べる
  const allowed = (id: number) => !selectedOrder || caosDripperAllowed(selectedOrder, id);

  return (
    <SidePanel
      title={`${dripperLabel(bayId)} に割当`}
      onClose={onClose}
      footer={
        <PanelFooter onCancel={onClose}>
          <button
            type="button"
            disabled={!selectedOrder || !allowed(selectedBayId)}
            onClick={() => {
              if (selectedOrder) onAssign(selectedOrder, selectedBayId);
              onClose();
            }}
            className="flex min-h-[44px] touch-manipulation items-center gap-1.5 rounded-lg bg-emerald-700 px-4 font-bold text-white text-xs shadow-xs hover:bg-emerald-800 disabled:opacity-50"
          >
            割当を確定
            <ArrowRight className="h-4 w-4" />
          </button>
        </PanelFooter>
      }
    >
      <h3 className="mb-1.5 font-bold text-slate-700 text-xs">注文</h3>
      {unassignedOrders.length === 0 ? (
        <p className="rounded border border-slate-200 bg-slate-50 p-3 text-slate-500 text-xs">未割当なし</p>
      ) : (
        <div className="grid max-h-[200px] gap-1.5 overflow-y-auto p-1">
          {unassignedOrders.map((order) => (
            <OrderCard
              key={order.key}
              card={order}
              look={looks.get(order.key)}
              size="sm"
              selected={selectedOrderUid === order.key}
              note={`標準予測: ${clockLabel(caosBrewSec(order.cups.length))}`}
              onClick={() => setSelectedOrderUid(order.key)}
              className="cursor-pointer"
            />
          ))}
        </div>
      )}

      <h3 className="mt-4 mb-1.5 font-bold text-slate-700 text-xs">担当</h3>
      <div className="grid grid-cols-3 gap-2">
        {lanes.map((lane) => (
          <button
            key={lane.id}
            type="button"
            data-assignment-bay={lane.id}
            aria-pressed={selectedBayId === lane.id}
            disabled={!allowed(lane.id)}
            onClick={() => setSelectedBayId(lane.id)}
            className={`flex min-h-[72px] touch-manipulation flex-col justify-between rounded-lg border p-2 text-left disabled:opacity-30 ${
              selectedBayId === lane.id
                ? 'border-emerald-600 bg-emerald-50 shadow-xs ring-1 ring-emerald-600'
                : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <LaneBadge
              bayId={lane.id}
              muted={
                selectedOrder
                  ? unsupportedDrip(
                      shiftFeed.feed,
                      assignees.find((person) => person.dripper === lane.id)?.name ?? '',
                      selectedOrder
                    )
                  : false
              }
            />
            <span className="text-[10px] text-slate-500">待機 {orderCount(lane.queued)}件</span>
          </button>
        ))}
      </div>
    </SidePanel>
  );
};
