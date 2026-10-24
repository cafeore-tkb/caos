import { ArrowLeft, Download, Trophy } from 'lucide-react';
import { useState } from 'react';
import { type GameMode, MODES } from './engine';
import type { ResultEntry } from './history';

export function HistoryView({ entries, onBack }: { entries: ResultEntry[]; onBack: () => void }) {
  const [mode, setMode] = useState<GameMode | 'all'>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const visible = entries
    .filter((e) => mode === 'all' || e.mode === mode)
    .slice()
    .reverse();
  const entry = visible.find((e) => e.id === selected) ?? visible[0];
  const detail = entry?.detail;
  return (
    <main className="training-home">
      <div className="training-container">
        <button className="training-back" type="button" onClick={onBack}>
          <ArrowLeft size={16} />
          練習メニューに戻る
        </button>
        <header className="training-title">
          <span className="training-eyebrow">
            <Trophy size={18} />
            MY RECORDS
          </span>
          <h1>運営の記録を振り返る</h1>
          <p>
            このブラウザに最新100回分を保存します。ブラウザを閉じても残ります。別の端末とは共有されず、サイトデータを消すと削除されます。
          </p>
        </header>
        <div className="training-history-filters" role="group" aria-label="履歴のモード">
          {(['all', 'fast', 'middle', 'full'] as const).map((key) => (
            <button
              type="button"
              key={key}
              aria-pressed={mode === key}
              onClick={() => {
                setMode(key);
                setSelected(null);
              }}
            >
              {key === 'all' ? 'すべて' : MODES[key].label}
            </button>
          ))}
        </div>
        <p className="training-data-summary">
          {visible.length}回の挑戦 · 自己ベスト {Math.max(0, ...visible.map((e) => e.score))}点 · 80点以上{' '}
          {visible.filter((e) => e.score >= 80).length}回
        </p>
        {visible.length === 0 ? (
          <section className="training-panel">
            <h2>まだ記録がありません</h2>
            <p>ゲームを終了・採点すると、ここで内訳や改善点を確認できます。チュートリアルはスコアに含めません。</p>
          </section>
        ) : (
          <div className="training-history-grid">
            <section className="training-history-list" aria-label="過去の挑戦">
              {visible.map((e) => (
                <button type="button" aria-pressed={entry?.id === e.id} key={e.id} onClick={() => setSelected(e.id)}>
                  <span>
                    {MODES[e.mode].label}
                    <small>{new Date(e.at).toLocaleString('ja-JP')}</small>
                  </span>
                  <strong>
                    {e.score}
                    <small>点</small>
                  </strong>
                </button>
              ))}
            </section>
            {entry && (
              <article className="training-panel training-history-detail">
                <h2>
                  {MODES[entry.mode].label} · {entry.score}点
                </h2>
                <p>{new Date(entry.at).toLocaleString('ja-JP')}</p>
                {detail ? (
                  <>
                    <p>
                      {detail.title} · 完了 {detail.result.done}/{detail.result.total}杯 · 品質OK{' '}
                      {detail.result.quality}杯 · 条件違反 {detail.violations}回
                    </p>
                    <p className="training-criteria">{detail.result.label}</p>
                    {detail.result.categories.map((c) => (
                      <div className="training-history-category" key={c.label}>
                        <b>{c.label}</b>
                        <span>
                          {c.points.toFixed(1)} / {c.max}
                        </span>
                        <progress value={c.points} max={c.max} />
                        <small>{c.detail}</small>
                      </div>
                    ))}
                    <h2>次に意識すること</h2>
                    <ul className="training-feedback">
                      {detail.result.feedback.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                    <details>
                      <summary>操作の記録（{detail.events.length}件）</summary>
                      <ol className="training-event-log">
                        {detail.events.map((e) => (
                          <li key={e.id}>
                            <time>
                              {Math.floor(e.atSec / 60)}:{String(e.atSec % 60).padStart(2, '0')}
                            </time>{' '}
                            {e.message}
                          </li>
                        ))}
                      </ol>
                    </details>
                  </>
                ) : (
                  <p>
                    旧版で保存した記録です。点数と日時を引き継いでいます。新しい挑戦から内訳・改善点・操作記録も保存します。
                  </p>
                )}
              </article>
            )}
          </div>
        )}
        <div className="training-result-actions">
          <button
            type="button"
            onClick={() => {
              try {
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' })
                );
                const a = document.createElement('a');
                a.href = url;
                a.download = 'caos-training-history.json';
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              } catch {
                setError('履歴をダウンロードできませんでした');
              }
            }}
          >
            <Download size={16} />
            履歴をJSONで保存
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
      </div>
    </main>
  );
}
