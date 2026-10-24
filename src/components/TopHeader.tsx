import {
  BarChart3,
  Bean,
  CalendarClock,
  Database,
  Gamepad2,
  History,
  Search,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import settingsIcon from '../current-caos/icons/change-dripper.svg';
import type { PosConnectionStatus } from '../hooks/usePosOrders';
import { CONTROL_VIEWS, type ControlViewMode } from './ControlWorkspace';
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
  posStatus: PosConnectionStatus;
  onSearchOrder?: (no: number) => void;
  onOpenPastOrders?: () => void;
}
export const TopHeader: React.FC<TopHeaderProps> = (props) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [digits, setDigits] = useState('');
  const nav = [
    { id: 'control', label: 'CaOS', icon: null },
    { id: 'bays', label: 'ドリッパー', icon: null },
    { id: 'beans', label: '豆残量確認', icon: Bean },
    { id: 'analytics', label: '実績', icon: BarChart3 },
  ] as const;
  const cell =
    'flex h-11 min-w-10 shrink-0 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-black';
  return (
    <>
      <header className="relative z-[110] flex min-h-14 shrink-0 items-center justify-between gap-2 overflow-x-auto border-b border-slate-200 bg-white px-2 py-1">
        <div className="flex shrink-0 items-center gap-2">
          <nav
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1"
            aria-label="画面切替"
          >
            {nav.map(({ id, label, icon: Icon }) => (
              <button
                type="button"
                key={id}
                aria-label={label}
                aria-pressed={props.activeTab === id}
                onClick={() => props.onSelectTab(id)}
                className={`${cell} ${props.activeTab === id ? '!border-slate-950 !bg-slate-950 !text-white' : 'text-slate-600'}`}
              >
                {id === 'control' ? (
                  'CaOS'
                ) : Icon ? (
                  <Icon size={16} />
                ) : (
                  <span
                    className="h-4 w-4 bg-current"
                    style={{ maskImage: `url(${settingsIcon})`, maskSize: 'contain', maskRepeat: 'no-repeat' }}
                  />
                )}
              </button>
            ))}
            <div className="ml-1 flex gap-1 border-l border-slate-300 pl-1" role="group" aria-label="管制盤の表示切替">
              {(Object.keys(CONTROL_VIEWS) as ControlViewMode[]).map((mode) => (
                <button
                  type="button"
                  key={mode}
                  aria-pressed={props.controlViewMode === mode}
                  onClick={() => props.onSelectControlViewMode(mode)}
                  className={`${cell} ${props.controlViewMode === mode ? '!border-blue-700 !bg-blue-700 !text-white' : 'text-slate-600'}`}
                >
                  {CONTROL_VIEWS[mode]}
                </button>
              ))}
            </div>
          </nav>
          <div className="min-w-0">
            <div className="font-mono text-[27px] font-black leading-none">{props.timeStr}</div>
            <div className="mt-1 max-w-52 truncate text-[10px] text-slate-500">
              ↶ {props.undoLabel ?? '直前の操作なし'}
            </div>
          </div>
          {props.showTimelineControls && (
            <button
              type="button"
              aria-pressed
              onClick={() => props.onTimelineNavigate('now')}
              className="flex h-11 flex-col items-center justify-center rounded-md bg-red-500 px-3 text-[11px] font-black text-white"
            >
              <span className="h-2 w-2 rounded-full bg-white" />
              現在
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className={cell} aria-label="注文番号で探す" onClick={() => setSearchOpen(!searchOpen)}>
            <Search size={16} />
            番号
          </button>
          <output
            aria-label={`cafeore-pos ${props.posStatus}`}
            className={`${cell} ${props.posStatus === 'open' ? 'text-emerald-700' : 'text-amber-700'}`}
          >
            <Database size={16} />
            <span
              className={`h-2 w-2 rounded-full ${props.posStatus === 'open' ? 'bg-emerald-500' : 'bg-amber-400'}`}
            />
          </output>
          <button
            type="button"
            onClick={props.testPlaying ? props.onEndTestPlay : props.onOpenTestPlay}
            className={`${cell} !border-blue-300 !bg-blue-50 text-blue-900`}
          >
            <CalendarClock size={16} />
            {props.testPlaying ? `終了 ${props.testProgressLabel ?? ''}` : 'テスト'}
          </button>
          <a href="#training" className={`${cell} !border-emerald-800 !bg-emerald-800 text-white`}>
            <Gamepad2 size={16} />
            ゲーム
          </a>
          <button
            type="button"
            aria-label={props.soundEnabled ? '通知音 ON' : '通知音 OFF'}
            onClick={props.onToggleSound}
            className={cell}
          >
            {props.soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button
            type="button"
            className={cell}
            onClick={props.onOpenPastOrders ?? (() => props.onSelectTab('analytics'))}
          >
            <History size={16} />
            過去の注文
          </button>
          <button
            type="button"
            className={cell}
            disabled={!props.canUndo}
            aria-label="直前の操作を戻す"
            onClick={props.onUndo}
          >
            <Undo2 size={16} />
          </button>
        </div>
      </header>
      {props.testPlaying && (
        <div className="flex shrink-0 items-center gap-3 border-b border-blue-200 bg-blue-50 px-3 py-1 text-[12px] font-bold">
          <span>テストの盤面</span>
          <button type="button" className="min-h-9 rounded border bg-white px-3" onClick={props.onTogglePlay}>
            {props.isRunning ? '一時停止' : '再開'}
          </button>
          <select
            value={props.simSpeed}
            aria-label="テスト再生速度"
            onChange={(event) => props.onChangeSpeed(Number(event.target.value))}
          >
            {[1, 2, 5, 10].map((speed) => (
              <option value={speed} key={speed}>
                {speed}倍
              </option>
            ))}
          </select>
          <button type="button" onClick={props.onEndTestPlay}>
            終了・実績
          </button>
        </div>
      )}
      {searchOpen && (
        <form
          className="absolute top-16 right-3 z-[150] flex items-center gap-2 rounded-xl border border-slate-300 bg-white p-4 shadow-xl"
          onSubmit={(event) => {
            event.preventDefault();
            if (digits) props.onSearchOrder?.(Number(digits));
            setSearchOpen(false);
          }}
        >
          <label className="text-sm font-bold">
            注文番号{' '}
            <input
              aria-label="探す注文番号"
              inputMode="numeric"
              pattern="[0-9]{1,4}"
              value={digits}
              onChange={(event) => setDigits(event.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-24 rounded border border-slate-300 p-2 font-mono"
            />
          </label>
          <button type="submit" className={cell}>
            探す
          </button>
          <button type="button" className={cell} onClick={() => setSearchOpen(false)}>
            閉じる
          </button>
        </form>
      )}
    </>
  );
};
