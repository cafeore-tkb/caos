import React from 'react';
import { X, CheckCircle2, Clock, Thermometer, Scale, Cog, Sparkles } from 'lucide-react';
import { OrderTicket } from '../types';
import { BEAN_LEGENDS } from '../data/initialData';

interface TicketDetailModalProps {
  ticket: OrderTicket | null;
  onClose: () => void;
  onCompleteTicket: (ticketId: string) => void;
}

export const TicketDetailModal: React.FC<TicketDetailModalProps> = ({
  ticket,
  onClose,
  onCompleteTicket,
}) => {
  if (!ticket) return null;

  const bean = BEAN_LEGENDS.find((b) => b.code === ticket.beanCode);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/35 backdrop-blur-xs select-none" onClick={onClose}>
      <div className="context-sheet bg-white w-full max-w-[520px] h-full border-l border-slate-300 shadow-2xl overflow-hidden flex flex-col" onClick={(event) => event.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-[#f8fafc]">
          <div className="flex items-center gap-3">
            <span className="font-mono text-2xl font-black text-slate-900 leading-none">
              {ticket.id}
            </span>
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-bold px-2 py-0.5 rounded border ${bean?.badgeBg} ${bean?.badgeText} ${bean?.borderColor}`}>
                {ticket.beanName}
              </span>
              <span className="bg-slate-900 text-white text-xs font-mono font-bold px-2 py-0.5 rounded">
                {ticket.cupCount}杯 {ticket.tag}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-11 h-11 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors touch-manipulation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Recipe Info */}
        <div className="p-5 overflow-y-auto space-y-4 text-sm">
          {/* Multi-item Order Banner */}
          {ticket.totalItemsInOrder && ticket.totalItemsInOrder > 1 && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                <div>
                  <div className="font-bold text-amber-950">
                    複数品オーダー連動: {ticket.id} [{ticket.itemIndex}/{ticket.totalItemsInOrder}] (合計 {ticket.totalOrderCups} 杯)
                  </div>
                  {ticket.orderNotes && (
                    <div className="text-amber-800 text-[11px] mt-0.5 font-medium">
                      全体内訳: {ticket.orderNotes}
                    </div>
                  )}
                </div>
              </div>
              <span className="bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded text-[10px]">
                同一オーダー
              </span>
            </div>
          )}

          {/* Status Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <span className="font-medium text-blue-900">
                抽出ステータス: {ticket.status === 'brewing' ? '抽出中 (進行中)' : '待機 / 予定'}
              </span>
            </div>
            {ticket.timeRemainingSec !== undefined && (
              <span className="font-mono font-bold text-red-600">
                残り {Math.floor(ticket.timeRemainingSec / 60)}:{(ticket.timeRemainingSec % 60).toString().padStart(2, '0')}
              </span>
            )}
          </div>

          {/* Extraction Specs */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              抽出スペック・バリスタ指示書
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex items-center gap-2.5">
                <Cog className="w-4 h-4 text-slate-500 shrink-0" />
                <div>
                  <div className="text-[10px] text-slate-500 font-medium">ミル挽き目</div>
                  <div className="font-semibold text-slate-800 text-xs">
                    {ticket.recipe?.grindSize || 'EK43 #8.0 (中細挽き)'}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex items-center gap-2.5">
                <Thermometer className="w-4 h-4 text-amber-600 shrink-0" />
                <div>
                  <div className="text-[10px] text-slate-500 font-medium">ケトル注湯温度</div>
                  <div className="font-mono font-semibold text-slate-800 text-xs">
                    {ticket.recipe?.waterTemp || '93.5°C ±0.5°C'}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex items-center gap-2.5">
                <Scale className="w-4 h-4 text-indigo-600 shrink-0" />
                <div>
                  <div className="text-[10px] text-slate-500 font-medium">粉量 / 注湯比率</div>
                  <div className="font-mono font-semibold text-slate-800 text-xs">
                    {ticket.recipe?.ratio || '1:15.5 (16g / 250ml)'}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <div className="text-[10px] text-slate-500 font-medium">目標仕上がり量</div>
                  <div className="font-mono font-semibold text-slate-800 text-xs">
                    {ticket.recipe?.targetYield || '215ml ±5ml'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pour Steps */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              注湯ステップ詳細 (Pour Profile)
            </h4>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">ステップ</th>
                    <th className="px-3 py-2">注湯量</th>
                    <th className="px-3 py-2">タイム目標</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {ticket.recipe?.pourSteps ? (
                    ticket.recipe.pourSteps.map((step, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-sans font-medium text-slate-800">{step.step}</td>
                        <td className="px-3 py-2 font-bold text-slate-700">{step.amount}</td>
                        <td className="px-3 py-2 text-slate-500">{step.time}</td>
                      </tr>
                    ))
                  ) : (
                    <>
                      <tr>
                        <td className="px-3 py-2 font-sans font-medium text-slate-800">1. 蒸らし (Bloom)</td>
                        <td className="px-3 py-2 font-bold text-slate-700">50g</td>
                        <td className="px-3 py-2 text-slate-500">0:00 - 0:40</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-sans font-medium text-slate-800">2. 本抽出 (Main Pour)</td>
                        <td className="px-3 py-2 font-bold text-slate-700">240g</td>
                        <td className="px-3 py-2 text-slate-500">0:40 - 1:45</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-sans font-medium text-slate-800">3. 落としきり (Drawdown)</td>
                        <td className="px-3 py-2 font-bold text-slate-700">Finish</td>
                        <td className="px-3 py-2 text-slate-500">1:45 - 2:15</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-slate-200 bg-[#f8fafc] flex items-center justify-between">
          <button
            onClick={onClose}
            className="min-h-[44px] px-4 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs transition-colors touch-manipulation"
          >
            閉じる
          </button>
          <button
            onClick={() => {
              onCompleteTicket(ticket.id);
              onClose();
            }}
            className="min-h-[44px] px-4 rounded-lg bg-[#006c4a] hover:bg-[#005137] text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors touch-manipulation"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>このオーダーを完了にする</span>
          </button>
        </div>
      </div>
    </div>
  );
};
