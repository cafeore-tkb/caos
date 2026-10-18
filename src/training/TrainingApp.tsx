import { ArrowLeft, Check, Download, FileJson, Flag, Gamepad2, Pause, Play, RotateCcw, Trophy, X } from 'lucide-react';
import { useEffect, useReducer, useRef, useState } from 'react';
import { CONTROL_VIEWS, type ControlViewMode, ControlWorkspace } from '../components/ControlWorkspace';
import type { OrderTicket } from '../types';
import {
  type GameMode,
  type GameState,
  gameReducer,
  MODES,
  parseScenario,
  type Scenario,
  scoreGame,
  startGame,
} from './engine';
import { itemAbbr, needsBrew } from './master';
import './training.css';

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const scenarioUrl = (mode: GameMode) => `${import.meta.env.BASE_URL}training/${mode}.json`;
type HistoryEntry = { mode: GameMode; score: number; at: string };
const readHistory = (): HistoryEntry[] => {
  try {
    const value = JSON.parse(localStorage.getItem('caos-training-results-v1') ?? '[]');
    return Array.isArray(value)
      ? value.filter(
          (entry) =>
            entry &&
            Object.hasOwn(MODES, entry.mode) &&
            Number.isFinite(entry.score) &&
            entry.score >= 0 &&
            entry.score <= 100
        )
      : [];
  } catch {
    return [];
  }
};

export default function TrainingApp() {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [mode, setMode] = useState<GameMode>('fast');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(readHistory);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setScenario(null);
    fetch(scenarioUrl(mode), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('シナリオを読み込めませんでした');
        return response.json();
      })
      .then((data) => setScenario(parseScenario(data)))
      .catch((cause) => {
        if (!controller.signal.aborted) setError(String(cause.message));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [mode]);
  const saveResult = (state: GameState) => {
    const next = [
      ...readHistory(),
      { mode: state.scenario.mode, score: scoreGame(state).score, at: new Date().toISOString() },
    ].slice(-30);
    setHistory(next);
    try {
      localStorage.setItem('caos-training-results-v1', JSON.stringify(next));
    } catch {
      /* Results remain visible if storage is full. */
    }
  };
  if (playing && scenario)
    return <GameSession scenario={scenario} onBack={() => setPlaying(false)} onFinish={saveResult} />;
  const dripCups =
    scenario?.orders.reduce(
      (sum, order) =>
        sum +
        order.items.filter((item) => needsBrew(item.name)).reduce((subtotal, item) => subtotal + item.quantity, 0),
      0
    ) ?? 0;
  return (
    <main className="training-home">
      <div className="training-container">
        <a className="training-back" href="#control">
          <ArrowLeft size={16} />
          管制盤に戻る
        </a>
        <header className="training-title">
          <span className="training-eyebrow">
            <Gamepad2 size={18} />
            CaOS TRAINING
          </span>
          <h1>店舗を回す、その判断を練習する。</h1>
          <p>
            実際のマスターシートと同じ配置で、注文の割当から抽出完了まで。
            <br />
            80点が、店舗運営を任せられる操作の目安です。
          </p>
        </header>
        <div className="training-mode-grid" role="group" aria-label="ゲームモード">
          {(Object.keys(MODES) as GameMode[]).map((key, index) => {
            const config = MODES[key];
            const attempts = history.filter((entry) => entry.mode === key);
            const best = Math.max(0, ...attempts.map((entry) => entry.score));
            return (
              <button
                key={key}
                type="button"
                aria-pressed={mode === key}
                className={`training-mode ${mode === key ? 'is-selected' : ''}`}
                onClick={() => setMode(key)}
              >
                <span className="training-mode-top">
                  <span>
                    0{index + 1} / {config.target}
                  </span>
                  {mode === key && <Check size={20} />}
                </span>
                <strong>{config.label}</strong>
                <p>{config.description}</p>
                <span className="training-mode-meta">
                  営業 {config.durationSec / 60}分 · {config.count}件 · 標準2倍速
                </span>
                <small>{attempts.length > 0 ? `自己ベスト ${best}点` : '未挑戦'}</small>
              </button>
            );
          })}
        </div>
        <div className="training-setup-grid">
          <section className="training-panel">
            <h2>
              <FileJson size={18} />
              今回のオーダー
            </h2>
            <p>添付マスターの12商品を使う架空の注文です。アイスミルク・物販は抽出対象から外します。</p>
            <div className="training-data-summary">
              {loading
                ? '読み込み中…'
                : scenario
                  ? `${scenario.orders.length}件 / 抽出 ${dripCups}杯 / 営業 ${scenario.durationSec / 60}分`
                  : 'データを読み込めません'}
            </div>
            {scenario && (
              <details>
                <summary>注文の内容を見る</summary>
                <ol className="training-order-preview">
                  {scenario.orders.map((order) => (
                    <li key={order.orderId}>
                      <b>
                        #{String(order.orderId).padStart(3, '0')} <time>{clock(order.atSec)}</time>
                      </b>
                      <span>
                        {order.items
                          .map(
                            (item) =>
                              `${itemAbbr(item.name)} ×${item.quantity}${item.nominee ? `（${item.nominee}番指名）` : ''}`
                          )
                          .join(' / ')}
                      </span>
                    </li>
                  ))}
                </ol>
              </details>
            )}
            <div className="training-data-actions">
              <a href={scenarioUrl(mode)} download={`${mode}-orders.json`}>
                <Download size={16} />
                標準JSON
              </a>
              <button type="button" onClick={() => fileRef.current?.click()}>
                <FileJson size={16} />
                JSONを読み込む
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              aria-label="ダミーオーダーJSON"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                try {
                  if (file.size > 1_000_000) throw new Error('JSONは1MB以内にしてください');
                  const parsed = parseScenario(JSON.parse(await file.text()));
                  if (parsed.mode !== mode) throw new Error('選択したモードとJSONのmodeを合わせてください');
                  setScenario(parsed);
                  setError('');
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : 'JSONを確認してください');
                }
              }}
            />
            {error && (
              <p role="alert" className="training-error">
                {error}
              </p>
            )}
          </section>
          <section className="training-panel">
            <h2>
              <Trophy size={18} />
              80点の基準
            </h2>
            <p>仕上げた杯数45点・8分以内の準備25点・抽出品質20点・同一注文の仕上がり10点。</p>
            <p className="training-criteria">
              80点以上には、全抽出杯の90%以上を完了、完了杯の95%以上で予定抽出時間の90%以上を確保、指名・上級生条件の違反ゼロが必要です。
            </p>
            <p>
              一時停止中は操作も停止。終了時は未到着を含む全注文が採点対象です。各モードの80点はその課題の達成目安で、総合判断はフルで確認できます。
            </p>
          </section>
        </div>
        <footer className="training-start-row">
          <p>
            未割当の注文を選択 → 担当者へ割当 →
            空の列では自動で抽出開始。残り時間を見てカードの✓で完了します。A・Cはいつでも切り替えできます。
            <br />
            同じ商品の1杯同士は、指名条件が矛盾しなければ統合できます。限定豆は上級生の1・6番へ。
          </p>
          <button
            type="button"
            className="training-primary"
            disabled={loading || !scenario}
            onClick={() => setPlaying(true)}
          >
            <Play size={18} />
            {MODES[mode].label}を始める
          </button>
        </footer>
      </div>
    </main>
  );
}

