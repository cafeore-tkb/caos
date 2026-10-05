// 盤面の Durable Object を、画面と同じく WebSocket でつないで確かめる（Workers のランタイムの中で動く）。
import { env, runDurableObjectAlarm, runInDurableObject, SELF } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientMessage, PosOrder, ServerMessage } from '../board/types';
import type { Env } from '../env';
import * as f from './fixtures';
import { ITEMS, orderId } from './fixtures';

type Reply = Extract<ServerMessage, { t: 'reply' }>;

// Durable Object の保存はテストの間で共有されるので、テストごとに別の営業日（別の盤面）を使う
let n = 0;
let DAY = '';
beforeEach(() => {
  n += 1;
  DAY = `2026-12-${String(n).padStart(2, '0')}`;
});
const onDay = (o: PosOrder): PosOrder => ({ ...o, created_at: `${DAY}T01:00:00.000Z` });
const single = (...args: Parameters<typeof f.single>) => onDay(f.single(...args));
const order1 = (...args: Parameters<typeof f.order1>) => onDay(f.order1(...args));
const order = (...args: Parameters<typeof f.order>) => onDay(f.order(...args));

/** 盤面につなぐ。届いたメッセージを順にためておき、待ち合わせられるようにする */
async function connect(day = DAY, headers: Record<string, string> = {}) {
  const res = await SELF.fetch(`https://caos.example/api/board?day=${day}`, {
    headers: { Upgrade: 'websocket', ...headers },
  });
  expect(res.status).toBe(101);
  const ws = res.webSocket as WebSocket;
  ws.accept();
  const inbox: ServerMessage[] = [];
  const waiters: (() => void)[] = [];
  ws.addEventListener('message', (e) => {
    inbox.push(JSON.parse(e.data as string));
    for (const w of waiters.splice(0)) w();
  });
  const next = async <T extends ServerMessage['t']>(t: T): Promise<Extract<ServerMessage, { t: T }>> => {
    for (;;) {
      const i = inbox.findIndex((m) => m.t === t);
      if (i >= 0) return inbox.splice(i, 1)[0] as Extract<ServerMessage, { t: T }>;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${t} が届きません`)), 2000);
        waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  };
  const send = (msg: ClientMessage) => ws.send(JSON.stringify(msg));
  let rid = 0;
  const op = async (o: Extract<ClientMessage, { t: 'op' }>['op']): Promise<Reply> => {
    const id = `r${++rid}`;
    send({ t: 'op', rid: id, op: o });
    for (;;) {
      const r = await next('reply');
      if (r.rid === id) return r;
    }
  };
  return { ws, inbox, next, send, op };
}

const bindings = env as unknown as Env;
const boardStub = (day = DAY) => bindings.BOARD.get(bindings.BOARD.idFromName(`board-${day}`));

/** POS に送り待ちの準備完了・取り消し */
const outbox = () =>
  runInDurableObject(boardStub(), (_, state) =>
    state.storage.sql.exec('select order_id, desired, attempts from pos_outbox order by order_id').toArray()
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe('盤面の WebSocket', () => {
  it('つなぐと今のカードが届き、注文を送るとつないでいる全員に変わったカードが届く', async () => {
    const a = await connect();
    const b = await connect();
    expect(await a.next('snapshot')).toMatchObject({ t: 'snapshot', v: 0, day: DAY, drips: [] });
    await b.next('snapshot');

    a.send({ t: 'orders', orders: [order1(), single(2)], full: true });
    const fromA = await a.next('drips');
    const fromB = await b.next('drips');
    expect(fromA.v).toBe(1);
    expect(fromB).toEqual(fromA);
    expect(fromA.drips).toHaveLength(4);

    // 同じ注文をもう一度送っても、何も届かない（版も進めない）
    b.send({ t: 'orders', orders: [order1(), single(2)], full: true });
    b.send({ t: 'sync' });
    expect((await b.next('snapshot')).v).toBe(1);
  });

  it('操作の結果は呼んだ画面に返り、ほかの画面にも届く。ルールに合わない操作は invalid で断る', async () => {
    const a = await connect();
    const b = await connect();
    await a.next('snapshot');
    await b.next('snapshot');
    a.send({ t: 'orders', orders: [single(2)], full: true });
    const [card] = (await a.next('drips')).drips;
    await b.next('drips');

    const ok = await a.op({ name: 'assign', drip_id: card.id, dripper: 1 });
    expect(ok.ok).toBe(true);
    expect((ok as Extract<Reply, { ok: true }>).result.changed[0]).toMatchObject({ status: 'brewing', dripper: 1 });
    expect((await b.next('drips')).drips[0]).toMatchObject({ id: card.id, status: 'brewing' });

    const ng = await a.op({ name: 'next', dripper: 6 });
    expect(ng).toMatchObject({ ok: false, error: { code: 'invalid' } });
  });

  it('ほかの日の注文は載せない', async () => {
    const a = await connect();
    await a.next('snapshot');
    a.send({
      t: 'orders',
      orders: [
        single(2),
        { ...single(3), created_at: new Date(Date.parse(`${DAY}T00:00:00+09:00`) - 60_000).toISOString() },
        { ...single(4), created_at: new Date(Date.parse(`${DAY}T00:00:00+09:00`) + 86_400_000).toISOString() },
      ],
      full: true,
    });
    const msg = await a.next('drips');
    // 前の日の 23:59（日本時間）と次の日の 0:00 の注文は外れる
    expect(msg.drips.map((d) => d.order_ids[0])).toEqual([orderId(2)]);
  });

  it('つなぎ直しても、保存したカードと版が残っている', async () => {
    const a = await connect();
    await a.next('snapshot');
    a.send({ t: 'orders', orders: [single(2)], full: true });
    await a.next('drips');
    a.ws.close();
    const b = await connect();
    const snap = await b.next('snapshot');
    expect(snap.v).toBe(1);
    expect(snap.drips).toHaveLength(1);
  });

  it('ほかのサイトからはつなげない', async () => {
    const res = await SELF.fetch(`https://caos.example/api/board?day=${DAY}`, {
      headers: { Upgrade: 'websocket', Origin: 'https://evil.example' },
    });
    expect(res.status).toBe(403);
    const same = await SELF.fetch(`https://caos.example/api/board?day=${DAY}`, {
      headers: { Upgrade: 'websocket', Origin: 'https://caos.example' },
    });
    expect(same.status).toBe(101);
    same.webSocket?.accept();
    same.webSocket?.close();
  });

  it('day の形が違えば断る', async () => {
    const res = await SELF.fetch('https://caos.example/api/board?day=2026-1-1', { headers: { Upgrade: 'websocket' } });
    expect(res.status).toBe(400);
  });
});

