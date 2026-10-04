import { useCallback, useEffect, useRef, useState } from 'react';
import { type Backend, BackendError, backendEnabled, type DripsEvent, loadBackend } from './backend';
import type { Drip, DripRpcResult } from './drips';

export type LiveStatus =
  | 'off' // 実データテスト中など、DB を使っていない
  | 'unconfigured' // site-config.js に Supabase の設定が無い
  | 'signed-out'
  | 'not-staff'
  | 'connecting'
  | 'open'
  | 'reconnecting';

// 古い行で新しい行を上書きしない（RPC の結果と Broadcast は順番が前後することがある）
const isNewer = (incoming: Drip, current: Drip | undefined) =>
  !current || new Date(incoming.updated_at).getTime() >= new Date(current.updated_at).getTime();

// その日のカードを読み、caos:drips の Broadcast で変わったカードだけを受け取って手元の一覧を最新に保つ。
// 版（v）が飛んだら取りこぼしたとみなして読み直す。書き込みは call() で関数を呼び、結果のカードはすぐ反映する。
export const useLiveDrips = (enabled: boolean, dayStartMs: number) => {
  const configured = backendEnabled();
  const [backend, setBackend] = useState<Backend | null>(null);
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [access, setAccess] = useState<'unknown' | 'staff' | 'denied'>('unknown');
  const [channel, setChannel] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [drips, setDrips] = useState<Map<string, Drip>>(() => new Map());
  const dripsRef = useRef(drips);
  dripsRef.current = drips;
  const versionRef = useRef<number | null>(null);

  useEffect(() => {
    if (!configured) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    loadBackend()
      .then((loaded) => {
        if (cancelled) return;
        setBackend(loaded);
        stop = loaded.onUser((user) => setEmail(user?.email ?? null));
      })
      .catch(() => setEmail(null));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [configured]);

  const apply = useCallback((changed: Drip[] = [], deleted: string[] = []) => {
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

  const active = enabled && Boolean(backend) && Boolean(email);
  useEffect(() => {
    if (!active || !backend) return;
    let cancelled = false;
    setAccess('unknown');
    versionRef.current = null;

    // その日のカードを丸ごと読み直す。つないだとき・つなぎ直したとき・版が飛んだときに使う
    const reload = async () => {
      const startedMs = Date.now();
      try {
        const snapshot = await backend.rpc<{ v: number; drips: Drip[] }>('list_drips', {
          p_since: new Date(dayStartMs).toISOString(),
        });
        if (cancelled) return;
        versionRef.current = Math.max(versionRef.current ?? 0, snapshot.v);
        const loaded = new Map<string, Drip>(snapshot.drips.map((drip) => [drip.id, drip]));
        // 読んでいる間に Broadcast や関数の結果で届いた新しいカードは残す
        setDrips((prev) => {
          prev.forEach((drip, id) => {
            const recent = new Date(drip.updated_at).getTime() >= startedMs - 1_000;
            if (recent && isNewer(drip, loaded.get(id))) loaded.set(id, drip);
          });
          return loaded;
        });
        setAccess('staff');
      } catch (error) {
        if (cancelled) return;
        if (error instanceof BackendError && (error.kind === 'denied' || error.kind === 'login')) setAccess('denied');
      }
    };

    const onDrips = (event: DripsEvent) => {
      const last = versionRef.current;
      if (event.reload) {
        void reload();
        return;
      }
      apply(event.drips, event.deleted);
      if (last !== null && event.v > last + 1) void reload();
      versionRef.current = Math.max(last ?? 0, event.v);
    };

    const stop = backend.watchDrips({
      drips: onDrips,
      status: (status) => {
        if (status === 'live') {
          setChannel('live');
          void reload();
        } else if (status === 'denied') {
          setAccess('denied');
        } else {
          setChannel(status === 'connecting' ? 'connecting' : 'offline');
        }
      },
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [active, backend, dayStartMs, apply]);

  // 関数を呼び、結果をすぐ手元に反映する。失敗したらエラーの文を返す。
  const call = useCallback(
    async (fn: string, args: Record<string, unknown>): Promise<{ result?: DripRpcResult; error?: string }> => {
      if (!backend) return { error: 'DB につながっていません' };
      try {
        const result = await backend.rpc<DripRpcResult>(fn, args);
        apply(result.changed, result.deleted);
        return { result };
      } catch (error) {
        return { error: (error as Error).message };
      }
    },
    [backend, apply]
  );

  const signIn = useCallback(() => {
    void backend?.signIn();
  }, [backend]);
  const signOut = useCallback(() => {
    void backend?.signOut();
  }, [backend]);

  const status: LiveStatus = !enabled
    ? 'off'
    : !configured
      ? 'unconfigured'
      : email === undefined
        ? 'connecting'
        : email === null
          ? 'signed-out'
          : access === 'denied'
            ? 'not-staff'
            : access === 'unknown' || channel === 'connecting'
              ? 'connecting'
              : channel === 'live'
                ? 'open'
                : 'reconnecting';

  return { status, email: email ?? undefined, drips, dripsRef, call, signIn, signOut };
};
