# ロードマップ

[要件定義書](./requirements.md) を実装するための段階計画。各 Phase は「動くものを main に入れる」単位で区切り、どの時点で止めても壊れていない状態を保つ。

## 前提と技術選定

| 領域                 | 採用                          | メモ                                                                                         |
| -------------------- | ----------------------------- | -------------------------------------------------------------------------------------------- |
| ツールチェーン       | Vite+ (`vp`)                  | dev / build / test (Vitest) / lint (Oxlint) / fmt (Oxfmt) / 型チェック / Git hooks を一本化  |
| パッケージマネージャ | Bun                           | `packageManager: bun@…`。`vp install` が Bun を検出して使う                                  |
| 本番ランタイム       | Cloudflare Workers            | 要件 2 の通り。Bun はローカルのパッケージ管理・スクリプト実行に使い、本番は Workers          |
| Web フレームワーク   | Hono + Hono JSX               | API と SSR 画面を同一 Worker で配信                                                          |
| Vite 連携            | `@cloudflare/vite-plugin`     | `vp dev` で workerd 上の Worker を動かす。`vp build` で `wrangler deploy` 可能な成果物を出す |
| DB                   | Cloudflare D1                 | `migrations/` を `wrangler d1 migrations` で管理                                             |
| 画像解析             | Workers AI（Gemma 4 + Jev）   | 段階処理（ADR 0007）。ローカル開発でも `remote: true` でリモート実行                         |
| レート制限           | Workers Rate Limiting binding | `EXTRACT_RATE_LIMITER`（10 回 / 60 秒）。キーは space_id                                     |
| 入力検証             | Zod + `@hono/zod-validator`   | スキーマは `src/domain/schema.ts`。API は `zValidator` で検証                                |

### Vitest の実行環境について

`@cloudflare/vitest-pool-workers` は現時点で Vitest 4 系までの対応で、Vite+ 同梱の Vitest 5 では使えない。そのため当面は次の方針とする。

- 純粋関数（日付正規化・表示ステータス判定など）: Node 上でそのままユニットテスト
- ルート / API: `app.request(path, init, env)` に対して、`wrangler` の `getPlatformProxy()` で得たローカル D1 などのバインディングを渡して結合テスト
- pool-workers が Vitest 5 に対応したら移行を検討する

## ガードレール（Phase 0 で整備済み）

| 仕組み                                                                         | 何を守るか                                                                               | 実行タイミング                             |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------ |
| `vp check`                                                                     | Oxfmt 整形 / Oxlint（type-aware）/ TypeScript 型チェック                                 | pre-commit（`vp staged`）・CI              |
| `vp test`                                                                      | ユニット / 結合テスト                                                                    | CI                                         |
| `vp build`                                                                     | Worker がバンドルできること                                                              | CI                                         |
| Playwright（`e2e/`）                                                           | スマホ viewport での主要導線（Phase 5 で追加）                                           | CI                                         |
| `wrangler types --check`                                                       | `wrangler.jsonc` と `worker-configuration.d.ts` のズレ                                   | CI                                         |
| `wrangler d1 migrations apply --local`                                         | マイグレーションが素の DB に適用できること                                               | CI                                         |
| knip                                                                           | 未使用のファイル / export / 依存                                                         | CI                                         |
| Semgrep（`p/typescript`, `p/secrets`）                                         | 一般的な脆弱パターン・秘密情報の混入                                                     | CI                                         |
| Semgrep 独自ルール（`.semgrep/`）                                              | 本アプリ固有の約束事（下表）                                                             | CI（ルール自体も `semgrep --test` で検証） |
| `vp test --coverage`（v8）                                                     | 全体 100%（branches 95%）、`src/domain/` はファイル単位で 100%。`src/platform/` は対象外 | CI                                         |
| Worker バンドルサイズ                                                          | gzip 後 3 MiB（無料プラン上限）未満、2/3 超で警告                                        | CI                                         |
| Lighthouse CI（`lighthouserc.json`）                                           | モバイルで Performance / Accessibility 90 以上、LCP ≤ 2.5s、CLS ≤ 0.1、TBT ≤ 200ms       | CI                                         |
| zghalint                                                                       | ワークフロー自体のセキュリティ・ベストプラクティス                                       | CI                                         |
| CodeQL（`security-extended`）                                                  | TypeScript と Actions の脆弱パターン                                                     | CI・週次                                   |
| OpenSSF Scorecard                                                              | リポジトリ全体のサプライチェーン衛生（目標 7.0 以上）                                    | main への push・週次                       |
| 依存の待機期間（Dependabot `cooldown` / `bunfig.toml` の `minimumReleaseAge`） | 公開から 7 日未満のバージョンを入れない                                                  | 常時                                       |
| Rulesets（`infra/github.tf`）                                                  | 必須チェック・承認 1 名・push で承認を外す                                               | 常時（apply は手元から）                   |
| Dependabot                                                                     | Bun 依存と GitHub Actions の更新                                                         | 週次                                       |
| Actions の SHA 固定 + `permissions: contents: read`                            | サプライチェーン・トークン権限の最小化                                                   | 常時                                       |

