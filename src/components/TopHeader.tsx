import {
  BarChart3,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Database,
  LayoutGrid,
  LogIn,
  Pause,
  Play,
  RotateCcw,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type React from 'react';
import type { LiveStatus } from '../live/useLiveDrips';
import type { ControlViewMode } from './ControlWorkspace';

export type NavTab = 'control' | 'bays' | 'beans' | 'analytics';

interface TopHeaderProps {
  activeTab: NavTab;
  controlViewMode: ControlViewMode;
  onSelectTab: (tab: NavTab) => void;
  onSelectControlViewMode: (mode: ControlViewMode) => void;
  timeStr: string;
  unassignedCups: number;
  totalWaitingCups: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  isRunning: boolean;
  onTogglePlay: () => void;
  simSpeed: number;
  onChangeSpeed: (speed: number) => void;
  onResetData: () => void;
  showTimelineControls: boolean;
  onTimelineNavigate: (direction: 'back' | 'now' | 'forward') => void;
  canUndo: boolean;
  undoLabel: string | null;
  onUndo: () => void;
  testPlaying: boolean;
  testProgressLabel: string | null;
  onOpenTestPlay: () => void;
  onEndTestPlay: () => void;
  liveStatus: LiveStatus;
  liveEmail?: string;
  onSignIn: () => void;
  onSignOut: () => void;
}

const LIVE_STATUS_LABEL: Record<LiveStatus, string> = {
  off: '実データテスト中は停止',
  unconfigured: 'Supabase 未設定',
  'signed-out': '未ログイン',
  'not-staff': 'スタッフ未登録',
  connecting: '接続中',
  open: '接続済み',
  reconnecting: '再接続中',
};

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeTab,
  controlViewMode,
  onSelectTab,
  onSelectControlViewMode,
  timeStr,
  unassignedCups,
  totalWaitingCups,
  soundEnabled,
  onToggleSound,
  isRunning,
  onTogglePlay,
  simSpeed,
  onChangeSpeed,
  onResetData,
  showTimelineControls,
  onTimelineNavigate,
  canUndo,
  undoLabel,
  onUndo,
  testPlaying,
  testProgressLabel,
  onOpenTestPlay,
  onEndTestPlay,
  liveStatus,
  liveEmail,
  onSignIn,
  onSignOut,
}) => {
  const navItems = [
    { id: 'control' as const, label: 'CaOS', icon: null },
    { id: 'bays' as const, label: 'ドリッパー', icon: LayoutGrid },
    { id: 'beans' as const, label: '豆キュー', icon: Coffee },
    { id: 'analytics' as const, label: '実績', icon: BarChart3 },
  ];

  return (
    <header className="h-[56px] bg-white border-b border-[#e2e8f0] px-2 flex items-center justify-between gap-2 shadow-xs select-none shrink-0">
      {/* Left side: Clock and Top Metrics */}
      <div className="flex min-w-0 items-center gap-2">
        <nav
          className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1"
          aria-label="画面切替"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-tab-${item.id}`}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-pressed={active}
                title={item.label}
                className={`flex h-10 min-w-10 items-center justify-center gap-1 rounded-md px-2 text-[11px] font-black touch-manipulation ${active ? 'bg-slate-950 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {Icon && <Icon className="h-4 w-4" />}
                <span className={item.id === 'control' ? '' : 'hidden 2xl:inline'}>{item.label}</span>
              </button>
            );
          })}
          {activeTab === 'control' && (
            <div
              className="ml-0.5 flex items-center gap-0.5 border-l border-slate-300 pl-1"
              role="group"
              aria-label="管制盤の表示切替"
            >
              {(['current', 'new', 'c', 'd'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={controlViewMode === mode}
                  onClick={() => onSelectControlViewMode(mode)}
                  className={`h-10 min-w-9 rounded-md text-[12px] font-black touch-manipulation ${controlViewMode === mode ? 'bg-blue-700 text-white' : 'bg-white text-slate-600'}`}
                >
                  {mode === 'current' ? 'A' : mode === 'new' ? 'B' : mode.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </nav>

        {/* Large Digital Clock */}
        <div className="flex items-center gap-2">
          <div className="font-mono text-[28px] font-bold tracking-tight text-[#0f172a] leading-none">{timeStr}</div>
          {/* Quick Sim Controls */}
          <div className="flex items-center gap-1 bg-[#f1f5f9] p-1 rounded-md border border-[#e2e8f0]">
            <button
              id="sim-play-pause-btn"
              onClick={onTogglePlay}
              title={isRunning ? '一時停止' : 'タイマー再開'}
              className="w-10 h-10 hover:bg-white text-slate-700 rounded-lg transition-colors text-xs flex items-center justify-center touch-manipulation"
            >
              {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <button
              id="sim-speed-btn"
              onClick={() => onChangeSpeed(simSpeed === 1 ? 2 : simSpeed === 2 ? 5 : simSpeed === 5 ? 10 : 1)}
              title="シミュレーション速度切替"
              className="min-w-10 h-10 px-1.5 hover:bg-white text-[11px] font-mono font-bold text-slate-700 rounded-lg transition-colors touch-manipulation"
            >
              {simSpeed}x
            </button>
            <button
              id="sim-reset-btn"
              onClick={onResetData}
              title="初期状態にリセット"
              className="w-10 h-10 hover:bg-white text-slate-600 rounded-lg transition-colors flex items-center justify-center touch-manipulation"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            {showTimelineControls && (
              <div className="ml-1 flex items-center gap-1 border-l border-slate-300 pl-1">
                <button
                  type="button"
                  onClick={() => onTimelineNavigate('back')}
                  title="5分前を表示"
                  className="h-10 px-2 rounded-lg border border-slate-300 bg-white text-[12px] font-black text-slate-700 flex items-center gap-0.5 touch-manipulation"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  −5分
                </button>
                <button
                  type="button"
                  onClick={() => onTimelineNavigate('now')}
                  title="現在時刻へ戻る"
                  className="h-10 px-3 rounded-lg bg-red-500 text-[12px] font-black text-white flex items-center gap-1 touch-manipulation"
                >
                  <span className="h-2 w-2 rounded-full bg-white" />
                  現在
                </button>
                <button
                  type="button"
                  onClick={() => onTimelineNavigate('forward')}
                  title="5分先を表示"
                  className="h-10 px-2 rounded-lg border border-slate-300 bg-white text-[12px] font-black text-slate-700 flex items-center gap-0.5 touch-manipulation"
                >
                  ＋5分
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Metric 1: 未割当オーダー (Unassigned Orders) */}
        <div className="hidden xl:flex bg-[#eef5fc] border border-[#d3e5f8] rounded-md px-3 py-1.5 items-baseline gap-1.5">
          <span className="text-[12px] font-semibold text-[#475569]">未割当オーダー</span>
          <div className="flex items-baseline font-mono">
            <span className="text-[19px] font-extrabold text-[#ef4444] leading-none">{unassignedCups}</span>
            <span className="text-[12px] font-bold text-[#475569] ml-1">杯</span>
          </div>
        </div>

        {/* Metric 2: 全ベイ待機杯数 (Total Queued Cups in Bays) */}
        <div className="hidden xl:flex bg-[#eef5fc] border border-[#d3e5f8] rounded-md px-3 py-1.5 items-baseline gap-1.5">
          <span className="text-[12px] font-semibold text-[#475569]">全ドリッパー待機杯数</span>
          <div className="flex items-baseline font-mono">
            <span className="text-[19px] font-extrabold text-[#0f172a] leading-none">{totalWaitingCups}</span>
            <span className="text-[12px] font-bold text-[#475569] ml-1">杯</span>
          </div>
        </div>
      </div>

      {/* Right side: only persistent operational controls */}
      <div className="flex items-center gap-2">
        {liveStatus === 'signed-out' ? (
          <button
            type="button"
            onClick={onSignIn}
            className="min-h-[44px] flex items-center gap-1.5 rounded-lg border border-emerald-700 bg-emerald-700 px-3 text-xs font-black text-white shadow-xs touch-manipulation"
            title="cafeore-pos と同じ DB に Google アカウントでログイン"
          >
            <LogIn className="h-4 w-4" />
            <span>ログイン</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={liveEmail ? onSignOut : undefined}
            disabled={!liveEmail}
            aria-label={`cafeore-pos ${LIVE_STATUS_LABEL[liveStatus]}`}
            title={`cafeore-pos の DB: ${LIVE_STATUS_LABEL[liveStatus]}${liveEmail ? `（${liveEmail}）。押すとログアウト` : ''}`}
            className={`min-h-[44px] flex items-center gap-1 rounded-lg border px-2 text-xs font-black touch-manipulation ${liveStatus === 'open' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : liveStatus === 'off' || liveStatus === 'unconfigured' ? 'border-slate-200 bg-slate-100 text-slate-400' : liveStatus === 'not-staff' ? 'border-red-300 bg-red-50 text-red-700' : 'border-amber-300 bg-amber-50 text-amber-800'}`}
          >
            <Database className="h-4 w-4" />
            {liveStatus === 'not-staff' ? (
              <span>未登録</span>
            ) : (
              <span
                className={`h-2 w-2 rounded-full ${liveStatus === 'open' ? 'bg-emerald-500' : liveStatus === 'off' || liveStatus === 'unconfigured' ? 'bg-slate-300' : 'bg-amber-400'}`}
              />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={testPlaying ? onEndTestPlay : onOpenTestPlay}
          className={`min-h-[44px] flex items-center gap-1.5 rounded-lg border px-3 text-xs font-black shadow-xs touch-manipulation ${testPlaying ? 'border-blue-700 bg-blue-700 text-white' : 'border-blue-300 bg-blue-50 text-blue-900 hover:bg-blue-100'}`}
          title={testPlaying ? 'テストプレイを終了して実績を表示' : '2025年の実データでテストプレイ'}
        >
          {testPlaying ? <BarChart3 className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
          <span>{testPlaying ? `終了・実績 ${testProgressLabel || ''}` : '実データテスト'}</span>
        </button>
        <button
          id="btn-undo"
          type="button"
          disabled={!canUndo}
          onClick={onUndo}
          title={undoLabel ? `${undoLabel}を元に戻す` : '元に戻せる操作はありません'}
          className="min-h-[44px] flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-black text-slate-800 shadow-xs transition-colors hover:bg-slate-100 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 touch-manipulation"
        >
          <Undo2 className="w-4 h-4" />
          <span>1つ戻す</span>
        </button>

        {/* Sound toggle */}
        <button
          id="btn-toggle-sound"
          onClick={onToggleSound}
          title={soundEnabled ? '通知音 ON' : '通知音 消音'}
          className={`w-11 h-11 rounded-lg border text-xs transition-colors flex items-center justify-center touch-manipulation ${
            soundEnabled ? 'bg-[#f1f5f9] text-slate-700 border-[#cbd5e1]' : 'bg-red-50 text-red-500 border-red-200'
          }`}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
