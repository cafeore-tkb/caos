// 盤面のルール。CaOS#15 の SQL のテスト（supabase/tests/caos_test.sql）の流れを、そのまま TypeScript で確かめる。
import { describe, expect, it } from 'vitest';
import { Board, BoardError, Changeset } from '../board/logic';
import type { Drip, Op } from '../board/types';
import { ITEMS, order, order1, orderId, single } from './fixtures';

const newBoard = () => {
  let n = 0;
  let t = Date.parse('2026-11-01T01:00:00.000Z');
  const clock = () => {
    t += 1000;
    return new Date(t).toISOString();
  };
  const newId = () => {
    n += 1;
    return `drip-${n}`;
  };
  return new Board([], [], { clock, newId });
};

const run = (_board: Board, fn: (cs: Changeset) => void) => {
  const cs = new Changeset();
  fn(cs);
  return cs;
};

const op = (board: Board, o: Op) => {
  const cs = run(board, (cs) => board.apply(cs, o));
  return { cs, result: board.result(cs) };
};

const cardsOf = (board: Board, no: number) => board.list().filter((d) => d.order_ids.includes(orderId(no)));
const byDripper = (board: Board, dripper: number) =>
  board
    .list()
    .filter((d) => d.dripper === dripper)
    .map((d) => d.status);

/** 1 人のドリッパーが同時に抽出できるのは 1 枚だけ・状態と担当の組み合わせ */
const checkInvariants = (board: Board) => {
  const brewing = board.list().filter((d) => d.status === 'brewing');
  expect(new Set(brewing.map((d) => d.dripper)).size).toBe(brewing.length);
  for (const d of board.drips.values()) {
    if (d.status === 'unassigned') expect(d.dripper).toBeNull();
    if (d.status === 'queued' || d.status === 'brewing') expect(d.dripper).not.toBeNull();
    expect(d.cups).toBe(d.lines.reduce((s, l) => s + l.cups, 0));
    expect(d.cups).toBeGreaterThanOrEqual(1);
    expect(d.cups).toBeLessThanOrEqual(2);
  }
};

/** SQL のテストと同じ状態：注文 #1（優勝 2+2・俺ブレ 1）と #2・#3（優勝 1 杯ずつ） */
const seeded = () => {
  const board = newBoard();
  run(board, (cs) => board.ingestOrders(cs, [order1(), single(2), single(3)], true));
  return board;
};

describe('注文 → カード', () => {
  it('2 杯ずつに分け、アイスミルクとグッズは載せない。セットの中の優勝も数える', () => {
    const board = seeded();
    const one = cardsOf(board, 1);
    expect(one.map((d) => [d.lines[0].abbr, d.cups])).toEqual([
      ['優勝', 2],
      ['優勝', 2],
      ['俺ブレ', 1],
    ]);
    expect(board.list()).toHaveLength(5);
    expect(one.every((d) => d.status === 'unassigned' && d.queue_pos === 1)).toBe(true);
    checkInvariants(board);
  });

  it('指名は前後の空白を落として写す', () => {
    const board = seeded();
    expect(cardsOf(board, 1).find((d) => d.lines[0].abbr === '俺ブレ')?.lines[0].nominee).toBe('２');
  });

  it('準備完了・提供済みで受け取った注文にはカードを作らない', () => {
    const board = newBoard();
    run(board, (cs) =>
      board.ingestOrders(
        cs,
        [
          single(5, ITEMS.champ, 1),
          { ...single(6), ready_at: '2026-11-01T02:00:00Z' },
          { ...single(7), served_at: 'x' },
        ],
        true
      )
    );
    expect(board.list().map((d) => d.order_ids[0])).toEqual([orderId(5)]);
  });

  it('中身が同じ注文をもう一度受け取っても、カードを作り直さず、何も変わらない', () => {
    const board = seeded();
    const ids = board.list().map((d) => d.id);
    const cs = run(board, (cs) => board.ingestOrders(cs, [order1(), single(2), single(3)], true));
    expect(cs.empty).toBe(true);
    expect(board.list().map((d) => d.id)).toEqual(ids);
  });
});