独自 Semgrep ルール:

| ルール                          | 対応する要件                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `no-math-random`                | 8.2 space_id / id は推測不能な値（`crypto.randomUUID()`）                    |
| `d1-no-dynamic-sql`             | SQL インジェクション防止。値は必ず `.bind()`                                 |
| `hono-no-raw-html`              | 商品名・メモ・AI 出力の XSS 防止（`raw()` / `dangerouslySetInnerHTML` 禁止） |
| `no-logging-request-payload`    | 8.1 画像をログ出力しない                                                     |
| `space-cookie-must-be-hardened` | 3.1 Cookie は HttpOnly / Secure / SameSite                                   |

### 各 PR の完了条件（Definition of Done）

- CI（check / knip / semgrep / e2e / lighthouse / zghalint / CodeQL）がすべて緑
- 不安定なテストは skip / retry で通さず原因を直す
- 追加したロジックにテストがある（特に日付処理・バリデーション・スペース分離）
- スキーマ変更は新しいマイグレーションファイルで行い、既存ファイルは書き換えない
- `wrangler.jsonc` を変えたら `bun run cf-typegen` で型を再生成してコミット

---

## Phase 0: 基盤とガードレール ✅

- [x] Vite+ / Hono / Cloudflare Vite plugin / Wrangler / Bun の雛形
- [x] `wrangler.jsonc`（D1 / AI / Rate Limiting バインディング）と型生成
- [x] 初期マイグレーション `migrations/0001_init.sql`（要件 6.3 の DDL + `warn_days` の CHECK 制約）
- [x] `secureHeaders` を全体に適用、`/healthz`
- [x] 上記ガードレール一式（CI / pre-commit / knip / Semgrep / Dependabot）

## Phase 1: スペースとデータ API

ゴール: 画面なしで、curl から商品の登録・一覧・更新・削除とスペース設定ができる。

- [x] 本番 D1 を作成し `database_id` を反映 — `infra/` の Terraform で作る（[ADR 0008](./adr/0008-terraform-infra.md)）。apply は Cloudflare の認証が要るため手元で行い、output を `wrangler.jsonc` に書く
- [x] Zod スキーマ（`src/domain/schema.ts`）: `name`（必須・上限 100 文字）/ `expires_on`（実在する `YYYY-MM-DD`）/ `kind`（`best_by` | `use_by`）/ `memo`（任意・上限 500 文字）/ `warn_days`（1〜30）
- [x] スペース解決ミドルウェア（`src/space.ts`、決定は [ADR 0001](./adr/0001-space-resolution.md)）
  - URL `/s/:spaceId` → Cookie の順で解決し、D1 に存在するものだけ採用
  - どちらもなければ `crypto.randomUUID()` で発行して `spaces` に INSERT、Cookie（HttpOnly / Secure / SameSite=Lax / 1 年）を設定
  - URL で開いた場合は Cookie をその ID に更新（機種変更・家族共有）
- [x] リポジトリ層（`src/platform/db.ts`）: すべてのクエリに `space_id` 条件を必須にする（他スペースのデータを触れない構造にする）
- [x] API（`src/routes/api.ts`）: `GET/POST /api/items`、`PATCH/DELETE /api/items/:id`、`GET/PATCH /api/space`
- [x] JST の「今日」を返すユーティリティ（`src/domain/date.ts`）（`Intl.DateTimeFormat` + `Asia/Tokyo`）と残り日数計算
- [x] テスト: バリデーション境界値、スペース分離（別スペースの item を PATCH/DELETE できない）、JST の日付境界（UTC 15:00 前後）
  - API の結合テストは `src/test-env.ts` が `getPlatformProxy()` のインメモリ D1 に `migrations/` を適用して行う

## Phase 2: 画面（手入力で完結する MVP）✅

ゴール: スマホで開いて、手入力だけで要件 4.2〜4.5 の操作ができる。この時点で実用可能。構成は [ADR 0002](./adr/0002-server-rendered-forms.md)（JS なしの SSR フォーム）。

