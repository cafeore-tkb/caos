import { useEffect, useRef, useState } from 'react';
import { type GameMode, MODES } from './engine';
import { type Rank, rankingApi } from './rankingClient';
import type { RunSummary } from './runSummary';

const bayLabel = (id: number) => `${id}${id === 1 ? 'st' : id === 2 ? 'nd' : id === 3 ? 'rd' : 'th'}`;
export function RankingResult({ row, mode, onClose }: { row: Rank; mode: GameMode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<RunSummary | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    let active = true;
    if (!row.run_id) {
      setError('この記録には詳しいリザルトが残っていません。');
      return;
    }
    void rankingApi<RunSummary>(`/results/${row.run_id}`, null).then(
      (value) => {
        if (active) setResult(value);
      },
      (cause: Error) => {
        if (active) setError(cause.message);
      }
    );
    return () => {
      active = false;
    };
  }, [row.run_id]);
  const conditions = result?.conditions;
  return (
    <dialog
      ref={dialog}
      className="training-rules-dialog ranking-result-dialog"
      aria-labelledby="ranking-result-title"
      onCancel={onClose}
    >
      <header className="ranking-result-header">
        <div>
          <small>{MODES[mode].label} · 簡易リザルト</small>
          <h2 id="ranking-result-title">{row.display_name}</h2>
        </div>
        <button type="button" onClick={onClose}>
          閉じる
        </button>
      </header>
      <div className="ranking-result-content">
        <div className="ranking-result-numbers">
          <strong>
            {row.score}
            <small> / 100点</small>
          </strong>
          <span>営業 {row.business_score.toLocaleString()}pt</span>
          <span>
            {row.done} / {row.total}杯
          </span>
        </div>
        {result && (
          <p className="ranking-result-meta">
            {new Date(result.completedAt).toLocaleString('ja-JP')} · {result.rulesVersion}
            {result.forecast ? ' · 未完了分は見込みを含む' : ''}
          </p>
        )}
        {!result && !error && <p role="status">リザルトを読み込み中…</p>}
        {error && <p role="alert">{error}</p>}
        {result && (
          <>
            <h3>この回の抽選・担当</h3>
            {conditions ? (
              <>
                <dl className="ranking-result-conditions">
                  <div>
                    <dt>ホットのみ</dt>
                    <dd>
                      {conditions.roster
                        .filter((b) => b.hotOnly)
                        .map((b) => bayLabel(b.id))
                        .join('・') || 'なし'}
                    </dd>
                  </div>
                  <div>
                    <dt>上級生</dt>
                    <dd>
                      {conditions.roster
                        .filter((b) => b.senior)
                        .map((b) => `${bayLabel(b.id)}${![1, 6].includes(b.id) ? '（追加）' : ''}`)
                        .join('・')}
                    </dd>
                  </div>
                  <div>
                    <dt>注文</dt>
                    <dd>{conditions.randomizedOrders ? '商品・到着時刻を抽選' : '再現モードの固定注文'}</dd>
                  </div>
                </dl>
                {conditions.emergencies.length ? (
                  <ul className="ranking-emergency-list">
                    {conditions.emergencies.map((trial) => (
                      <li key={trial.id}>
                        <b>緊急 {trial.id}：</b>
                        {!trial.drawn
                          ? '抽選で発生なし'
                          : conditions.source === 'draw'
                            ? `${trial.reason}の抽選あり`
                            : trial.status === 'armed'
                              ? '抽選あり・発生前に終了'
                              : `${trial.bayId ? `${bayLabel(trial.bayId)}で` : ''}${trial.reason ?? '緊急'}`}
                        {trial.drawn && trial.orderId !== undefined && (
                          <span> · #{String(trial.orderId).padStart(3, '0')}</span>
                        )}
                        {trial.atSec !== undefined && (
                          <span>
                            {' '}
                            · 開始{Math.floor(trial.atSec / 60)}分{trial.atSec % 60}秒
                          </span>
                        )}
                        {conditions.source === 'saved' && trial.drawn && trial.status !== 'armed' && (
                          <span>
                            {' '}
                            ·{' '}
                            {trial.status === 'resolved'
                              ? '対応完了'
                              : trial.status === 'rebrewing'
                                ? '淹れ直し手配済み'
                                : '未対応'}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>このモードは緊急なし。</p>
                )}
                {conditions.source === 'draw' && conditions.emergencies.length > 0 && (
                  <p className="ranking-result-meta">
                    保存済みの条件から抽選結果を復元しています。実際の発生時刻・対応状況は、この記録には残っていません。
                  </p>
                )}
              </>
            ) : (
              <p>以前の記録には、抽選・担当の詳細が残っていません。</p>
            )}
            <h3>点数の内訳</h3>
            {result.categories.length ? (
              <dl className="ranking-result-breakdown">
                {result.categories.map((category) => (
                  <div key={category.label}>
                    <dt>
                      {category.label}
                      <small>{category.detail}</small>
                    </dt>
                    <dd>
                      {Math.round(category.points * 10) / 10} / {category.max}
                    </dd>
                  </div>
                ))}
                {result.penalties !== null && (
                  <div>
                    <dt>操作による減点</dt>
                    <dd>−{result.penalties}点</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p>この記録には点数の内訳が残っていません。</p>
            )}
            {result.feedback.length > 0 && (
              <>
                <h3>次へのヒント</h3>
                <ul>
                  {result.feedback.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}
