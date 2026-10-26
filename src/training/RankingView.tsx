import { useCallback, useEffect, useRef, useState } from 'react';
import { type GameMode, MODES } from './engine';
import { type Login, type Ranking, RankingError, rankingApi, readPending, storeLogin, syncRuns } from './rankingClient';
import { ScoreRules } from './ScoreRules';

export function RankingView({
  login,
  onLogin,
  onBack,
  onGame,
}: {
  login: Login | null;
  onLogin: (value: Login | null) => void;
  onBack: () => void;
  onGame: () => void;
}) {
  const [mode, setMode] = useState<GameMode>('fast');
  const [offset, setOffset] = useState(0);
  const [metric, setMetric] = useState<'master' | 'business'>('master');
  const [form, setForm] = useState<'register' | 'login'>('register');
  const [name, setName] = useState(''),
    [username, setUsername] = useState(''),
    [password, setPassword] = useState('');
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [stats, setStats] = useState<
    { mode: GameMode; best: number; business_best: number; attempts: number; passed: number }[]
  >([]);
  const requestId = useRef(0);
  const refresh = useCallback(async () => {
    if (!login) return;
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const [r, me] = await Promise.all([
        rankingApi<Ranking>(`/rankings?mode=${mode}&metric=${metric}&offset=${offset}`, login),
        rankingApi<{ stats: typeof stats }>('/me', login),
      ]);
      if (currentRequest !== requestId.current) return;
      setRanking(r);
      setStats(me.stats);
    } catch (e) {
      if (currentRequest !== requestId.current) return;
      setError((e as Error).message);
      if (e instanceof RankingError && e.status === 401) {
        storeLogin(null);
        onLogin(null);
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [login, mode, metric, offset, onLogin]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 30000);
    return () => {
      requestId.current++;
      clearInterval(timer);
    };
  }, [refresh]);
  return (
    <main className="training-home training-ranking-screen">
      <div className="training-container">
        <button type="button" className="training-back" onClick={onBack}>
          メニュー
        </button>
        <header className="training-title">
          <span className="training-eyebrow">COFFEE LEAGUE</span>
          <h1>みんなのランキング</h1>
          <p>モード別の自己ベスト。名前と記録を、みんなで共有。</p>
        </header>
        {!login ? (
          <section className="training-panel ranking-register">
            <div className="training-history-filters" role="group" aria-label="アカウント操作">
              {(['register', 'login'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={form === v}
                  onClick={() => {
                    setForm(v);
                    setError('');
                  }}
                >
                  {v === 'register' ? '新しく登録' : 'ログイン'}
                </button>
              ))}
            </div>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                setError('');
                try {
                  const value = await rankingApi<Login>(`/${form}`, null, {
                    username,
                    password,
                    ...(form === 'register' ? { displayName: name } : {}),
                  });
                  storeLogin(value);
                  onLogin(value);
                  setPassword('');
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {form === 'register' && (
                <label>
                  表示名
                  <input
                    required
                    maxLength={30}
                    autoComplete="nickname"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              )}
              <label>
                ユーザー名
                <input
                  required
                  minLength={3}
                  maxLength={20}
                  pattern="[a-zA-Z0-9_]+"
                  autoComplete="username"
                  placeholder="半角英数・_で3〜20文字"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>
              <label>
                パスワード
                <input
                  required
                  type="password"
                  minLength={8}
                  maxLength={128}
                  autoComplete={form === 'register' ? 'new-password' : 'current-password'}
                  placeholder="8文字以上"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <p>表示名・ユーザー名・スコアは、登録した人に公開されます。</p>
              <button type="submit" className="training-primary" disabled={busy}>
                {busy ? '接続中…' : form === 'register' ? '登録して見る' : 'ログインして見る'}
              </button>
            </form>
          </section>
        ) : (
          <>
            <div className="ranking-account">
              <strong>
                {login.player.displayName} <small>@{login.player.username}</small>
              </strong>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await rankingApi('/logout', login, {});
                  } catch {
                    setError('この端末からログアウトしました。');
                  } finally {
                    storeLogin(null);
                    onLogin(null);
                    setRanking(null);
                  }
                }}
              >
                ログアウト
              </button>
              <ScoreRules />
            </div>
            <div className="training-history-filters" role="group" aria-label="ランキングの種類">
              {(['master', 'business'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={metric === key}
                  onClick={() => {
                    setMetric(key);
                    setOffset(0);
                    setRanking(null);
                  }}
                >
                  {key === 'master' ? 'マスター評価 / 100' : '営業スコア'}
                </button>
              ))}
            </div>
            <div className="ranking-stats">
              {(Object.keys(MODES) as GameMode[]).map((key) => {
                const s = stats.find((v) => v.mode === key);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={mode === key}
                    onClick={() => {
                      setMode(key);
                      setOffset(0);
                      setRanking(null);
                    }}
                  >
                    <span>{MODES[key].label}</span>
                    <strong>
                      {metric === 'master' ? (s?.best ?? '—') : (s?.business_best?.toLocaleString() ?? '—')}
                      <small>{metric === 'master' ? '点' : 'pt'}</small>
                    </strong>
                    <small>
                      {s?.attempts ?? 0}回 / 合格{s?.passed ?? 0}回
                    </small>
                  </button>
                );
              })}
            </div>
            <section className="ranking-board training-panel">
              <div className="ranking-board-heading">
                <h2>{MODES[mode].label}</h2>
                <span>{ranking?.totalPlayers ?? 0}人</span>
                <button type="button" disabled={loading} onClick={() => void refresh()}>
                  {loading ? '更新中…' : '更新'}
                </button>
              </div>
              <div className="ranking-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>順位</th>
                      <th>名前</th>
                      <th>マスター</th>
                      <th>営業</th>
                      <th>完了</th>
                      <th>挑戦</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking?.players.map((row) => (
                      <tr key={row.player_id} data-self={row.player_id === login.player.id}>
                        <td>{row.rank}</td>
                        <td>
                          <strong>{row.display_name}</strong>
                          <small>
                            @{row.username}
                            {row.player_id === login.player.id ? ' / あなた' : ''}
                          </small>
                        </td>
                        <td>
                          <b>{row.score}</b>
                          <small>{row.passed ? '合格' : '練習中'}</small>
                        </td>
                        <td>
                          <b>
                            {row.business_score.toLocaleString()}
                            <small>pt</small>
                          </b>
                          <small>売上 ¥{row.revenue.toLocaleString()}</small>
                        </td>
                        <td>
                          {row.done}/{row.total}杯
                        </td>
                        <td>{row.attempts}回</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!loading && ranking?.players.length === 0 && <p>まだ記録がありません。最初の挑戦をどうぞ。</p>}
              </div>
              {(ranking?.totalPlayers ?? 0) > 100 && (
                <div className="ranking-pagination">
                  <button
                    type="button"
                    disabled={offset === 0 || loading}
                    onClick={() => setOffset(Math.max(0, offset - 100))}
                  >
                    前へ
                  </button>
                  <span>
                    {offset + 1}〜{Math.min(offset + 100, ranking?.totalPlayers ?? 0)}位
                  </span>
                  <button
                    type="button"
                    disabled={offset + 100 >= (ranking?.totalPlayers ?? 0) || loading}
                    onClick={() => setOffset(offset + 100)}
                  >
                    次へ
                  </button>
                </div>
              )}
            </section>
            {readPending().some((p) => p.playerId === login.player.id) && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const { skipped } = await syncRuns(login);
                    await refresh();
                    if (skipped) setError('期限切れなどで共有できない記録があります。端末の履歴は残っています。');
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                未送信の記録を送る
              </button>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="training-error">
            {error}
          </p>
        )}
        <footer className="training-actionbar">
          <p>選んだ指標の自己ベスト。同点は同順位。30秒ごとに更新。</p>
          <button type="button" className="training-primary" onClick={onGame}>
            ゲームに挑戦
          </button>
        </footer>
      </div>
    </main>
  );
}
