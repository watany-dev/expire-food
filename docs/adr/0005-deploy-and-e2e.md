# ADR 0005: デプロイと E2E

- 状態: 採用
- 日付: 2026-09-24

## 背景

Phase 5 で、main へのマージから本番（Cloudflare Workers + D1）へ出す手順と、スマホ viewport での主要導線の E2E を用意する。本番 D1 の作成と API トークンの発行は Cloudflare の認証が要るため、リポジトリの外で手作業になる。

## 決定

- デプロイ（`.github/workflows/deploy.yml`）
  - main への push と手動実行で、`vp build` → `wrangler d1 migrations apply --remote` → `wrangler deploy` を 1 ジョブで行う。CI の完了は待たない（Rulesets で CI が緑の PR しか main に入らないため）。`workflow_run` で繋ぐと権限とトリガーの扱いが複雑になる
  - `production` Environment（承認者あり・`main` のみ）で止め、`CLOUDFLARE_API_TOKEN` は Environment の secret にする
  - リポジトリ変数 `CLOUDFLARE_ACCOUNT_ID` が無い間はジョブを実行しない。本番 D1 を作る前に main へ push するたびにデプロイが失敗して赤くならないようにするため
  - マイグレーションを Worker より先に適用する。したがってマイグレーションは旧 Worker でも動く形（列の追加は NULL 可か既定値付き、削除は 2 段階）にする。こうすると Worker のロールバック（`wrangler rollback`）でスキーマを戻さなくてよい
  - デプロイでは依存のキャッシュを使わない（本番に出すものにキャッシュ経由の改変を入れない）
- E2E（`e2e/`、`playwright.config.ts`、CI の `e2e` ジョブ）
  - サーバーは Lighthouse CI と同じく Bun で `app.fetch` を配信し、D1 は結合テストと同じ `createTestEnv()`（インメモリ + `migrations/` 適用）を渡す。`vp dev` / `wrangler dev` は Workers AI のリモートバインディングに Cloudflare の認証が要るため使わない。写真の読み取り（`/api/extract`）は E2E の対象外
  - iPhone（`iPhone 15`）と Pixel（`Pixel 7`）の viewport・UA・タッチで、どちらも Chromium で動かす。WebKit は `http://localhost` で `Secure` 属性付きの Cookie を保存せずスペースを保てないうえ、CI でブラウザを 1 つ入れるだけで済むため
  - 期限日はテスト側で JST の今日から作る。サーバーは実時刻で残り日数を出すので、途中で日付が変わっても色分けが変わらない日数（-1 / +1 / +30、`warn_days` 3）にする

## 影響

- 静的アセット（`public/`）は E2E のサーバーでは配信されない。PWA のホーム画面追加は本番で実機確認する（Phase 4 の残タスク）
- iOS Safari 固有の挙動は E2E では見られない
- 本番 D1 を作り `CLOUDFLARE_ACCOUNT_ID` を設定した時点から、main への push がデプロイ（承認待ち）になる
