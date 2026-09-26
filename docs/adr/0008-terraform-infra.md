# ADR 0008: デプロイの前提を Terraform で作る

- 状態: 採用
- 日付: 2026-09-26

## 背景

[ADR 0005](./0005-deploy-and-e2e.md) では、本番 D1 の作成、デプロイ用 API トークンの発行、GitHub の `production` Environment・secret・リポジトリ変数の設定を手作業にしていた。これらを手順書ではなくコードで再現できるようにしたい。

## 決定

- `infra/` に Terraform を置き、次のものを管理する
  - Cloudflare: D1 `expire-food`（`prevent_destroy`）、デプロイ用のアカウントトークン（対象アカウントに限定し、Workers Scripts / D1 / Workers AI の Write だけ）
  - GitHub: `production` Environment（承認者は自分、`main` のみ）、Environment secret `CLOUDFLARE_API_TOKEN`（上のトークンの値）、リポジトリ変数 `CLOUDFLARE_ACCOUNT_ID`、main の Ruleset（それまでの `.github/rulesets/main.json` を UI で取り込む方式をやめる）
- state はローカルに置き、コミットしない（`.gitignore`）。apply も手元からだけ行う。CI で apply すると、トークンを発行できる強い権限を GitHub に置くことになるうえ、変更の頻度が低いので自動化しても得るものが少ない
- Worker 本体のデプロイとマイグレーションは Terraform で持たず、これまでどおり `deploy.yml`（wrangler）で行う。同じものを二重に管理しないため
- `database_id` は `terraform output` の値を `wrangler.jsonc` に書いてコミットする。D1 を作り直さない限り変わらないので、差し込む仕組みは作らない

## 影響

- 手元に残る作業は、Terraform を動かすための認証情報の用意（Cloudflare の Account API Tokens: Edit と D1: Edit を持つトークン、`gh auth token`）と、デプロイの承認だけになる
- state はこの手元にしか無い。失うとトークンと Environment を Terraform の管理下に戻す（`import` するか、作り直す）必要がある。secret の値も平文で入るので、state のファイルは共有しない
- `workers.dev` のアカウントのサブドメインは provider にリソースが無いため対象外。まだ登録していないアカウントなら、ダッシュボードで登録する
- `CLOUDFLARE_ACCOUNT_ID` を作った時点から、main への push がデプロイ（承認待ち）になる
