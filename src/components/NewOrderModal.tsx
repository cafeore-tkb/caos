import { Coffee, Plus, X } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { BEAN_NAME_MAP } from '../data/initialData';
import type { BeanCode } from '../types';
import { MENU_GROUPS, MENU_PRESENTATION } from '../utils/menuPresentation';

interface NewOrderModalProps {
  onClose: () => void;
  onAddOrder: (order: {
    beanCode: BeanCode;
    beanName: string;
    cupCount: number;
    tag: string;
    predictedTimeStr: string;
    recommendedBaristas: string;
    recommendedBayIds: number[];
    preferredBaristaId?: number;
  }) => void;
}

export const NewOrderModal: React.FC<NewOrderModalProps> = ({ onClose, onAddOrder }) => {
  const [selectedBean, setSelectedBean] = useState<BeanCode>('CHAMP');
  const [cupCount, setCupCount] = useState<number>(1);
  const [orderType, setOrderType] = useState<string>('HOT');
  const [preferredBaristaId, setPreferredBaristaId] = useState<number | null>(null);
  const selectMenu = (code: BeanCode) => {
    setSelectedBean(code);
    if (code === 'ICE') setOrderType('ICE');
    else if (code === 'MILK') setOrderType('牛');
    else if (orderType === 'ICE' || orderType === '牛') setOrderType('HOT');
  };

  const handleCreate = () => {
    const name = BEAN_NAME_MAP[selectedBean];
    let predictedTime = '2分30秒';
    let recommended = '佐藤 または 渡辺';
    let bayIds = [1, 6];

    if (selectedBean === 'ICE') {
      predictedTime = '3分30秒';
      recommended = '田中 (ICE専任)';
      bayIds = [4];
    } else if (selectedBean === 'SP') {
      predictedTime = '3分50秒';
      recommended = '鈴木 (丁寧専任)';
      bayIds = [2];
    } else if (selectedBean === 'MILK') {
      predictedTime = '2分45秒';
      recommended = '伊藤 (牛専任)';
      bayIds = [5];
    } else if (selectedBean === 'ORE') {
      predictedTime = '2分35秒';
      recommended = '鈴木 または 佐藤';
      bayIds = [2, 1];
    } else if (selectedBean === 'TNZ') {
      predictedTime = '2分20秒';
      recommended = '高橋 または 佐藤';
      bayIds = [3, 1];
    } else if (selectedBean === 'KEN') {
      predictedTime = '2分15秒';
      recommended = '渡辺 または 高橋';
      bayIds = [6, 3];
    } else if (selectedBean === 'BRA') {
      predictedTime = '2分30秒';
      recommended = '鈴木 または 渡辺';
      bayIds = [2, 6];
    }

    onAddOrder({
      beanCode: selectedBean,
      beanName: name,
      cupCount,
      tag: orderType,
      predictedTimeStr: predictedTime,
      recommendedBaristas: recommended,
      recommendedBayIds: bayIds,
      preferredBaristaId: preferredBaristaId ?? undefined,
    });
    onClose();
  };

  return (
    <div className="fixed top-[56px] right-0 bottom-0 z-50 pointer-events-none select-none">
      <div className="context-sheet pointer-events-auto bg-white w-[min(440px,44vw)] min-w-[360px] h-full border-l border-slate-300 shadow-2xl overflow-y-auto">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-[#f8fafc]">
          <div className="flex items-center gap-2">
            <Coffee className="w-5 h-5 text-slate-700" />
            <h3 className="text-base font-bold text-slate-900">新規オーダー受付</h3>
          </div>
          <button
            onClick={onClose}
            className="w-11 h-11 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 touch-manipulation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {/* Bean selection */}
          <div className="space-y-3">
            {MENU_GROUPS.map((group) => (
              <section key={group.family}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <h4 className="text-[12px] font-black tracking-[0.12em] text-slate-900">{group.title}</h4>
                  <span className="text-[11px] font-medium text-slate-500">{group.description}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {group.codes.map((code) => {
                    const menu = MENU_PRESENTATION[code];
                    return (
                      <button
                        key={code}
                        onClick={() => selectMenu(code)}
                        className={`min-h-[64px] rounded-xl border p-2.5 text-left transition-all touch-manipulation ${menu.cardClass} ${selectedBean === code ? 'ring-2 ring-slate-950 shadow-sm' : 'hover:shadow-sm'}`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={`text-[15px] font-black ${menu.family === 'premium' ? 'text-white' : 'text-slate-950'}`}
                          >
                            {menu.shortLabel}
                          </span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-black ${menu.badgeClass}`}>
                            {menu.familyLabel}
                          </span>
                        </div>
                        <div
                          className={`mt-1 text-[11px] font-bold ${menu.family === 'premium' ? 'text-emerald-100' : 'text-slate-600'}`}
                        >
                          {menu.processLabel}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <div className={`rounded-xl border p-3 ${MENU_PRESENTATION[selectedBean].cardClass}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-black tracking-[0.12em] text-slate-500">抽出工程</div>
                <div className="mt-1 text-[16px] font-black text-slate-950">
                  {MENU_PRESENTATION[selectedBean].processLabel}
                </div>
              </div>
              {(selectedBean === 'ICE' || selectedBean === 'MILK') && (
                <div className="rounded-lg bg-white/80 px-3 py-2 text-right text-[12px] font-bold text-slate-700">
                  半量をゆっくり抽出
                  <br />
                  してから仕上げ
                </div>
              )}
            </div>
          </div>

          {/* Cup count */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">杯数:</label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4].map((num) => (
                <button
                  key={num}
                  onClick={() => setCupCount(num)}
                  className={`flex-1 min-h-[44px] rounded-lg border font-mono font-bold text-sm touch-manipulation ${
                    cupCount === num
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  {num}杯
                </button>
              ))}
            </div>
          </div>

          {/* Style */}
          <div>
            <label className="block text-[14px] font-bold text-slate-700 mb-1.5">提供タイプ</label>
            <div className="flex items-center gap-2">
              {['HOT', 'ICE', '牛', 'BATCH'].map((t) => (
                <button
                  key={t}
                  onClick={() => setOrderType(t)}
                  className={`flex-1 min-h-[44px] rounded-lg border font-bold text-xs touch-manipulation ${
                    orderType === t
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[14px] font-bold text-slate-700 mb-1.5">指名（1人のみ）</label>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setPreferredBaristaId(null)}
                className={`min-h-[44px] rounded-lg border text-[13px] font-bold ${preferredBaristaId === null ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300'}`}
              >
                なし
              </button>
              {[1, 2, 3, 4, 5, 6].map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPreferredBaristaId(id)}
                  className={`min-h-[44px] rounded-lg border text-[16px] font-mono font-black ${preferredBaristaId === id ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300'}`}
                >
                  {id}
                </button>
              ))}
            </div>
            {preferredBaristaId && (
              <p className="mt-2 text-[13px] font-bold text-blue-700">
                ドリッパー {preferredBaristaId} の枠を確保します
              </p>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 bg-[#f8fafc] flex items-center justify-between">
          <button
            onClick={onClose}
            className="min-h-[44px] px-4 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs touch-manipulation"
          >
            キャンセル
          </button>
          <button
            onClick={handleCreate}
            className="min-h-[44px] px-4 rounded-lg bg-[#006c4a] hover:bg-[#005137] text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors touch-manipulation"
          >
            <Plus className="w-4 h-4" />
            <span>未割当キューに投入</span>
          </button>
        </div>
      </div>
    </div>
  );
};