describe('操作', () => {
  it('統合：同じ商品の 1 杯同士を 1 枚 2 杯にし、消えたカードを返す', () => {
    const board = seeded();
    const [a] = cardsOf(board, 2);
    const [b] = cardsOf(board, 3);
    const { result } = op(board, { name: 'merge', first_id: a.id, second_id: b.id });
    const merged = cardsOf(board, 3);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ cups: 2, order_ids: [orderId(2), orderId(3)], queue_pos: 2 });
    expect(result.deleted).toEqual([b.id]);
    checkInvariants(board);
  });

  it('統合できないカード同士は断り、何も変えない', () => {
    const board = seeded();
    const [champ2] = cardsOf(board, 1);
    const ore = cardsOf(board, 1).find((d) => d.lines[0].abbr === '俺ブレ') as Drip;
    const [c2] = cardsOf(board, 2);
    const before = JSON.stringify(board.list());
    expect(() => op(board, { name: 'merge', first_id: champ2.id, second_id: c2.id })).toThrow(BoardError); // 2 杯
    expect(() => op(board, { name: 'merge', first_id: ore.id, second_id: c2.id })).toThrow(BoardError); // 別の商品
    expect(() => op(board, { name: 'merge', first_id: c2.id, second_id: c2.id })).toThrow(BoardError);
    expect(JSON.stringify(board.list())).toBe(before);
  });

  it('割当：空いているドリッパーならすぐ抽出中、2 枚目は待機', () => {
    const board = seeded();
    const [a, b] = cardsOf(board, 1);
    op(board, { name: 'assign', drip_id: a.id, dripper: 1 });
    op(board, { name: 'assign', drip_id: b.id, dripper: 1 });
    expect(byDripper(board, 1)).toEqual(['brewing', 'queued']);
    expect(board.drips.get(a.id)?.started_at).not.toBeNull();
    checkInvariants(board);
  });

  it('割当できないもの（抽出中・知らないカード・ドリッパーの番号違い）は断る', () => {
    const board = seeded();
    const [a, b] = cardsOf(board, 1);
    op(board, { name: 'assign', drip_id: a.id, dripper: 1 });
    expect(() => op(board, { name: 'assign', drip_id: a.id, dripper: 2 })).toThrow('割り当てられません');
    expect(() => op(board, { name: 'assign', drip_id: 'nope', dripper: 2 })).toThrow(BoardError);
    expect(() => op(board, { name: 'assign', drip_id: b.id, dripper: 7 })).toThrow('1〜6');
  });

  it('未割当に戻せるのは待機中だけ', () => {
    const board = seeded();
    const [a, b] = cardsOf(board, 1);
    op(board, { name: 'assign', drip_id: a.id, dripper: 1 });
    op(board, { name: 'assign', drip_id: b.id, dripper: 1 });
    expect(() => op(board, { name: 'unassign', drip_id: a.id })).toThrow(BoardError);
    op(board, { name: 'unassign', drip_id: b.id });
    expect(board.drips.get(b.id)).toMatchObject({ status: 'unassigned', dripper: null });
  });

  it('注文の編集：杯数を増やすと未割当の分だけ作り直し、割当済みはそのまま', () => {
    const board = seeded();
    const [a, b] = cardsOf(board, 1);
    op(board, { name: 'assign', drip_id: a.id, dripper: 1 });
    op(board, { name: 'assign', drip_id: b.id, dripper: 1 });
    run(board, (cs) => board.ingestOrders(cs, [order1(2)], false));
    const unassigned = cardsOf(board, 1).filter((d) => d.status === 'unassigned');
    expect(unassigned.map((d) => [d.lines[0].abbr, d.cups])).toEqual([['俺ブレ', 2]]);
    expect(byDripper(board, 1)).toEqual(['brewing', 'queued']);
    checkInvariants(board);
  });

  it('次へ・準備完了・1つ戻す（SQL のテストと同じ流れ）', () => {
    const board = seeded();
    const [a, b, ore] = cardsOf(board, 1);
    op(board, { name: 'assign', drip_id: a.id, dripper: 1 });
    op(board, { name: 'assign', drip_id: b.id, dripper: 1 });

    // 次へ：1 枚目が終わり 2 枚目が始まる。俺ブレが残るので準備完了にしない
    const next1 = op(board, { name: 'next', dripper: 1 });
    expect(byDripper(board, 1)).toEqual(['done', 'brewing']);
    expect(next1.result.readied).toEqual([]);

    // 俺ブレを 2 へ、次へを 1・2 の順に押すと注文 #1 が準備完了になる
    op(board, { name: 'assign', drip_id: ore.id, dripper: 2 });
    op(board, { name: 'next', dripper: 1 });
    const before = [board.drips.get(ore.id)].map((d) => structuredClone(d as Drip));
    const next2 = op(board, { name: 'next', dripper: 2 });
    expect(next2.result.readied).toEqual([orderId(1)]);
    expect(next2.cs.readied.has(orderId(1))).toBe(true);
    expect(board.orders.get(orderId(1))?.ready).toBe(true);
    checkInvariants(board);

    // 1つ戻す：抽出中に戻り、準備完了を取り消す（POS に送る）
    const undo = op(board, { name: 'restore', before, after: next2.result.changed, readied: next2.result.readied });
    expect(board.drips.get(ore.id)?.status).toBe('brewing');
    expect(board.orders.get(orderId(1))?.ready).toBe(false);
    expect([...undo.cs.unreadied]).toEqual([orderId(1)]);
    checkInvariants(board);

    // ほかの端末が後から動かしていたら断る
    expect(() =>
      op(board, { name: 'restore', before, after: next2.result.changed, readied: next2.result.readied })
    ).toThrow('ほかの端末で変更された');
  });

  it('次へは抽出中でないドリッパーでは断る', () => {
    const board = seeded();
    expect(() => op(board, { name: 'next', dripper: 4 })).toThrow('抽出中ではありません');
  });

  it('入れ直し：終わった統合カードを 1 杯で入れ直すとすぐ始まり、1つ戻すと消える', () => {
    const board = seeded();
    const [c2] = cardsOf(board, 2);
    const [c3] = cardsOf(board, 3);
    op(board, { name: 'merge', first_id: c2.id, second_id: c3.id });
    op(board, { name: 'assign', drip_id: c2.id, dripper: 3 });
    op(board, { name: 'next', dripper: 3 });
    const before = [structuredClone(board.drips.get(c2.id) as Drip)];
    const rebrew = op(board, {
      name: 'rebrew',
      source_id: c2.id,
      cups: 1,
      interrupt: false,
      dripper: 4,
      queue_pos: null,
    });
    const made = board.list().find((d) => d.rebrew_of === c2.id) as Drip;
    expect(made).toMatchObject({ status: 'brewing', dripper: 4, cups: 1, order_ids: [orderId(2)] });
    expect(made.lines).toHaveLength(1);
    checkInvariants(board);

    op(board, { name: 'restore', before, after: rebrew.result.changed, readied: [] });
    expect(board.list().some((d) => d.rebrew_of !== null)).toBe(false);
  });

  it('入れ直し：抽出中のカードを途中でやめて、同じドリッパーで入れ直す', () => {
    const board = seeded();
    const [a] = cardsOf(board, 1);
    op(board, { name: 'assign', drip_id: a.id, dripper: 1 });
    op(board, { name: 'rebrew', source_id: a.id, cups: 2, interrupt: true, dripper: 1, queue_pos: null });
    expect(board.drips.get(a.id)).toMatchObject({ status: 'done', interrupted: true });
    expect(board.list().find((d) => d.rebrew_of === a.id)).toMatchObject({ status: 'brewing', dripper: 1, cups: 2 });
    checkInvariants(board);
  });

  it('入れ直しのカードが終わるまで、注文は準備完了にしない', () => {
    const board = newBoard();
    run(board, (cs) => board.ingestOrders(cs, [single(8)], true));
    const [a] = cardsOf(board, 8);
    op(board, { name: 'assign', drip_id: a.id, dripper: 1 });
    op(board, { name: 'rebrew', source_id: a.id, cups: 1, interrupt: true, dripper: 2, queue_pos: null });
    expect(board.orders.get(orderId(8))?.ready).toBe(false);
    expect(op(board, { name: 'next', dripper: 2 }).result.readied).toEqual([orderId(8)]);
  });
});

