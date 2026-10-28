# main更新からの自動公開

ソースとGitHub Pagesを `cafeore-tkb/caos` に一本化する。公開先は https://cafeore-tkb.github.io/caos/ 。ルートと `#training` はゲーム画面、`#control` は管制盤。

mainへのpushで `.github/workflows/deploy-pages.yml` が型・スタイル・練習テストを確認し、`/caos/` 向けの成果物をPagesへ直接公開する。PRは検証だけを行う。ビルドには元の実績データを含めない。GitHub標準のPages権限を使い、別の公開用リポジトリや `PAGES_PUBLISH_TOKEN` は不要。

公開する採点ルールとAPIの `/health` が一致することを公開前に確認する。不一致の場合は画面の公開を止める。公開後は `release.json` のコミットと採点ルールを照合する。

## 採点API

採点APIは既存の `caos-training-ranking.210on.workers.dev` とD1を維持する。既存のランキングを移動・削除しない。採点ルールや標準シナリオを変更するときは、同じソースで `npm run worker:deploy` を行ってからPagesを公開する。手元では正しいCloudflareアカウントへWranglerでログインする。D1のスキーマ変更は別に互換性を確認し、必要なマイグレーションを適用する。

GitHubに以前から登録されているCloudflare用secretsは別アカウント向けだったため、Pages公開には使用しない。APIのCI公開を追加するときは、既存Workerのアカウントを対象とするトークンを用意する。アカウントを変更して新しいDBを作ることで回避しない。

## 手動で再実行

Actionsの `Build and deploy Pages` をmainで再実行するか、mainで `npm run publish:pages` を実行する。

## 実績データの整理

全日分の実績ファイルと旧テスト画面を削除し、ブランチとタグの履歴からも元ファイルを除去する。公開するのは `public/training/butchi.json` と `shawn.json` のゲーム用注文だけ。注文番号・商品数・相対時刻に絞り、商品名を置き換え、注文キューは7分早く入れる。元の提供時刻・会計額・日付つきの実績は残さない。
