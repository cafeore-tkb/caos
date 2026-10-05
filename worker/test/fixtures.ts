import type { PosOrder } from '../board/types';

// テスト用の商品（cafeore-pos の items / item_types と同じ形）
export const ITEMS = {
  champ: { id: 'item-champ', name: '優勝ブレンド', abbr: '優勝', item_type: { name: 'hot' } },
  ore: { id: 'item-ore', name: '珈琲・俺ブレンド', abbr: '俺ブレ', item_type: { name: 'hot' } },
  ice: { id: 'item-ice', name: 'アイスコーヒー', abbr: '氷', item_type: { name: 'ice' } },
  milk: { id: 'item-milk', name: 'アイスミルク', abbr: 'ミルク', item_type: { name: 'milk' } },
  tote: { id: 'item-tote', name: 'トートバッグ', abbr: 'トート', item_type: { name: 'others' } },
} as const;

type Item = (typeof ITEMS)[keyof typeof ITEMS];

/** 注文の明細 1 行（メニュー 1 つ）。セットのメニューは items を複数にする */
export interface Line {
  items: [Item, number][];
  assignee?: string | null;
}

export const DAY = '2026-11-01';

export const orderId = (no: number) => `00000000-0000-0000-0000-${no.toString().padStart(12, '0')}`;

export const order = (
  no: number,
  lines: Line[],
  opts: { ready_at?: string | null; served_at?: string | null; created_at?: string } = {}
): PosOrder => ({
  id: orderId(no),
  order_id: no,
  created_at: opts.created_at ?? `${DAY}T01:${String(no % 60).padStart(2, '0')}:00.000Z`,
  ready_at: opts.ready_at ?? null,
  served_at: opts.served_at ?? null,
  menus: lines.map((line, i) => ({
    id: `${orderId(no)}-menu-${i}`,
    assignee: line.assignee ?? null,
    menu: { items: line.items.map(([item, quantity]) => ({ item, quantity })) },
  })),
});

/** SQL のテスト（caos_test.sql）と同じ注文 #1：優勝 3 杯・アイスミルク・トートセット（優勝＋トート）・俺ブレ（指名 ２） */
export const order1 = (oreCups = 1) =>
  order(1, [
    { items: [[ITEMS.champ, 3]] },
    { items: [[ITEMS.milk, 1]] },
    {
      items: [
        [ITEMS.champ, 1],
        [ITEMS.tote, 1],
      ],
    },
    { items: [[ITEMS.ore, oreCups]], assignee: ' ２ ' },
  ]);

export const single = (no: number, item: Item = ITEMS.champ, cups = 1) => order(no, [{ items: [[item, cups]] }]);
