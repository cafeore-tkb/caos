import { ExternalLink, X } from 'lucide-react';
import type React from 'react';
import type { Barista, BeanItem, HistoricalOrder, LearningEngineLog } from '../types';
import { AiConfigView } from './AiConfigView';
import { AnalyticsView } from './AnalyticsView';
import { BaysOverviewView } from './BaysOverviewView';
import { BeanQueueView } from './BeanQueueView';
import type { NavTab } from './TopHeader';

export type AuxiliaryTab = Exclude<NavTab, 'control'>;

export const getAuxiliaryTitle = (tab: AuxiliaryTab) =>
  tab === 'bays' ? 'ドリッパー / 補正設定' : tab === 'beans' ? '豆キュー' : '実績';

interface AuxiliaryContentProps {
  tab: AuxiliaryTab;
  baristas: Barista[];
  beans: BeanItem[];
  learningLogs: LearningEngineLog[];
  salesOrders: HistoricalOrder[];
  periodStartMs?: number;
  periodEndMs?: number;
  nextShiftLabel: string;
  onChangeShift: () => void;
  onUpdateCoefficient: (bayId: number, coefficient: number) => void;
  onResetLearning: () => void;
  onUpdateBean: (bean: BeanItem) => void;
  onAddBean: (bean: BeanItem) => void;
}

export const AuxiliaryContent: React.FC<AuxiliaryContentProps> = ({
  tab,
  baristas,
  beans,
  learningLogs,
  salesOrders,
  periodStartMs,
  periodEndMs,
  nextShiftLabel,
  onChangeShift,
  onUpdateCoefficient,
  onResetLearning,
  onUpdateBean,
  onAddBean,
}) => (
  <>
    {tab === 'bays' && (
      <div className="space-y-5">
        <BaysOverviewView baristas={baristas} nextShiftLabel={nextShiftLabel} onChangeShift={onChangeShift} />
        <div className="border-t border-slate-300 pt-4">
          <AiConfigView
            baristas={baristas}
            logs={learningLogs}
            onUpdateCoefficient={onUpdateCoefficient}
            onResetLearning={onResetLearning}
          />
        </div>
      </div>
    )}
    {tab === 'beans' && <BeanQueueView beans={beans} onUpdateBean={onUpdateBean} onAddBean={onAddBean} />}
    {tab === 'analytics' && (
      <AnalyticsView
        baristas={baristas}
        salesOrders={salesOrders}
        periodStartMs={periodStartMs}
        periodEndMs={periodEndMs}
      />
    )}
  </>
);

interface AuxiliarySheetProps {
  tab: AuxiliaryTab;
  onOpenInNewTab: () => void;
  onClose: () => void;
  children: React.ReactNode;
}

export const AuxiliarySheet: React.FC<AuxiliarySheetProps> = ({ tab, onOpenInNewTab, onClose, children }) => {
  const title = getAuxiliaryTitle(tab);

  return (
    <aside className="context-sheet absolute top-[56px] right-0 bottom-0 z-40 w-[min(440px,44vw)] min-w-[360px] bg-white border-l border-slate-300 shadow-2xl flex flex-col">
      <div className="h-[52px] px-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
        <h2 className="text-[16px] font-black text-slate-950">{title}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenInNewTab}
            className="w-11 h-11 rounded-full hover:bg-slate-200 flex items-center justify-center touch-manipulation"
            aria-label={`${title}を新しいブラウザタブで開く`}
            title="新しいタブで開く"
          >
            <ExternalLink className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-full hover:bg-slate-200 flex items-center justify-center"
            aria-label="補助パネルを閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">{children}</div>
    </aside>
  );
};

interface StandaloneAuxiliaryPanelProps {
  tab: AuxiliaryTab;
  children: React.ReactNode;
}

export const StandaloneAuxiliaryPanel: React.FC<StandaloneAuxiliaryPanelProps> = ({ tab, children }) => (
  <div className="h-screen overflow-hidden bg-slate-100 text-slate-950 font-sans">
    <header className="h-14 border-b border-slate-300 bg-white px-5 flex items-center">
      <h1 className="text-[18px] font-black">{getAuxiliaryTitle(tab)}</h1>
    </header>
    <main className="h-[calc(100vh-56px)] overflow-y-auto p-4">
      <div className="mx-auto max-w-[900px]">{children}</div>
    </main>
  </div>
);
