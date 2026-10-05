// 盤面のルール。Durable Object の保存・通信には触らず、メモリ上のカードと注文だけを変える（テストはここに厚く書く）。
// supabase/migrations の caos.* の関数（CaOS#15）を移したもの。POS の DB のトリガーの役目は ingestOrders が受け持つ。
//
// 1 つの盤面（営業日）への操作は Durable Object が 1 件ずつ順番に呼ぶので、ここではロックを考えない。
// 操作は「確かめてから変える」順に書く。途中で例外が出たときは、呼んだ側が保存してある状態から読み直す。

import type { Drip, DripLine, Op, OpResult, PosOrder } from './types';

/** 盤面が覚えている注文の状態（POS から受け取ったものと、盤面が準備完了にしたもの） */
export interface OrderState {
  id: string;
  order_no: number;
  created_at: string;
  ready: boolean;
  served: boolean;
}

/** 操作で起きた変更。保存と配信、POS への送り待ちに使う */
export class Changeset {
  readonly changed = new Set<string>();
  readonly deleted = new Set<string>();
  /** 盤面が準備完了にした注文（POS に送る） */
  readonly readied = new Set<string>();
  /** 盤面が準備完了を取り消した注文（POS に送る） */
  readonly unreadied = new Set<string>();
  /** 覚え直した注文（保存する） */
  readonly orders = new Set<string>();

  touch(id: string) {
    this.changed.add(id);
    this.deleted.delete(id);
  }

  remove(id: string) {
    this.changed.delete(id);
    this.deleted.add(id);
  }

  get empty() {
    return this.changed.size === 0 && this.deleted.size === 0;
  }
}

export class BoardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BoardError';
  }
}

const invalid = (message: string): never => {
  throw new BoardError(message);
};

const isDripper = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 6;

/** 何回呼んでも時刻が戻らず、1 ミリ秒ずつは必ず進む時計（Workers の Date.now() は I/O の間しか進まないため） */
export const monotonicClock = (now: () => number = Date.now) => {
  let last = 0;
  return () => {
    last = Math.max(now(), last + 1);
    return new Date(last).toISOString();
  };
};

/** 待機列・未割当の並び順 */
export const compareQueue = (a: Drip, b: Drip) =>
  a.queue_pos - b.queue_pos || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);

const sameOrders = (drip: Drip, orderId: string) => drip.order_ids.length === 1 && drip.order_ids[0] === orderId;

/** 注文の明細から、抽出するもの（商品と指名ごとの杯数）。アイスミルク（milk）とグッズ（others）は抽出しない */
export const wantedItems = (order: PosOrder) => {
  const groups = new Map<string, Omit<DripLine, 'cups' | 'order_id' | 'order_no'> & { cups: number }>();
  for (const line of order.menus) {
    const nominee = line.assignee?.trim() || null;
    for (const { item, quantity } of line.menu.items) {
      const type = item.item_type.name;
      if (type === 'others' || type === 'milk' || quantity <= 0) continue;
      const key = `${item.id}\u0000${nominee ?? ''}`;
      const current = groups.get(key);
      if (current) current.cups += quantity;
      else groups.set(key, { item_id: item.id, name: item.name, abbr: item.abbr, type, nominee, cups: quantity });
    }
  }
  return [...groups.values()].sort(
    (a, b) =>
      (a.type < b.type ? -1 : a.type > b.type ? 1 : 0) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
      (a.nominee === b.nominee ? 0 : a.nominee === null ? -1 : b.nominee === null ? 1 : a.nominee < b.nominee ? -1 : 1)
  );
};

const lineKey = (line: DripLine) => JSON.stringify([line.item_id, line.nominee, line.cups]);
const canonicalLines = (lines: DripLine[]) =>
  JSON.stringify(
    [...lines]
      .sort((a, b) => lineKey(a).localeCompare(lineKey(b)))
      .map((l) => [l.order_id, l.order_no, l.item_id, l.name, l.abbr, l.type, l.nominee, l.cups])
  );

export interface BoardOptions {
  clock?: () => string;
  newId?: () => string;
}

export class Board {
  readonly drips: Map<string, Drip>;
  readonly orders: Map<string, OrderState>;
  private readonly clock: () => string;
  private readonly newId: () => string;

  constructor(drips: Iterable<Drip> = [], orders: Iterable<OrderState> = [], options: BoardOptions = {}) {
    this.drips = new Map([...drips].map((d) => [d.id, d]));
    this.orders = new Map([...orders].map((o) => [o.id, o]));
    this.clock = options.clock ?? monotonicClock();
    this.newId = options.newId ?? (() => crypto.randomUUID());
  }

