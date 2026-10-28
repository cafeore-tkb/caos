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

同梱マスターは `src/data/training-master.json`。営業10/20/30分、6/12/44件（抽出10/23/66杯）。架空シナリオは `public/training/{fast,middle,full}.json`。生成元は `scripts/generate-training.ts`。標準JSONは注文のテンプレート。開始時のシードで、数量・限定条件が同じ商品枠でコーヒー名を入れ替え、到着時刻も抽選する。指名・限定の枠と総杯数・商品構成・売上上限は保つ。緊急イベントも抽選し、結果JSONにシードと抽選・発生・対応の状態を記録する。

| モード | 注文 | 指名あり | 上級生限定あり | コメントあり |
| --- | --- | --- | --- | --- |
| ファスト | 6件 | 1件 | 1件 | 1件 |
| ミドル | 12件 | 2件 | 1件 | 2件 |
| フル | 44件 | 3件 | 2件 | 3件 |

件数は注文単位で重複あり。通常注文を中心に、指名先を複数の担当者へ分散する。限定豆はマスターの `senior_only` から選び、上級生への指名との組合せも含める。ミドルは最後の注文から8分の仕上げ時間を設ける。

標準はファスト2倍、ミドル3倍、フル4倍。1〜10倍を0.5刻みのスライダーで変更でき、一時停止は到着・時計・抽出と盤面の操作を止める。ファスト・ミドルは最後に6分30秒以上の仕上げ時間を設ける。フルは開始時に8件12杯を積み、全割当時の予測で採点する。フルは2件が8秒差で到着する短いピークを繰り返す。

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
| 完了 | 35 | 完了杯数 / シナリオの抽出総杯数 |
| 提供準備 | 25 | 到着から480秒以内に、品質基準を満たして完了した杯数 / 総杯数 |
| 抽出品質 | 20 | 予定抽出時間の90%以上で完了した杯数 / 総杯数 |
| 同一注文の仕上がり | 10 | 全抽出杯が品質基準を満たし、完了時刻の差が60秒以内の注文件数 / 抽出が必要な注文件数 |

| アイス1杯の配分 | 10 | 対象となる完了杯のうち、上級生へ割り当てた割合。指名なし・1杯抽出で、割当時に上級生の待ち時間が割当先＋60秒以内なら対象。2杯・上級生が忙しい場面は対象外。対象なしは満点（未完了のみなら0）。 |

合計を四捨五入して0〜100点。指名・上級生の条件違反を試みた操作はブロックし、1回2点（最大20点）減点する。80点以上には以下をすべて満たす必要があり、満たさなければ最大79点。

1. シナリオ全体の90%以上の杯を完了。
2. 完了した杯の95%以上が抽出品質を満たす。
3. 指名・上級生条件への違反がゼロ。
4. 発生した緊急淹れ直しがすべて品質基準を満たして完了。
5. 対象のアイス1杯の半数以上を上級生へ割当（対象なしは除外）。

80点以上は「店舗運営を任せられるレベル」、60〜79点は「サポート付きで運営できるレベル」。各モードの課題内での目安とし、フルで総合確認する。

現行mainと同じく抽出は商品を問わず1杯300秒・2杯360秒。空の列への配置で開始する。未着手に戻した場合は操作メニューの「始める」で再開し、「終える」で完了と次の抽出開始を行う。開始後60秒までは未着手に戻せ、60秒以降は完了・緊急の入れ直しが可能。抽出中のカードを別の列へ移す・未割当へ戻す場合は抽出時間をリセットする。

開始前に全シナリオのカップ台帳を作成する。途中終了・時間切れでも未到着の注文を分母から外さない。連打による早すぎる完了は品質・提供準備・仕上がり点に入らず、全杯連打しても最大45点（完了35＋配分10、品質の必須条件は未達）。

入れ直しは理由・杯数・担当／未割当・元抽出の中断／継続を利用者が選択する。同じ杯の完了点は一度取り消し、入れ直し完了時だけ再評価するため、二重加点しない。

結果は採点内訳、未完了杯数、品質、改善点、操作記録を表示。JSON出力にはシナリオ・結果・各杯・操作イベント・乱数シード・緊急の抽選と対応状態を含む。得点履歴はこのブラウザのlocalStorageに保存する。表示名で掲載した標準ゲームは共有ランキングにも送信する。営業スコアは品質OKのコーヒー売上（マスター価格、1円＝1pt）＋指名100pt/杯＋限定150pt/杯＋実際の2杯統合100pt/組。淹れ直しは元の杯IDで一度だけ計上し、統合は同じ抽出で2杯を適切に完了した場合に加算する。営業点はマスターの合格条件を置き換えない。

## 検証

