import {
  ArrowLeft,
  BellRing,
  BookOpen,
  Check,
  Coffee,
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
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { CONTROL_VIEWS, type ControlViewMode, ControlWorkspace } from '../components/ControlWorkspace';
import type { OrderTicket } from '../types';
import { trainingComments } from './comments';
import { emergencyGuidance } from './emergencyGuidance';
import {
  type GameAction,
  type GameMode,
  type GameState,
  gameReducer,
  MODES,
  parseScenario,
  type Scenario,
  scoreGame,
  startGame,
} from './engine';
import { GradeBadge } from './GradeBadge';
import type { GradeAssessment } from './grades';
import { itemAbbr, needsBrew, seniorOnly } from './master';
import { RankingView } from './RankingView';
import { randomScenario } from './randomScenario';
import {
  beginNamedRun,
  type DeviceSession,
  publishRun,
  type RankedRun,
  rankingApi,
  readDisplayName,
  readSession,
  storeDisplayName,
} from './rankingClient';
import { appendReplay } from './replay';
import { type PublicationStatus, ScorePublisher } from './ScorePublisher';
import { ScoreReview } from './ScoreReview';
import { ScoreRules } from './ScoreRules';
import { SHIFT_FEED, SHIFT_NEXT, SHIFT_ORIGIN_MS, shiftClock, shiftReminder } from './shifts';
import './training.css';
import './screens.css';
import './theme.css';
import './community.css';

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
  const [page, setPage] = useState<'learn' | 'game' | 'history' | 'ranking'>('learn');
  const [lessonIndex, setLessonIndex] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [completed, setCompleted] = useState(readCourse);
  const [storageError, setStorageError] = useState('');
  const [session, setSession] = useState(readSession);
  const [playerName, setPlayerName] = useState(readDisplayName);
  const [runPlayerName, setRunPlayerName] = useState('');
  const [publication, setPublication] = useState<PublicationStatus | null>(null);
  const publishing = useRef(new Set<string>());
  type Finished = {
    entry: ReturnType<typeof createResult>;
    actions: GameAction[];
    run: RankedRun | null;
    session: DeviceSession | null;
    displayName: string;
  };
  const finished = useRef<Finished | null>(null);
  const [rankedRun, setRankedRun] = useState<RankedRun | null>(null);
  const [customScenario, setCustomScenario] = useState(false);
  const [localSeed, setLocalSeed] = useState(1);
  const [starting, setStarting] = useState(false);
  const [sharingStatus, setSharingStatus] = useState('');
  const [assessments, setAssessments] = useState<Record<string, GradeAssessment>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setScenario(null);
    setCustomScenario(false);
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
  const publishScore = async (record: Finished | null) => {
    if (!record?.run || !record.session || publishing.current.has(record.run.id)) return;
    const { entry, actions, run, session: owner, displayName } = record;
    publishing.current.add(run.id);
    if (finished.current === record) setPublication({ status: 'sending' });
    try {
      await publishRun(owner, run.id, actions, displayName);
      if (finished.current === record) setPublication({ status: 'sent' });
      try {
        const { assessment } = await rankingApi<{ assessment: GradeAssessment }>(`/runs/${run.id}/grade`, owner);
        setAssessments((old) => ({ ...old, [run.id]: assessment }));
        if (entry.detail) {
          const updated = persistResult({ ...entry, detail: { ...entry.detail, assessment } });
          setHistory(updated.entries);
          if (!updated.saved && finished.current === record) setStorageError('共有評定を端末に保存できませんでした。');
        }
      } catch {
        if (finished.current === record) setSharingStatus('共有評定はランキングで確認できます。');
      }
    } catch (cause) {
      if (finished.current === record) setPublication({ status: 'failed', error: (cause as Error).message });
    } finally {
      publishing.current.delete(run.id);
    }
  };
  const saveResult = (state: GameState, actions: GameAction[]) => {
    const entry = createResult(state);
    const saved = persistResult(entry);
    setHistory(saved.entries);
    setStorageError(saved.saved ? '' : '保存できません。結果JSONを保存してください。');
    const record = { entry, actions, run: rankedRun, session, displayName: runPlayerName };
    finished.current = record;
    if (record.run) void publishScore(record);
  };
  const startPlaying = async () => {
    if (!playerName.trim()) {
      setError('プレイヤー名を入力してください');
      return;
    }
    setStarting(true);
    setPublication(null);
    setError('');
    setSharingStatus('');
    finished.current = null;
    try {
      if (!customScenario) {
        const { run, session: currentSession, displayName } = await beginNamedRun(mode, session, playerName);
        setRunPlayerName(displayName);
        setSession(currentSession);
        setRankedRun(run);
        setScenario(run.scenario);
      } else {
        setRankedRun(null);
        setRunPlayerName(playerName.trim());
        storeDisplayName(playerName.trim());
        const seed = crypto.getRandomValues(new Uint32Array(1))[0];
        setLocalSeed(seed);
        if (scenario && !customScenario) setScenario(randomScenario(scenario, seed));
      }
      setPlaying(true);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setStarting(false);
    }
  };
  if (page === 'ranking' && lessonIndex === null && !playing)
    return <RankingView session={session} onBack={() => setPage('learn')} onGame={() => setPage('game')} />;
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
        seed={rankedRun?.seed ?? localSeed}
        sharingStatus={sharingStatus}
        playerName={runPlayerName}
        publication={publication}
        onPublish={rankedRun ? () => publishScore(finished.current) : undefined}
        assessment={rankedRun ? assessments[rankedRun.id] : null}
        onRanking={() => {
          setPlaying(false);
          setPage('ranking');
        }}
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
              <Coffee size={18} />
              CaOS / 珈琲・俺
            </span>
            <h1>マスターシート練習室</h1>
            <p>操作を覚える → ゲームに挑戦 → 記録を見る</p>
          </header>
          <button type="button" className="training-ranking-entry" onClick={() => setPage('ranking')}>
            みんなのランキング
          </button>
          <section className="training-course-intro training-panel">
            <div>
              <h2>
                <BookOpen size={20} />
                操作チュートリアル
              </h2>
              <p>全{LESSONS.length}レッスン。待ち時間はボタンで進めます。</p>
              <b>
                {LESSONS.filter((lesson) => completed.includes(lesson.id)).length} / {LESSONS.length} 完了
              </b>
              <progress
                value={LESSONS.filter((lesson) => completed.includes(lesson.id)).length}
                max={LESSONS.length}
                aria-label="完了したレッスン"
              />
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
                ? 'もう一度練習'
                : completed.length
                  ? '続きから練習'
                  : '練習を始める'}
            </button>
            <button type="button" className="training-secondary training-game-entry" onClick={() => setPage('game')}>
              <Gamepad2 size={24} />
              ゲームに挑戦
            </button>
            <button
              type="button"
              className="training-secondary training-record-entry"
              onClick={() => setPage('history')}
            >
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
    <main className="training-home training-setup-screen" data-selected-mode={mode}>
      <div className="training-container">
        <div className="training-menu-nav">
          <button type="button" className="training-back" onClick={() => setPage('learn')}>
            <ArrowLeft size={16} />
            メニュー
          </button>
          <button type="button" className="training-secondary" onClick={() => setPage('ranking')}>
            ランキング
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
                  {mode === key && (
                    <span className="training-mode-choice">
                      <Check size={16} />
                      選択中
                    </span>
                  )}
                </span>
                <strong>{config.label}</strong>
                <p>{config.description}</p>
                <span className="training-mode-meta">
                  営業 {config.durationSec / 60}分 · {config.count}件 · 標準{config.defaultSpeed}倍速
                </span>
                <small>{attempts.length > 0 ? `これまでの最高 ${best}点 / ${attempts.length}回` : '未挑戦'}</small>
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
                注文JSONの見本
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
                {!customScenario && (
                  <>
                    {scenario.kind === 'recreated'
                      ? '注文と到着順は固定。開始時に7分ぶんの注文が入り、その後も7分先の注文が届きます。'
                      : '注文内容・到着時刻は毎回抽選。'}
                    <br />
                  </>
                )}
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
                  setCustomScenario(true);
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
              80点を目指すには
            </h2>
            <p>
              {mode === 'full'
                ? '担当を決めた杯数35点、完了見込みの速さ25点、抽出時間20点、同じ注文の仕上がり10点、アイスの担当選び10点。'
                : '仕上げた杯数35点、8分以内の準備25点、抽出時間20点、同じ注文の仕上がり10点、アイスの担当選び10点。'}
            </p>
            <p className="training-criteria">
              9割以上のカップを仕上げ、そのうち95%以上で抽出時間を守りましょう。指名と限定豆の条件を守り、緊急の淹れ直しも終えます。
            </p>
            <p>
              {mode === 'full'
                ? 'フルは最初に8件届きます。全注文の担当と緊急の淹れ直しを手配すると、タイムラインの完了見込みで自動採点します。ゲーム内の営業は30分です。'
                : 'これから届く注文も採点に含みます。時間を最後まで使い、全注文を仕上げましょう。'}
            </p>
            <ScoreRules />
            <p>
              {customScenario
                ? '持込JSONは、この端末に記録します。'
                : 'プレイヤー名を入力して開始。終了後はランキングへ自動掲載。'}
            </p>
          </section>
        </div>
        {error && scenario && !starting && (
          <button
            type="button"
            className="training-secondary"
            onClick={() => {
              if (!playerName.trim()) return;
              setRankedRun(null);
              setRunPlayerName(playerName.trim());
              storeDisplayName(playerName.trim());
              setPublication(null);
              const seed = crypto.getRandomValues(new Uint32Array(1))[0];
              setLocalSeed(seed);
              if (scenario && !customScenario) setScenario(randomScenario(scenario, seed));
              setSharingStatus('端末に記録します。');
              setPlaying(true);
            }}
          >
            端末だけで練習
          </button>
        )}
        <footer className="training-start-row training-actionbar" aria-label="ゲームの開始">
          <label className="training-player-name">
            プレイヤー名
            <input
              aria-label="プレイヤー名"
              autoComplete="nickname"
              maxLength={30}
              placeholder="ランキングに載る名前"
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
              disabled={starting}
            />
            <small>{customScenario ? '持込JSONは端末のみ' : '終了後にランキングへ自動掲載'}</small>
          </label>
          <button
            type="button"
            className="training-primary"
            disabled={loading || !scenario || starting || !playerName.trim()}
            onClick={() => void startPlaying()}
          >
            <Play size={18} />
            {starting ? '準備中…' : `${MODES[mode].label}を始める`}
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
  seed,
  sharingStatus,
  playerName = '',
  publication,
  onPublish,
  assessment,
  onRanking,
}: {
  scenario: Scenario;
  onBack: () => void;
  onFinish: (state: GameState, actions: GameAction[]) => void;
  seed?: number;
  sharingStatus?: string;
  playerName?: string;
  publication?: PublicationStatus | null;
  onPublish?: () => Promise<void>;
  assessment?: GradeAssessment | null;
  onRanking?: () => void;
  lesson?: Lesson;
  lessonNumber?: number;
  onLessonNext?: () => void;
  onRetry?: () => void;
  onHistory?: () => void;
  storageError?: string;
}) {
  const [state, reduce] = useReducer(gameReducer, scenario, (input) =>
    lesson ? lesson.setup() : startGame(input, seed ?? crypto.getRandomValues(new Uint32Array(1))[0])
  );
  const trace = useRef<GameAction[]>([]);
  const dispatch = useCallback((action: GameAction) => {
    appendReplay(trace.current, action);
    reduce(action);
  }, []);
  const [interactions, setInteractions] = useState<string[]>([]);
  const interact = (kind: string) => setInteractions((old) => (old.includes(kind) ? old : [...old, kind]));
  const [speed, setSpeed] = useState<number>(MODES[scenario.mode].defaultSpeed);
  const [viewMode, setViewMode] = useState<ControlViewMode>('current');
  const [timelineCommand, setTimelineCommand] = useState<{ direction: 'back' | 'now' | 'forward'; id: number } | null>(
    null
  );
  const [followingNow, setFollowingNow] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [endOpen, setEndOpen] = useState(false);
  const [emptyBay, setEmptyBay] = useState<number | null>(null);
  const saved = useRef(false);
  const [exportError, setExportError] = useState('');
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
  }, [state.status, state.paused, speed, endOpen, lesson, dispatch]);
  useEffect(() => {
    if (!lesson && state.status === 'finished' && !saved.current) {
      saved.current = true;
      onFinish(state, trace.current);
    }
  }, [state, onFinish, lesson]);
  const shiftLesson = lesson?.id === 'shift';
  const recreatedStartMinutes = scenario.mode === 'butchi' ? 90 : scenario.mode === 'shawn' ? 360 : 0;
  const boardClockOrigin = shiftLesson ? SHIFT_ORIGIN_MS : TRAINING_CLOCK_ORIGIN + recreatedStartMinutes * 60_000;
  const result = scoreGame(state);
  const emergencyGuide = emergencyGuidance(state);
  const occurredEmergencies = state.emergencies.filter((trial) => trial.triggeredAtSec !== undefined);
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
          <div className="training-result-links">
            <ScoreRules />
            {onRanking && (
              <button type="button" onClick={onRanking}>
                みんなのランキング
              </button>
            )}
          </div>
          {sharingStatus && <p role="status">{sharingStatus}</p>}
          <div className={`training-score ${result.passed ? 'passed' : ''}`}>
            <GradeBadge score={result.score} assessment={assessment} />
            <strong>
              <small>マスター評価 </small>
              {result.score}
              <small> / 100</small>
            </strong>
            <span>{result.label}</span>
          </div>
          <p className="training-grade-caption">
            {assessment ? '共有評定' : '点数評定（A+は共有順位で判定）'} ·{' '}
            {result.score >= 60 ? '評定は合格' : 'D：不合格'} · 店舗運営の目安は80点以上
          </p>
          <section className="training-business-summary" aria-label="営業スコアの内訳">
            <div>
              <span>営業スコア{result.forecast ? '（見込み）' : ''}</span>
              <strong>
                {result.business.score.toLocaleString()}
                <small> pt</small>
              </strong>
            </div>
            <p>
              コーヒー売上{result.forecast ? '見込み' : ''} ¥{result.business.revenue.toLocaleString()}（1円＝1pt）
            </p>
            <p>
              {result.business.bonuses
                .map((b) => `${b.label} ${b.count}${b.label === '2杯統合' ? '組' : '杯'} ＋${b.points}pt`)
                .join(' / ')}
            </p>
          </section>
          <p>
            {result.forecast ? (
              <>
                開始から {result.forecast.endSec === null ? '—' : clock(result.forecast.endSec)} で完了予測 / 営業終了{' '}
                {clock(scenario.durationSec)} · 超過 {clock(result.forecast.overtimeSec)} · 実際の完了{' '}
                {result.forecast.actualDone}杯 / 見込み {result.forecast.projectedDone}杯
              </>
            ) : (
              <>
                経過 {clock(state.nowSec)} / {clock(scenario.durationSec)} · 完了 {result.done}/{result.total}杯 ·
                抽出時間を守ったカップ {result.quality}杯
              </>
            )}
          </p>
          {MODES[scenario.mode].emergencyChances > 0 && (
            <p>
              緊急淹れ直し：発生 {occurredEmergencies.length}件 · 実際の完了{' '}
              {state.emergencies.filter((trial) => trial.status === 'resolved').length}件
              {result.forecast &&
                ` · 手配済み ${state.emergencies.filter((trial) => trial.status === 'rebrewing').length}件（完了予測に含む）`}
            </p>
          )}
          <div className="training-result-body" aria-label="採点の詳細">
            {result.forecast && (
              <p>
                担当を決めた時点の完了見込みで採点しています。まだ終わっていないカップの売上と抽出時間、淹れ直しの結果も見込みです。
              </p>
            )}
            {onPublish && <ScorePublisher name={playerName} publication={publication} onRetry={onPublish} />}
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
            <ScoreReview review={result.review} />
            <details className="training-panel">
              <summary>練習の目標</summary>
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
              {!result.ready && <p>80点以上に必要な条件が残っているため、今回は79点が上限です。</p>}
              <p>総合確認はフルで80点を目指す。</p>
            </details>
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
          <b>
            {shiftLesson
              ? shiftClock(state.nowSec)
              : clock(lesson ? state.nowSec : scenario.durationSec - state.nowSec)}
          </b>
        </div>
        {viewMode === 'current' && (
          <button
            type="button"
            className="training-now"
            aria-pressed={followingNow}
            onClick={() => setTimelineCommand({ direction: 'now', id: performance.now() })}
          >
            {followingNow ? '現在を表示中' : '現在に戻る'}
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
        {state.notice && !emergencyGuide && (
          <div className="training-session-notice" role="status">
            {state.notice}
          </div>
        )}
        {shiftLesson && shiftReminder(boardClockOrigin + state.nowSec * 1000) && (
          <div
            data-tour-shift-notice
            role="status"
            className={`training-shift-reminder inline-flex max-w-full items-center gap-2 whitespace-nowrap rounded-lg border-2 px-4 py-1 text-[18px] shadow-md ${new Date(boardClockOrigin + state.nowSec * 1000).getUTCMinutes() >= 55 ? 'border-red-600 bg-red-100 text-red-800' : 'border-amber-900 bg-yellow-300 text-slate-950 ring-2 ring-white/90'}`}
          >
            <BellRing size={20} aria-hidden="true" />
            {shiftReminder(boardClockOrigin + state.nowSec * 1000)}
          </div>
        )}
        {emergencyGuide && (
          <div data-emergency-notice role="alert" className="training-emergency-notice">
            <BellRing size={20} aria-hidden="true" />
            <span>
              <strong>{emergencyGuide.title}</strong>　該当カードの「緊急（淹れ直し）」を押してください。
            </span>
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
            <label className="training-speed">
              <span>
                速度 <output>{speed}倍</output>
              </span>
              <input
                type="range"
                aria-label="ゲーム速度"
                aria-valuetext={`${speed}倍`}
                min={1}
                max={10}
                step={0.5}
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
              />
            </label>
            <button type="button" className="training-finish-button" onClick={() => setEndOpen(true)}>
              <Flag size={16} />
              {scenario.scoring === 'forecast' ? '割当を採点' : '終了・採点'}
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
            if (shiftLesson) {
              const next = [60, 360, 600, 1260].find((at) => at > state.nowSec);
              if (next !== undefined) dispatch({ type: 'tick', seconds: next - state.nowSec });
              return;
            }
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
      {!lesson && emergencyGuide && (
        <TutorialOverlay
          lesson={LESSONS.find((entry) => entry.id === 'emergency') ?? LESSONS[0]}
          lessonNumber={8}
          state={state}
          interactions={interactions}
          mode={viewMode}
          onNext={() => {}}
          onAdvanceTime={() => {}}
          guidance={emergencyGuide}
        />
      )}
      <div className="training-board">
        <ControlWorkspace
          mode={viewMode}
          shift={
            shiftLesson
              ? {
                  feed: SHIFT_FEED,
                  onPick: (id, name, senior) => {
                    const current = state.bays.find((bay) => bay.id === id)?.name;
                    interact(
                      !name
                        ? 'shift:clear'
                        : !current
                          ? 'shift:restore'
                          : name === '田中'
                            ? 'shift:alternate'
                            : name === '中村'
                              ? 'shift:typed'
                              : 'shift:scheduled'
                    );
                    if (name === SHIFT_NEXT[id - 1] && state.nowSec >= 60 && state.nowSec < 660)
                      interact(`shift:scheduled:${id}`);
                    dispatch({ type: 'set-lane', bayId: id, name, senior });
                  },
                  onSwap: (first, second) => {
                    interact('shift:swap');
                    dispatch({ type: 'swap-lanes', first, second });
                  },
                }
              : undefined
          }
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
          panelTicketKey={detailKey}
          onClosePanel={() => setDetailKey(null)}
          onAddEmergency={async (cupIds, reason) => {
            dispatch({ type: 'rebrew-cups', cupIds, reason });
            return cupIds;
          }}
          onCancelEmergency={(key) => dispatch({ type: 'cancel-emergency', key })}
          nextAvailable={state.bays
            .map((bay) => ({
              bayNumber: bay.id,
              seconds: bay.queue.reduce((sum, card) => sum + (card.timeRemainingSec ?? card.totalDurationSec), 0),
              isStandby: bay.queue.length === 0,
            }))
            .sort((a, b) => a.seconds - b.seconds)
            .slice(0, 3)}
          timelineCommand={timelineCommand}
          onFollowNowChange={setFollowingNow}
          onCloseTicketAction={() => setDetailKey(null)}
          baristas={state.bays}
          unassignedOrders={state.unassigned}
          currentTimeSec={state.nowSec}
          clockOriginMs={boardClockOrigin}
          orderComments={trainingComments(state, boardClockOrigin)}
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
              {scenario.scoring === 'forecast'
                ? '今のタイムラインで採点。未割当・未到着は0点。'
                : `完了 ${result.done}/${result.total}杯。残りは0点。`}
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