- [x] 共通レイアウト（`src/views/layout.tsx`。Hono JSX、スマホ縦画面前提の CSS を埋め込み、`viewport`）
- [x] 一覧: 期限日昇順、商品名 / 期限日 / 種別 / 残り日数、期限切れ=赤・`warn_days` 未満=黄
- [x] 追加・編集フォーム（商品名・期限日・種別・メモ）。サーバー側でも同じ Zod スキーマで検証（`src/routes/pages.tsx`）
- [x] 削除（`popover` の確認ダイアログ → 承認時のみ削除）
- [x] 設定: `warn_days` の変更
- [x] CSRF 対策（`hono/csrf` で Origin 検証）と CSP（`secureHeaders` の `contentSecurityPolicy`、スタイルは nonce）
- [x] ステータス判定（expired / warn / normal）を純粋関数にしてテーブル駆動テスト（`src/domain/status.ts`）
- [x] 閲覧系の画面ではスペースを発行せず、書き込み時に発行する（ADR 0001 の `/` の扱いを更新）
- [x] 一覧を 1 行に詰め、期限切れ / N日以内 / それ以降に区切って遠いものを畳む。削除ボタンは左スワイプで出す（[ADR 0009](./adr/0009-compact-list.md)）

## Phase 3: 写真からの AI 抽出

ゴール: 撮影 → 読み取り結果がフォームに入る。失敗しても手入力にフォールバックできる。構成は [ADR 0003](./adr/0003-photo-extraction.md)。

- [x] クライアント（`src/client/extract.js` を `GET /extract.js` で配信）: `<input type="file" accept="image/*" capture="environment">`、Canvas で長辺 800px にリサイズ・JPEG 圧縮、2MB 超は送信しない
- [x] `POST /api/extract`
  - `EXTRACT_RATE_LIMITER.limit({ key: spaceId })` で 10 回/分、超過は 429。読み取りではスペースを発行せず、スペースが無ければ IP をキーにする
  - 画像サイズ・MIME を検証（2MB 上限、JPEG / PNG / WebP）
  - Workers AI の Vision モデルに JSON のみを返すよう指示（当初は `@cf/meta/llama-4-scout-17b-16e-instruct`。ADR 0007 で Gemma 4 + Jev の段階処理に置き換え）
  - 画像はメモリ上のみで扱い、保存・ログ出力しない（Semgrep ルールで担保）
- [x] AI 応答の検証・正規化（`src/domain/extract.ts`。fast-check のプロパティテスト付き）
  - JSON としてパースできなければ全項目 `null`
  - 日付: `26.10.05` / `2026/10/5` / `2026.10.05` / `R8.10.5`（令和）/ `10.5`・`10月5日`（年省略）/ `2027.10`（年月のみ → 月末）
  - 年省略時は「今日（JST）以降で最も近い日付」で補完
  - 存在しない日付（`2/30` など）は `null`
  - 種別: 「消費期限」→ `use_by`、「賞味期限」→ `best_by`、不明時は `null` を返し、フォームの選択（追加時の初期値は `best_by`）を変えずに確認を促す
  - `confidence` を返す（低いときはフォームで確認を促す）
- [x] 読み取り中表示、失敗時は空欄のまま手入力できる UI（JS が無ければ写真の入力欄自体を出さない）
- [x] モデル比較用のスクリプト: `bun run extract-eval <写真のディレクトリ> [モデル...]`（`scripts/extract-eval.ts`）が Workers AI の REST API で本番と同じ段階処理（`extractItem`。ADR 0007）を通した結果を正解（`expected.json`）と比べて項目ごとの正解数・確信度が高いのに日付を誤った数・応答時間を出す。採点は `src/domain/evaluation.ts`
- [x] 段階的な読み取り（[ADR 0007](./adr/0007-staged-extraction.md)）: Gemma 4（`@cf/google/gemma-4-26b-a4b-it`）で原文を抽出 → コードで検証（日付の成立・製造日の除外・登録済みの商品名との一致）→ 候補が複数残ったときだけ Jev（`typesafe/jev`）で選ぶ → `next` で確定 / 部分再読 / 再撮影を返す
  - 部分再読: 期限が読めなければ、フォームで写真の期限の部分を指で囲み、縮小前の写真から切り出して `part=date` で送る。再読でも読めなければ再撮影
  - 撮影ガイド・端末 OCR の座標からの切り出しは未実装（同じ `part=date` に送る入口として足せる）
- [ ] 実物パッケージ写真（牛乳・卵・パン・缶詰など）で精度を確認し、モデルとプロンプトを決める — Workers AI はリモート実行で Cloudflare の認証が要るため手作業。上のスクリプトで比べる。Jev の入出力の形（ADR 0007）もこのとき確かめる

