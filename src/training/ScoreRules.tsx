import { useEffect, useRef, useState } from 'react';
import { SCORING_VERSION } from './replay';
export function ScoreRules() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) ref.current?.showModal();
  }, [open]);
  return (
    <>
      <button type="button" className="training-rules-link" onClick={() => setOpen(true)}>
        採点のしくみ
      </button>
      {open && (
        <dialog ref={ref} className="training-rules-dialog" aria-label="採点のしくみ" onCancel={() => setOpen(false)}>
          <h2>マスター評価 / 100点</h2>
          <table>
            <thead>
              <tr>
                <th>項目</th>
                <th>配点</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>完了した杯数 ÷ 全杯数</td>
                <td>35</td>
              </tr>
              <tr>
                <td>品質を守り、注文から8分以内</td>
                <td>25</td>
              </tr>
              <tr>
                <td>予定抽出時間の90％以上で完了</td>
                <td>20</td>
              </tr>
              <tr>
                <td>同じ注文を60秒差以内に完了</td>
                <td>10</td>
              </tr>
              <tr>
                <td>アイス1杯を余裕のある上級生へ</td>
                <td>10</td>
              </tr>
            </tbody>
          </table>
          <p>杯数の割合で計算。同一注文は件数の割合。違反1回につき2点減点（最大20点）。最後に四捨五入します。</p>
          <h3>80点以上の条件</h3>
          <p>
            完了90％以上・完了分の品質95％以上・条件違反なし・緊急対応の未完了なし。対象のアイス1杯を半数以上、上級生へ。満たさない場合は79点まで。
          </p>
          <p>
            アイス配分：割当時、上級生の待ち時間が割当先＋60秒以内なら対象。指名・2杯・上級生が忙しい時は対象外。対象なしは配分満点です。
          </p>
          <h3>営業スコア / pt</h3>
          <p>品質OKのコーヒー売上（1円＝1pt）＋ 指名100pt/杯 ＋ 限定150pt/杯 ＋ 2杯統合100pt/組。</p>
          <p>売上はマスターの価格。淹れ直しは二重計上せず、統合は2杯を一緒に正しく仕上げた時だけ加算。</p>
          <p>注文内容と到着時刻は毎回抽選。同じモードの総杯数・商品構成・売上上限は同じです。</p>
          <p>未到着の注文も採点対象です。モード別に順位を分け、1人の自己ベストを表示します。同点は同順位です。</p>
          <small>練習上の目安 / ルール {SCORING_VERSION}</small>
          <button type="button" className="training-primary" onClick={() => setOpen(false)}>
            閉じる
          </button>
        </dialog>
      )}
    </>
  );
}
