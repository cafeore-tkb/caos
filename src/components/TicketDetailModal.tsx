import { ArrowRight, Undo2, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef } from 'react';
import type { OrderTicket } from '../types';

interface TicketDetailModalProps {
  ticket: OrderTicket | null;
  currentBayId: number | null;
  onClose: () => void;
  onMoveTicket: (ticket: OrderTicket, bayId: number) => void;
  onReturnToUnassigned: (ticket: OrderTicket) => void;
}

export const TicketDetailModal: React.FC<TicketDetailModalProps> = ({
  ticket,
  currentBayId,
  onClose,
  onMoveTicket,
  onReturnToUnassigned,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress);
  }, [onClose]);
  if (ticket?.status !== 'scheduled') return null;

  return (
    <div className="fixed top-[56px] right-0 bottom-0 z-50 pointer-events-none select-none">
      <div
        ref={panelRef}
        className="pointer-events-auto bg-white w-[min(420px,42vw)] min-w-[360px] h-full border-l border-slate-300 shadow-2xl flex flex-col"
      >
        <header className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-[12px] font-black text-slate-500">未開始オーダーの移動</div>
            <div className="flex items-center gap-3 mt-1">
              <span className="font-mono text-[28px] font-black">{ticket.id}</span>
              <span className="text-[18px] font-bold">{ticket.beanName}</span>
              <span className="rounded-md bg-slate-950 px-2.5 py-1 text-[17px] font-mono font-black text-white">
                {ticket.cupCount}杯
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-11 h-11 rounded-full hover:bg-slate-100 flex items-center justify-center"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="p-5 space-y-5">
          <section>
            <h3 className="text-[14px] font-black text-slate-700 mb-2">他のドリッパーへ移動</h3>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3, 4, 5, 6].map((bayId) => {
                const disabled =
                  bayId === currentBayId || Boolean(ticket.preferredBaristaId && ticket.preferredBaristaId !== bayId);
                return (
                  <button
                    key={bayId}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onMoveTicket(ticket, bayId);
                      onClose();
                    }}
                    className="h-16 rounded-xl border-2 border-slate-300 bg-white text-[24px] font-mono font-black active:bg-slate-900 active:text-white disabled:bg-slate-100 disabled:text-slate-300 disabled:border-slate-200 touch-manipulation"
                  >
                    {bayId}
                  </button>
                );
              })}
            </div>
            {ticket.preferredBaristaId && (
              <p className="mt-2 text-[13px] font-bold text-violet-700">
                指名オーダー：ドリッパー {ticket.preferredBaristaId} のみ
              </p>
            )}
          </section>

          <button
            type="button"
            onClick={() => {
              onReturnToUnassigned(ticket);
              onClose();
            }}
            className="w-full min-h-[60px] rounded-xl border-2 border-red-200 bg-red-50 px-4 text-red-700 font-black text-[16px] flex items-center justify-center gap-2 active:bg-red-100 touch-manipulation"
          >
            <Undo2 className="w-5 h-5" />
            未割り当に戻す
          </button>

          <div className="rounded-lg bg-slate-100 p-3 text-[13px] font-bold text-slate-500 flex items-center gap-2">
            <ArrowRight className="w-4 h-4" />
            抽出開始後はここから変更できません
          </div>
        </div>
      </div>
    </div>
  );
};