## Phase 4: 共有と PWA

構成は [ADR 0004](./adr/0004-share-rotation-and-pwa.md)。

- [x] 設定画面に共有 URL（`/s/{space_id}`）を表示・コピー（Clipboard API。使えなければボタンを出さず長押しでコピー）
- [x] `POST /api/space/rotate`（画面は `POST /settings/rotate`）: 新 ID を発行して items を付け替え、旧 ID を削除する処理を D1 の `batch()` で一括実行。実行した端末の Cookie を新 ID に更新
- [x] 旧 URL / 旧 Cookie の扱い: 旧 URL（D1 に無い `/s/:spaceId`）は 404 で案内し Cookie を変えない。旧 Cookie の端末は一覧に「新しい共有URLを開いてください」と出す（書き込めば新しいスペースになる）
- [x] PWA: `public/` の `manifest.webmanifest`、アイコン（192 / 512 / maskable / `apple-touch-icon`）、`display: standalone`、最小限の Service Worker（`sw.js`。オフライン時に `offline.html` を出すだけで、データはキャッシュしない）
- [ ] iOS Safari / Android Chrome のホーム画面追加を実機で確認 — 本番デプロイ（Phase 5）後に手作業

## Phase 5: 本番化と運用

構成は [ADR 0005](./adr/0005-deploy-and-e2e.md)。

- [x] デプロイ用ワークフロー: main への push で `vp build` → `wrangler d1 migrations apply --remote` → `wrangler deploy`
  - `CLOUDFLARE_API_TOKEN` は GitHub Environments（`production`、Required reviewers 付き）に置き、トークン権限は Workers / D1 / Workers AI の編集に限定（手順は `docs/repository-settings.md`）
  - リポジトリ変数 `CLOUDFLARE_ACCOUNT_ID` が無い間は実行しない（本番 D1 の作成が手作業のため）
- [x] デプロイの前提（D1・デプロイ用トークン・`production` Environment・secret・`CLOUDFLARE_ACCOUNT_ID`）を Terraform（`infra/`、state はローカル）で作る。CI の `checkov` ジョブで静的検査。[ADR 0008](./adr/0008-terraform-infra.md)
- [x] E2E: Playwright でスマホ viewport（iPhone / Pixel）の主要導線（手入力登録 → 一覧色分け → 編集 → 削除 → 共有 URL で別端末から閲覧）。`e2e/`、CI の `e2e` ジョブ
- [ ] Workers Observability でエラー率と `/api/extract` のレイテンシを確認（画像や本文はログに出さない）— `wrangler.jsonc` で有効化済み。確認は本番デプロイ後に手作業
- [x] 実ユーザーの Core Web Vitals（LCP ≤ 2.5s / INP ≤ 200ms / CLS ≤ 0.1）を計測する手段を決める — 自前のビーコン（`/app.js` → `POST /api/vitals` → Workers Logs）。[ADR 0006](./adr/0006-real-user-web-vitals.md)
- [x] 無料枠の消費を確認する手段 — `bun run usage`（`scripts/usage.ts`）が GraphQL Analytics API から Workers のリクエスト数・Workers AI の Neurons・D1 の読み書き行数を直近 7 日分出し、8 割超えで終了コード 1。集計と判定は `src/domain/usage.ts`
- [ ] 無料枠の消費確認（Workers AI の Neurons、D1 の読み書き行数）— 本番デプロイ後に `bun run usage` で手作業
- [x] README に運用手順（D1 作成、マイグレーション、ロールバック）を追記

---

## リスクと対応

| リスク                                 | 影響                                 | 対応                                                                                           |
| -------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Vite+ が RC 版                         | 破壊的変更の可能性                   | バージョンを完全固定し、Dependabot の更新は `vite-plus` / `vite` / `vitest` をまとめて検証する |
| vitest-pool-workers が Vitest 5 非対応 | Workers ランタイム上でテストできない | `getPlatformProxy()` で代替。純粋関数を厚くしてランタイム依存部分を薄く保つ                    |
| AI の読み取り精度                      | 期限の誤登録                         | 必ず確認フォームを経由。原文をコードで検証し、決めきれない候補は判定モデルかユーザーが選ぶ     |
| URL が鍵                               | URL 流出で第三者が閲覧可能           | 共有 URL の再生成機能（Phase 4）、`Referrer-Policy: no-referrer`                               |
| Workers AI の無料枠                    | 上限超過で抽出不可                   | レート制限、クライアントでの縮小、失敗時は手入力へ                                             |

## 対象外（要件 9 の再掲）

ログイン、通知、画像の保存・表示、消費履歴、バーコード読み取り。
