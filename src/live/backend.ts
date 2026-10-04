// CaOS のつなぎ先（Supabase。cafeore-pos・ShiftMaker と同じプロジェクトの caos スキーマ）。
// ログインは Supabase Auth の Google（リダイレクト）。データはテーブルを直接触らず、caos スキーマの関数（RPC）だけを呼ぶ
// （権限の確認は関数の中＝supabase/migrations）。カードの変更は Realtime の Broadcast（private チャンネル caos:drips）で届く。
// 設定は public/site-config.js の window.SUPABASE_CONFIG（url と公開キー。キーは公開してよい値）。
// 作りは ShiftMaker（cafeore-tkb/sohosai-shift の src/sync/backend.ts）にそろえている。

import type { Drip } from './drips';

declare global {
  interface Window {
    SUPABASE_CONFIG?: { url?: string; key?: string };
    /** 動作確認用：本物の代わりに使う Backend */
    __CAOS_BACKEND_MOCK__?: Backend;
  }
}

export interface User {
  email: string;
}

/** 失敗の種類：login＝ログインが必要、denied＝スタッフでない、invalid＝その操作はできない、network＝つながらない */
export type ErrorKind = 'login' | 'denied' | 'invalid' | 'network' | 'other';
export class BackendError extends Error {
  constructor(
    message: string,
    readonly kind: ErrorKind
  ) {
    super(message);
  }
}

/** caos:drips の Broadcast。v＝版、drips＝変わった後のカード、deleted＝消したカード、reload＝大きすぎたので読み直す */
export interface DripsEvent {
  v: number;
  drips?: Drip[];
  deleted?: string[];
  reload?: boolean;
}

export type ChannelStatus = 'live' | 'connecting' | 'offline' | 'denied';
export interface ChannelHandlers {
  drips(e: DripsEvent): void;
  /** 受け取りを始めた・つなぎ直した（live）ときは、取りこぼしがないよう読み直す */
  status(s: ChannelStatus): void;
}

export interface Backend {
  onUser(cb: (u: User | null) => void): () => void;
  /** Google でログイン（このページを離れて、戻ってくる） */
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /** caos スキーマの関数を呼ぶ。失敗は BackendError */
  rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T>;
  /** caos:drips の Broadcast を受け取る。返り値で止める */
  watchDrips(h: ChannelHandlers): () => void;
}

export const backendEnabled = (): boolean =>
  !!window.__CAOS_BACKEND_MOCK__ || !!(window.SUPABASE_CONFIG?.url && window.SUPABASE_CONFIG?.key);

let loaded: Promise<Backend> | null = null;
export function loadBackend(): Promise<Backend> {
  if (!loaded) loaded = window.__CAOS_BACKEND_MOCK__ ? Promise.resolve(window.__CAOS_BACKEND_MOCK__) : connect();
  return loaded;
}

/** PostgREST のエラー（関数の raise の errcode・hint）→ BackendError */
export function toBackendError(
  e: { message?: string; code?: string; hint?: string | null } | null,
  status = 0
): BackendError {
  const message = e?.message || 'エラーが起きました';
  if (!e || status === 0 || /Failed to fetch|NetworkError|Load failed|fetch failed/i.test(message)) {
    return new BackendError(message, 'network');
  }
  if (e.hint === 'login') return new BackendError(message, 'login');
  if (e.code === '42501' || status === 401 || status === 403) return new BackendError(message, 'denied');
  if (e.hint === 'invalid') return new BackendError(message, 'invalid');
  return new BackendError(message, 'other');
}

async function connect(): Promise<Backend> {
  const { url, key } = window.SUPABASE_CONFIG || {};
  if (!url || !key) throw new Error('Supabase の設定（site-config.js）がありません');
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(url, key, {
    db: { schema: 'caos' },
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  // ログインから戻ってきたあと、URL に付いた code などを消す
  const cleanUrlAfterSignIn = () => {
    const q = new URLSearchParams(location.search);
    if (!q.has('code') && !q.has('error')) return;
    for (const name of ['code', 'error', 'error_code', 'error_description']) q.delete(name);
    const rest = q.toString();
    history.replaceState(history.state, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`);
  };

  return {
    onUser(cb) {
      let last: string | null | undefined;
      const { data } = sb.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') cleanUrlAfterSignIn();
        const email = session?.user?.email?.toLowerCase() || null;
        if (email === last) return;
        last = email;
        cb(email ? { email } : null);
      });
      return () => data.subscription.unsubscribe();
    },
    async signIn() {
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${location.origin}${location.pathname}${location.search}`,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw new BackendError(error.message, 'other');
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async rpc<T>(fn: string, args: Record<string, unknown> = {}) {
      try {
        const { data, error, status } = await sb.rpc(fn, args);
        if (error) throw toBackendError(error, status);
        return data as T;
      } catch (e) {
        if (e instanceof BackendError) throw e;
        throw toBackendError({ message: (e as Error).message }, 0);
      }
    },
    watchDrips(h) {
      const ch = sb.channel('caos:drips', { config: { private: true } });
      ch.on('broadcast', { event: 'drips' }, ({ payload }) => h.drips(payload as DripsEvent));
      h.status('connecting');
      // Realtime にはログインした人のトークンが自動で渡る（supabase-js）。購読の前に最新のものにしておく
      void sb.realtime.setAuth().then(() =>
        ch.subscribe((status, err) => {
          if (status === 'SUBSCRIBED') h.status('live');
          else if (status === 'CHANNEL_ERROR' && /unauthori[sz]ed|denied/i.test(err?.message || '')) h.status('denied');
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') h.status('offline');
          // CLOSED は止めたとき
        })
      );
      return () => void sb.removeChannel(ch);
    },
  };
}
