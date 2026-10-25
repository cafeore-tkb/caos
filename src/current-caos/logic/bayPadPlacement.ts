// Popover rows use viewport coordinates so scroll containers cannot clip them.
export const BAY_PAD_ROW_PX = 34;
const GAP = 4;
const STEP = BAY_PAD_ROW_PX + GAP;

export function bayPadPlacement(
  card: { left: number; top: number; bottom: number; width: number },
  viewport: { width: number; height: number },
) {
  const width = Math.min(card.width - 4, viewport.width - 2 * GAP);
  const left = Math.max(GAP, Math.min(card.left + 2, viewport.width - GAP - width));
  const above = card.top - STEP;
  const below = card.bottom + GAP;
  let tops = [above, below];
  if (below + BAY_PAD_ROW_PX > viewport.height - GAP)
    tops = [card.top - 2 * STEP, above];
  else if (above < GAP) tops = [below, below + STEP];
  // Keep both rows usable even if the card is partly outside the viewport.
  const shift = Math.max(GAP - tops[0], Math.min(0, viewport.height - GAP - BAY_PAD_ROW_PX - tops[1]));
  return tops.map((top) => ({ left, top: top + shift, width, height: BAY_PAD_ROW_PX }));
}
