import { X } from 'lucide-react';
import { type ReactNode, useRef } from 'react';
import { usePanelOutsidePress } from '../hooks/useOutsidePress';

/** Production SidePanel shell, with standalone close ownership. */
export function SidePanel({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  usePanelOutsidePress(ref, onClose);
  return (
    <aside
      ref={ref}
      aria-label={title}
      style={{ width: 'var(--caos-side-panel-width, 440px)', maxWidth: '100vw' }}
      className="caos-side-panel fixed top-[56px] right-0 bottom-0 z-[150] flex w-(--caos-side-panel-width) flex-col border-l border-slate-300 bg-white text-slate-950 shadow-2xl"
    >
      <header className="flex min-h-[52px] shrink-0 items-center gap-1 border-b border-slate-200 bg-slate-50 px-4">
        <h2 className="mr-auto min-w-0 font-black text-[16px]">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-black/5"
        >
          <X className="h-5 w-5" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      {footer}
    </aside>
  );
}
