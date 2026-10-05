// CaOS の Worker。画面（dist の静的ファイル）と、盤面（Durable Object）への WebSocket を配る。
//   /api/board?day=YYYY-MM-DD … 盤面の WebSocket。day を省くと日本時間の今日
//   それ以外                  … 画面（SPA。知らないパスは index.html）
// 見られる人は Cloudflare Access（Worker の前）で絞る。

import { BoardObject, jstDay } from './board/BoardObject';
import type { Env } from './env';

export { BoardObject };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const allowedOrigin = (request: Request, env: Env) => {
  const origin = request.headers.get('Origin');
  // ブラウザ以外（テスト・curl）は Origin を付けない
  if (!origin) return true;
  if (origin === new URL(request.url).origin) return true;
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(origin);
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/board') {
      const day = url.searchParams.get('day') ?? jstDay(Date.now());
      if (!DAY.test(day)) return new Response('day は YYYY-MM-DD です', { status: 400 });
      // ほかのサイトから、ログインしている人の Cookie で盤面につながれないようにする
      if (!allowedOrigin(request, env)) return new Response('Forbidden', { status: 403 });
      const headers = new Headers(request.headers);
      headers.set('X-Board-Day', day);
      return env.BOARD.get(env.BOARD.idFromName(`board-${day}`)).fetch(new Request(request, { headers }));
    }
    if (url.pathname.startsWith('/api/')) return new Response('Not Found', { status: 404 });
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
