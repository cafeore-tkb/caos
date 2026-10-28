# main更新からの自動公開

CaOSの`main`を更新すると、[Build and deploy Pages](../.github/workflows/deploy-pages.yml)が次の順で公開する。

1. 型・スタイル・練習のテスト・公開処理のテストを確認する。
2. `/caos-game/`向けにビルドし、ソースのコミットと採点ルールを`release.json`へ記録する。
3. 同じソースから採点APIをCloudflare Workersへ公開し、`/health`の採点ルールを照合する。
4. 検証したビルド成果物だけを、`cafeore-tkb/caos-game`の`main`にある`site/`へ送る。
5. 公開用リポジトリのPagesワークフローが自動で動く。配信中の`release.json`が更新したコミットと一致するまで確認する。

公開先は[CaOS](https://cafeore-tkb.github.io/caos-game/)。[Pagesの公開履歴](https://github.com/cafeore-tkb/caos-game/deployments/github-pages)でも結果を確認できる。CaOS側のActionsの完了画面にも両方のリンクを表示する。

PRでは検証とビルドだけを行う。公開用のトークンとCloudflare認証は`main`の公開ジョブだけで使う。同じブランチに次の更新が入れば古い実行を止め、再実行した古いコミットからの公開も拒否する。

## 認証

CaOSのActionsに次のシークレットを設定する。値はソースやログに書かない。

| 名前 | 用途 |
| --- | --- |
| `PAGES_PUBLISH_TOKEN` | 公開用リポジトリに成果物を送る専用トークン |
| `CLOUDFLARE_API_TOKEN` | 既存の採点APIを公開するCloudflareトークン |
| `CLOUDFLARE_ACCOUNT_ID` | 採点APIのCloudflareアカウント |

公開用リポジトリではDeploy keyが無効になっているため、専用のfine-grained personal access tokenを使う。作成時のResource ownerは`cafeore-tkb`、Repository accessは`caos-game`だけ、Repository permissionsはContentsのRead and writeに限定する。ほかのリポジトリや管理権限は付けない。組織の承認が必要な場合は承認後に使う。

この専用トークンを[CaOSのActionsシークレット](https://github.com/cafeore-tkb/CaOS/settings/secrets/actions)へ`PAGES_PUBLISH_TOKEN`という名前で登録する。普段のCLIログイン用トークンは流用しない。有効期限を付け、期限の前に更新する。廃止するときは専用トークンを失効させ、CaOS側のシークレットも削除する。

GitHub標準の`GITHUB_TOKEN`は別リポジトリへの書き込みに使えないため、専用トークンが必要になる。このトークンによる公開用リポジトリへのpushが、そちらのPagesワークフローを起動する。

## 送るものと残すもの

送るのはビルド済みの`dist/`だけ。CaOSのソース、設定、`.env`、Workerコードは公開用リポジトリへコピーしない。架空の練習注文JSONは従来どおり公開する。

公開用リポジトリのREADMEとPagesワークフローは保持する。古いmain向けの成果物は削除するが、`site/astalum-dev/`があれば独立したプレビューとして残す。ファイルサイズと時刻が同じでも内容が違えば更新する。同じコミットの同じ成果物を再送しても、余計なコミットを作らない。

## 失敗したとき

CaOSのActionsで失敗した工程を確認し、設定やソースを直して`main`を更新する。`workflow_dispatch`で`main`の最新の公開を再実行することもできる。採点APIの更新や版の照合に失敗した場合は、画面の公開へ進まない。

手元からの再公開には`main`で`npm run publish:pages`を使う。この操作の前に、採点APIを同じソースの版へそろえる。D1のスキーマ変更がある場合は、互換性を確認して必要なマイグレーションを先に適用する。自動公開はD1のスキーマを変更しない。
