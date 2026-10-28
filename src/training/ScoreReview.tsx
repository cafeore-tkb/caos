import { useState } from 'react';
import { type ScoreReview as Review, reviewClock } from './feedback';
import './feedback.css';

const orders = (ids: number[]) => ids.map((id) => `#${String(id).padStart(3, '0')}`).join('・');
const points = (value: number) => value.toFixed(1);

export function ScoreReview({ review }: { review: Review }) {
  const [order, setOrder] = useState('all');
  const orderIds = [...new Set(review.deductions.flatMap((row) => row.orderIds))].sort((a, b) => a - b);
  const rows = review.deductions.filter((row) => order === 'all' || row.orderIds.includes(Number(order)));
  const first = rows.find((row) => row.orderIds.length === 1) ?? rows[0];
  return (
    <section className="training-review" aria-label="注文ごとの失点と改善方法">
      <h2>点数が下がった理由</h2>
      <p>注文番号を選ぶと、その注文の操作と失点を見返せます。時刻はゲーム開始からの経過時間です。</p>
      <p className="training-review-calculation">
        満点100 − 項目ごとの失点{points(review.categoryLoss)} − 条件違反{points(review.penaltyPoints)}
        {review.minimumAdjustment > 0 && ` ＋ 0点を下回った分${points(review.minimumAdjustment)}`}
        {Math.abs(review.roundingAdjustment) > 0.001 &&
          ` ${review.roundingAdjustment >= 0 ? '＋' : '−'} 四捨五入${points(Math.abs(review.roundingAdjustment))}`}
        {review.capPoints > 0 && ` − 79点上限による調整${points(review.capPoints)}`} ＝{' '}
        <strong>{review.score}点</strong>
      </p>
      {review.gates.length > 0 && (
        <section className="training-review-gates" aria-label="80点以上に必要な条件">
          <h3>
            {review.capPoints > 0
              ? `79点上限でさらに${points(review.capPoints)}点下がりました`
              : '80点以上に必要な条件'}
          </h3>
          <p>次の条件が残っているため、今回は79点が上限です。</p>
          <ul>
            {review.gates.map((gate) => (
              <li key={gate.reason}>
                {orders(gate.orderIds)} {gate.reason}
              </li>
            ))}
          </ul>
        </section>
      )}
      {orderIds.length > 1 && (
        <label className="training-review-filter">
          注文番号で絞る
          <select aria-label="注文番号で絞る" value={order} onChange={(event) => setOrder(event.target.value)}>
            <option value="all">すべての注文</option>
            {orderIds.map((id) => (
              <option key={id} value={id}>
                {orders([id])}
              </option>
            ))}
          </select>
        </label>
      )}
      {first ? (
        <aside className="training-review-next" aria-label="最初に見直すこと">
          <h3>まず見直すこと · {orders(first.orderIds) || '割り当て条件'}</h3>
          <p>
            <b>
              {first.category}で −{points(first.points)}点
            </b>
          </p>
          <p>{first.reason}</p>
          <p>{first.advice}</p>
        </aside>
      ) : (
        <p>失点はありません。抽出時間と注文の仕上がりを守れました。</p>
      )}
      {rows.length > 0 && (
        <>
          <p>同じ操作が複数の項目に影響することがあります。表示は小数1桁に丸め、合計は丸める前の値で計算します。</p>
          <div className="training-review-rows">
            {rows.map((row, index) => (
              <details key={row.id} className="training-review-row" open={index === 0}>
                <summary>
                  <span>
                    {orders(row.orderIds) || '注文番号の記録なし'}
                    <small>
                      {row.category}
                      {row.items?.length ? ` · ${row.items.join('・')}` : ''}
                    </small>
                  </span>
                  <strong>−{points(row.points)}点</strong>
                </summary>
                <div className="training-review-explanation">
                  <p>{row.reason}</p>
                  <p>
                    <b>次はこうする</b>　{row.advice}
                  </p>
                  {row.timeline.length > 0 && (
                    <ol className="training-review-timeline" aria-label="この注文の時系列">
                      {row.timeline.map((moment) => (
                        <li key={`${moment.atSec}-${moment.kind}-${moment.label}`} data-kind={moment.kind}>
                          <time>{reviewClock(moment.atSec)}</time>
                          <span>
                            <small>
                              {moment.kind === 'actual' ? '実際' : moment.kind === 'forecast' ? '見込み' : '予定・目標'}
                            </small>
                            {moment.label}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </details>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