function GameSession({
  scenario,
  onBack,
  onFinish,
}: {
  scenario: Scenario;
  onBack: () => void;
  onFinish: (state: GameState) => void;
}) {
  const [state, dispatch] = useReducer(gameReducer, scenario, startGame);
  const [speed, setSpeed] = useState(2);
  const [viewMode, setViewMode] = useState<ControlViewMode>('current');
  const [timelineCommand, setTimelineCommand] = useState<{ direction: 'back' | 'now' | 'forward'; id: number } | null>(
    null
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [endOpen, setEndOpen] = useState(false);
  const [emptyBay, setEmptyBay] = useState<number | null>(null);
  const saved = useRef(false);
  const [exportError, setExportError] = useState('');
  const [remakeReason, setRemakeReason] = useState('');
  const [remakeCount, setRemakeCount] = useState('');
  const [remakeTarget, setRemakeTarget] = useState('');
  const [remakeInterrupt, setRemakeInterrupt] = useState('');
  useEffect(() => {
    if (state.status !== 'active' || state.paused || endOpen) return;
    let previous = performance.now();
    let remainder = 0;
    const timer = window.setInterval(() => {
      const now = performance.now();
      remainder += ((now - previous) / 1000) * speed;
      previous = now;
      const seconds = Math.floor(remainder);
      if (seconds > 0) {
        remainder -= seconds;
        dispatch({ type: 'tick', seconds });
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [state.status, state.paused, speed, endOpen]);
  useEffect(() => {
    if (state.status === 'finished' && !saved.current) {
      saved.current = true;
      onFinish(state);
    }
  }, [state, onFinish]);
  const result = scoreGame(state);
  const detail = detailKey
    ? state.bays
        .flatMap((bay) => [...bay.queue, ...(bay.pastTickets ?? [])])
        .find((ticket) => ticket.ticketUid === detailKey)
    : null;
  const downloadResult = () => {
    try {
      const blob = new Blob(
        [
          JSON.stringify(
            {
              schemaVersion: 1,
              scenario: state.scenario,
              result,
              elapsedSec: state.nowSec,
              cups: Object.values(state.cups),
              events: state.events,
            },
            null,
            2
          ),
        ],
        { type: 'application/json' }
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `caos-${scenario.mode}-result.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setExportError('結果JSONを保存できませんでした');
    }
  };
  if (state.status === 'finished')
    return (
      <main className="training-home">
        <div className="training-container training-results">
          <span className="training-eyebrow">
            <Flag size={18} />
            {MODES[scenario.mode].label} / RESULT
          </span>
          <h1>今回の運営結果</h1>
          <div className={`training-score ${result.passed ? 'passed' : ''}`}>
            <strong>
              {result.score}
              <small> / 100</small>
            </strong>
            <span>{result.label}</span>
          </div>
          <p>
            経過 {clock(state.nowSec)} / {clock(scenario.durationSec)} · 完了 {result.done}/{result.total}杯 · 品質OK{' '}
            {result.quality}杯
          </p>
          <div className="training-result-grid">
            {result.categories.map((category) => (
              <section className="training-panel" key={category.label}>
                <h2>{category.label}</h2>
                <strong className="training-category-score">
                  {category.points.toFixed(1)} <small>/ {category.max}</small>
                </strong>
                <progress value={category.points} max={category.max} />
                <p>{category.detail}</p>
              </section>
            ))}
          </div>
          <section className="training-panel">
            <h2>次に意識すること</h2>
            <ul>
              {result.feedback.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {result.penalties > 0 && (
              <p className="training-error">
                条件違反 {state.violations}回：−{result.penalties}点
              </p>
            )}
            {!result.ready && <p>80点の必須条件に届いていないため、得点の上限は79点です。</p>}
            <p>80点以上：店舗運営を任せられる操作レベル。フルモードで総合的に確認できます。</p>
          </section>
          <details className="training-panel">
            <summary>操作の記録（{state.events.length}件）</summary>
            <ol className="training-event-log">
              {state.events.map((event) => (
                <li key={event.id}>
                  <time>{clock(event.atSec)}</time> {event.message}
                </li>
              ))}
            </ol>
          </details>
          {exportError && <p role="alert">{exportError}</p>}
          <div className="training-result-actions">
            <button type="button" className="training-primary" onClick={onBack}>
              <RotateCcw size={18} />
              モードを選んで再挑戦
            </button>
            <button type="button" onClick={downloadResult}>
              <Download size={18} />
              結果JSONを保存
            </button>
            <a href="#control">
              <ArrowLeft size={18} />
              管制盤に戻る
            </a>
          </div>
        </div>
      </main>
    );
  const openDetail = (ticket: OrderTicket) => {
    setRemakeReason('');
    setRemakeCount('');
    setRemakeTarget('');
    setRemakeInterrupt('');
    setDetailKey(ticket.ticketUid ?? null);
  };
  return (
    <div className="training-game">
      <header className="training-game-header">
        <div>
          <span className="training-eyebrow">CaOS TRAINING</span>
          <h1>{MODES[scenario.mode].label}</h1>
        </div>
        <nav className="training-view-switch" aria-label="管制盤の表示切替">
          {(Object.keys(CONTROL_VIEWS) as ControlViewMode[]).map((mode) => (
            <button type="button" key={mode} aria-pressed={viewMode === mode} onClick={() => setViewMode(mode)}>
              {CONTROL_VIEWS[mode]}
            </button>
          ))}
        </nav>
        <div className="training-countdown">
          <small>残り</small>
          <b>{clock(scenario.durationSec - state.nowSec)}</b>
        </div>
        <div className="training-game-counts">
          <b>
            {state.arrived.length}/{scenario.orders.length}件 到着
          </b>
          <span>
            完了 {result.done}/{result.total}杯
          </span>
        </div>
        <div className="training-game-controls">
          <button
            type="button"
            onClick={() => dispatch({ type: 'pause' })}
            aria-label={state.paused ? '再開' : '一時停止'}
          >
            {state.paused ? <Play size={18} /> : <Pause size={18} />}
          </button>
          <label>
            速度
            <select aria-label="ゲーム速度" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
              {[1, 2, 5, 10].map((value) => (
                <option key={value} value={value}>
                  {value}倍
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => setEndOpen(true)}>
            <Flag size={16} />
            終了・採点
          </button>
        </div>
      </header>
      <div className="training-progress">
        <div style={{ width: `${(100 * state.nowSec) / scenario.durationSec}%` }} />
      </div>
      {viewMode === 'current' && (
        <div className="training-timeline-controls">
          <button type="button" onClick={() => setTimelineCommand({ direction: 'now', id: performance.now() })}>
            現在
          </button>
        </div>
      )}
      <div className="training-game-hint">
        <span>80点が合格の目安 · 限定豆は1・6番 · ▶で開始・✓で完了</span>
        <span role="status">{state.notice || '未割当の注文カードを選んで、担当者へ割り当ててください'}</span>
      </div>
      <div className="training-board">
        <ControlWorkspace
          mode={viewMode}
          actionTicketKey={null}
          nextAvailable={state.bays
            .map((bay) => ({
              bayNumber: bay.id,
              seconds: bay.queue.reduce((sum, card) => sum + (card.timeRemainingSec ?? card.totalDurationSec), 0),
              isStandby: bay.queue.length === 0,
            }))
            .sort((a, b) => a.seconds - b.seconds)
            .slice(0, 3)}
          timelineCommand={timelineCommand}
          onCloseTicketAction={() => setDetailKey(null)}
          baristas={state.bays}
          unassignedOrders={state.unassigned}
          currentTimeSec={state.nowSec}
          clockOriginMs={Date.UTC(2026, 9, 19, 1)}
          onUnstartBay={(bayId) => dispatch({ type: 'unstart', bayId })}
          onSplitCup={(key, cupId) => dispatch({ type: 'split', key, cupId })}
          selectedOrderId={selected}
          onSelectOrder={(id) => setSelected(id || null)}
          onAdvanceBay={(bayId) =>
            dispatch({
              type: state.bays.find((bay) => bay.id === bayId)?.queue[0]?.status === 'brewing' ? 'complete' : 'start',
              bayId,
            })
          }
          onOpenTicketDetail={openDetail}
          onOpenEmptySlot={(bayId) => setEmptyBay(bayId)}
          onAssignToBay={(card, bayId, place) =>
            dispatch({ type: 'assign', key: card.ticketUid ?? card.id, bayId, place })
          }
          onRequestRebrew={openDetail}
          onMoveTicket={(card, bayId, place) =>
            dispatch({ type: 'move', key: card.ticketUid ?? card.id, bayId, place })
          }
          onReturnToUnassigned={(card) => dispatch({ type: 'return', key: card.ticketUid ?? card.id })}
          onMergeOrders={(first, second) => dispatch({ type: 'merge', first, second })}
        />
      </div>
      {emptyBay !== null && (
        <aside className="training-ticket-panel" aria-label="未割当を選んで配置">
          <button type="button" className="training-close" onClick={() => setEmptyBay(null)} aria-label="配置を閉じる">
            <X size={20} />
          </button>
          <h2>{emptyBay}番へ配置</h2>
          <p>割り当てる未割当カードを選んでください。</p>
          <div className="flex flex-col gap-2">
            {state.unassigned.length === 0 ? (
              <p>未割当の注文はありません</p>
            ) : (
              state.unassigned.map((card) => (
                <button
                  type="button"
                  key={card.ticketUid}
                  onClick={() => {
                    dispatch({ type: 'assign', key: card.ticketUid ?? card.id, bayId: emptyBay });
                    setEmptyBay(null);
                  }}
                >
                  {card.id} {itemAbbr(card.beanName)} {card.cupCount}杯
                  {card.preferredBaristaId ? ` / ${card.preferredBaristaId}番指名` : ''}
                </button>
              ))
            )}
          </div>
        </aside>
      )}
      {detail && (
        <aside className="training-ticket-panel" aria-label="カードの操作">
          <button
            type="button"
            className="training-close"
            onClick={() => setDetailKey(null)}
            aria-label="カードの操作を閉じる"
          >
            <X size={20} />
          </button>
          <h2>
            {detail.id} {itemAbbr(detail.beanName)}
          </h2>
          <p>
            {detail.cupCount}杯 ·{' '}
            {detail.status === 'completed'
              ? '完了済み'
              : detail.status === 'brewing'
                ? '抽出中。移動すると抽出時間をリセットします。'
                : '待機中'}
          </p>
          <details className="my-4 rounded border border-red-200 p-3">
            <summary className="text-sm font-black text-red-800">緊急の入れ直し</summary>
            <div className="mt-3 flex flex-col gap-2 text-xs">
              <label>
                理由
                <select
                  aria-label="入れ直しの理由"
                  value={remakeReason}
                  onChange={(event) => setRemakeReason(event.target.value)}
                  className="mt-1 w-full rounded border p-2"
                >
                  <option value="">選択してください</option>
                  {['こぼれ', '抽出ミス', '異物混入', 'その他'].map((reason) => (
                    <option key={reason}>{reason}</option>
                  ))}
                </select>
              </label>
              <label>
                杯数
                <select
                  aria-label="入れ直しの杯数"
                  value={remakeCount}
                  onChange={(event) => setRemakeCount(event.target.value)}
                  className="mt-1 w-full rounded border p-2"
                >
                  <option value="">選択してください</option>
                  {Array.from({ length: detail.cupCount }, (_, index) => index + 1).map((count) => (
                    <option key={count} value={count}>
                      {count}杯
                    </option>
                  ))}
                </select>
              </label>
              <label>
                割当先
                <select
                  aria-label="入れ直しの割当先"
                  value={remakeTarget}
                  onChange={(event) => setRemakeTarget(event.target.value)}
                  className="mt-1 w-full rounded border p-2"
                >
                  <option value="">選択してください</option>
                  <option value="unassigned">未割当へ</option>
                  {state.bays.map((bay) => (
                    <option key={bay.id} value={bay.id}>
                      {bay.id}番 {bay.name}
                    </option>
                  ))}
                </select>
              </label>
              {detail.status === 'brewing' && (
                <label>
                  現在の抽出
                  <select
                    aria-label="現在の抽出の扱い"
                    value={remakeInterrupt}
                    onChange={(event) => setRemakeInterrupt(event.target.value)}
                    className="mt-1 w-full rounded border p-2"
                  >
                    <option value="">選択してください</option>
                    <option value="interrupt">中断する</option>
                    <option value="continue">続ける</option>
                  </select>
                </label>
              )}
              <button
                type="button"
                disabled={
                  !remakeReason || !remakeCount || !remakeTarget || (detail.status === 'brewing' && !remakeInterrupt)
                }
                onClick={() => {
                  dispatch({
                    type: 'rebrew',
                    key: detail.ticketUid ?? detail.id,
                    cupCount: Number(remakeCount),
                    bayId: remakeTarget === 'unassigned' ? null : Number(remakeTarget),
                    interrupt: remakeInterrupt === 'interrupt',
                    reason: remakeReason,
                  });
                  setDetailKey(null);
                  setRemakeReason('');
                  setRemakeCount('');
                  setRemakeTarget('');
                  setRemakeInterrupt('');
                }}
              >
                この内容で入れ直す
              </button>
            </div>
          </details>
          {detail.status !== 'completed' && (
            <>
              <h3>担当者を変更</h3>
              <div className="training-bay-actions">
                {state.bays.map((bay) => (
                  <button
                    type="button"
                    key={bay.id}
                    disabled={detail.preferredBaristaId !== undefined && detail.preferredBaristaId !== bay.id}
                    onClick={() => {
                      dispatch({ type: 'move', key: detail.ticketUid ?? detail.id, bayId: bay.id });
                      setDetailKey(null);
                    }}
                  >
                    {bay.id}番{bay.canHandleSpecial ? ' ★' : ''}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  dispatch({ type: 'return', key: detail.ticketUid ?? detail.id });
                  setDetailKey(null);
                }}
              >
                未割当に戻す
              </button>
            </>
          )}
          <p>★は上級生。限定豆は1・6番へ。条件違反の操作は受け付けず、記録に残ります。</p>
        </aside>
      )}
      {state.paused && (
        <div className="training-paused">
          <Pause size={32} />
          <h2>一時停止中</h2>
          <p>時計・注文到着・抽出・操作を止めています</p>
          <button type="button" className="training-primary" onClick={() => dispatch({ type: 'pause' })}>
            <Play size={18} />
            再開する
          </button>
        </div>
      )}
      {endOpen && (
        <div className="training-dialog-backdrop">
          <section role="dialog" aria-modal="true" aria-labelledby="finish-title" className="training-dialog">
            <h2 id="finish-title">ここで終了して採点しますか？</h2>
            <p>
              完了 {result.done}/{result.total}杯。未到着・未完了の杯も0点として採点します。
            </p>
            <div>
              <button type="button" onClick={() => setEndOpen(false)}>
                練習を続ける
              </button>
              <button type="button" className="training-primary" onClick={() => dispatch({ type: 'finish' })}>
                終了して採点
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
