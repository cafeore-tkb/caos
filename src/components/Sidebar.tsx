import { BarChart3, Coffee, LayoutGrid, SlidersHorizontal } from 'lucide-react';
import React from 'react';
import { CONTROL_VIEWS, type ControlViewMode } from './ControlWorkspace';

export type NavTab = 'control' | 'bays' | 'beans' | 'analytics';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  controlViewMode: ControlViewMode;
  onSelectControlViewMode: (mode: ControlViewMode) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  controlViewMode,
  onSelectControlViewMode,
}) => {
  const navItems: { id: NavTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'control',
      label: '管制盤',
      icon: <SlidersHorizontal className="w-5 h-5" />,
    },
    {
      id: 'bays',
      label: 'ドリッパー',
      icon: <LayoutGrid className="w-5 h-5" />,
    },
    {
      id: 'beans',
      label: '豆キュー',
      icon: <Coffee className="w-5 h-5" />,
    },
    {
      id: 'analytics',
      label: '実績',
      icon: <BarChart3 className="w-5 h-5" />,
    },
  ];

  return (
    <aside className="w-[82px] bg-white border-r border-[#e2e8f0] flex flex-col items-center py-2 select-none shrink-0 z-10">
      <div className="flex flex-col items-center w-full">
        <nav className="w-full flex flex-col items-center gap-1 mt-1 px-1.5">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <React.Fragment key={item.id}>
                <button
                  id={`nav-tab-${item.id}`}
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full min-h-[48px] py-1.5 px-1 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all touch-manipulation ${
                    isActive
                      ? 'bg-[#0f172a] text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-[#f8fafc]'
                  }`}
                  title={item.label}
                >
                  <div>{item.icon}</div>
                  <span className="text-[10px] font-medium tracking-tight leading-tight">{item.label}</span>
                </button>
                {item.id === 'control' && (
                  <div
                    className="w-full rounded-xl bg-slate-200 p-1 grid gap-1"
                    role="group"
                    aria-label="管制盤の表示切替"
                  >
                    {(Object.keys(CONTROL_VIEWS) as ControlViewMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={controlViewMode === mode}
                        onClick={() => onSelectControlViewMode(mode)}
                        className={`min-h-[44px] rounded-lg text-[12px] font-black transition-colors touch-manipulation ${controlViewMode === mode ? 'bg-slate-950 text-white shadow-sm' : 'bg-white text-slate-600'}`}
                      >
                        {CONTROL_VIEWS[mode]}
                      </button>
                    ))}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      </div>
    </aside>
  );
};
