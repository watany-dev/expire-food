# expire-food

スマホのブラウザで使う、食品の賞味期限・消費期限管理アプリ。写真から AI で商品名と期限を読み取り、期限の近い順に一覧表示する。

- 要件: [docs/requirements.md](docs/requirements.md)
- ロードマップ: [docs/ROADMAP.md](docs/ROADMAP.md)

## 技術スタック

Vite+ (`vp`) / Bun / Hono (JSX) / Cloudflare Workers / D1 / Workers AI

## セットアップ

```bash
bun install                   # prepare で Git hooks（vp staged）も有効化される
bun run db:migrate:local      # ローカル D1 にマイグレーション適用
bun run dev                   # vp dev（workerd 上で Worker が動く）
```

Workers AI はローカルでもリモート実行のため、`/api/extract` を試すには `bunx wrangler login` が必要。

## よく使うコマンド

| コマンド               | 内容                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `bun run check`        | 整形 / lint / 型チェック（`vp check`、`--fix` で自動修正）                           |
| `bun run test`         | テスト（`vp test`、CI では `vp test --coverage` で閾値を検査）                       |
| `bun run build`        | 本番ビルド                                                                           |
| `bun run knip`         | 未使用のファイル / export / 依存の検出                                               |
| `bun run e2e`          | E2E（Playwright。iPhone / Pixel の viewport。要 `bunx playwright install chromium`） |
| `bun run lighthouse`   | Lighthouse CI（`lighthouserc.json` の閾値。要 Chrome）                               |
| `bun run semgrep`      | Semgrep（要 `semgrep` コマンド）                                                     |
| `bun run cf-typegen`   | `wrangler.jsonc` から `worker-configuration.d.ts` を再生成                           |
| `bun run usage`        | 無料枠の消費（直近 7 日）。下の「無料枠の確認」                                      |
| `bun run extract-eval` | 実物の写真で読み取りモデルを比べる。下の「読み取りモデルの比較」                     |

## CI で見ていること

`.github/workflows/` を参照。`vp check` / `vp test --coverage`（閾値付き）/ `vp build` とバンドルサイズ / `wrangler types --check` / D1 マイグレーション適用 / knip / Semgrep（独自ルールのテスト込み）/ Checkov（`infra/` の Terraform）/ Playwright E2E / Lighthouse CI / zghalint / CodeQL / OpenSSF Scorecard。GitHub の UI で行う設定は [docs/repository-settings.md](docs/repository-settings.md)。

## 運用

デプロイは main への push で `.github/workflows/deploy.yml` が行う（`vp build` → `wrangler d1 migrations apply --remote` → `wrangler deploy`）。`production` Environment の承認待ちになるので、GitHub の Actions 画面で承認する。構成は [ADR 0005](docs/adr/0005-deploy-and-e2e.md)。

### 初回（Terraform）

本番 D1、デプロイ用トークン、GitHub の `production` Environment・secret・リポジトリ変数 `CLOUDFLARE_ACCOUNT_ID`・main の Ruleset は `infra/` の Terraform で作る（[ADR 0008](docs/adr/0008-terraform-infra.md)）。state はローカルにだけ置く。

1. Cloudflare でカスタムトークンを作る。対象アカウントに限定し、権限は Account / Account API Tokens: Edit と Account / D1: Edit。Terraform を動かすときだけ使う
2. apply する

   ```bash
   export CLOUDFLARE_API_TOKEN=...            # 1 のトークン
   export GITHUB_TOKEN=$(gh auth token)       # リポジトリの admin 権限が要る
   export TF_VAR_cloudflare_account_id=...
   terraform -chdir=infra init
   terraform -chdir=infra apply
   ```

3. `terraform -chdir=infra output -raw d1_database_id` の値を `wrangler.jsonc` の `database_id` に書いて PR を出す。マージするとデプロイが承認待ちになり、マイグレーションもそこで適用される

apply で `CLOUDFLARE_ACCOUNT_ID` が作られた時点から、main への push はデプロイになる。3 より先に別の PR をマージすると、ダミーの `database_id` のままデプロイされて失敗するので、承認画面で却下する。デプロイ用トークンを作り直すときは `terraform -chdir=infra apply -replace=cloudflare_account_token.deploy` を実行する。

### マイグレーション

