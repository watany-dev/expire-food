# ADR 0010: D1 の往復・スクリプトの再取得・Worker のバンドルを減らす

- 状態: 採用
- 日付: 2026-09-26

## 背景

ローカル（`wrangler dev` + ローカル D1、同時 10 接続）で計測すると、Cookie 付きの `GET /` は Cookie 無しより p50 で約 35ms 遅かった。

- Cookie のあるリクエストは、`findSpace` / `resolveSpace` で `spaces` の存在を確かめてからハンドラーのクエリを実行する。D1 との往復が必ず直列に 2 回になり、本番ではエッジから D1 までの距離が 1 回ごとに乗る
- `/app.js`・`/extract.js` は `no-cache` なのに ETag が無く、画面を開くたびに本文を取り直していた
- Worker のバンドルは minify なしで 319KB、うち Zod が 173KB。コールドスタートで読み込む量が多い

## 決定

- 最も開かれる `GET /` と `GET /settings` は `findSpace` を通さない。Cookie は形式だけ確かめ（`spaceCookie`）、存在の確認は画面に要るクエリで兼ねる
  - `GET /` は `spaces.warn_days` と `items` を `batch()` で 1 回の往復にする（`getList`）。`spaces` の行が無ければ Cookie のスペースは無い
  - `GET /settings` は `getWarnDays` が `null` なら無い
  - どちらも見つかったときだけ Cookie を書き直す（これまでどおり）
  - 書き込み系は `resolveSpace` のまま。無ければ新しいスペースを発行して続けるので、1 本のクエリにまとめられない
- `/app.js`・`/extract.js` に `hono/etag` を付け、変わっていなければ `304` を返す。`no-cache` はそのまま（デプロイ後に古いスクリプトを残さない）
- Zod は `zod/mini` を使う。`@hono/zod-validator` はそのまま使える
- Worker の環境だけ `build.minify` を有効にし、ソースマップを `upload_source_maps` でアップロードして Workers Logs のスタックトレースを読めるようにする

## 影響

- ローカルの計測で、Cookie 付きの `GET /` は p50 58ms → 39ms、`GET /settings` は 53ms → 35ms。`/app.js`・`/extract.js` の再検証は本文 0 バイト
- バンドルは 319KB → 102KB（gzip 80KB → 36KB）
- `zod/mini` はメソッドチェーンではなく関数（`z.optional()`・`.check(z.maxLength())` など）で書く
- 書き込み（`POST /items` など）は存在確認と書き込みの 2 往復が残る。リダイレクト先の `GET /` が 1 往復になったので、追加の一連の操作は 4 往復 → 3 往復