describe('POS からの変更', () => {
  it('POS で準備完了：統合カードを抽出終了にし、相手の注文も準備完了にする', () => {
    const board = seeded();
    const [c2] = cardsOf(board, 2);
    const [c3] = cardsOf(board, 3);
    op(board, { name: 'merge', first_id: c2.id, second_id: c3.id });
    op(board, { name: 'assign', drip_id: c2.id, dripper: 3 });
    const cs = run(board, (cs) =>
      board.ingestOrders(cs, [{ ...single(2), ready_at: '2026-11-01T02:00:00Z' }, single(3)], false)
    );
    expect(board.drips.get(c2.id)?.status).toBe('done');
    expect([...cs.readied]).toEqual([orderId(3)]);
    expect(board.orders.get(orderId(3))?.ready).toBe(true);
    checkInvariants(board);
  });

  it('POS で準備完了にすると、抽出中だったドリッパーは次のカードを始める', () => {
    const board = seeded();
    const [a, b] = cardsOf(board, 1);
    const [c2] = cardsOf(board, 2);
    op(board, { name: 'assign', drip_id: c2.id, dripper: 1 });
    op(board, { name: 'assign', drip_id: a.id, dripper: 1 });
    run(board, (cs) => board.ingestOrders(cs, [{ ...single(2), ready_at: '2026-11-01T02:00:00Z' }], false));
    expect(board.drips.get(a.id)?.status).toBe('brewing');
    expect(board.drips.get(b.id)?.status).toBe('unassigned');
  });

  it('注文の削除：全部の一覧に載っていない注文のカードを片付ける（終わったカードは残す）', () => {
    const board = newBoard();
    run(board, (cs) => board.ingestOrders(cs, [single(4, ITEMS.ice), single(9), single(10)], true));
    expect(cardsOf(board, 4)).toHaveLength(1);
    const [done] = cardsOf(board, 10);
    op(board, { name: 'assign', drip_id: done.id, dripper: 1 });
    op(board, { name: 'next', dripper: 1 });
    // 一部だけの一覧（full でない）では消さない
    run(board, (cs) => board.ingestOrders(cs, [single(9)], false));
    expect(cardsOf(board, 4)).toHaveLength(1);
    run(board, (cs) => board.ingestOrders(cs, [single(9)], true));
    expect(cardsOf(board, 4)).toHaveLength(0);
    expect(cardsOf(board, 10)).toHaveLength(1);
    expect(board.orders.has(orderId(4))).toBe(false);
  });

  it('統合カードの片方の注文が消えたら、その分だけ外して残す', () => {
    const board = seeded();
    const [c2] = cardsOf(board, 2);
    const [c3] = cardsOf(board, 3);
    op(board, { name: 'merge', first_id: c2.id, second_id: c3.id });
    op(board, { name: 'assign', drip_id: c2.id, dripper: 5 });
    run(board, (cs) => board.ingestOrders(cs, [order1(), single(2)], true));
    expect(board.drips.get(c2.id)).toMatchObject({ order_ids: [orderId(2)], cups: 1, status: 'brewing' });
    checkInvariants(board);
  });

  it('POS に送り待ちの注文は、POS の準備完了の状態を見ない（送る前の古い一覧で巻き戻さない）', () => {
    const board = seeded();
    const [a, b, ore] = cardsOf(board, 1);
    for (const [d, n] of [
      [a, 1],
      [b, 2],
      [ore, 3],
    ] as const)
      op(board, { name: 'assign', drip_id: d.id, dripper: n });
    for (const n of [1, 2]) op(board, { name: 'next', dripper: n });
    const before = [structuredClone(board.drips.get(ore.id) as Drip)];
    const last = op(board, { name: 'next', dripper: 3 });
    op(board, { name: 'restore', before, after: last.result.changed, readied: last.result.readied });
    // 取り消しを POS に送る前に、まだ準備完了の古い一覧が届いた
    const stale = { ...order1(), ready_at: '2026-11-01T02:00:00Z' };
    run(board, (cs) => board.ingestOrders(cs, [stale, single(2), single(3)], true, new Set([orderId(1)])));
    expect(board.drips.get(ore.id)?.status).toBe('brewing');
    expect(board.orders.get(orderId(1))?.ready).toBe(false);
  });

  it('グッズだけの注文・数量 0 の明細はカードにしない', () => {
    const board = newBoard();
    run(board, (cs) =>
      board.ingestOrders(
        cs,
        [order(11, [{ items: [[ITEMS.tote, 1]] }]), order(12, [{ items: [[ITEMS.champ, 0]] }])],
        true
      )
    );
    expect(board.list()).toHaveLength(0);
  });
});

