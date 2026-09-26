# ADR 0012: space_id をログとキャッシュに残さない

- 状態: 採用
- 日付: 2026-09-26

## 背景

`space_id` は知っていれば誰でも一覧を読み書きできる唯一の資格情報（ADR 0001）だが、セキュリティ監査（#19 / #24）で次の経路に残ることが分かった。

- Workers Logs の呼び出しログはリクエスト URL を残すので、共有 URL（`GET /s/<space_id>`）を開くたびにそのままログに載る。ログを見られる人（Cloudflare アカウントのメンバー、将来のログ転送先）は全スペースに入れる
- 共有 URL を出す `/settings` や商品を返す `/`・`/api/items` に `Cache-Control` が無く、共有端末の bfcache・ディスクキャッシュや、将来入れうる CDN キャッシュに残りうる

## 決定

- Workers Logs の呼び出しログを切る（`wrangler.jsonc` の `observability.logs.invocation_logs: false`）。`console.*` のログ（`web-vitals`、読み取りの失敗、Hono が出す未処理の例外）は残る
  - リクエスト数・エラー数・CPU 時間は Workers の Metrics（ダッシュボード）で見る。ルートごとのレイテンシが要るようになったら、パスを画面種別に丸めて（ADR 0006 と同じ）`console.info` で出す
- 応答は既定で `Cache-Control: no-store` にする（`src/index.tsx` のミドルウェア）。キャッシュさせてよい `/app.js`・`/extract.js` は自分で `no-cache` を付けるので上書きしない。静的アセット（`public/`）は Worker を通らないので対象外
- D1 の `spaces.id` は平文のまま。ハッシュ（SHA-256）にすると D1 のエクスポート・バックアップの漏えいには強くなるが、マイグレーションと全クエリの書き換えが要る。優先度が低いので見送る

## 影響

- `console.*` のログにも、Workers Logs がリクエストの情報（URL）を付けうる。`/s/:spaceId` でログが出るのは未処理の例外のときだけなので許容する
- 一覧などの画面は bfcache に入らず、戻る操作で再読み込みになる。共有している端末の更新が見えないより良い（ADR 0004 の Service Worker でデータをキャッシュしないのと同じ理由）
- Workers Logs のイベント数は 1 リクエストあたり 0〜1 件（`web-vitals` のログ）に減る
