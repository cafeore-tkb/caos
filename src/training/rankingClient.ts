import type { GameAction, GameMode, Scenario } from './engine';
import type { GradeAssessment } from './grades';
import { RANKING_API } from './rankingConfig';
import { SCORING_VERSION } from './replay';
export interface DeviceSession {
  token: string;
  player: { id: string };
}
export interface RankedRun {
  id: string;
  seed: number;
  scenario: Scenario;
  rulesVersion: string;
}
export interface Rank {
  run_id?: string;
  rulesVersion?: string;
  player_id: string;
  display_name: string;
  score: number;
  business_score: number;
  revenue: number;
  rank: number;
  assessment: GradeAssessment;
  done: number;
  total: number;
  quality: number;
  elapsed_sec: number;
  passed: number;
  attempts: number;
  completed_at: number;
}
export interface Ranking {
  players: Rank[];
  viewerId: string;
  totalPlayers: number;
  offset: number;
  rulesVersion: string;
  currentRulesVersion?: string;
  availableVersions?: { rulesVersion: string; attempts: number; players: number }[];
  showingPreviousRules?: boolean;
}
const AUTH_KEY = 'caos-ranking-login-v1';
const PENDING_KEY = 'caos-ranking-pending-v2';
const NAME_KEY = 'caos-ranking-display-name-v1';
export function readSession(): DeviceSession | null {
  try {
    const v = JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null');
    return /^[a-f0-9]{64}$/.test(v?.token ?? '') && typeof v?.player?.id === 'string' ? v : null;
  } catch {
    return null;
  }
}
export function storeSession(value: DeviceSession | null) {
  if (value) localStorage.setItem(AUTH_KEY, JSON.stringify(value));
  else localStorage.removeItem(AUTH_KEY);
}
export class RankingError extends Error {
  constructor(
    message: string,
    public status = 0
  ) {
    super(message);
  }
}
export async function rankingApi<T>(path: string, session: DeviceSession | null, data?: unknown): Promise<T> {
  if (!RANKING_API) throw new RankingError('ランキングは準備中です');
  let response: Response;
  try {
    response = await fetch(`${RANKING_API}${path}`, {
      method: data === undefined ? 'GET' : 'POST',
      headers: {
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
        ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new RankingError('通信できません。記録はこの端末に残ります。');
  }
  const body = await response.json().catch(() => {
    throw new RankingError('通信できません。少し待ってお試しください。', response.status);
  });
  if (!response.ok) throw new RankingError(body.error ?? '通信に失敗しました', response.status);
  return body;
}
export function readDisplayName(): string {
  try {
    return localStorage.getItem(NAME_KEY)?.trim().slice(0, 30) ?? '';
  } catch {
    return '';
  }
}
export function storeDisplayName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* The submitted score still exists on the server. */
  }
}
export async function beginRun(mode: GameMode, existing: DeviceSession | null) {
  let session = existing ?? readSession();
  if (!session) session = await rankingApi<DeviceSession>('/session', null, {});
  let run: RankedRun;
  try {
    run = await rankingApi<RankedRun>('/runs', session, { mode });
  } catch (error) {
    if (!(error instanceof RankingError) || error.status !== 401) throw error;
    session = await rankingApi<DeviceSession>('/session', null, {});
    run = await rankingApi<RankedRun>('/runs', session, { mode });
  }
  try {
    storeSession(session);
  } catch {
    /* The current run can continue without persistent storage. */
  }
  if (run.rulesVersion !== SCORING_VERSION)
    throw new RankingError('採点ルールが更新されました。画面を再読み込みしてください。');
  return { run, session };
}
export async function beginNamedRun(mode: GameMode, existing: DeviceSession | null, name: string) {
  const displayName = name.trim();
  if (!displayName || displayName.length > 30) throw new RankingError('プレイヤー名を1〜30文字で入力してください');
  const game = await beginRun(mode, existing);
  storeDisplayName(displayName);
  return { ...game, displayName };
}

interface Pending {
  runId: string;
  playerId: string;
  actions: GameAction[];
  displayName: string;
}
export function readPending(): Pending[] {
  try {
    const a = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]');
    return Array.isArray(a)
      ? a.filter(
          (p) => p && typeof p.runId === 'string' && typeof p.displayName === 'string' && Array.isArray(p.actions)
        )
      : [];
  } catch {
    return [];
  }
}
export function queueRun(session: DeviceSession, runId: string, actions: GameAction[], displayName: string) {
  const pending = readPending().filter((p) => p.runId !== runId);
  localStorage.setItem(
    PENDING_KEY,
    JSON.stringify([...pending, { runId, playerId: session.player.id, actions, displayName }].slice(-20))
  );
}
export async function publishRun(session: DeviceSession, runId: string, actions: GameAction[], displayName: string) {
  try {
    queueRun(session, runId, actions, displayName);
  } catch {
    /* Online publishing also works when browser storage is unavailable. */
  }
  const response = await rankingApi(`/runs/${runId}/submit`, session, { actions, displayName });
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(readPending().filter((p) => p.runId !== runId)));
  } catch {
    /* Retrying an already published trace is idempotent. */
  }
  return response;
}
export async function syncRuns(session: DeviceSession) {
  let skipped = 0;
  for (const run of readPending().filter((p) => p.playerId === session.player.id)) {
    try {
      await rankingApi(`/runs/${run.runId}/submit`, session, { actions: run.actions, displayName: run.displayName });
    } catch (error) {
      if (error instanceof RankingError && [400, 404, 409, 410].includes(error.status)) skipped++;
      else throw error;
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify(readPending().filter((p) => p.runId !== run.runId)));
  }
  return { skipped };
}
