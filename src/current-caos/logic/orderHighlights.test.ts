// Upstream assertions retained; test runner adapted to node:test.
import {
  type CaosCard,
  type CaosOrderInput,
  type Cup,
  buildCaosCards,
} from "@cafeore/common";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ORDER_HIGHLIGHT_COLORS,
  cardOrders,
  highlightFrame,
  highlightParts,
  labelOrders,
  outsideHighlights,
  selectHighlights,
} from "./orderHighlights";

const item = {
  id: "blend",
  name: "ブレンド",
  abbr: "ブ",
  item_type: { name: "hot", makes_cup: true, needs_brew: true },
} as Cup["item"];
const order = (id: string, no: number, drips: string[]): CaosOrderInput => ({
  id,
  orderId: no,
  createdAt: new Date("2026-10-20T09:00:00+09:00"),
  menus: [],
  cups: drips.map((dripId, index) => ({
    id: `${id}-cup-${index}`,
    orderMenuId: "",
    item,
    dripper: 1,
    dripperPosition: index,
    dripId,
    brewStartedAt: null,
    brewFinishedAt: null,
    readyAt: null,
    servedAt: null,
    emergencies: [],
  })),
});
const cards = buildCaosCards([
  order("a", 12, ["ab", "a"]),
  order("b", 13, ["ab", "bc", "b"]),
  order("c", 14, ["bc"]),
]);
const get = (key: string) =>
  cards.find((card) => card.dripId === key) as CaosCard;
const selected = selectHighlights(cardOrders(get("ab")), []);

describe("[unit] 注文ハイライト", () => {
  test("統合の番号順に2色を割り当て、片方に絞っても対応色を保つ", () => {
    assert.deepEqual(selected, [
      { id: "a", no: 12, color: ORDER_HIGHLIGHT_COLORS[0] },
      { id: "b", no: 13, color: ORDER_HIGHLIGHT_COLORS[1] },
    ]);
    assert.deepEqual(selectHighlights([{ id: "b", no: 13 }], selected), [
      selected[1],
    ]);
    assert.deepEqual(selectHighlights(cardOrders(get("ab")), [selected[1]]), selected);
  });

  test("別の統合を経由して無関係な注文へ連鎖しない。対象の半分だけ着色する", () => {
    assert.deepEqual(highlightParts(get("bc"), selected), [
      { id: "b", no: 13, color: ORDER_HIGHLIGHT_COLORS[1] },
      { id: "c", no: 14, color: null },
    ]);
    assert.equal(highlightFrame(get("bc"), selected), "linear-gradient(90deg, #EA580C 0%, #EA580C 50%, transparent 50%, transparent 100%)");
    assert.ok(highlightFrame(get("ab"), selected)?.includes("#F59E0B 50%, #EA580C 50%"));
    assert.equal(highlightFrame(get("a"), [selected[1]]), null);
  });

  test("表示番号が同じ別注文を強調せず、曖昧な文字検索を推測しない", () => {
    const otherDay = buildCaosCards([order("other-day", 12, ["other"])])[0];
    assert.equal(highlightFrame(otherDay, selected), null);
    assert.deepEqual(labelOrders([...cards, otherDay], "#012"), []);
    assert.deepEqual(labelOrders([...cards, otherDay], "#012", "a"), [
      { id: "a", no: 12 },
    ]);
    assert.deepEqual(labelOrders(cards, "#012+#013"), [
      { id: "a", no: 12 },
      { id: "b", no: 13 },
    ]);
  });

  test("移動・統合解除でキーや並びが変わっても、同じ注文IDなら色を維持する", () => {
    const moved = { ...get("b"), key: "moved", dripper: 4 };
    assert.equal(highlightParts(moved, selected)[0].color, ORDER_HIGHLIGHT_COLORS[1]);
    const split = {
      ...get("ab"),
      key: "split",
      cups: get("ab").cups.filter((cup) => cup.orderId === "b"),
    };
    assert.equal(highlightFrame(split, selected), "linear-gradient(90deg, #EA580C 0%, #EA580C 100%)");
    // カップが盤面から消えた場合も、選択自体を削除する処理はない。
    assert.equal(selected.length, 2);
  });

  test("画面外の杯数は対象注文だけを数え、部分的に見えるカードを除く", () => {
    const result = outsideHighlights(
      [
        { card: get("ab"), left: 0, right: 100 },
        { card: get("b"), left: 190, right: 240 },
        { card: get("bc"), left: 400, right: 500 },
      ],
      "b",
      { left: 200, right: 400 },
    );
    assert.deepEqual(result, {
      left: { count: 1, key: get("ab").key },
      right: { count: 1, key: get("bc").key },
    });
  });

  test("同じカードの重複で杯数を増やさず、最も近い画面外のカードへ案内する", () => {
    const result = outsideHighlights(
      [
        { card: get("bc"), left: 900, right: 1000 },
        { card: get("b"), left: 500, right: 600 },
        { card: get("b"), left: 500, right: 600 },
      ],
      "b",
      { left: 100, right: 400 },
    );
    assert.deepEqual(result.right, { count: 2, key: get("b").key });
    assert.deepEqual(result.left, { count: 0, key: null });
  });

  test("同じ注文2杯の統合は1色。対象なしでは枠を追加しない", () => {
    const same = buildCaosCards([
      order("same", 20, ["same-drip", "same-drip"]),
    ])[0];
    const selection = selectHighlights(cardOrders(same), []);
    assert.equal(selection.length, 1);
    assert.equal(outsideHighlights([{ card: same, left: 500, right: 600 }], "same", {
        left: 0,
        right: 400,
      }).right.count, 2);
    assert.equal(highlightFrame(same, []), null);
  });
});
