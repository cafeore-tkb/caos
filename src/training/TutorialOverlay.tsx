import { BookOpen, CheckCircle2, ChevronDown, ChevronUp, MoveUpRight } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GameState } from './engine';
import { placeTour, type TourRect, tourArrow } from './tourGeometry';
import { findTourTarget, tourHint } from './tourHints';
import { LESSONS, type Lesson } from './tutorial';

type Layout = { panel: TourRect; target: TourRect | null; portal: HTMLElement; fallback: boolean };
const rectOf = (element: Element): TourRect => {
  const r = element.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
};
const sameRect = (a: TourRect | null, b: TourRect | null) =>
  a === b ||
  Boolean(a && b && (['x', 'y', 'width', 'height'] as const).every((key) => Math.abs(a[key] - b[key]) < 0.5));

/** Non-modal, pointer-transparent coach layer. Only the floating card takes pointer input. */
export function TutorialOverlay({
  lesson,
  lessonNumber,
  state,
  interactions,
  mode,
  onNext,
  onAdvanceTime,
}: {
  lesson: Lesson;
  lessonNumber: number;
  state: GameState;
  interactions: string[];
  mode: string;
  onNext: () => void;
  onAdvanceTime: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [layout, setLayout] = useState<Layout | null>(null);
  const popup = useRef<HTMLDivElement>(null);
  const lastRevealed = useRef<HTMLElement | null>(null);
  const id = useId().replace(/:/g, '');
  const stepIndex = lesson.steps.findIndex((step) => !step.done(state, interactions));
  const complete = stepIndex < 0;
  const hint = complete ? null : tourHint(lesson, stepIndex, state, mode);
  const portalHost = layout?.portal ?? document.body;

  useLayoutEffect(() => {
    let frame = 0;
    let disposed = false;
    let observed: HTMLElement | null = null;
    const resize = new ResizeObserver(() => schedule());
    const measure = () => {
      if (disposed || !popup.current) return;
      const hint = complete ? null : tourHint(lesson, stepIndex, state, mode);
      let element = hint ? findTourTarget(hint.queries) : null;
      const fallback = !complete && !element;
      if (fallback) element = document.querySelector('[data-tour-retry]');
      if (element !== observed) {
        if (observed) resize.unobserve(observed);
        if (element) resize.observe(element);
        observed = element;
      }
      if (element && element !== lastRevealed.current) {
        lastRevealed.current = element;
        const bounds = element.getBoundingClientRect();
        if (
          bounds.top < 60 ||
          bounds.bottom > window.innerHeight - 12 ||
          bounds.left < 0 ||
          bounds.right > window.innerWidth
        )
          element.scrollIntoView({
            block: 'nearest',
            inline: 'center',
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          });
      }
      const target = element ? rectOf(element) : null;
      const viewport = { width: document.documentElement.clientWidth, height: window.innerHeight };
      const obstacles = [
        ...document.querySelectorAll(
          '.training-ticket-panel, .caos-side-panel, dialog[open], [aria-label="ドリッパーの情報"], [data-comment-dock], [data-caos-action-tray], [data-search-key] button[data-bay-target]'
        ),
      ]
        .filter((item) => !item.closest('[data-training-tour]'))
        .map(rectOf);
      const measured = popup.current.getBoundingClientRect();
      const panel = placeTour(target, { width: measured.width, height: measured.height }, viewport, obstacles);
      // Native confirm dialogs use the browser's top layer. Keep the coach in that layer too.
      const portal = document.querySelector<HTMLElement>('dialog[open]') ?? document.body;
      setLayout((previous) =>
        previous &&
        sameRect(previous.panel, panel) &&
        sameRect(previous.target, target) &&
        previous.portal === portal &&
        previous.fallback === fallback
          ? previous
          : { panel, target, portal, fallback }
      );
    };
    function schedule() {
      if (!frame && !disposed)
        frame = requestAnimationFrame(() => {
          frame = 0;
          measure();
        });
    }
    const mutations = new MutationObserver((records) => {
      if (
        records.some((record) => !(record.target instanceof Element) || !record.target.closest('[data-training-tour]'))
      )
        schedule();
    });
    mutations.observe(document.body, { childList: true, subtree: true, attributes: true });
    const currentPopup = portalHost.querySelector<HTMLElement>('[data-training-tour] [role="dialog"]') ?? popup.current;
    if (currentPopup) resize.observe(currentPopup);
    document.addEventListener('scroll', schedule, true);
    document.addEventListener('animationend', schedule, true);
    document.addEventListener('transitionend', schedule, true);
    document.addEventListener('change', schedule, true);
    document.addEventListener('input', schedule, true);
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    measure();
    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      document.removeEventListener('scroll', schedule, true);
      document.removeEventListener('animationend', schedule, true);
      document.removeEventListener('transitionend', schedule, true);
      document.removeEventListener('change', schedule, true);
      document.removeEventListener('input', schedule, true);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
    };
  }, [lesson, stepIndex, complete, state, mode, portalHost]);

  const arrow = layout?.target ? tourArrow(layout.panel, layout.target) : null;
  const inConfirmation = Boolean(layout && layout.portal !== document.body && lesson.id === 'discard');
  const message = layout?.fallback
    ? '対象が変わりました。「やり直す」で再開。'
    : inConfirmation
      ? '元の1杯を確認して破棄。淹れ直しは残ります。'
      : hint?.message;
  return createPortal(
    <div data-training-tour className="tutorial-layer">
      {layout?.target && (
        <div
          className="tutorial-target"
          data-tour-target
          style={{
            left: layout.target.x - 5,
            top: layout.target.y - 5,
            width: layout.target.width + 10,
            height: layout.target.height + 10,
          }}
          aria-hidden="true"
        />
      )}
      {arrow && (
        <svg className="tutorial-arrow" aria-hidden="true">
          <defs>
            <marker id={`${id}-tip`} markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
              <path d="M 0 0 L 8 4.5 L 0 9 Z" fill="#dc2626" />
            </marker>
          </defs>
          <path className="tutorial-arrow-under" d={arrow.path} />
          <path className="tutorial-arrow-line" d={arrow.path} markerEnd={`url(#${id}-tip)`} />
          <circle cx={arrow.start.x} cy={arrow.start.y} r="5" fill="#dc2626" />
        </svg>
      )}
      <div
        ref={popup}
        role="dialog"
        aria-modal="false"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-instruction`}
        aria-label="レッスンのガイド"
        className={`tutorial-popup ${expanded ? '' : 'is-collapsed'} ${complete ? 'is-complete' : ''}`}
        style={{ left: layout?.panel.x ?? 12, top: layout?.panel.y ?? 90, visibility: layout ? 'visible' : 'hidden' }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setExpanded(false);
        }}
      >
        <header className="tutorial-popup-header">
          <span>
            <BookOpen size={15} />
            練習 {lessonNumber} / {LESSONS.length}
          </span>
          <button
            type="button"
            aria-label={expanded ? 'ガイドを小さくする' : 'ガイドを開く'}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>
        </header>
        <div className="tutorial-popup-content">
          <div className="tutorial-step-count">{complete ? '完了' : `${stepIndex + 1} / ${lesson.steps.length}`}</div>
          <h2 id={`${id}-title`}>
            {complete ? (
              <>
                <CheckCircle2 size={21} />
                できました！
              </>
            ) : inConfirmation ? (
              '元の1杯を破棄'
            ) : (
              lesson.steps[stepIndex].label
            )}
          </h2>
          <p id={`${id}-instruction`} aria-live="polite">
            {complete ? '次へ進みましょう。' : message}
          </p>
          {expanded && (
            <>
              <div className="tutorial-step-track" aria-hidden="true">
                {lesson.steps.map((step, index) => (
                  <i
                    key={step.label}
                    className={step.done(state, interactions) ? 'done' : index === stepIndex ? 'current' : ''}
                  />
                ))}
              </div>
              {hint?.advanceTime && (
                <button type="button" className="tutorial-time" onClick={onAdvanceTime}>
                  時間を進める
                </button>
              )}
              {complete ? (
                <button type="button" className="tutorial-next" onClick={onNext}>
                  {lessonNumber === LESSONS.length ? 'ゲームへ' : '次へ'}
                  <MoveUpRight size={17} />
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>,
    portalHost
  );
}