  list(): Drip[] {
    return [...this.drips.values()].sort(
      (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
    );
  }

  /** 操作の結果（呼んだ画面に返す形） */
  result(cs: Changeset): OpResult {
    return {
      changed: [...cs.changed].flatMap((id) => this.drips.get(id) ?? []),
      deleted: [...cs.deleted],
      readied: [...cs.readied],
    };
  }

  private update(cs: Changeset, drip: Drip, patch: Partial<Drip>) {
    Object.assign(drip, patch, { updated_at: this.clock() });
    cs.touch(drip.id);
  }

  private insert(cs: Changeset, drip: Omit<Drip, 'id' | 'created_at' | 'updated_at'>) {
    const at = this.clock();
    const row: Drip = { ...drip, id: this.newId(), created_at: at, updated_at: at };
    this.drips.set(row.id, row);
    cs.touch(row.id);
    return row;
  }

  private delete(cs: Changeset, id: string) {
    this.drips.delete(id);
    cs.remove(id);
  }

  // ---------------------------------------------------------------- 内部

  /** ドリッパーが空いていれば、待機列の先頭の抽出を始める */
  private promote(cs: Changeset, dripper: number | null) {
    if (dripper === null) return;
    const mine = [...this.drips.values()].filter((d) => d.dripper === dripper);
    if (mine.some((d) => d.status === 'brewing')) return;
    const next = mine.filter((d) => d.status === 'queued').sort(compareQueue)[0];
    if (next) this.update(cs, next, { status: 'brewing', started_at: this.clock() });
  }

  /** カードが全部抽出終了になった注文を準備完了にする（入れ直しのカードも終わるまで待つ。既に準備完了ならそのまま） */
  private completeOrders(cs: Changeset, orderIds: Iterable<string>) {
    for (const id of new Set(orderIds)) {
      const order = this.orders.get(id);
      if (!order || order.ready) continue;
      const mine = [...this.drips.values()].filter((d) => d.order_ids.includes(id));
      if (mine.length === 0 || mine.some((d) => d.status !== 'done')) continue;
      order.ready = true;
      cs.orders.add(id);
      cs.unreadied.delete(id);
      cs.readied.add(id);
    }
  }

  /**
   * 注文の明細から、あるべき抽出カード（最大 2 杯ずつ）を作り直す。
   * 作り直すのは「未割当で、その注文だけのカード」だけ。割当済み・抽出中・終了・統合・入れ直しのカードには触らず、
   * その分の杯数を差し引いて足りない分だけ作る。中身が変わらないときは何もしない（カードの id が変わると、画面で選んでいたカードが外れる）。
   */
  private syncOrder(cs: Changeset, order: PosOrder) {
    const wanted: DripLine[] = [];
    for (const item of wantedItems(order)) {
      let locked = 0;
      for (const d of this.drips.values()) {
        if (!d.order_ids.includes(order.id) || d.rebrew_of !== null) continue;
        if (d.status === 'unassigned' && sameOrders(d, order.id)) continue;
        for (const l of d.lines)
          if (l.order_id === order.id && l.item_id === item.item_id && l.nominee === item.nominee) locked += l.cups;
      }
      for (let remaining = item.cups - locked; remaining > 0; remaining -= 2)
        wanted.push({ ...item, order_id: order.id, order_no: order.order_id, cups: Math.min(2, remaining) });
    }

    const current = [...this.drips.values()].filter(
      (d) => sameOrders(d, order.id) && d.status === 'unassigned' && d.rebrew_of === null
    );
    if (canonicalLines(current.map((d) => d.lines[0])) === canonicalLines(wanted)) return;

    for (const d of current) this.delete(cs, d.id);
    for (const line of wanted)
      this.insert(cs, {
        status: 'unassigned',
        dripper: null,
        queue_pos: order.order_id,
        order_ids: [order.id],
        lines: [line],
        cups: line.cups,
        rebrew_of: null,
        interrupted: false,
        started_at: null,
        finished_at: null,
      });
  }

  /** 注文が POS から消えた。終わっていないカードからその注文を外す */
  private removeOrder(cs: Changeset, orderId: string) {
    for (const d of [...this.drips.values()]) {
      if (!d.order_ids.includes(orderId) || d.status === 'done') continue;
      if (sameOrders(d, orderId)) {
        this.delete(cs, d.id);
        continue;
      }
      const lines = d.lines.filter((l) => l.order_id !== orderId);
      this.update(cs, d, {
        lines,
        order_ids: d.order_ids.filter((id) => id !== orderId),
        cups: lines.reduce((sum, l) => sum + l.cups, 0),
      });
    }
    if (this.orders.delete(orderId)) cs.orders.add(orderId);
  }

  /**
   * 注文が POS で準備完了・提供済みになった。その注文のカードを抽出終了にし、抽出中だったドリッパーは次を始める。
   * 統合していた相手の注文も、それでカードが全部終わったなら準備完了にする
   */
  private finishOrder(cs: Changeset, orderId: string) {
    const drippers = new Set<number>();
    const others = new Set<string>();
    for (const d of this.drips.values()) {
      if (!d.order_ids.includes(orderId) || d.status === 'done' || d.rebrew_of !== null) continue;
      if (d.dripper !== null) drippers.add(d.dripper);
      for (const id of d.order_ids) if (id !== orderId) others.add(id);
      this.update(cs, d, { status: 'done', finished_at: this.clock() });
    }
    for (const dripper of drippers) this.promote(cs, dripper);
    this.completeOrders(cs, others);
  }

  // ---------------------------------------------------------------- POS の注文を取り込む

  /**
   * POS から受け取った注文を盤面に反映する（今まで POS の DB のトリガーがしていたこと）。何度同じものを受け取っても結果は同じ。
   * @param full その日の注文を全部送ってきた（載っていない注文は POS で消えたとみなす）
   * @param pending POS に送り待ちの注文（盤面の準備完了・取り消しがまだ届いていないので、POS の準備完了の状態は見ない）
   */
  ingestOrders(cs: Changeset, orders: PosOrder[], full: boolean, pending: ReadonlySet<string> = new Set()) {
    // この取り込みの中で盤面が準備完了にした注文（統合相手）も、まだ POS に届いていないので同じ扱い
    const isPending = (id: string) => pending.has(id) || cs.readied.has(id) || cs.unreadied.has(id);
    const seen = new Set<string>();
    for (const order of orders) {
      seen.add(order.id);
      const prev = this.orders.get(order.id);
      const posDone = order.ready_at !== null || order.served_at !== null;
      const next: OrderState = {
        id: order.id,
        order_no: order.order_id,
        created_at: order.created_at,
        ready: isPending(order.id) && prev ? prev.ready : order.ready_at !== null,
        served: order.served_at !== null,
      };
      if (
        !prev ||
        prev.order_no !== next.order_no ||
        prev.created_at !== next.created_at ||
        prev.ready !== next.ready ||
        prev.served !== next.served
      ) {
        this.orders.set(order.id, next);
        cs.orders.add(order.id);
      }
      if (isPending(order.id)) continue;
      if (posDone) this.finishOrder(cs, order.id);
      else this.syncOrder(cs, order);
    }
    if (!full) return;
    const known = new Set([...this.orders.keys(), ...[...this.drips.values()].flatMap((d) => d.order_ids)]);
    for (const id of known) if (!seen.has(id) && !isPending(id)) this.removeOrder(cs, id);
  }

  // ---------------------------------------------------------------- 画面からの操作

  apply(cs: Changeset, op: Op): void {
    switch (op.name) {
      case 'assign':
        this.assign(cs, op.drip_id, op.dripper);
        break;
      case 'unassign':
        this.unassign(cs, op.drip_id);
        break;
      case 'next':
        this.next(cs, op.dripper);
        break;
      case 'merge':
        this.merge(cs, op.first_id, op.second_id);
        break;
      case 'rebrew':
        this.rebrew(cs, op.source_id, op.cups, op.interrupt, op.dripper, op.queue_pos);
        break;
      case 'restore':
        this.restore(cs, op.before, op.after, op.readied);
        break;
      default:
        invalid('知らない操作です');
    }
  }

  /** 未割当・待機中のカードをドリッパーへ割り当てる（別のドリッパーへの移動も同じ）。ドリッパーが空いていれば、そのまま抽出を始める */
  assign(cs: Changeset, dripId: string, dripper: number) {
    if (!isDripper(dripper)) invalid('ドリッパーは 1〜6 です');
    const drip = this.drips.get(dripId);
    if (!drip || (drip.status !== 'unassigned' && drip.status !== 'queued')) invalid('このカードは割り当てられません');
    this.update(cs, drip as Drip, { status: 'queued', dripper });
    this.promote(cs, dripper);
  }

  /** 待機中のカードを未割当に戻す */
  unassign(cs: Changeset, dripId: string) {
    const drip = this.drips.get(dripId);
    if (drip?.status !== 'queued') invalid('このカードは未割当に戻せません');
    this.update(cs, drip as Drip, { status: 'unassigned', dripper: null });
  }

  /** 「次へ」。抽出中のカードを終わらせ、待機列の次を始める。注文のカードが全部終わったら、その注文を準備完了にする */
  next(cs: Changeset, dripper: number) {
    const brewing = [...this.drips.values()].find((d) => d.dripper === dripper && d.status === 'brewing');
    if (!brewing) invalid(`ドリッパー ${dripper} は抽出中ではありません`);
    const done = brewing as Drip;
    this.update(cs, done, { status: 'done', finished_at: this.clock() });
    this.promote(cs, dripper);
    this.completeOrders(cs, done.order_ids);
  }

  /** 同じ商品・同じ指名の 1 杯の未割当カード同士を、2 杯の同時抽出にまとめる */
  merge(cs: Changeset, firstId: string, secondId: string) {
    const first = this.drips.get(firstId);
    const second = this.drips.get(secondId);
    if (
      !first ||
      !second ||
      first.id === second.id ||
      first.status !== 'unassigned' ||
      second.status !== 'unassigned' ||
      first.cups !== 1 ||
      second.cups !== 1 ||
      first.rebrew_of !== null ||
      second.rebrew_of !== null ||
      first.lines[0]?.item_id !== second.lines[0]?.item_id ||
      first.lines[0]?.nominee !== second.lines[0]?.nominee
    )
      invalid('このカード同士は統合できません');
    const a = first as Drip;
    const b = second as Drip;
    this.update(cs, a, {
      lines: [...a.lines, ...b.lines],
      order_ids: [...new Set([...a.order_ids, ...b.order_ids])],
      cups: 2,
      queue_pos: Math.min(a.queue_pos, b.queue_pos),
    });
    this.delete(cs, b.id);
  }

  /**
   * 入れ直し。元のカード（抽出中・終了）と同じ中身で、杯数を選んだ新しいカードを作る。
   * @param interrupt 抽出中の元のカードを途中でやめる
   * @param dripper 担当。null なら未割当に置く
   * @param queuePos 待機列での位置（画面が前後のカードの間の値を渡す）。null なら元のカードの位置
   */
  rebrew(
    cs: Changeset,
    sourceId: string,
    cups: number,
    interrupt: boolean,
    dripper: number | null,
    queuePos: number | null
  ) {
    if (cups !== 1 && cups !== 2) invalid('杯数は 1〜2 杯です');
    if (dripper !== null && !isDripper(dripper)) invalid('ドリッパーは 1〜6 です');
    const source = this.drips.get(sourceId);
    if (!source || (source.status !== 'brewing' && source.status !== 'done')) invalid('このカードは入れ直せません');
    const src = source as Drip;

    if (interrupt && src.status === 'brewing')
      this.update(cs, src, { status: 'done', interrupted: true, finished_at: this.clock() });

    // 杯数が元より少なければ、先頭の明細から必要な杯数だけ取る
    const lines: DripLine[] = [];
    let taken = 0;
    for (const line of src.lines) {
      if (taken >= cups) break;
      const n = Math.min(line.cups, cups - taken);
      lines.push({ ...line, cups: n });
      taken += n;
    }
    this.insert(cs, {
      status: dripper === null ? 'unassigned' : 'queued',
      dripper,
      queue_pos: queuePos ?? src.queue_pos,
      order_ids: [...new Set(lines.map((l) => l.order_id))],
      lines,
      cups,
      rebrew_of: src.id,
      interrupted: false,
      started_at: null,
      finished_at: null,
    });
    this.promote(cs, src.dripper);
    this.promote(cs, dripper);
  }

  /**
   * 「1つ戻す」。直前の操作の結果と、その前の行を渡すと元に戻す。
   * @param before 操作の前の行（結果の changed と deleted のうち、操作の前からあったもの）
   * @param after 操作が返した changed。この時点から誰も触っていないときだけ戻す
   * @param readied 操作が準備完了にした注文。まだ提供していなければ準備完了を取り消す
   */
  restore(cs: Changeset, before: Drip[], after: Drip[], readied: string[]) {
    for (const a of after) {
      const now = this.drips.get(a.id);
      if (!now || now.updated_at !== a.updated_at) invalid('ほかの端末で変更されたため、元に戻せません');
    }
    const beforeIds = new Set(before.map((d) => d.id));
    // 操作でできたカードは消す（入れ直し）
    for (const a of after) if (!beforeIds.has(a.id)) this.delete(cs, a.id);
    for (const b of before) {
      const row: Drip = { ...b, lines: b.lines.map((l) => ({ ...l })), order_ids: [...b.order_ids] };
      this.drips.set(row.id, row);
      this.update(cs, row, {});
    }
    for (const id of readied) {
      const order = this.orders.get(id);
      if (!order || order.served || !order.ready) continue;
      order.ready = false;
      cs.orders.add(id);
      cs.readied.delete(id);
      cs.unreadied.add(id);
    }
  }
}
