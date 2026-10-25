import {
  ArrowLeft,
  BookOpen,
  Check,
  Download,
  FileJson,
  Flag,
  Gamepad2,
  Pause,
  Play,
  RotateCcw,
  Search,
  Trophy,
} from 'lucide-react';
import { useEffect, useReducer, useRef, useState } from 'react';
import { CONTROL_VIEWS, type ControlViewMode, ControlWorkspace } from '../components/ControlWorkspace';
import { SidePanel } from '../current-caos/bridge/SidePanel';
import type { OrderTicket } from '../types';
import { trainingComments } from './comments';
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
import { itemAbbr, needsBrew, seniorOnly } from './master';
import './training.css';
import './screens.css';

const TRAINING_CLOCK_ORIGIN = Date.UTC(2026, 9, 19, 1);
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const scenarioUrl = (mode: GameMode) => `${import.meta.env.BASE_URL}training/${mode}.json`;

import { HistoryView } from './HistoryView';
import { COURSE_KEY, createResult, saveResult as persistResult, readCourse, readHistory } from './history';
import { TutorialOverlay } from './TutorialOverlay';
import { LESSONS, type Lesson } from './tutorial';

export default function TrainingApp() {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [mode, setMode] = useState<GameMode>('fast');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [history, setHistory] = useState(readHistory);
  const [page, setPage] = useState<'learn' | 'game' | 'history'>('learn');
  const [lessonIndex, setLessonIndex] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [completed, setCompleted] = useState(readCourse);
  const [storageError, setStorageError] = useState('');
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
    const saved = persistResult(createResult(state));
    setHistory(saved.entries);
    setStorageError(saved.saved ? '' : '保存できません。結果JSONを保存してください。');
  };
  if (lessonIndex !== null)
    return (
      <GameSession
        key={`${lessonIndex}-${attempt}`}
        scenario={LESSONS[lessonIndex].setup().scenario}
        lesson={LESSONS[lessonIndex]}
        lessonNumber={lessonIndex + 1}
        onBack={() => setLessonIndex(null)}
        onFinish={() => {}}
        onRetry={() => setAttempt((value) => value + 1)}
        onLessonNext={() => {
          const next = [...new Set([...completed, LESSONS[lessonIndex].id])];
          setCompleted(next);
          try {
            localStorage.setItem(COURSE_KEY, JSON.stringify(next));
          } catch {
            setStorageError('進捗を保存できません。このまま続けられます。');
          }
          if (lessonIndex + 1 === LESSONS.length) {
            setLessonIndex(null);
            setPage('game');
          } else setLessonIndex(lessonIndex + 1);
        }}
      />
    );
  if (playing && scenario)
    return (
      <GameSession
        scenario={scenario}
        onBack={() => setPlaying(false)}
        onFinish={saveResult}
        storageError={storageError}
        onHistory={() => {
          setPlaying(false);
          setPage('history');
        }}
      />
    );
  if (page === 'history')
    return <HistoryView entries={history} onBack={() => setPage('learn')} onGame={() => setPage('game')} />;
  if (page === 'learn')
    return (
      <main className="training-home training-dashboard">
        <div className="training-container">
          <a className="training-back" href="#control">
            <ArrowLeft size={16} />
            管制盤に戻る
          </a>
          <header className="training-title">
            <span className="training-eyebrow">
              <BookOpen size={18} />
              CaOS LEARNING
            </span>
            <h1>CaOSを練習する</h1>
            <p>操作を覚える → ゲームに挑戦 → 記録を見る</p>
          </header>
          <section className="training-course-intro training-panel">
            <div>
              <h2>
                <BookOpen size={20} />
                操作チュートリアル
              </h2>
              <p>全{LESSONS.length}レッスン。時計は手動です。</p>
              <b>
                {LESSONS.filter((lesson) => completed.includes(lesson.id)).length} / {LESSONS.length} 完了
              </b>
            </div>
          </section>
          <ol className="training-curriculum">
            {LESSONS.map((lesson, index) => (
              <li key={lesson.id}>
                <button type="button" onClick={() => setLessonIndex(index)}>
                  <span className={`training-lesson-number ${completed.includes(lesson.id) ? 'done' : ''}`}>
                    {completed.includes(lesson.id) ? <Check size={20} /> : String(index + 1).padStart(2, '0')}
                  </span>
                  <span>
                    <strong>{lesson.title}</strong>
                    <small>{lesson.description}</small>
                  </span>
                  <span aria-hidden="true">→</span>
                </button>
              </li>
            ))}
          </ol>
          {storageError && (
            <p role="alert" className="training-error">
              {storageError}
            </p>
          )}
          <footer className="training-actionbar training-menu-actions" aria-label="練習メニューの操作">
            <button
              type="button"
              className="training-primary"
              onClick={() =>
                setLessonIndex(
                  Math.max(
                    0,
                    LESSONS.findIndex((lesson) => !completed.includes(lesson.id))
                  )
                )
              }
            >
              <Play size={18} />
              {LESSONS.every((lesson) => completed.includes(lesson.id))
                ? '最初から'
                : completed.length
                  ? '続きから'
                  : '練習を始める'}
            </button>
            <button type="button" className="training-secondary" onClick={() => setPage('game')}>
              <Gamepad2 size={24} />
              ゲームへ
            </button>
            <button type="button" className="training-secondary" onClick={() => setPage('history')}>
              <Trophy size={24} />
              記録を見る
            </button>
          </footer>
        </div>
      </main>
    );
  const dripCups =
    scenario?.orders.reduce(
      (sum, order) =>
        sum +
        order.items.filter((item) => needsBrew(item.name)).reduce((subtotal, item) => subtotal + item.quantity, 0),
      0
    ) ?? 0;
  return (
    <main className="training-home training-setup-screen">
      <div className="training-container">
        <div className="training-menu-nav">
          <button type="button" className="training-back" onClick={() => setPage('learn')}>
            <ArrowLeft size={16} />
            メニュー
          </button>
          <button type="button" className="training-secondary" onClick={() => setPage('history')}>
            <Trophy size={16} />
            スコア履歴
          </button>
        </div>
        <header className="training-title">
          <span className="training-eyebrow">
            <Gamepad2 size={18} />
            CaOS TRAINING
          </span>
          <h1>ゲームモード</h1>
          <p>80点以上で「店舗運営を任せられるレベル」。</p>
        </header>
        {LESSONS.every((lesson) => completed.includes(lesson.id)) && (
          <p className="training-course-done">
            <Check size={16} />
            練習完了。ゲームに挑戦！
          </p>
        )}
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
              注文データ
            </h2>
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
            <div className="training-data-summary">
              {loading
                ? '読み込み中…'
                : scenario
                  ? `${scenario.orders.length}件 / 抽出 ${dripCups}杯 / 営業 ${scenario.durationSec / 60}分`
                  : 'データを読み込めません'}
            </div>
            {scenario && (
              <p className="training-data-mix">
                指名 {scenario.orders.filter((order) => order.items.some((item) => item.nominee)).length}件 · 上級生限定{' '}
                {scenario.orders.filter((order) => order.items.some((item) => seniorOnly(item.name))).length}件 ·
                コメント {scenario.orders.filter((order) => order.comments?.length).length}件
              </p>
            )}
            {MODES[mode].emergencyChances > 0 && (
              <p className="training-data-mix">
                緊急淹れ直し：{MODES[mode].emergencyChances === 1 ? '50%の確率で1件' : '50%×2回・最大2件'}
                。抽出75%で通知。
              </p>
            )}
            {scenario && (
              <details>
                <summary>注文を見る</summary>
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
                      {order.comments?.map((comment) => (
                        <small className="training-preview-comment" key={comment}>
                          💬 {comment}
                        </small>
                      ))}
                    </li>
                  ))}
                </ol>
              </details>
            )}

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
            <p>完了45点・速さ25点・品質20点・同時仕上げ10点。</p>
            <p className="training-criteria">完了90%以上・品質達成95%以上・条件違反ゼロ・緊急対応完了。</p>
            <p>未到着も採点対象。総合練習はフル。</p>
          </section>
        </div>
        <footer className="training-start-row training-actionbar" aria-label="ゲームの開始">
          <p>カードを選ぶ → 担当へ割当 → 時間を見て完了。</p>
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
  lesson,
  lessonNumber,
  onLessonNext,
  onRetry,
  onHistory,
  storageError,
}: {
  scenario: Scenario;
  onBack: () => void;
  onFinish: (state: GameState) => void;
  lesson?: Lesson;
  lessonNumber?: number;
  onLessonNext?: () => void;
  onRetry?: () => void;
  onHistory?: () => void;
  storageError?: string;
}) {
  const [state, dispatch] = useReducer(gameReducer, scenario, (input) =>
    lesson ? lesson.setup() : startGame(input, crypto.getRandomValues(new Uint32Array(1))[0])
  );
  const [interactions, setInteractions] = useState<string[]>([]);
  const interact = (kind: string) => setInteractions((old) => (old.includes(kind) ? old : [...old, kind]));
  const [speed, setSpeed] = useState(2);
  const [viewMode, setViewMode] = useState<ControlViewMode>('current');
  const [timelineCommand, setTimelineCommand] = useState<{ direction: 'back' | 'now' | 'forward'; id: number } | null>(
    null
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
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
    if (lesson || state.status !== 'active' || state.paused || endOpen) return;
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
  }, [state.status, state.paused, speed, endOpen, lesson]);
  useEffect(() => {
    if (!lesson && state.status === 'finished' && !saved.current) {
      saved.current = true;
      onFinish(state);
    }
  }, [state, onFinish, lesson]);
  const result = scoreGame(state);
  const detail = detailKey
    ? state.bays
        .flatMap((bay) => [...bay.queue, ...(bay.pastTickets ?? [])])
        .find((ticket) => ticket.ticketUid === detailKey)
    : null;
  const pendingEmergencies = state.emergencies.filter((trial) => trial.status === 'pending');
  const occurredEmergencies = state.emergencies.filter((trial) => trial.triggeredAtSec !== undefined);
  const detailIncident = pendingEmergencies.find((trial) => trial.sourceKey === detailKey);
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
              randomSeed: state.randomSeed,
              emergencies: state.emergencies,
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
      <main className="training-home training-result-screen">
        <div className="training-container training-results">
          <span className="training-eyebrow">
            <Flag size={18} />
            {MODES[scenario.mode].label} / RESULT
          </span>
          <h1>結果</h1>
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
          {MODES[scenario.mode].emergencyChances > 0 && (
            <p>
              緊急淹れ直し：発生 {occurredEmergencies.length}件 · 完了{' '}
              {state.emergencies.filter((trial) => trial.status === 'resolved').length}件
            </p>
          )}
          <div className="training-result-body" aria-label="採点の詳細">
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
              <h2>次の課題</h2>
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
              {!result.ready && <p>必須条件が未達のため、上限79点。</p>}
              <p>総合確認はフルで80点を目指す。</p>
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
            {storageError ? (
              <p role="alert" className="training-error">
                {storageError}
              </p>
            ) : (
              <p>このブラウザに保存しました。</p>
            )}
          </div>
          <div className="training-result-actions training-actionbar" aria-label="採点後の操作">
            <button type="button" className="training-primary" onClick={onBack}>
              <RotateCcw size={18} />
              もう一度
            </button>
            <button type="button" onClick={onHistory}>
              <Trophy size={18} />
              記録を見る
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
    setSearchOpen(false);
    setEmptyBay(null);
    setRemakeReason('');
    setRemakeCount('');
    setRemakeTarget('');
    setRemakeInterrupt('');
    setDetailKey(ticket.ticketUid ?? null);
  };
  return (
    <div className={`training-game ${lesson ? 'is-tutorial' : ''}`}>
      <header className="training-game-header">
        <nav className="training-view-switch" aria-label="管制盤の表示切替">
          {(Object.keys(CONTROL_VIEWS) as ControlViewMode[]).map((mode) => (
            <button
              type="button"
              key={mode}
              data-tour-view={mode}
              aria-pressed={viewMode === mode}
              onClick={() => {
                setViewMode(mode);
                interact(`view:${mode}`);
              }}
            >
              {CONTROL_VIEWS[mode]}
            </button>
          ))}
        </nav>
        <div className="training-countdown">
          <small>{lesson ? '練習' : '残り'}</small>
          <b>{clock(lesson ? state.nowSec : scenario.durationSec - state.nowSec)}</b>
        </div>
        {viewMode === 'current' && (
          <button
            type="button"
            className="training-now"
            onClick={() => setTimelineCommand({ direction: 'now', id: performance.now() })}
          >
            現在
          </button>
        )}
        <h1 className="training-session-label">
          {lesson ? `練習 ${lessonNumber}/${LESSONS.length}` : MODES[scenario.mode].label}
        </h1>
        <button
          type="button"
          className="training-search-toggle"
          data-tour-search
          aria-pressed={searchOpen}
          onClick={() => {
            setDetailKey(null);
            setEmptyBay(null);
            setSearchOpen(!searchOpen);
          }}
        >
          <Search size={17} />
          番号
        </button>
        <div className="training-game-counts">
          <b>
            {state.arrived.length}/{scenario.orders.length}件
          </b>
          <span>
            完了 {result.done}/{result.total}杯
          </span>
        </div>
        {state.notice && pendingEmergencies.length === 0 && (
          <div className="training-session-notice" role="status">
            {state.notice}
          </div>
        )}
        {lesson ? (
          <div className="training-game-controls">
            <button type="button" data-tour-retry onClick={onRetry}>
              やり直す
            </button>
            <button type="button" onClick={onBack}>
              メニュー
            </button>
          </div>
        ) : (
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
            <button type="button" className="training-finish-button" onClick={() => setEndOpen(true)}>
              <Flag size={16} />
              終了・採点
            </button>
          </div>
        )}
      </header>
      {lesson && (
        <TutorialOverlay
          lesson={lesson}
          lessonNumber={lessonNumber ?? 1}
          state={state}
          interactions={interactions}
          mode={viewMode}
          onNext={() => onLessonNext?.()}
          onAdvanceTime={() => {
            const remaining = state.bays.flatMap((bay) =>
              bay.queue[0]?.status === 'brewing' && bay.queue[0].trainingCupIds?.length
                ? [Math.max(1, bay.queue[0].timeRemainingSec ?? 300)]
                : []
            );
            if (remaining.length)
              dispatch({
                type: 'tick',
                seconds: Math.min(Math.max(1, scenario.durationSec - state.nowSec - 1), ...remaining),
              });
          }}
        />
      )}
      <div className="training-progress">
        <div style={{ width: `${(100 * state.nowSec) / scenario.durationSec}%` }} />
      </div>
      {pendingEmergencies.length > 0 && (
        <aside className="training-emergencies" aria-label="緊急淹れ直しの通知">
          {pendingEmergencies.map((trial) => {
            const source = state.bays
              .flatMap((bay) => [...bay.queue, ...(bay.pastTickets ?? [])])
              .find((ticket) => ticket.ticketUid === trial.sourceKey);
            const waiting = state.unassigned.find((card) => card.ticketUid === trial.sourceKey);
            return (
              <div role="alert" key={trial.id}>
                <strong>緊急淹れ直し {source?.id ?? waiting?.id}</strong>
                <p>{waiting ? '対象カードを担当へ割当。' : '抽出トラブル。淹れ直してください。'}</p>
                <button
                  type="button"
                  disabled={!source}
                  onClick={() => {
                    if (source) {
                      setEmptyBay(null);
                      openDetail(source);
                    }
                  }}
                >
                  入れ直しを手配
                </button>
              </div>
            );
          })}
        </aside>
      )}
      <div className="training-board">
        <ControlWorkspace
          mode={viewMode}
          emptyBay={emptyBay}
          onCloseEmptySlot={() => setEmptyBay(null)}
          searchOpen={searchOpen}
          onOpenSearch={() => {
            setDetailKey(null);
            setEmptyBay(null);
            setSearchOpen(true);
          }}
          onCloseSearch={() => setSearchOpen(false)}
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
          clockOriginMs={TRAINING_CLOCK_ORIGIN}
          orderComments={trainingComments(state, TRAINING_CLOCK_ORIGIN)}
          onInteraction={interact}
          onDiscard={(key, cupIds) => {
            dispatch({ type: 'discard', key, cupIds });
            return true;
          }}
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
          onOpenEmptySlot={(bayId) => {
            setDetailKey(null);
            setSearchOpen(false);
            setEmptyBay(bayId);
          }}
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
      {detail && (
        <SidePanel
          title={detail.status === 'scheduled' ? 'カードの操作' : '緊急（淹れ直し）'}
          onClose={() => setDetailKey(null)}
        >
          <div className="training-card-actions">
            <h2>
              {detail.id} {itemAbbr(detail.beanName)}
            </h2>
            <p>
              {detail.cupCount}杯 ·{' '}
              {detail.status === 'completed'
                ? '完了済み'
                : detail.status === 'brewing'
                  ? '抽出中・移動で時計リセット'
                  : '待機中'}
            </p>
            <details
              open={detail.status !== 'scheduled' || Boolean(detailIncident)}
              className="my-4 rounded border border-red-200 p-3"
            >
              <summary className="text-sm font-black text-red-800">淹れ直し</summary>
              <div className="mt-3 flex flex-col gap-2 text-xs">
                <label>
                  理由
                  <select
                    aria-label="入れ直しの理由"
                    value={remakeReason}
                    onChange={(event) => setRemakeReason(event.target.value)}
                    className="mt-1 w-full rounded border p-2"
                  >
                    <option value="">選択</option>
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
                    <option value="">選択</option>
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
                    <option value="">選択</option>
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
                      <option value="">選択</option>
                      <option value="interrupt">中断する</option>
                      <option value="continue">続ける</option>
                    </select>
                  </label>
                )}
                {remakeInterrupt === 'interrupt' && <p>待機は「始める」で再開。</p>}
                {remakeInterrupt === 'interrupt' && Number(remakeCount) < detail.cupCount && (
                  <p>残りの杯は未割当へ。</p>
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
                      incidentId: detailIncident?.id,
                    });
                    setDetailKey(null);
                    setRemakeReason('');
                    setRemakeCount('');
                    setRemakeTarget('');
                    setRemakeInterrupt('');
                  }}
                >
                  淹れ直す
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
                      data-tour-move={bay.id}
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
            <p>★上級生：1・6番</p>
          </div>
        </SidePanel>
      )}
      {state.paused && (
        <div className="training-paused">
          <Pause size={32} />
          <h2>一時停止中</h2>
          <p>時計・操作を停止中</p>
          <button type="button" className="training-primary" onClick={() => dispatch({ type: 'pause' })}>
            <Play size={18} />
            再開する
          </button>
        </div>
      )}
      {endOpen && (
        <div className="training-dialog-backdrop">
          <section role="dialog" aria-modal="true" aria-labelledby="finish-title" className="training-dialog">
            <h2 id="finish-title">終了して採点？</h2>
            <p>
              完了 {result.done}/{result.total}杯。残りは0点。
            </p>
            <div>
              <button type="button" onClick={() => setEndOpen(false)}>
                続ける
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
