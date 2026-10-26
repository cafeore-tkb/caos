import type { GameAction, GameMode, Scenario } from './engine';
import { RANKING_API } from './rankingConfig';
import { SCORING_VERSION } from './replay';
export interface Player {
  id: string;
  username: string;
  displayName: string;
}
export interface Login {
  token: string;
  player: Player;
}
export interface RankedRun {
  id: string;
  seed: number;
  scenario: Scenario;
  rulesVersion: string;
}
export interface Rank {
  player_id: string;
  username: string;
  display_name: string;
  score: number;
  business_score: number;
  revenue: number;
  rank: number;
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
}
const AUTH_KEY = 'caos-ranking-login-v1';
const PENDING_KEY = 'caos-ranking-pending-v1';
export function readLogin(): Login | null {
  try {
    const v = JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null');
    return /^[a-f0-9]{64}$/.test(v?.token ?? '') && typeof v?.player?.id === 'string' ? v : null;
  } catch {
    return null;
  }
}
export function storeLogin(value: Login | null) {
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
export async function rankingApi<T>(path: string, login: Login | null, data?: unknown): Promise<T> {
  if (!RANKING_API) throw new RankingError('ランキングは準備中です');
  let response: Response;
  try {
    response = await fetch(`${RANKING_API}${path}`, {
      method: data === undefined ? 'GET' : 'POST',
      headers: {
        ...(login ? { Authorization: `Bearer ${login.token}` } : {}),
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
export async function beginRun(login: Login, mode: GameMode) {
  const run = await rankingApi<RankedRun>('/runs', login, { mode });
  if (run.rulesVersion !== SCORING_VERSION)
    throw new RankingError('採点ルールが更新されました。画面を再読み込みしてください。');
  return run;
}
interface Pending {
  runId: string;
  playerId: string;
  actions: GameAction[];
}
export function readPending(): Pending[] {
  try {
    const a = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]');
    return Array.isArray(a) ? a.filter((p) => p && typeof p.runId === 'string' && Array.isArray(p.actions)) : [];
  } catch {
    return [];
  }
}
export function queueRun(login: Login, runId: string, actions: GameAction[]) {
  const pending = readPending().filter((p) => p.runId !== runId);
  localStorage.setItem(
    PENDING_KEY,
    JSON.stringify([...pending, { runId, playerId: login.player.id, actions }].slice(-20))
  );
}
export async function syncRuns(login: Login) {
  let skipped = 0;
  for (const run of readPending().filter((p) => p.playerId === login.player.id)) {
    try {
      await rankingApi(`/runs/${run.runId}/submit`, login, { actions: run.actions });
    } catch (error) {
      if (error instanceof RankingError && [400, 404, 409, 410].includes(error.status)) skipped++;
      else throw error;
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify(readPending().filter((p) => p.runId !== run.runId)));
  }
  return { skipped };
}