`npm run test:training` は全モードでの合理的な割当方針による合格到達、未操作、早期終了、連打、制限時間、一時停止、条件違反、提供遅延、仕上がり差、統合のカップ追跡、限定豆の区別、移動と戻し、数量分割、マスターのフラグ、不正JSON、コメントの検証・到着時表示・統合後の元注文追跡、緊急の独立抽選・75%境界・一時停止・粗いtick・部分中断・全抽選結果での合格到達を検証する。

`npm run lint`（型検査を含む）、`npm run build` と合わせてCIで実行する。

## Learning flow and browser history (2026-10-25)

`#training` opens a learning menu: tutorial → game → review. Ten interactive lessons cover A/C and order highlighting, number lookup/order tabs/comments and replies, assignment, nomination/senior requirements, undo/start/move/return, merge/split, timed completion, guaranteed emergency handling, and original-brew discard confirmation, and normal/manual shift handoff. Tasks advance only after the relevant interaction or reducer state; the tutorial clock advances only through its practice control. Lessons can be replayed, and experienced operators can open the game directly. Tutorial progress is browser-local and tutorial activity never creates a scored result.

The game retains its three modes, sparse special orders, independent emergency probabilities and 80-point criteria. Continuing an original brew leaves it on the board with current main's discard suggestion, while only the remake retains credit for the replaced cup. A partial discard cannot delete unrelated cups. Queued merged cards can split one cup to unassigned while leaving the other in place.

Finished games are stored in `localStorage` under `caos-training-results-v2` (latest 100 attempts): timestamp, mode, score, category details, feedback, violations, seed, emergency outcomes, cups and action log. The history screen filters by mode, shows best/pass counts and per-attempt details, and exports JSON. `caos-training-results-v1` score/date entries are migrated without inventing unavailable details. Reads validate stored data; denied storage or quota failures leave the current result visible and offer JSON export. Site-data deletion removes this device/browser's results; explicitly published server-issued standard games additionally synchronize to the shared ranking; custom JSON and historical browser-only attempts stay local. Course progress uses `caos-training-course-v1`.

Current source reference: `cafeore-pos/main@173c9f18b71a4435fd967916378ed4df06efdbc4`. See `src/current-caos/UPSTREAM.md` for integration boundaries.

## Floating tutorial guidance

All ten lessons use a non-modal floating guide rendered outside the board layout. The guide follows the first unfinished task and resolves actual visible controls: A/C switches, order lookup/tabs/comments, card bodies and assignment numbers, card action trays, individual rebrew fields, and discard confirmation. A red outline and an animated dashed arrow identify the target without intercepting pointer input. Only the guide itself takes input, and it can be collapsed.

Position is recalculated after scroll, resize and DOM/form changes, avoiding the current target, input panels and confirmation dialogs. A native discard confirmation hosts the guide in the same top layer so it remains visible and interactive. Tutorial descriptions reserve zero board space; the normal and tutorial board start at the same vertical position. The practice clock control appears within the guide only for timed completion tasks. Both pulse and arrow motion honor `prefers-reduced-motion`.

Validation includes the complete nine-lesson browser flow, A/C changes, field-by-field rebrew targeting, confirmation-dialog recovery, collapsing/restoring, and 1024×768 placement. Geometry tests check viewport boundaries, target/form overlap and arrow endpoints.

## 2026-10-26 short operational UI

The guide uses a short action title and one instruction (at most 48 characters). The course menu lists a brief lesson summary rather than all tasks. Games, score history and setup use the same concise style. Core pass criteria, scenarios, emergency draws, and local history remain unchanged. Board view labels and header placement match the production master sheet. Number lookup uses the production keypad and 500ms search behavior, including Enter/Escape, while the tutorial remains non-modal. Search results, assignment and rebrew panels use the production side-panel position. The standalone assignment panel now preserves the production select-order → select-dripper → confirm flow. Production board row heights and C's 560px queue column are preserved without training-only size overrides.

## Persistent controls outside the board

Learning, setup, results and history use a viewport-height shell. Primary actions remain outside the scrollable lesson/detail areas. The desktop curriculum shows ten lessons, including the final shift-handoff lesson; setup keeps all modes and the selected start action visible. Result details and history panes scroll independently from the footer. History can open game setup directly. Primary actions use 64px minimum height and 20px text; results emphasize the score at 96px. `screens.css` scopes these screen changes without modifying production board components or geometry. Tutorial time/next and game pause/finish controls have larger touch targets too.

## Coffee-club visual theme

`theme.css` confines the palette to training menus, setup, results, history and coach controls. Cream paper, espresso text, forest green, ink blue, brick and ochre use solid fills and crisp borders. Each game mode has a consistent accent, an explicit selected label/check, and a matching start button. The course progress bar derives solely from completed lessons. Production board colors and geometry are unchanged; urgent targets retain red arrows. The coach uses a book icon. Copy clarifies manual practice time and the timing requirement for a passing score.