- `migrations/` に新しい連番ファイルを足す（既存ファイルは編集しない）。ローカルは `bun run db:migrate:local`
- デプロイはマイグレーションを先に適用してから Worker を差し替える。適用後・差し替え前は旧 Worker が新スキーマで動くので、列の追加は `NULL` 可か既定値付きにし、列やテーブルの削除は「使わなくする版をデプロイ → 次の版で削除」の 2 段階に分ける
- 適用状況は `bunx wrangler d1 migrations list expire-food --remote`

### 実ユーザーの Core Web Vitals

各画面が離れるときに LCP / INP / CLS を `POST /api/vitals` に送り、Worker が `message: "web-vitals"` のログとして残す（[ADR 0006](docs/adr/0006-real-user-web-vitals.md)）。Cloudflare ダッシュボードの Workers → expire-food → Observability の Query Builder で `message = web-vitals` に絞り、`path` ごとに `lcp` / `inp` / `cls` の P75 を見る。

### 無料枠の確認

```bash
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... bun run usage
```

GraphQL Analytics API から、アカウント全体の 1 日あたりの消費（Workers のリクエスト数、Workers AI の Neurons、D1 の読み書き行数）を直近 7 日分（UTC。無料枠は UTC 0 時にリセット）、無料枠に対する割合付きで出す。どれかが 8 割を超えた日があれば `!`（上限到達は `✗`）を付けて終了コード 1 になる（取得に失敗したときは 2）。トークンはデプロイ用とは別に、Account / Account Analytics: Read だけのものを作る。

- Workers AI が上限に達するとその日の読み取りは失敗し、画面は手入力に戻る（ADR 0003）。1 回あたりの Neurons は、読み取りの回数と見比べてモデル選定（Phase 3 の残タスク）の材料にする
- Workers Logs のイベント数は 1 リクエストにつき 1〜2 件（呼び出しのログと `web-vitals` のログ）なので、リクエスト数が無料枠に収まっていれば Workers Logs の無料枠にも収まる

### 読み取りモデルの比較

ROADMAP Phase 3 の残タスク（実物パッケージでモデルとプロンプトを決める）用。写真（JPEG / PNG / WebP、2MB 以下。本番と揃えるなら長辺 800px 程度）と正解の `expected.json` を 1 つのディレクトリに置く。写真はリポジトリに入れない。

```json
{
  "milk.jpg": { "name": "牛乳", "expires_on": "2026-10-05", "kind": "use_by" },
  "bread.jpg": { "name": "食パン", "expires_on": "2026-09-28", "kind": "best_by" }
}
```

```bash
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... bun run extract-eval ~/photos \
  @cf/google/gemma-4-26b-a4b-it @cf/meta/llama-4-scout-17b-16e-instruct
```

引数は読み取りモデル（段階処理の最初の段）で、省くと本番のモデル（`src/platform/ai.ts` の `READ_MODEL`）だけを試す。本番と同じ段階処理（`extractItem`。候補が複数残った写真では判定モデル `JUDGE_MODEL` も呼ぶ。登録済みの商品名は使わない）を通し、モデルごとに商品名・期限日・種別の正解数、確信度 `high` なのに期限日を誤った数（フォームで確認を促さないので一番危ない）、平均応答時間と、外れた写真を出す。商品名はどちらかがもう一方を含めば正解とする。年省略の日付は実行した日（JST）を基準に補完されるので、正解もそのつもりで書く。トークンは Workers AI の権限だけのものを作る。Neurons はモデルごとには出ないので、1 モデルずつ実行して `bun run usage` の差分で見る。決めたモデルは `src/platform/ai.ts` の `READ_MODEL` に反映し、ADR 0007 を更新する。

### ロールバック

- Worker: `bunx wrangler deployments list` で版を確認し、`bunx wrangler rollback [version-id]` で戻す。上のとおりマイグレーションは旧版でも動く形にしているので、スキーマはそのままでよい
- D1: マイグレーションに down は無い。戻すときは打ち消すマイグレーションを新しく足す。データを壊したときは Time Travel（無料プランは過去 7 日、有料は 30 日）で戻す

  ```bash
  bunx wrangler d1 time-travel info expire-food --timestamp=2026-10-01T09:00:00+09:00   # その時点の bookmark を確認
  bunx wrangler d1 time-travel restore expire-food --timestamp=2026-10-01T09:00:00+09:00
  ```

  restore はその時点以降の書き込みをすべて失う。`d1_migrations` テーブルも戻るので、restore 後に `migrations list` で適用状況を確かめる
