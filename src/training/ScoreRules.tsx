import { useEffect, useRef, useState } from 'react';
import { GradeMark } from './GradeBadge';
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
          <header className="training-rules-header">
            <h2>採点のしくみ</h2>
            <button type="button" className="training-primary" onClick={() => setOpen(false)}>
              閉じる
            </button>
          </header>
          <div className="training-rules-content">
            <h3>評定 / A+・A・B・C・D</h3>
            <table aria-label="評定の基準">
              <tbody>
                <tr>
                  <th>
                    <GradeMark grade="A+" />
                  </th>
                  <td>95点以上、かつ上位10％未満</td>
                </tr>
                <tr>
                  <th>
                    <GradeMark grade="A" />
                  </th>
                  <td>80点以上 / A+以外</td>
                </tr>
                <tr>
                  <th>
                    <GradeMark grade="B" />
                  </th>
                  <td>70〜79点</td>
                </tr>
                <tr>
                  <th>
                    <GradeMark grade="C" />
                  </th>
                  <td>60〜69点</td>
                </tr>
                <tr>
                  <th>
                    <GradeMark grade="D" />
                  </th>
                  <td>60点未満 / 不合格</td>
                </tr>
              </tbody>
            </table>
            <p>
              A+の順位は、同じモードと採点ルールの自己ベストで比べます。1人につき1件を数え、同点の人も全員含めます。95点以上でも、上位10%未満に入らなければAです。10%ちょうどもAになります。
            </p>
            <p>
              この端末だけではAまで判定します。A+は共有ランキングで決まり、参加人数や記録によって変わります。履歴には保存した時点の評定が残ります。店舗運営の目安は80点以上です。
            </p>
            <h3>マスター評価 / 100点</h3>
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
                  <td>抽出時間を守り、注文から8分以内に仕上げる</td>
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
            <p>
              各項目は、条件を満たした杯数の割合で計算します。同じ注文の仕上がりは、注文の件数で比べます。割り当て条件に合わない操作は1回につき2点減点し、20点まで引きます。最後に四捨五入します。
            </p>
            <h3>フル：タイムラインの完了予測</h3>
            <p>
              ゲーム内の営業は30分で、44件・66杯を担当します。最初に8件届きます。全注文の担当と緊急の淹れ直しを手配すると、自動で採点します。営業の延長はありません。
            </p>
            <p>
              まだ終わっていないカップは、タイムラインの予定時刻で計算します。杯数35点、完了見込みの速さ25点、抽出時間20点、同じ注文の仕上がり10点、アイスの担当選び10点です。
            </p>
            <p>
              66杯を6台で2杯ずつ淹れる場合、抽出時間だけでも33分かかります。完了見込みが33分以内なら速さは25点で、そこから遅れるほど下がり、15分遅れると0点です。注文がまだ届いていない場合や、担当が決まっていない場合は杯数の点に入りません。実際に早く終えすぎたカップは、抽出時間の点に入りません。
            </p>
            <p>未完了分の売上とボーナスは見込みです。実際の完了杯数も結果に表示します。</p>
            <h3>80点以上の条件</h3>
            <p>
              全カップの90%以上を仕上げ、そのうち95%以上で予定抽出時間の90%以上を確保する必要があります。割り当て条件に合わない操作は0回で、緊急の淹れ直しは全件完了が必要です。採点対象のアイス1杯は、半数以上を上級生へ任せます。1つでも満たさない場合は79点が上限です。フルの未完了分は、完了見込みで判定します。
            </p>
            <p>
              アイス1杯の担当を決めるとき、上級生の待ち時間が割当先より60秒長い範囲までなら、上級生へ任せると点になります。指名と2杯抽出、上級生の待ち時間が長すぎる場合は対象外です。完了したカップがあり、採点対象がなければこの項目は満点です。完了が0杯なら0点です。
            </p>
            <h3>営業スコア / pt</h3>
            <p>
              抽出時間を守ったコーヒーの売上を、1円につき1ptとして数えます。指名は1杯100pt、限定豆は1杯150pt、2杯をまとめて仕上げると1組100ptを加えます。
            </p>
            <p>
              売上には、商品データに登録された価格を使います。淹れ直しても同じカップの売上は1回だけ数えます。2杯をまとめたボーナスは、両方の抽出時間を守り、一緒に仕上げたときだけ加えます。
            </p>
            <p>注文内容と到着時刻は毎回抽選。同じモードの総杯数・商品構成・売上上限は同じです。</p>
            <p>未到着の注文も採点対象です。モード別に順位を分け、1人の自己ベストを表示します。同点は同順位です。</p>
            <small>練習上の目安 / ルール {SCORING_VERSION}</small>
          </div>
        </dialog>
      )}
    </>
  );
}
