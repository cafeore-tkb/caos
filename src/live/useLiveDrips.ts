import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Drip, DripRpcResult } from './drips';
import { supabase } from './supabase';

export type LiveStatus =
  | 'off' // 実データテスト中など、DB を使っていない
  | 'unconfigured' // VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY が無い
  | 'signed-out'
  | 'not-staff'
  | 'connecting'
  | 'open'
  | 'reconnecting';

const PAGE_SIZE = 1000;

// 古い行で新しい行を上書きしない（RPC の結果と Realtime の通知は順番が前後することがある）
const isNewer = (incoming: Drip, current: Drip | undefined) =>
  !current || new Date(incoming.updated_at).getTime() >= new Date(current.updated_at).getTime();

// その日のカードを読み、Realtime で変わった行だけを受け取って手元の一覧を最新に保つ。
// 書き込みは call() で RPC を呼ぶ。結果の行は Realtime を待たずにすぐ反映する。
export const useLiveDrips = (enabled: boolean, dayStartMs: number) => {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [isStaff, setIsStaff] = useState<boolean | null>(null);
  const [channelStatus, setChannelStatus] = useState<'connecting' | 'open' | 'reconnecting'>('connecting');
  const [drips, setDrips] = useState<Map<string, Drip>>(() => new Map());
  const dripsRef = useRef(drips);
  dripsRef.current = drips;

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  const email = session?.user.email;
  useEffect(() => {
    if (!supabase || !email) {
      setIsStaff(null);
      return;
    }
    let cancelled = false;
    supabase.rpc('is_staff').then(({ data, error }) => {
      if (!cancelled) setIsStaff(error ? false : Boolean(data));
    });
    return () => {
      cancelled = true;
    };
  }, [email]);

  const apply = useCallback((changed: Drip[], deleted: string[] = []) => {
    if (changed.length === 0 && deleted.length === 0) return;
    setDrips((prev) => {
      const next = new Map<string, Drip>(prev);
      changed.forEach((drip) => {
        if (isNewer(drip, next.get(drip.id))) next.set(drip.id, drip);
      });
      deleted.forEach((id) => {
        next.delete(id);
      });
      return next;
    });
  }, []);

  const active = enabled && Boolean(supabase) && Boolean(isStaff);
  useEffect(() => {
    const client = supabase;
    if (!active || !client) return;
    let cancelled = false;
    const since = new Date(dayStartMs).toISOString();

    // その日のカードを丸ごと読み直す。つないだ直後と、つなぎ直したとき（切れていた間の変更を拾う）に使う
    const reload = async () => {
      const startedMs = Date.now();
      const loaded = new Map<string, Drip>();
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await client
          .from('drips')
          .select('*')
          .gte('created_at', since)
          .order('created_at')
          .range(from, from + PAGE_SIZE - 1);
        if (error || cancelled) return;
        (data as Drip[]).forEach((drip) => {
          loaded.set(drip.id, drip);
        });
        if (data.length < PAGE_SIZE) break;
      }
      if (cancelled) return;
      // 読んでいる間に Realtime や RPC で届いた新しい行は残す
      setDrips((prev) => {
        prev.forEach((drip, id) => {
          const recent = new Date(drip.updated_at).getTime() >= startedMs - 1_000;
          if (recent && isNewer(drip, loaded.get(id))) loaded.set(id, drip);
        });
        return loaded;
      });
    };

    setChannelStatus('connecting');
    const channel = client
      .channel('caos-drips')
      .on('postgres_changes', { event: '*', schema: 'caos', table: 'drips' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as Partial<Drip>).id;
          if (id) apply([], [id]);
        } else {
          apply([payload.new as Drip]);
        }
      })
      .subscribe((state) => {
        if (state === 'SUBSCRIBED') {
          setChannelStatus('open');
          void reload();
        } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
          // supabase-js が自動でつなぎ直す。つながったら SUBSCRIBED がもう一度来る
          setChannelStatus('reconnecting');
        }
      });

    return () => {
      cancelled = true;
      void client.removeChannel(channel);
    };
  }, [active, dayStartMs, apply]);

  // RPC を呼び、結果をすぐ手元に反映する。失敗したらエラーの文を返す。
  const call = useCallback(
    async (fn: string, args: Record<string, unknown>): Promise<{ result?: DripRpcResult; error?: string }> => {
      if (!supabase) return { error: 'Supabase が設定されていません' };
      const { data, error } = await supabase.rpc(fn, args);
      if (error) return { error: error.message };
      const result = data as DripRpcResult;
      apply(result.changed, result.deleted);
      return { result };
    },
    [apply]
  );

  const signIn = useCallback(() => {
    void supabase?.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
    });
  }, []);
  const signOut = useCallback(() => {
    void supabase?.auth.signOut();
  }, []);

  const status: LiveStatus = !enabled
    ? 'off'
    : !supabase
      ? 'unconfigured'
      : !authReady || (session && isStaff === null)
        ? 'connecting'
        : !session
          ? 'signed-out'
          : !isStaff
            ? 'not-staff'
            : channelStatus;

  return { status, email, drips, dripsRef, call, signIn, signOut };
};