describe('POS への準備完了', () => {
  /** POS の API の代わり。注文ごとの ready_at を持ち、PATCH /ready で入れ替える（本物と同じ） */
  const fakePos = (initial: Record<string, string | null> = {}) => {
    const ready = new Map(Object.entries(initial));
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const method = init?.method ?? 'GET';
      calls.push(`${method} ${url.pathname}`);
      const m = url.pathname.match(/^\/api\/orders\/([^/]+)(\/ready)?$/);
      if (!m) return new Response('not found', { status: 404 });
      const id = decodeURIComponent(m[1]);
      if (method === 'PATCH') ready.set(id, ready.get(id) ? null : '2026-11-01T03:00:00Z');
      return Response.json({ id, ready_at: ready.get(id) ?? null, served_at: null });
    });
    return { ready, calls };
  };

  it('次へで注文のカードが全部終わったら、POS に準備完了を送る（今の状態を確かめてから切り替える）', async () => {
    const pos = fakePos();
    const a = await connect();
    await a.next('snapshot');
    a.send({ t: 'orders', orders: [single(2)], full: true });
    const [card] = (await a.next('drips')).drips;
    await a.op({ name: 'assign', drip_id: card.id, dripper: 1 });
    const done = (await a.op({ name: 'next', dripper: 1 })) as Extract<Reply, { ok: true }>;
    expect(done.result.readied).toEqual([orderId(2)]);

    // アラームは本物と同じく自動で動くので、送り終わるのを待つ
    await vi.waitFor(() =>
      expect(pos.calls).toEqual([`GET /api/orders/${orderId(2)}`, `PATCH /api/orders/${orderId(2)}/ready`])
    );
    expect(pos.ready.get(orderId(2))).toBeTruthy();
    expect(await outbox()).toEqual([]);

    // もう一度動いても、送り待ちは空なので何も送らない（送り直しで準備完了を外さない）
    await runDurableObjectAlarm(boardStub());
    expect(pos.calls).toHaveLength(2);
  });

  it('POS がすでに準備完了なら切り替えない。1つ戻すと取り消しを送る', async () => {
    const pos = fakePos({ [orderId(2)]: '2026-11-01T03:00:00Z' });
    const a = await connect();
    await a.next('snapshot');
    a.send({ t: 'orders', orders: [single(2)], full: true });
    const [card] = (await a.next('drips')).drips;
    const assigned = (await a.op({ name: 'assign', drip_id: card.id, dripper: 1 })) as Extract<Reply, { ok: true }>;
    const before = assigned.result.changed;
    const done = (await a.op({ name: 'next', dripper: 1 })) as Extract<Reply, { ok: true }>;
    await vi.waitFor(() => expect(pos.calls).toEqual([`GET /api/orders/${orderId(2)}`]));
    await vi.waitFor(async () => expect(await outbox()).toEqual([]));

    const undo = await a.op({
      name: 'restore',
      before,
      after: done.result.changed,
      readied: done.result.readied,
    });
    expect(undo.ok).toBe(true);
    await vi.waitFor(() => expect(pos.ready.get(orderId(2))).toBeNull());
    expect(pos.calls.slice(-2)).toEqual([`GET /api/orders/${orderId(2)}`, `PATCH /api/orders/${orderId(2)}/ready`]);
  });

  it('POS につながらなければ、送り待ちに残して送り直す', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('down', { status: 503 }));
    const a = await connect();
    await a.next('snapshot');
    a.send({ t: 'orders', orders: [single(2)], full: true });
    const [card] = (await a.next('drips')).drips;
    await a.op({ name: 'assign', drip_id: card.id, dripper: 1 });
    await a.op({ name: 'next', dripper: 1 });
    // 1 回目は失敗し、送り待ちに残る（2 秒あとに送り直す）
    await vi.waitFor(async () =>
      expect(await outbox()).toEqual([{ order_id: orderId(2), desired: 'ready', attempts: 1 }])
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
    const pos = fakePos();
    await vi.waitFor(() => expect(pos.ready.get(orderId(2))).toBeTruthy(), { timeout: 5000 });
    expect(await outbox()).toEqual([]);
  });

  it('送り待ちの間に届いた古い一覧では、POS の準備完了の状態で巻き戻さない', async () => {
    fakePos();
    const a = await connect();
    await a.next('snapshot');
    a.send({ t: 'orders', orders: [order(5, [{ items: [[ITEMS.ore, 1]] }])], full: true });
    const [card] = (await a.next('drips')).drips;
    await a.op({ name: 'assign', drip_id: card.id, dripper: 2 });
    await a.op({ name: 'next', dripper: 2 });
    // 準備完了を POS に送る前の、まだ準備完了でない一覧が届く。注文は消えていないので、カードもそのまま
    a.send({ t: 'orders', orders: [order(5, [{ items: [[ITEMS.ore, 1]] }])], full: true });
    a.send({ t: 'sync' });
    const snap = await a.next('snapshot');
    expect(snap.drips).toEqual([expect.objectContaining({ id: card.id, status: 'done' })]);
  });
});
