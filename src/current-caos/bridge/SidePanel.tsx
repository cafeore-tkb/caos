import { X } from 'lucide-react';
import type React from 'react';
import { useRef } from 'react';
import { FloatingWindowScope, useFloatingWindow } from '../components/FloatingWindows';
import { usePanelOutsidePress } from '../hooks/useOutsidePress';

export const SidePanel: React.FC<{
  title: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  icon?: React.ReactNode;
  contentClassName?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ title, onClose, footer, icon, contentClassName = 'p-4', style, children }) => {
  const panelRef = useRef<HTMLElement | null>(null);
  const floating = useFloatingWindow(typeof title === 'string' ? title : '操作パネル');
  usePanelOutsidePress(panelRef, onClose, !floating.hidden);
  return (
    <aside
      ref={(element) => {
        panelRef.current = element;
        floating.ref.current = element;
      }}
      aria-label={typeof title === 'string' ? title : '操作パネル'}
      data-popup-hidden={floating.hidden}
      style={{
        ...style,
        ...floating.style,
        // コメント入力中のキーボード表示では、移動済みのパネルも表示範囲へ戻す。
        ...(typeof style?.bottom === 'number' && style.bottom > 0
          ? {
              top: 56,
              bottom: style.bottom,
              maxHeight: `calc(100dvh - ${style.bottom + 56}px)`,
            }
          : {}),
      }}
      className="context-sheet fade-in-75 slide-in-from-right caos-side-panel fixed top-[56px] right-0 bottom-0 z-[150] flex w-(--caos-side-panel-width) animate-in select-none flex-col border-slate-300 border-l bg-white text-slate-950 shadow-2xl duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
    >
      <header className="flex min-h-[52px] shrink-0 items-center gap-1 border-slate-200 border-b bg-slate-50 px-4">
        {floating.handle}
        {icon}
        <div className="mr-auto min-w-0 font-black text-[16px]">{title}</div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full hover:bg-black/5"
          aria-label="閉じる"
        >
          <X className="h-5 w-5" />
        </button>
      </header>
      <div className={`min-h-0 flex-1 overflow-y-auto ${contentClassName}`}>
        <FloatingWindowScope value={{ active: !floating.hidden, activate: floating.restore }}>
          {children}
        </FloatingWindowScope>
      </div>
      {footer}
    </aside>
  );
};