describe('いろいろな操作を続けても壊れない', () => {
  it('ランダムな操作の列で、1 人 1 枚の抽出中・状態と担当の組み合わせ・杯数が保たれる', () => {
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    const board = newBoard();
    const orders = Array.from({ length: 12 }, (_, i) =>
      order(i + 1, [{ items: [[[ITEMS.champ, ITEMS.ore, ITEMS.ice][i % 3], 1 + (i % 4)]] }])
    );
    run(board, (cs) => board.ingestOrders(cs, orders, true));
    for (let step = 0; step < 400; step++) {
      const drips = board.list();
      const pick = drips[rand(Math.max(1, drips.length))];
      const ops: Op[] = [
        { name: 'assign', drip_id: pick?.id ?? 'x', dripper: 1 + rand(6) },
        { name: 'unassign', drip_id: pick?.id ?? 'x' },
        { name: 'next', dripper: 1 + rand(6) },
        { name: 'merge', first_id: pick?.id ?? 'x', second_id: drips[rand(Math.max(1, drips.length))]?.id ?? 'y' },
        {
          name: 'rebrew',
          source_id: pick?.id ?? 'x',
          cups: 1 + rand(2),
          interrupt: rand(2) === 0,
          dripper: rand(3) === 0 ? null : 1 + rand(6),
          queue_pos: null,
        },
      ];
      try {
        op(board, ops[rand(ops.length)]);
      } catch (e) {
        expect(e).toBeInstanceOf(BoardError);
      }
      checkInvariants(board);
    }
  });
});
