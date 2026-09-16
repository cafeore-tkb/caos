import React from 'react';
import {
  SlidersHorizontal,
  LayoutGrid,
  Coffee,
  Sparkles,
  BarChart3,
  RotateCw,
} from 'lucide-react';

export type NavTab = 'control' | 'bays' | 'beans' | 'ai' | 'analytics';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  activeBayCount: number;
  totalBays: number;
  cph: number;
  avgTimeStr: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  activeBayCount,
  totalBays,
  cph,
  avgTimeStr,
}) => {
  const navItems: { id: NavTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'control',
      label: '管制盤',
      icon: <SlidersHorizontal className="w-5 h-5" />,
    },
    {
      id: 'bays',
      label: '6ベイ',
      icon: <LayoutGrid className="w-5 h-5" />,
    },
    {
      id: 'beans',
      label: '豆キュー',
      icon: <Coffee className="w-5 h-5" />,
    },
    {
      id: 'ai',
      label: '補正AI',
      icon: <Sparkles className="w-5 h-5" />,
    },
    {
      id: 'analytics',
      label: '実績',
      icon: <BarChart3 className="w-5 h-5" />,
    },
  ];

  return (
    <aside className="w-[72px] bg-white border-r border-[#e2e8f0] flex flex-col items-center justify-between py-3 select-none shrink-0 z-10">
      {/* Top Section */}
      <div className="flex flex-col items-center w-full gap-3">
        {/* KDS Logo */}
        <div className="flex flex-col items-center group cursor-pointer" onClick={() => onSelectTab('control')}>
          <div className="w-10 h-10 bg-[#0f172a] rounded-lg flex flex-col items-center justify-center text-white shadow-xs">
            <span className="text-[17px] font-black leading-none tracking-tight">匠</span>
            <span className="text-[8px] font-mono font-bold tracking-widest text-slate-300 mt-0.5">
              KDS
            </span>
          </div>
        </div>

        {/* RUN Status Indicator */}
        <div className="w-full px-2 flex flex-col items-center">
          <div className="w-full py-1 bg-[#f0fdf4] border border-[#bbf7d0] rounded-md flex flex-col items-center justify-center">
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#16a34a] animate-pulse"></span>
              <span className="text-[9px] font-mono font-bold text-[#166534]">RUN</span>
            </div>
            <span className="text-[10px] font-mono font-bold text-[#15803d]">
              {activeBayCount}/{totalBays}
            </span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="w-full flex flex-col items-center gap-1 mt-1 px-1.5">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-tab-${item.id}`}
                onClick={() => onSelectTab(item.id)}
                className={`w-full py-2.5 px-1 rounded-lg flex flex-col items-center justify-center gap-1 transition-all ${
                  isActive
                    ? 'bg-[#0f172a] text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-[#f8fafc]'
                }`}
                title={item.label}
              >
                <div>{item.icon}</div>
                <span className="text-[10px] font-medium tracking-tight leading-tight">
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Telemetry Status */}
      <div className="flex flex-col items-center gap-1 px-1 w-full text-center">
        <div className="w-full py-1.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-md flex flex-col items-center">
          <RotateCw className="w-3.5 h-3.5 text-red-500 animate-spin-slow mb-0.5" />
          <span className="font-mono text-[10px] font-bold text-slate-700 leading-none">
            {avgTimeStr}
          </span>
          <span className="font-mono text-[9px] text-slate-500 font-semibold mt-0.5">
            {cph}cph
          </span>
        </div>
      </div>
    </aside>
  );
};
