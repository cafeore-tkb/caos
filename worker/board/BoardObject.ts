// 盤面の Durable Object（営業日ごとに 1 つ）。カードと注文を SQLite に置き、つないでいる画面みんなに変わったカードを配る。
// ルールは logic.ts。ここは保存・WebSocket・POS への送り待ちだけを受け持つ。
//
// Durable Object は 1 つの盤面への処理を 1 件ずつ順番に動かすので、同時に操作しても消えない。
// WebSocket は Hibernation API で持つ（つないだまま眠れるので、操作がない間は料金がかからない）。

import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import { Board, BoardError, Changeset, type OrderState } from './logic';
import { type Desired, type PosResult, setReady } from './pos';
import type { ClientMessage, Drip, ServerMessage } from './types';

/** 日本時間の日付（YYYY-MM-DD） */
export const jstDay = (at: string | number | Date) =>
  new Date(new Date(at).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

const RETRY_MAX_MS = 60_000;

const parse = (raw: string | ArrayBuffer): ClientMessage | null => {
  try {
    const msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    return msg && typeof msg === 'object' && typeof msg.t === 'string' ? (msg as ClientMessage) : null;
  } catch {
    return null;
  }
};

export class BoardObject extends DurableObject<Env> {
  private board = new Board();
  private version = 0;
  private day = '';

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => this.load());
  }

  private get sql() {
    return this.ctx.storage.sql;
  }

  /** 保存してある状態を読む（起動したとき・処理の途中で思わぬ失敗をしたとき） */
  private load() {
    this.sql.exec('create table if not exists drips (id text primary key, data text not null)');
    this.sql.exec('create table if not exists orders (id text primary key, data text not null)');
    this.sql.exec('create table if not exists meta (key text primary key, value text not null)');
    // POS に送り待ちの準備完了・取り消し。seq は書き直すたびに増やす（送っている間に書き直されたら消さない）
    this.sql.exec(
      'create table if not exists pos_outbox (order_id text primary key, desired text not null, attempts integer not null, next_at integer not null, seq integer not null)'
    );
    const drips = this.sql
      .exec<{ data: string }>('select data from drips')
      .toArray()
      .map((r) => JSON.parse(r.data) as Drip);
    const orders = this.sql
      .exec<{ data: string }>('select data from orders')
      .toArray()
      .map((r) => JSON.parse(r.data) as OrderState);
    const meta = new Map(
      this.sql
        .exec<{ key: string; value: string }>('select key, value from meta')
        .toArray()
        .map((r) => [r.key, r.value])
    );
    this.board = new Board(drips, orders);
    this.version = Number(meta.get('version') ?? 0);
    this.day = meta.get('day') ?? '';
  }

  async fetch(request: Request): Promise<Response> {
    const day = request.headers.get('X-Board-Day');
    if (day && !this.day) {
      this.day = day;
      this.sql.exec("insert or replace into meta (key, value) values ('day', ?)", day);
    }
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
      return new Response('WebSocket でつないでください', { status: 426 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    this.send(server, this.snapshot());
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const msg = parse(raw);
    if (!msg) return;
    if (msg.t === 'sync') {
      this.send(ws, this.snapshot());
    } else if (msg.t === 'orders') {
      if (!Array.isArray(msg.orders)) return;
      // その営業日に受けた注文だけを盤面に載せる（POS は前の日の注文も送ってくる）
      const orders = msg.orders.filter((o) => o && typeof o.id === 'string' && jstDay(o.created_at) === this.day);
      const full = msg.full === true;
      const pending = this.pending();
      await this.run((cs) => this.board.ingestOrders(cs, orders, full, pending));
    } else if (msg.t === 'op') {
      const { op } = msg;
      try {
        const cs = await this.run((cs) => this.board.apply(cs, op));
        this.send(ws, { t: 'reply', rid: msg.rid, ok: true, result: this.board.result(cs) });
      } catch (e) {
        const invalid = e instanceof BoardError;
        if (!invalid) console.error('caos board op failed', e);
        this.send(ws, {
          t: 'reply',
          rid: msg.rid,
          ok: false,
          error: { code: invalid ? 'invalid' : 'error', message: invalid ? e.message : '盤面の処理に失敗しました' },
        });
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 ? 1000 : code);
    } catch {
      // すでに閉じている
    }
  }

  /** ルールを動かし、変わったものを保存して配る */
  private async run(fn: (cs: Changeset) => void): Promise<Changeset> {
    const cs = new Changeset();
    try {
      fn(cs);
    } catch (e) {
      // ルールは確かめてから変えるので、BoardError のときは何も変わっていない。それ以外は保存してある状態に戻す
      if (!(e instanceof BoardError)) this.load();
      throw e;
    }
    this.persist(cs);
    if (cs.readied.size > 0 || cs.unreadied.size > 0) await this.ctx.storage.setAlarm(Date.now());
    if (!cs.empty) {
      const msg: ServerMessage = {
        t: 'drips',
        v: this.version,
        drips: [...cs.changed].flatMap((id) => this.board.drips.get(id) ?? []),
        deleted: [...cs.deleted],
      };
      for (const socket of this.ctx.getWebSockets()) this.send(socket, msg);
    }
    return cs;
  }

  private persist(cs: Changeset) {
    this.ctx.storage.transactionSync(() => {
      for (const id of cs.changed) {
        const drip = this.board.drips.get(id);
        if (drip) this.sql.exec('insert or replace into drips (id, data) values (?, ?)', id, JSON.stringify(drip));
      }
      for (const id of cs.deleted) this.sql.exec('delete from drips where id = ?', id);
      for (const id of cs.orders) {
        const order = this.board.orders.get(id);
        if (order) this.sql.exec('insert or replace into orders (id, data) values (?, ?)', id, JSON.stringify(order));
        else this.sql.exec('delete from orders where id = ?', id);
      }
      if (!cs.empty) {
        this.version += 1;
        this.sql.exec("insert or replace into meta (key, value) values ('version', ?)", String(this.version));
      }
      const now = Date.now();
      const enqueue = (id: string, desired: Desired) =>
        this.sql.exec(
          `insert into pos_outbox (order_id, desired, attempts, next_at, seq) values (?, ?, 0, ?, 1)
           on conflict (order_id) do update set desired = excluded.desired, attempts = 0, next_at = excluded.next_at, seq = pos_outbox.seq + 1`,
          id,
          desired,
          now
        );
      for (const id of cs.readied) enqueue(id, 'ready');
      for (const id of cs.unreadied) enqueue(id, 'unready');
    });
  }

  /** POS に送り待ちの注文 */
  private pending() {
    return new Set(
      this.sql
        .exec<{ order_id: string }>('select order_id from pos_outbox')
        .toArray()
        .map((r) => r.order_id)
    );
  }

  /** 送り待ちの準備完了・取り消しを POS に送る。失敗したら間を空けて送り直す */
  async alarm() {
    const now = Date.now();
    const due = this.sql
      .exec<{ order_id: string; desired: Desired; attempts: number; seq: number }>(
        'select order_id, desired, attempts, seq from pos_outbox where next_at <= ? order by next_at',
        now
      )
      .toArray();
    for (const row of due) {
      let result: PosResult;
      try {
        result = await setReady(this.env.POS_API_BASE_URL, row.order_id, row.desired);
      } catch (e) {
        console.error('caos board: POS への送信に失敗しました', e);
        result = 'retry';
      }
      if (result === 'retry') {
        const attempts = row.attempts + 1;
        this.sql.exec(
          'update pos_outbox set attempts = ?, next_at = ? where order_id = ? and seq = ?',
          attempts,
          Date.now() + Math.min(RETRY_MAX_MS, 1000 * 2 ** attempts),
          row.order_id,
          row.seq
        );
      } else {
        this.sql.exec('delete from pos_outbox where order_id = ? and seq = ?', row.order_id, row.seq);
      }
    }
    const next = this.sql.exec<{ at: number | null }>('select min(next_at) as at from pos_outbox').one().at;
    if (next !== null) await this.ctx.storage.setAlarm(Math.max(next, Date.now()));
  }

  private snapshot(): ServerMessage {
    return { t: 'snapshot', v: this.version, day: this.day, drips: this.board.list() };
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // 閉じかけの接続には送れない。次につないだときに snapshot で追いつく
    }
  }
}
