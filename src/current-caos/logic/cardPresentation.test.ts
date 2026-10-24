// Upstream assertions retained; test runner adapted to node:test.
import { type Cup, buildCaosCards } from "@cafeore/common";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  cardNomination,
  cardNumberParts,
  fittingCardLabels,
  isMergedOrderCard,
} from "./cardPresentation";

const labels = [
  { key: "lane", width: 60, compactWidth: 28, priority: 0 },
  { key: "senior", width: 66, compactWidth: 20, priority: 2 },
  { key: "emergency", width: 48, priority: 3 },
];

describe("[unit] カードのラベル優先順位", () => {
  test("余裕があれば指名・上級生の文字と緊急札をすべて残す", () => {
    const fit = fittingCardLabels(270, 48, labels, 4);
    assert.deepEqual([...fit.visible], ["lane", "senior", "emergency"]);
    assert.deepEqual([...fit.compact], []);
  });
  test("レーンと上級生アイコンを残し、入らない緊急札を省略する", () => {
    const fit = fittingCardLabels(154, 48, labels, 4);
    assert.deepEqual([...fit.visible], ["lane", "senior"]);
    assert.deepEqual([...fit.compact], ["senior"]);
  });
  test("さらに狭ければ指名の接頭語を省略し、2ndと★を残す", () => {
    const fit = fittingCardLabels(120, 48, labels, 4);
    assert.deepEqual([...fit.visible], ["lane", "senior"]);
    assert.deepEqual([...fit.compact], ["lane", "senior"]);
  });
  test("長い自由記述の札は途中切れにせず省略する", () => {
    const fit = fittingCardLabels(
      180,
      48,
      [
        { key: "name", width: 200, priority: 1 },
        ...labels.filter((l) => l.key !== "lane"),
      ],
      4,
    );
    assert.equal(fit.visible.has("name"), false);
    assert.equal(fit.visible.has("senior"), true);
  });
  test("商品名が長くても短いレーン名の幅を先に確保する", () => {
    const fit = fittingCardLabels(120, 300, labels, 4);
    assert.equal(fit.productWidth, 88);
    assert.deepEqual([...fit.visible], ["lane"]);
    assert.equal(fit.compact.has("lane"), true);
  });
  test("商品名より先にレーン指名と提供済みの幅を確保する", () => {
    const fit = fittingCardLabels(
      120,
      300,
      [...labels, { key: "served", width: 60, priority: 0 }],
      4,
    );
    assert.equal(fit.productWidth, 24);
    assert.deepEqual([...fit.visible], ["lane", "served"]);
    assert.equal(fit.wrapRequired, false);
  });
  test("極端に狭い幅でも必須札は隠さず折り返す", () => {
    const fit = fittingCardLabels(
      80,
      48,
      [...labels, { key: "served", width: 60, priority: 0 }],
      4,
    );
    assert.equal(fit.productWidth, 0);
    assert.deepEqual([...fit.visible], ["lane", "served"]);
    assert.equal(fit.wrapRequired, true);
  });
  test("レーン指名と自由記述の指名が収まる幅なら両方を残す", () => {
    const fit = fittingCardLabels(
      200,
      48,
      [labels[0], { key: "name", width: 100, priority: 1 }],
      4,
    );
    assert.deepEqual([...fit.visible], ["lane", "name"]);
  });
});

const item = {
  id: "blend",
  name: "ブレンド",
  abbr: "ブ",
  item_type: { name: "blend", makes_cup: true, needs_brew: true },
} as Cup["item"];
const state = {
  dripId: "mixed",
  dripper: 2,
  dripperPosition: 1,
  brewStartedAt: null,
  brewFinishedAt: null,
};
const [mixed] = buildCaosCards([
  {
    id: "a",
    orderId: 1000,
    createdAt: new Date("2026-10-20T09:00:00+09:00"),
    menus: [],
    cups: [
      {
        id: "cup",
        orderMenuId: "",
        item,
        readyAt: null,
        servedAt: null,
        ...state,
        emergencies: [
          {
            id: "emergency",
            createdAt: new Date("2026-10-20T10:00:00+09:00"),
            reason: "こぼした",
            ...state,
          },
        ],
      },
    ],
  },
]);

describe("[unit] カードの番号と指名", () => {
  test("同じ注文の通常と緊急の2杯には複数注文の統合表示を付けない", () => {
    assert.equal(isMergedOrderCard(mixed), false);
  });
  test("同一注文の通常2杯と、異なる注文の2杯を区別する", () => {
    const normalCups = mixed.cups.map((cup) => ({ ...cup, emergency: false }));
    assert.equal(isMergedOrderCard({ ...mixed, cups: normalCups }), false);
    assert.equal(isMergedOrderCard({
        ...mixed,
        cups: normalCups.map((cup, i) => ({ ...cup, orderId: `order-${i}` })),
      }), true);
  });
  test("同一注文の1000番でも緊急と通常を別の番号要素にする", () => {
    assert.deepEqual(cardNumberParts(mixed), [
      { id: "a", no: 1000, emergency: true },
      { id: "a", no: 1000, emergency: false },
    ]);
  });
  test("レーンと自由記述を区別し、レーンを番号順に表示する", () => {
    const nomination = cardNomination({
      ...mixed,
      cups: mixed.cups.map((cup, i) => ({
        ...cup,
        nominatedDripper: i ? null : 2,
        nominee: i ? "山田太郎" : "2nd",
      })),
    });
    assert.deepEqual(nomination, { lane: "2nd", text: "山田太郎" });
  });
});
