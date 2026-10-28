import type { D1Database } from '@cloudflare/workers-types';
import { z } from 'zod';
import butchi from '../public/training/butchi.json';
import fast from '../public/training/fast.json';
import full from '../public/training/full.json';
import middle from '../public/training/middle.json';
import shawn from '../public/training/shawn.json';
import { type GameMode, parseScenario } from '../src/training/engine';
import { assessGrade, type GradeCohort } from '../src/training/grades';
import { randomScenario } from '../src/training/randomScenario';
import { replayRun, SCORING_VERSION } from '../src/training/replay';

export interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
}
const scenarios = {
  fast: parseScenario(fast),
  middle: parseScenario(middle),
  full: parseScenario(full),
  butchi: parseScenario(butchi),
  shawn: parseScenario(shawn),
};
const modeSchema = z.enum(['fast', 'middle', 'full', 'butchi', 'shawn']);
const displayNameSchema = z.string().trim().min(1, '表示名を入力してください').max(30, '表示名は30文字まで');
type Player = { id: string; display_name: string };
type Run = {
  id: string;
  player_id: string;
  mode: GameMode;
  seed: number;
  started_at: number;
  completed_at: number | null;
  result_json: string | null;
  rules_version: string;
  trace_hash: string | null;
};
async function gradeCohort(env: Env, mode: GameMode): Promise<GradeCohort> {
  const groups = await env.DB.prepare(`SELECT score,COUNT(*) AS count FROM (
    SELECT MAX(score) AS score FROM runs WHERE mode=? AND rules_version=? AND completed_at IS NOT NULL AND participant_id IS NOT NULL GROUP BY participant_id
  ) GROUP BY score`)
    .bind(mode, SCORING_VERSION)
    .all<{ score: number; count: number }>();
  return groups.results;
}
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (v) => v.toString(16).padStart(2, '0')).join('');
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
const digest = async (s: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
async function body(request: Request) {
  if (Number(request.headers.get('content-length')) > 300000) throw new ApiError(413, '操作記録が大きすぎます');
  const text = await request.text();
  if (text.length > 300000) throw new ApiError(413, '操作記録が大きすぎます');
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, '入力を確認してください');
  }
}
async function rateLimit(env: Env, key: string, max: number, period = 60000) {
  const bucket = `${key}:${Math.floor(Date.now() / period)}`;
  const row = await env.DB.prepare(
    'INSERT INTO rate_limits(key,hits,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits'
  )
    .bind(bucket, Date.now() + period * 2)
    .first<{ hits: number }>();
  if ((row?.hits ?? max + 1) > max) throw new ApiError(429, '少し待ってからお試しください');
}
async function authenticated(request: Request, env: Env) {
  const token = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) throw new ApiError(401, 'このゲームの保存期限が切れました。新しく始めてください');
  const p = await env.DB.prepare(
    'SELECT p.* FROM players p JOIN sessions s ON s.player_id=p.id WHERE s.token_hash=? AND s.expires_at>?'
  )
    .bind(await digest(token), Date.now())
    .first<Player>();
  if (!p) throw new ApiError(401, 'このゲームの保存期限が切れました。新しく始めてください');
  return p;
}
async function issueSession(env: Env, player: Player) {
  const token = random();
  await env.DB.prepare('INSERT INTO sessions(token_hash,player_id,expires_at) VALUES(?,?,?)')
    .bind(await digest(token), player.id, Date.now() + 45 * 86400000)
    .run();
  return reply({ token, player: { id: player.id } });
}
async function route(request: Request, env: Env) {
  const url = new URL(request.url),
    path = url.pathname;
  if (path === '/health' && request.method === 'GET') return reply({ status: 'ok', rulesVersion: SCORING_VERSION });
  if (path === '/session' && request.method === 'POST') {
    await rateLimit(env, `device:${await digest(request.headers.get('CF-Connecting-IP') ?? 'local')}`, 120, 3600000);
    z.object({})
      .strict()
      .parse(await body(request));
    const id = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO players(id,username,display_name,password_hash,salt,created_at) VALUES(?,?,?,?,?,?)'
    )
      .bind(id, `device_${id}`, '', '', '', Date.now())
      .run();
    return issueSession(env, { id, display_name: '' });
  }
  if (path === '/profile' && request.method === 'GET') {
    const displayName = displayNameSchema.parse(url.searchParams.get('name'));
    const results =
      await env.DB.prepare(`SELECT r.mode,MAX(r.score) AS best,MAX(r.business_score) AS business_best,COUNT(*) AS attempts,SUM(r.passed) AS passed
      FROM runs r JOIN participants p ON p.id=r.participant_id WHERE p.display_name=? AND r.completed_at IS NOT NULL AND r.rules_version=? GROUP BY r.mode`)
        .bind(displayName, SCORING_VERSION)
        .all();
    const stats = await Promise.all(
      results.results.map(async (row) => ({
        ...row,
        assessment: assessGrade(Number(row.best), await gradeCohort(env, row.mode as GameMode)),
      }))
    );
    return reply({ displayName, stats });
  }
  if (path === '/rankings' && request.method === 'GET') {
    const mode = modeSchema.parse(url.searchParams.get('mode') ?? 'fast');
    const offset = z.coerce
      .number()
      .int()
      .min(0)
      .max(100000)
      .parse(url.searchParams.get('offset') ?? 0);
    const metric = z.enum(['master', 'business']).parse(url.searchParams.get('metric') ?? 'master');
    const column = metric === 'business' ? 'business_score' : 'score';
    const query = `WITH attempts AS (
      SELECT r.*,p.display_name,COUNT(*) OVER(PARTITION BY r.participant_id) AS attempts,
        ROW_NUMBER() OVER(PARTITION BY r.participant_id ORDER BY ${column} DESC,score DESC,done DESC,quality DESC,elapsed_sec ASC,completed_at ASC,r.id ASC) AS best
      FROM runs r JOIN participants p ON p.id=r.participant_id WHERE mode=? AND rules_version=? AND completed_at IS NOT NULL
    ), ranked AS (
      SELECT participant_id AS player_id,display_name,score,business_score,revenue,done,total,quality,elapsed_sec,passed,completed_at,attempts,
        RANK() OVER(ORDER BY ${column} DESC) AS rank FROM attempts WHERE best=1
    ) SELECT * FROM ranked ORDER BY ${column} DESC,score DESC,done DESC,quality DESC,elapsed_sec ASC,completed_at ASC,player_id ASC LIMIT 100 OFFSET ?`;
    const ranks = await env.DB.prepare(query).bind(mode, SCORING_VERSION, offset).all();
    const cohort = await gradeCohort(env, mode);
    const name = url.searchParams.get('name');
    const viewer = name
      ? await env.DB.prepare('SELECT id FROM participants WHERE display_name=?')
          .bind(displayNameSchema.parse(name))
          .first<{ id: string }>()
      : null;
    return reply({
      mode,
      metric,
      rulesVersion: SCORING_VERSION,
      players: ranks.results.map((row) => ({ ...row, assessment: assessGrade(Number(row.score), cohort) })),
      totalPlayers: cohort.reduce((sum, group) => sum + group.count, 0),
      viewerId: viewer?.id ?? '',
      offset,
    });
  }
  const player = await authenticated(request, env);
  if (path === '/logout' && request.method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?')
      .bind(await digest((request.headers.get('Authorization') ?? '').slice(7)))
      .run();
    return reply({ ok: true });
  }
  if (path === '/me' && request.method === 'GET') {
    const results = await env.DB.prepare(
      'SELECT mode,MAX(score) AS best,MAX(business_score) AS business_best,COUNT(*) AS attempts,SUM(passed) AS passed FROM runs WHERE player_id=? AND completed_at IS NOT NULL AND rules_version=? GROUP BY mode'
    )
      .bind(player.id, SCORING_VERSION)
      .all();
    const stats = await Promise.all(
      results.results.map(async (row) => ({
        ...row,
        assessment: assessGrade(Number(row.best), await gradeCohort(env, row.mode as GameMode)),
      }))
    );
    return reply({ player: { id: player.id }, stats });
  }
  if (path === '/runs' && request.method === 'POST') {
    await rateLimit(env, `start:${player.id}`, 30, 3600000);
    const { mode } = z
      .object({ mode: modeSchema })
      .strict()
      .parse(await body(request));
    const id = crypto.randomUUID(),
      seed = crypto.getRandomValues(new Uint32Array(1))[0];
    await env.DB.prepare('INSERT INTO runs(id,player_id,mode,seed,rules_version,started_at) VALUES(?,?,?,?,?,?)')
      .bind(id, player.id, mode, seed, SCORING_VERSION, Date.now())
      .run();
    return reply({ id, seed, scenario: randomScenario(scenarios[mode], seed), rulesVersion: SCORING_VERSION });
  }
  const gradeRun = path.match(/^\/runs\/([a-f0-9-]{36})\/grade$/);
  if (gradeRun && request.method === 'GET') {
    const run = await env.DB.prepare(
      'SELECT mode,score FROM runs WHERE id=? AND player_id=? AND rules_version=? AND completed_at IS NOT NULL'
    )
      .bind(gradeRun[1], player.id, SCORING_VERSION)
      .first<{ mode: GameMode; score: number }>();
    if (!run) throw new ApiError(404, '採点済みのゲームが見つかりません');
    return reply({ assessment: assessGrade(run.score, await gradeCohort(env, run.mode)) });
  }
  const submit = path.match(/^\/runs\/([a-f0-9-]{36})\/submit$/);
  if (submit && request.method === 'POST') {
    await rateLimit(env, `submit:${player.id}`, 15);
    const run = await env.DB.prepare('SELECT * FROM runs WHERE id=? AND player_id=?')
      .bind(submit[1], player.id)
      .first<Run>();
    if (!run) throw new ApiError(404, 'ゲームが見つかりません');
    if (run.rules_version !== SCORING_VERSION)
      throw new ApiError(409, '採点ルールが更新されました。新しく挑戦してください');
    const { actions, displayName: enteredName } = z
      .object({ actions: z.unknown(), displayName: displayNameSchema.optional() })
      .strict()
      .parse(await body(request));
    const displayName = displayNameSchema.parse(enteredName ?? player.display_name);
    const traceHash = await digest(JSON.stringify({ displayName, actions }));
    if (run.completed_at) {
      if (run.trace_hash !== traceHash) throw new ApiError(409, 'このゲームは登録済みです');
      return reply({ result: JSON.parse(run.result_json ?? '{}'), alreadySaved: true });
    }
    if (Date.now() - run.started_at > 86400000) throw new ApiError(410, 'ゲームの有効期限が切れました');
    let replay: ReturnType<typeof replayRun>;
    try {
      replay = replayRun(randomScenario(scenarios[run.mode], run.seed), run.seed, actions);
    } catch (error) {
      throw new ApiError(400, error instanceof z.ZodError ? '操作記録を確認してください' : (error as Error).message);
    }
    if (replay.state.nowSec > ((Date.now() - run.started_at + 10000) / 1000) * 10)
      throw new ApiError(400, 'ゲーム時間が一致しません');
    const r = replay.result;
    await env.DB.prepare(
      'INSERT INTO participants(id,display_name,created_at) VALUES(?,?,?) ON CONFLICT(display_name) DO NOTHING'
    )
      .bind(crypto.randomUUID(), displayName, Date.now())
      .run();
    const participant = await env.DB.prepare('SELECT id FROM participants WHERE display_name=?')
      .bind(displayName)
      .first<{ id: string }>();
    if (!participant) throw new ApiError(500, '表示名を保存できませんでした');
    await env.DB.prepare(
      'UPDATE runs SET participant_id=?,completed_at=?,score=?,business_score=?,revenue=?,done=?,total=?,quality=?,elapsed_sec=?,passed=?,result_json=?,trace_hash=? WHERE id=? AND player_id=? AND completed_at IS NULL'
    )
      .bind(
        participant.id,
        Date.now(),
        r.score,
        r.business.score,
        r.business.revenue,
        r.done,
        r.total,
        r.quality,
        replay.state.nowSec,
        Number(r.passed),
        JSON.stringify(r),
        traceHash,
        run.id,
        player.id
      )
      .run();
    // A conditional update makes concurrent retries idempotent too.
    const saved = await env.DB.prepare('SELECT trace_hash,result_json FROM runs WHERE id=?').bind(run.id).first<Run>();
    if (saved?.trace_hash !== traceHash) throw new ApiError(409, 'このゲームは登録済みです');
    return reply({ result: JSON.parse(saved?.result_json ?? '{}') });
  }
  throw new ApiError(404, 'ページが見つかりません');
}
export default {
  async fetch(request: Request, env: Env) {
    const origin = request.headers.get('Origin');
    const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
    if (origin && !allowed.includes(origin)) return reply({ error: 'このサイトからは利用できません' }, 403);
    const headers = {
      'Access-Control-Allow-Origin': origin ?? allowed[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    let response: Response;
    try {
      response = await route(request, env);
    } catch (error) {
      response =
        error instanceof ApiError
          ? reply({ error: error.message }, error.status)
          : error instanceof z.ZodError
            ? reply({ error: error.issues[0]?.message ?? '入力を確認してください' }, 400)
            : reply({ error: '保存できませんでした。もう一度お試しください' }, 500);
    }
    const next = new Response(response.body, response);
    for (const [name, value] of Object.entries(headers)) next.headers.set(name, value);
    next.headers.set('X-Content-Type-Options', 'nosniff');
    return next;
  },
  async scheduled(_event: unknown, env: Env) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(Date.now()),
      env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<?').bind(Date.now()),
      env.DB.prepare('DELETE FROM runs WHERE completed_at IS NULL AND started_at<?').bind(Date.now() - 86400000),
    ]);
  },
};
