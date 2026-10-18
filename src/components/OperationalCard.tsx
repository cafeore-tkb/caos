import type React from 'react';
import { itemAbbr, masterColor, seniorOnly } from '../training/master';
import type { OrderTicket, UnassignedOrder } from '../types';

type Card = OrderTicket | UnassignedOrder;
export const cardSurface = (card: Card) => ({
  backgroundColor:
    'status' in card && card.status === 'completed'
      ? '#f8fafc'
      : (masterColor(card.beanName, Boolean(card.preferredBaristaId)) ??
        (card.beanCode === 'ICE' || card.beanCode === 'MILK'
          ? '#cdedfe'
          : card.beanCode === 'SP'
            ? '#fecdcd'
            : '#fff')),
  color: '#0f172a',
});
export const OperationalCard: React.FC<{ card: Card; note?: string; size?: 'queue' | 'lane'; selected?: boolean }> = ({
  card,
  note,
  size = 'lane',
  selected = false,
}) => (
  <div
    style={cardSurface(card)}
    className={`flex h-full min-w-0 flex-col justify-center gap-0.5 rounded-lg border-2 px-2 py-1 text-left ${'status' in card && card.status === 'completed' ? 'border-dashed border-slate-300 opacity-40' : card.preferredBaristaId ? 'border-[3px] border-dashed border-slate-900' : 'border-slate-300'} ${selected ? 'ring-4 ring-amber-400' : ''}`}
  >
    <div className="flex w-full items-center justify-between gap-1">
      <b
        className={`min-w-0 truncate font-mono font-black leading-none ${size === 'queue' ? 'text-[24px]' : 'text-[20px]'}`}
      >
        {card.id}
      </b>
      <span
        className={`shrink-0 rounded border border-slate-950 px-1 font-mono text-[20px] font-black leading-tight ${card.cupCount === 1 ? 'bg-white text-black' : 'bg-slate-950 text-white'}`}
      >
        {card.cupCount}
        <small className="text-[11px]">杯</small>
      </span>
    </div>
    <div className={`flex min-w-0 ${size === 'queue' ? 'flex-col gap-1' : 'items-center gap-1'}`}>
      <span className="min-w-0 truncate text-[14px] font-bold leading-tight" title={card.beanName}>
        {itemAbbr(card.beanName)}
      </span>
      {(card.preferredBaristaId || seniorOnly(card.beanName) || card.isRebrew || note) && (
        <span className="shrink-0 truncate text-[10px] font-bold leading-tight">
          {card.isRebrew ? '緊急 ' : ''}
          {card.preferredBaristaId ? `指名${card.preferredBaristaId} ` : ''}
          {seniorOnly(card.beanName) ? '★上級生 ' : ''}
          {note}
        </span>
      )}
    </div>
  </div>
);
