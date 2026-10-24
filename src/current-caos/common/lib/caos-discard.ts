import type { CaosCard } from "./caos-board";
/** 元の抽出単位の後に、同じカップの実際の淹れ直しが登録された杯だけ。 */
export const caosDiscardCandidates = (
  cards: readonly CaosCard[],
  card: CaosCard,
) => {
  if (card.status !== "brewing" && card.status !== "queued") return [];
  const rebrews = cards
    .flatMap((c) => c.cups)
    .filter((c) => c.emergency && c.emergencyReason.trim() !== "ラベル再発行");
  return card.cups.filter(
    (cup) =>
      (!cup.emergency || cup.emergencyReason.trim() !== "ラベル再発行") &&
      rebrews.some(
        (redo) =>
          redo.cupId === cup.cupId &&
          redo.id !== cup.id &&
          redo.orderedAt.getTime() >= cup.orderedAt.getTime() &&
          redo.orderedAt.getTime() >=
            (card.startedAt ?? cup.orderedAt).getTime(),
      ),
  );
};