## シフト交代と共有ランキング（2026-10-26）

シフト交代は最後の10番目。10時〜11時の1時間コマを使い、10:50の予告と次の担当名、10:55の強調、10:59で6人のワンタップ交代、即交代の誤タップ注意、交代後の再タップ→B4→田中、11:10の予告なしでの名前入力、他レーンとの交換、空きと候補復帰を教える。本家の交代パネル・候補ロジックを使用し、ガイドはフローティング表示。通常のシフトデータは30分が既定で、レッスンのフィードだけ60分コマを指定する。実店舗の担当者・シフトAPIには書き込まない。

Cloudflare Workerと専用D1を使用。開始前にプレイヤー名だけを入力し、終了後は自動掲載して、モード別かつマスター／営業別の自己ベストを共有する。上位100件ごとにページ切替。画面・APIとも採点ルール `2026-10-v4` を使用し、旧版は順位比較に混ぜない。サーバー発行のシードと共有エンジンで注文・操作を再生する。詳細は `worker/README.md`。

## 5段階の評定（2026-10-26）

結果・履歴・ランキングにA+／A／B／C／Dを併記する。A+は95点以上、かつモード全体の上位10％未満。Aは80点以上でA+条件を満たさない場合、Bは70〜79、Cは60〜69、Dは60点未満で不合格。運営基準の80点と必須条件は継続する。

母集団は同モード・現行ルールで採点を終えた人。各人のマスター自己ベストを1件使い、対象得点以上の人（同点を全員含む）×10が全人数より小さい時だけA+となる。10人中1人は10％なので対象外、11人中1人は対象。95点未満は順位に関係なくA+にせず、95点以上でも人数・順位条件を満たさなければAとする。

端末のみはAまで。サーバー採点後は本人専用APIで共有評定を取得し、結果と端末履歴へスナップショットを保存する。ランキングは現在の人数・記録から再計算する。旧OR基準のメタデータは評定ポリシーIDで除き、元の得点・履歴を残す。

