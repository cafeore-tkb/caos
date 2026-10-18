import { ArrowRightCircle, CircleDot } from 'lucide-react';
import type React from 'react';
import type { ControlViewProps } from './ControlWorkspace';
import { LaneIndicator } from './LaneIndicator';
import { OperationalCard } from './OperationalCard';
import { UnassignedOrdersPanel } from './UnassignedOrdersPanel';

// cafeore-pos C: six horizontal lanes, current + waiting; orders on the right.
export const ControlViewC: React.FC<ControlViewProps> = ({
  baristas,
  unassignedOrders,
  currentTimeSec,
  selectedOrderId,
  nextAvailable,
  onSelectOrder,
  onAdvanceBay,
  onOpenTicketDetail,
  onOpenEmptySlot,
  onAssignToBay,
  onRequestRebrew,
  onMergeOrders,
}) => (
  <section
    className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_minmax(300px,40%)] gap-2"
    aria-label="Cコントロール画面"
  >
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-xs">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-3">
        <CircleDot className="h-4 w-4" />
        <h2 className="text-[15px] font-black">ドリッパー</h2>
      </header>
      <div className="grid min-h-0 flex-1 grid-rows-6 divide-y divide-slate-200">
        {baristas.map((bay) => {
          const current = bay.queue[0];
          return (
            <article key={bay.id} data-bay-target={bay.id} className="flex min-h-0 gap-2 p-2">
              <LaneIndicator bay={bay} nowSec={currentTimeSec} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <b className="truncate text-[18px] font-black">{bay.name}</b>
                  {bay.canHandleSpecial && <span className="shrink-0 text-[10px] font-bold">★上級生</span>}
                </div>
                <div className="flex min-h-0 flex-1 gap-1.5">
                  <div className="w-[148px] shrink-0">
                    {current ? (
                      <button
                        type="button"
                        className="h-full w-full"
                        aria-label={`${current.id} ${current.beanName} 抽出中の操作`}
                        onClick={() => onRequestRebrew(current, bay.id)}
                      >
                        <OperationalCard card={current} selected={selectedOrderId === current.id} />
                      </button>
                    ) : (
                      <div className="h-full rounded-lg border border-dashed border-slate-300" />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
                    {bay.queue.slice(1).map((ticket, index) => (
                      <button
                        type="button"
                        key={ticket.ticketUid}
                        className="h-full w-[148px] shrink-0"
                        onClick={() => onOpenTicketDetail(ticket)}
                      >
                        <OperationalCard
                          card={ticket}
                          note={`${index + 2}番目`}
                          selected={selectedOrderId === ticket.id}
                        />
                      </button>
                    ))}
                    {bay.queue.length < 2 && (
                      <button
                        type="button"
                        className="min-w-24 flex-1 rounded-lg border border-dashed border-slate-300 text-[11px] font-bold text-slate-400"
                        onClick={() => onOpenEmptySlot(bay.id)}
                      >
                        ここに割当
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                disabled={!current}
                aria-label={`${bay.id}番 次へ`}
                onClick={() => onAdvanceBay(bay.id)}
                className="flex w-11 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white text-[11px] font-black disabled:bg-slate-100 disabled:text-slate-300"
              >
                <ArrowRightCircle size={18} />
                次へ
              </button>
            </article>
          );
        })}
      </div>
    </section>
    <aside className="min-h-0 min-w-0">
      <UnassignedOrdersPanel
        layout="sidebar"
        orders={unassignedOrders}
        baristas={baristas}
        nextAvailable={nextAvailable}
        selectedOrderId={selectedOrderId}
        onSelectOrder={onSelectOrder}
        onClearSelection={() => onSelectOrder('')}
        onAssignToBay={onAssignToBay}
        onMergeOrders={onMergeOrders}
      />
    </aside>
  </section>
);
