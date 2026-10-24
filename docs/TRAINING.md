# CaOS トレーニング仕様

## UIの反映元

cafeore-pos `173c9f18b71a4435fd967916378ed4df06efdbc4` の `services/pos/app/caos/components/ControlViewA.tsx`、`ControlViewC.tsx`、`OrderCard.tsx`、`BoardParts.tsx` を基準とする。カード操作・ドラッグ・未提供一覧・ScrollAreaを含む表示層を同リビジョンから直接移植。詳細は `src/current-caos/UPSTREAM.md`。CaOS既存のチケットモデルへ適合させ、通常画面とゲーム画面で同じ `ControlWorkspace`（A/C） を共有する。

- Aは上部のタイムラインと下部の未割当の横帯。Cは6人のドリッパーの行と右側の未割当。A/Cだけを採用し、同じ盤面を自由に切り替える。番号と杯数を大きく表示。
- 1杯は白抜き、2杯は黒の塗り。指名は黒い点線枠と指名番号で表示。
- 色は同梱マスターの `master` / `nominated` 設定に従い、個別商品を商品種別より優先。
- 列の状態は空き・抽出中・まもなく・継続中・要確認。残り時間と超過時間を表示。
- Aの完了カードは灰色と点線で抽出中と区別し、Cのレーンは現在と待機だけを表示する。
- 未割当の統合では `beanCode` だけでなく正確な商品名を照合。異なる限定豆を統合しない。

## モードとデータ

同梱マスターは `src/data/training-master.json`。営業10/20/30分、6/12/20件（抽出10/23/39杯）。架空シナリオは `public/training/{fast,middle,full}.json`。生成元は `scripts/generate-training.ts`。注文列は固定の架空データ。緊急イベントの抽選だけを開始時の乱数で決め、結果JSONにシードと抽選・発生・対応の状態を記録する。

| モード | 注文 | 指名あり | 上級生限定あり | コメントあり |
| --- | --- | --- | --- | --- |
| ファスト | 6件 | 1件 | 1件 | 1件 |
| ミドル | 12件 | 2件 | 1件 | 2件 |
| フル | 20件 | 3件 | 2件 | 3件 |

件数は注文単位で重複あり。通常注文を中心に、指名先を複数の担当者へ分散する。限定豆はマスターの `senior_only` から選び、上級生への指名との組合せも含める。ミドルは最後の注文から8分の仕上げ時間を設ける。

標準は2倍速。1/2/5/10倍を変更でき、一時停止は到着・時計・抽出と盤面の操作を止める。最後に6分30秒以上の仕上げ時間を設ける。フルは2件が8秒差で到着する短いピークを繰り返す。

JSONは次の形式。到着秒は営業開始からの相対時刻。注文番号は重複不可。到着時刻が前後していても読み込み時に整列する。全件を検証し、不正な注文を黙って除外しない。

```json
{
  "schemaVersion": 1,
  "kind": "synthetic",
  "mode": "fast",
  "title": "架空の営業シナリオ",
  "durationSec": 600,
  "orders": [
    {
      "orderId": 1,
      "atSec": 0,
      "items": [{ "name": "余音ブレンド", "quantity": 2, "nominee": 1 }],
      "comments": ["複数杯の注文です。なるべく一緒に仕上げてください。"]
    }
  ]
}
```

- `mode`: fast / middle / full。営業秒数は600 / 1200 / 1800。
- 1〜200件、商品はマスターの名称、数量1〜6、指名1〜6。ファイルは1MB以下。
- 限定豆の指名は上級生の1・6番のみ。最後の注文は終了6分30秒前まで。
- `needs_brew` の品物だけ抽出・採点対象とする。ミルクや物販を含む注文でも抽出杯数を水増ししない。
- `comments` は省略可能な文字列配列。1注文3件、各1〜200文字。空白だけ・文字列以外・長すぎる入力は読み込み時にエラーにする。コメントなしの既存JSONも利用できる。
- 3杯以上は2杯以下へ分割。全カップに独立したIDを付け、統合・移動・未割当への戻しでも保持。

カードの前後・待機先頭・先頭への配置と、同じ列内の並べ替えも現行mainの開始／待機ルールに合わせる。統合時は各杯の注文番号・到着時刻・採点IDを保持し、抽出途中に追加した杯は追加後の抽出時間で品質を判定する。

コメントは注文到着時から表示する。未割当の注文見出しと割当済みカードの吹き出しから開き、未提供一覧では本文を直接確認できる。統合・再割当・分離・入れ直し後も元注文ごとに保持し、重複集計しない。A/C切替で開いているコメントも保持する。コメントは訓練用のレジ連絡として表示し、採点は既存の完了・時間・品質・仕上がりの基準を使う。

A/Cの切替は表示状態だけを変更し、ゲームのカップ台帳・時計・注文・採点状態を作り直さない。

## ランダムな緊急淹れ直し

