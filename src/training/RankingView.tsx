import { useCallback, useEffect, useRef, useState } from 'react';
import { type GameMode, MODES } from './engine';
import { GradeBadge } from './GradeBadge';
import type { GradeAssessment } from './grades';
import { type DeviceSession, type Ranking, rankingApi, readDisplayName, readPending, syncRuns } from './rankingClient';
import { ScoreRules } from './ScoreRules';

export function RankingView({
  session,
  onBack,
  onGame,
}: {
  session: DeviceSession | null;
  onBack: () => void;
  onGame: () => void;
}) {
  const [mode, setMode] = useState<GameMode>('fast');
  const [offset, setOffset] = useState(0);
  const [metric, setMetric] = useState<'master' | 'business'>('master');
  const [lastName] = useState(readDisplayName);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [stats, setStats] = useState<
    {
      mode: GameMode;
      best: number;
      business_best: number;
      attempts: number;
      passed: number;
      assessment: GradeAssessment;
    }[]
  >([]);
  const requestId = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const [r, profile] = await Promise.all([
        rankingApi<Ranking>(
          `/rankings?mode=${mode}&metric=${metric}&offset=${offset}${lastName ? `&name=${encodeURIComponent(lastName)}` : ''}`,
          null
        ),
        lastName
          ? rankingApi<{ stats: typeof stats }>(`/profile?name=${encodeURIComponent(lastName)}`, null)
          : Promise.resolve({ stats: [] }),
      ]);
      if (current !== requestId.current) return;
      setRanking(r);
      setStats(profile.stats);
    } catch (cause) {
      if (current === requestId.current) setError((cause as Error).message);
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [mode, metric, offset, lastName]);
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
          <p>プレイ前に名前を入力すると、結果が自動で載ります。</p>
        </header>
        <div className="ranking-account">
          <span>{lastName ? `前回の表示名：${lastName}` : '表示名だけで参加できます。'}</span>
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
                  {s && metric === 'master' && <GradeBadge score={s.best} assessment={s.assessment} />}{' '}
                  {s?.attempts ?? 0}回 / 運営目安クリア{s?.passed ?? 0}回
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
                  <th>{mode === 'full' ? '完了見込' : '完了'}</th>
                  <th>挑戦</th>
                </tr>
              </thead>
              <tbody>
                {ranking?.players.map((row) => (
                  <tr key={row.player_id} data-self={row.display_name === lastName}>
                    <td>{row.rank}</td>
                    <td>
                      <strong>{row.display_name}</strong>
                      {row.display_name === lastName && <small>前回の表示名</small>}
                    </td>
                    <td>
                      <b>{row.score}</b>
                      <GradeBadge score={row.score} assessment={row.assessment} />
                      <small>{row.passed ? '運営目安クリア' : '運営目安は80点'}</small>
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
        {session && readPending().some((p) => p.playerId === session?.player.id) && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const { skipped } = await syncRuns(session);
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

        {error && (
          <p role="alert" className="training-error">
            {error}
          </p>
        )}
        <footer className="training-actionbar">
          <p>同じ表示名の自己ベスト。30秒ごとに更新。</p>
          <button type="button" className="training-primary" onClick={onGame}>
            ゲームに挑戦
          </button>
        </footer>
      </div>
    </main>
  );
}