評語は[筑波大学GPA制度](https://www.tsukuba.ac.jp/education/ug-courses-gpa/)を参考とし、本ツールの95点基準と相対評価は独自設定である。

## 表示名だけで掲載（2026-10-27）

標準ゲームは開始前に1〜30文字のプレイヤー名を入力する。ゲーム終了・採点後に端末保存とランキングへの自動掲載を行い、結果画面には掲載中・掲載完了・通信失敗と再送を表示する。開始時の名前を固定して送るため、次のゲームで名前を変更しても前の記録は変わらない。ランキング・表示名ごとのプロフィールは入力なしで閲覧可能。前回の名前は次回の開始欄に補完する。持込JSON・端末のみの練習・チュートリアルは共有しない。

表示名を1人分の共有記録として扱い、複数端末の同名スコアを集約する。共有端末で別の人の名前を入れても既存の名前・スコアは変更しない。評定の母集団も掲載済みの表示名1件につき1人。ゲーム開始用の匿名セッションや未掲載の結果で人数を水増ししない。ゲームの所有確認だけは端末内の自動トークンで維持し、点数の自己申告は採用しない。

フルは30分40件60杯の繁忙基準に10%を加えた44件66杯。ルールv3から適用し、旧スコアと共有順位を混在させない。予告表示は本家mainと同じく開始10分前以上・開始時刻未満。11:00ちょうどには消えるため、ワンタップ練習の時計を10:59で止める。予定時刻を過ぎてからは候補パネルで交代する。

## フルの予測採点（v3）

営業30分は延長しない。開始時8件12杯を未割当に積み、残り36件を営業中に到着させる。全注文到着・未割当ゼロ・緊急の未手配ゼロで自動採点する。手配後の淹れ直し抽出は予測に含める。30分到達時、または途中終了でも、その時点の割当を予測する。

実際の完了記録は変更しない。未完了の割当カードだけ、タイムライン表示と同じ `startTimeSec + totalDurationSec` を終了予測とし、カップを仮集計する。未割当・未到着は加点しない。実際の早すぎる抽出完了を上書きして品質を回復させることはできない。発生済みで未手配の緊急を残して終了すると79点が上限。採点前に発生していない緊急は対応機会がないため減点しない。手配済みで品質を満たす見込みの淹れ直しは完了見込みに含む。

配点は割当35・完了予測25・抽出時間20・同時10・アイス配分10。速度点は `25 * max(0, 1 - max(0, 終了予測秒 - 基準秒) / 900)`。基準秒は営業30分と「全杯を6台で2杯ずつ360秒抽出する最短時間」の大きい方（66杯では33分）。33分以内25点、48分以降0点。売上・指名・限定・統合は未完了分を見込みとして算入し、結果・履歴・ランキングにも見込みと明記する。旧v2記録は保持し、現行ランキングと混在させない。


## 注文ごとの振り返りと操作の修正（2026-10-29）

結果と履歴には、注文番号ごとに失った点数、理由、次に試す操作を表示する。注文番号で絞ると、注文の到着、担当への割り当て、移動、抽出開始、終了の時刻を確認できる。実際の操作とフルモードの完了見込み、採点の目標時刻は表示を分ける。すべてゲーム開始からの経過時間で表示する。

- 早く終えすぎたカップは、実際の抽出秒数と必要な秒数を示す。途中でまとめたカップは、加えた時点から数える。
- 8分を超えた注文は、かかった時間と超過分を示す。同じ注文の仕上がりが60秒を超えてずれた場合も、実際の差を示す。
- フルの完了が遅い場合は、最後に終わる注文番号と、タイムラインの完了見込みを示す。採点の目安は `max(営業時間, 全杯数÷2×360秒÷6台)` と同じ値を使う。
- 指名・限定豆の条件に合わない操作は、注文番号と試した担当番号を記録する。1回2点の減点と、80点以上の条件を満たさないことによる79点上限は別に説明する。
- 項目ごとの失点、条件違反、四捨五入、0点の下限、79点の上限を足し引きすると、結果の点数に一致する。同じ操作が複数の項目に影響する場合も、それぞれを表示する。
- 新しい振り返りは履歴と結果JSONに保存する。旧履歴は従来の点数と説明を表示し、壊れた振り返りデータだけを除く。

「キュー」は画面とガイドで「待ち列」に変更した。抽出品質の説明は、採点で実際に使う「抽出時間を守る」にそろえた。yomiyasuの推敲手順で文を確認し、数値と条件は採点エンジンに照らして残す。

未割当へ戻したカードから抽出状態を外し、まとめ直して分けても両方の注文とカップIDを保つ。待機中の2杯から1杯を外す場合も、元のカードのキーを残し、外したカードには操作ごとの新しいキーを付ける。分けた後の注文番号と指名は各カップの元の情報へ戻す。

淹れ直しカードの登録時刻には元注文の時刻を使わない。開始まで待った注文でも、登録後に元のカップへゴミ箱が表示される。破棄は選んだ元のカップだけに適用し、新しい淹れ直しは残す。

タイムラインのカード検索は専用のスクロール命令で行い、現在時刻への追従と競合させない。900px以下の画面では盤面全体の横スクロールをなくし、タイムラインの中だけを横に動かす。ヘッダーは「現在を表示中」と「現在に戻る」を切り替える。

未割当のカードを選ぶ操作ではタイムラインを動かさない。緊急のカードも同様で、同じ注文番号の元カードへ自動で移動しない。画面の移動は番号検索、未提供一覧からの表示、画面外のカードを表示する操作に限る。

操作と再生結果が変わるため、採点ルールをv4へ更新する。公開時はWorkerと画面を同じ版へ更新する。v3の保存済み結果は残し、共有順位ではv4と分ける。

## 担当者の再現と緊急の誘導（v6）

モードは5つを横一列に表示する。ぶっちーは「04 / 初日の開店１時間後」、しょーんは「05 / ２日目の最後」。

フル・ぶっちー・しょーんでは、2nd〜4thをそれぞれ25%でホットのみの担当にする。3人が当選した場合はランダムに1人を外し、最大2人とする。その人と既存の上級生を除く担当から、別途25%で3人目の上級生を選ぶ。ホットのみの担当へアイスコーヒー・アイスオレは割り当てられない。フルの指名枠は担当条件と矛盾しない商品へ振り分け、全注文を手配できる状態を保つ。

上級生は0.90〜0.97、それ以外は0.97〜1.07の係数を、1杯と2杯で独立に抽選する。数値は画面に表示しない。ゲーム開始時のシードで固定し、抽出の残り時間・移動・統合・分割・タイムライン・完了予測・サーバーの採点に同じ値を用いる。ファスト・ミドル・チュートリアルの担当は固定。

ミドルは従来どおり1回、フルと再現2モードは2回の緊急の機会を持ち、それぞれ50%で発生する。発生時には画面上部に担当番号・注文番号・抽出ミスまたは異物混入を表示する。カード→カード自身の緊急ボタン→カップ・理由→確定の順に、赤枠と矢印で誘導する。通知から直接登録したり、ユーザーの代わりにカードのボタンを押したりしない。通常ゲームの案内はタイムラインを自動スクロールしない。
