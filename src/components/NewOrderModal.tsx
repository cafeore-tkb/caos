import React, { useState } from 'react';
import { X, Plus, Coffee } from 'lucide-react';
import { BeanCode } from '../types';
import { BEAN_LEGENDS, BEAN_NAME_MAP } from '../data/initialData';

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
  }) => void;
}

export const NewOrderModal: React.FC<NewOrderModalProps> = ({
  onClose,
  onAddOrder,
}) => {
  const [selectedBean, setSelectedBean] = useState<BeanCode>('CHAMP');
  const [cupCount, setCupCount] = useState<number>(1);
  const [orderType, setOrderType] = useState<string>('HOT');

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
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 select-none">
      <div className="bg-white w-full max-w-md rounded-xl border border-slate-300 shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-[#f8fafc]">
          <div className="flex items-center gap-2">
            <Coffee className="w-5 h-5 text-slate-700" />
            <h3 className="text-base font-bold text-slate-900">新規オーダー受付</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {/* Bean selection */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">コーヒー豆種別:</label>
            <div className="grid grid-cols-4 gap-2">
              {BEAN_LEGENDS.map((b) => (
                <button
                  key={b.code}
                  onClick={() => setSelectedBean(b.code)}
                  className={`p-2 rounded-lg border flex flex-col items-center gap-1 transition-all ${
                    selectedBean === b.code
                      ? 'border-blue-500 bg-blue-50 font-bold ring-1 ring-blue-500'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="font-mono text-xs">{b.label}</span>
                  <span className="text-[10px] text-slate-500">{b.subLabel}</span>
                </button>
              ))}
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
                  className={`flex-1 py-2 rounded-lg border font-mono font-bold text-sm ${
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
            <label className="block font-bold text-slate-700 mb-1.5">抽出タイプ:</label>
            <div className="flex items-center gap-2">
              {['HOT', 'ICE', 'BATCH', '特別抽出'].map((t) => (
                <button
                  key={t}
                  onClick={() => setOrderType(t)}
                  className={`flex-1 py-2 rounded-lg border font-bold text-xs ${
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
        </div>

        <div className="px-5 py-3 border-t border-slate-200 bg-[#f8fafc] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium text-xs"
          >
            キャンセル
          </button>
          <button
            onClick={handleCreate}
            className="px-4 py-2 rounded-md bg-[#006c4a] hover:bg-[#005137] text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>未割当キューに投入</span>
          </button>
        </div>
      </div>
    </div>
  );
};