- ファストは自動イベントなし。ミドルは50%の抽選を1回。フルは独立した50%の抽選を2回（0件25%・1件50%・2件25%）。
- 抽選は開始時に固定し、対象の杯を元のIDで追跡する。一時停止・倍速・A/C切替では再抽選しない。同じシードと同じ操作で再現できる。
- 対象が実際に抽出され、予定抽出時間の75%に達した時点（1杯225秒・2杯270秒、最後の1/4の始まり）に通知する。未割当・待機中には起きず、移動で抽出を再開した場合は新しい開始時刻を使う。途中統合の杯は参加時刻も考慮する。
- 大きなtickでも発生時刻を飛ばさず記録する。終了まで対象を抽出しなかった場合は発生しない。カスタムJSONで杯数が足りない場合は対象のある機会だけを使う。
- 1件は1回の緊急案件。通知からフォームを開き、理由・杯数・担当／未割当・元抽出の中断／継続を利用者が決める。未手配の対象は通常完了・移動・統合を止め、取り違えを防ぐ。
- 一部だけ入れ直して中断すると、残りの杯を未割当へ戻す。継続なら入れ直し対象以外を元の列に残す。元の列の待機は自動開始せず「始める」で再開する。
- 入れ直した杯が品質基準を満たして完了すると対応済みとする。短すぎる完了は再手配の通知へ戻す。二重加点しない。発生した緊急案件が未完了なら得点は最大79点。

## 採点

採点は仕上げた杯数に加え、品質と提供準備を評価する。基準時間は訓練用の初期設定であり、現場の観測データに基づく統計モデルではない。

| 評価 | 配点 | 計算 |
| --- | --- | --- |
| 完了 | 45 | 完了杯数 / シナリオの抽出総杯数 |
| 提供準備 | 25 | 到着から480秒以内に、品質基準を満たして完了した杯数 / 総杯数 |
| 抽出品質 | 20 | 予定抽出時間の90%以上で完了した杯数 / 総杯数 |
| 同一注文の仕上がり | 10 | 全抽出杯が品質基準を満たし、完了時刻の差が60秒以内の注文件数 / 抽出が必要な注文件数 |

合計を四捨五入して0〜100点。指名・上級生の条件違反を試みた操作はブロックし、1回2点（最大20点）減点する。80点以上には以下をすべて満たす必要があり、満たさなければ最大79点。

1. シナリオ全体の90%以上の杯を完了。
2. 完了した杯の95%以上が抽出品質を満たす。
3. 指名・上級生条件への違反がゼロ。
4. 発生した緊急淹れ直しがすべて品質基準を満たして完了。

80点以上は「店舗運営を任せられるレベル」、60〜79点は「サポート付きで運営できるレベル」。各モードの課題内での目安とし、フルで総合確認する。

現行mainと同じく抽出は商品を問わず1杯300秒・2杯360秒。空の列への配置で開始する。未着手に戻した場合は操作メニューの「始める」で再開し、「終える」で完了と次の抽出開始を行う。開始後60秒までは未着手に戻せ、60秒以降は完了・緊急の入れ直しが可能。抽出中のカードを別の列へ移す・未割当へ戻す場合は抽出時間をリセットする。

開始前に全シナリオのカップ台帳を作成する。途中終了・時間切れでも未到着の注文を分母から外さない。連打による早すぎる完了は品質・提供準備・仕上がり点に入らず、全杯連打しても最大45点。

入れ直しは理由・杯数・担当／未割当・元抽出の中断／継続を利用者が選択する。同じ杯の完了点は一度取り消し、入れ直し完了時だけ再評価するため、二重加点しない。

結果は採点内訳、未完了杯数、品質、改善点、操作記録を表示。JSON出力にはシナリオ・結果・各杯・操作イベント・乱数シード・緊急の抽選と対応状態を含む。得点履歴はこのブラウザのlocalStorageだけに保存する。

## 検証

`npm run test:training` は全モードでの合理的な割当方針による合格到達、未操作、早期終了、連打、制限時間、一時停止、条件違反、提供遅延、仕上がり差、統合のカップ追跡、限定豆の区別、移動と戻し、数量分割、マスターのフラグ、不正JSON、コメントの検証・到着時表示・統合後の元注文追跡、緊急の独立抽選・75%境界・一時停止・粗いtick・部分中断・全抽選結果での合格到達を検証する。

`npm run lint`（型検査を含む）、`npm run build` と合わせてCIで実行する。

## Learning flow and browser history (2026-10-25)

`#training` opens a learning menu: tutorial → game → review. Nine interactive lessons cover A/C and order highlighting, number lookup/order tabs/comments and replies, assignment, nomination/senior requirements, undo/start/move/return, merge/split, timed completion, guaranteed emergency handling, and original-brew discard confirmation. Tasks advance only after the relevant interaction or reducer state; the tutorial clock advances only through its practice control. Lessons can be replayed, and experienced operators can open the game directly. Tutorial progress is browser-local and tutorial activity never creates a scored result.

The game retains its three modes, sparse special orders, independent emergency probabilities and 80-point criteria. Continuing an original brew leaves it on the board with current main's discard suggestion, while only the remake retains credit for the replaced cup. A partial discard cannot delete unrelated cups. Queued merged cards can split one cup to unassigned while leaving the other in place.

Finished games are stored in `localStorage` under `caos-training-results-v2` (latest 100 attempts): timestamp, mode, score, category details, feedback, violations, seed, emergency outcomes, cups and action log. The history screen filters by mode, shows best/pass counts and per-attempt details, and exports JSON. `caos-training-results-v1` score/date entries are migrated without inventing unavailable details. Reads validate stored data; denied storage or quota failures leave the current result visible and offer JSON export. Site-data deletion removes this device/browser's results; there is no account or cross-device sync. Course progress uses `caos-training-course-v1`.

Current source reference: `cafeore-pos/main@173c9f18b71a4435fd967916378ed4df06efdbc4`. See `src/current-caos/UPSTREAM.md` for integration boundaries.
