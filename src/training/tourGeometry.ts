export interface TourRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(n, Math.max(min, max)));
export const overlapArea = (a: TourRect, b: TourRect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/** Keep the guide in the viewport and away from the actual control and its action tray. */
export function placeTour(
  target: TourRect | null,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  obstacles: TourRect[] = []
) {
  const padding = 12;
  const width = Math.min(size.width, viewport.width - padding * 2);
  const height = Math.min(size.height, viewport.height - padding * 2);
  const box = (x: number, y: number): TourRect => ({
    x: clamp(x, padding, viewport.width - width - padding),
    y: clamp(y, padding, viewport.height - height - padding),
    width,
    height,
  });
  if (!target) return box((viewport.width - width) / 2, (viewport.height - height) / 2);
  const cx = target.x + target.width / 2,
    cy = target.y + target.height / 2;
  const gap = 42;
  const choices = [
    box(target.x + target.width + gap, cy - height / 2),
    box(target.x - width - gap, cy - height / 2),
    box(cx - width / 2, target.y + target.height + gap),
    box(cx - width / 2, target.y - height - gap),
    box(viewport.width - width - padding, viewport.height - height - padding),
    box(padding, viewport.height - height - padding),
    box(viewport.width - width - padding, 90),
    box(padding, 90),
  ];
  const protectedTarget = { x: target.x - 14, y: target.y - 14, width: target.width + 28, height: target.height + 28 };
  const score = (candidate: TourRect) =>
    overlapArea(candidate, protectedTarget) * 1000 +
    obstacles.reduce((sum, obstacle) => sum + overlapArea(candidate, obstacle), 0) * 5 +
    Math.hypot(candidate.x + width / 2 - cx, candidate.y + height / 2 - cy);
  return choices.sort((a, b) => score(a) - score(b))[0];
}

export function tourArrow(panel: TourRect, target: TourRect) {
  const tx = target.x + target.width / 2,
    ty = target.y + target.height / 2;
  const px = panel.x + panel.width / 2,
    py = panel.y + panel.height / 2;
  const horizontal = Math.abs(tx - px) / Math.max(1, panel.width) > Math.abs(ty - py) / Math.max(1, panel.height);
  const start = horizontal
    ? { x: tx > px ? panel.x + panel.width : panel.x, y: clamp(ty, panel.y + 20, panel.y + panel.height - 20) }
    : { x: clamp(tx, panel.x + 20, panel.x + panel.width - 20), y: ty > py ? panel.y + panel.height : panel.y };
  const end = horizontal
    ? {
        x: tx > px ? target.x - 9 : target.x + target.width + 9,
        y: clamp(start.y, target.y + 5, target.y + target.height - 5),
      }
    : {
        x: clamp(start.x, target.x + 5, target.x + target.width - 5),
        y: ty > py ? target.y - 9 : target.y + target.height + 9,
      };
  const mid = horizontal ? (start.x + end.x) / 2 : (start.y + end.y) / 2;
  const path = horizontal
    ? `M ${start.x} ${start.y} C ${mid} ${start.y}, ${mid} ${end.y}, ${end.x} ${end.y}`
    : `M ${start.x} ${start.y} C ${start.x} ${mid}, ${end.x} ${mid}, ${end.x} ${end.y}`;
  return { path, start, end };
}
