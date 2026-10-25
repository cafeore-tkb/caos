import { useLayoutEffect, useRef } from "react";
import { bayPadPlacement } from "../logic/bayPadPlacement";

/** Keep the original card DOM ownership, but lift its two rows out of clipping and stacking contexts. */
export const useBayPadPlacement = () => {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const anchor = ref.current?.closest<HTMLElement>("[data-unassigned-uid]");
    const rows = Array.from(ref.current?.querySelectorAll<HTMLElement>("[data-bay-pad-row]") ?? []);
    if (!anchor || rows.length !== 2) return;
    let frame = 0;
    const position = () => {
      const rect = anchor.getBoundingClientRect();
      const positions = bayPadPlacement(rect, { width: window.innerWidth, height: window.innerHeight });
      rows.forEach((row, index) => {
        const placement = positions[index];
        Object.assign(row.style, {
          left: `${placement.left}px`, top: `${placement.top}px`,
          width: `${placement.width}px`, height: `${placement.height}px`,
        });
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(position);
    };
    position();
    rows.forEach((row) => row.showPopover());
    // Selection can smoothly scroll the card after the opening layout effect.
    document.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(anchor);
    if (anchor.parentElement) observer.observe(anchor.parentElement);
    observer.observe(document.documentElement);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      rows.forEach((row) => { if (row.isConnected && row.matches(":popover-open")) row.hidePopover(); });
    };
  });
  return { ref };
};
