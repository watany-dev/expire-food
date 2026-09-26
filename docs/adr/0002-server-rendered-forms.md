# ADR 0002: 画面は JS なしの SSR フォームで作る

- 状態: 採用
- 日付: 2026-09-24

## 背景

Phase 2 で一覧・追加・編集・削除・設定の画面を付ける。スマホのブラウザで速く表示でき（Lighthouse の Performance 90 以上）、CSP を厳しくでき、テストしやすい構成にしたい。あわせて ADR 0001 で保留した「`/` でスペースを発行するか」を決める。

## 決定

- 画面は Hono JSX の SSR と HTML の `<form method="post">` で作り、クライアントの JS は使わない。保存後は `303` で一覧へリダイレクトし、入力エラーは `400` で入力値を残したままフォームを出し直す
  - フォームの検証には API と同じ Zod スキーマ（`src/domain/schema.ts`）を使う
  - 画面用のルートは `GET /`、`GET /items/new`、`POST /items`、`GET /items/:id/edit`、`POST /items/:id`、`POST /items/:id/delete`、`GET/POST /settings`。JSON API（`/api/*`）は Phase 3 以降のクライアント JS と curl 用に残す
- 削除の確認ダイアログ（要件 4.3）は `popover` 属性と `popovertarget` で出す。JS の `confirm()` を使わないので CSP で `script-src` を許可しなくて済む（iOS Safari 17 / Chrome 114 以降。要件 8.4 は最新版が対象）
- CSP は `default-src 'none'`、`style-src` は HTML に埋め込んだ 1 つの `<style>` を nonce で許可、`form-action 'self'`、`frame-ancestors 'none'`、`base-uri 'none'`。CSS は外部ファイルにせず埋め込み、追加のリクエストをなくす
  - Hono JSX は `<style>` の中身もエスケープするので、CSS に `>` や `"` などを書かない（テストで検出する）
- CSRF は `hono/csrf` を全体に掛け、フォーム形式の送信は同一オリジン（`Origin` / `Sec-Fetch-Site`）だけを受け付ける
- スペースの発行（ADR 0001 の `/` の扱いを更新）
  - 閲覧系（`GET` の画面）は Cookie のスペースを探すだけで発行しない。見つからなければ空の一覧・既定値（`warn_days` = 3）を表示する。形式が UUID でない Cookie では D1 に問い合わせない
  - 書き込み系（`POST` の画面）で初めて発行する。フォーム送信は 1 件ずつなので、ADR 0001 の「並列リクエストで別々のスペースが発行される」問題も起きない
  - 閲覧系でもスペースが見つかれば Cookie を書き直して有効期限を延ばす（見るだけの家族の端末でも消えないように）

## 影響

- クローラーや Lighthouse が `/` を開いても `spaces` は増えない。Lighthouse CI はバインディングなしで `/` を配信したまま測れる
- Phase 3 の写真読み取りではクライアント JS が要る。フォームは JS が無くても手入力で使える状態を保つ（CSP は nonce ではなく `script-src 'self'` にした。[ADR 0003](./0003-photo-extraction.md)）

## 追記: API の閲覧でも発行せず、発行と件数に上限を付ける（2026-09-26、#21）

`app.use("/api/*", resolveSpace)` のため、`GET /api/items`・`GET /api/space` などの閲覧でも Cookie が無ければスペースを発行していた（上の「閲覧系は発行しない」は画面でしか守られていなかった）。発行や商品の追加に回数・件数の上限も無く、Cookie を付けない `GET` を繰り返すだけで D1 の書き込みの枠（無料枠は 1 日 10 万行）を使い切れた。枠を使い切ると全ユーザーの書き込みが止まる。

- `/api/*` の全体に掛けていた `resolveSpace` をやめ、ルートごとに付ける。発行するのは追加と設定の書き込み（`POST /api/items`・`/api/tags`、`PATCH /api/space` と画面の `POST /items`・`/tags`・`/settings`）だけ
  - 閲覧（`GET /api/items`・`/api/tags`・`/api/space`）は `findSpace` で、スペースが無ければ空の一覧・既定値を返す
  - 編集・削除（API と画面）は既存のスペースにしかできないので `findSpace` にし、スペースが無ければ `404`（画面の削除は一覧・タグ画面へ戻す）
  - API は本文を検証してから発行する（不正な本文でスペースを作らない）
  - ADR 0003 / 0004 の「`/api/extract`・`/api/space/rotate` は `/api/*` の `resolveSpace` より先に登録する」は不要になった
- スペースの発行を接続元ごとに数える（`SPACE_RATE_LIMITER`、1 分あたり 5 回。超えたら `429`）。キーは `cf-connecting-ip` で、IPv6 は /64 に丸める（`src/domain/client-key.ts`。1 回線に /64 が割り当てられ、その中でアドレスを変えれば別の枠になるため）。既存のスペースへの書き込みは数えない
- 1 スペースの商品は 500 件、タグは 100 個まで（`MAX_ITEMS` / `MAX_TAGS`）。件数の確認と追加は 1 文（`INSERT ... SELECT ... WHERE (SELECT COUNT(*) ...) < ?`）で行い、超えたら API は `409`、画面は案内を出す。上限に達していても既にある名前のタグは返す（二重送信で失敗にしない）
- 使われないまま残ったスペースを消す Cron は入れない。発行の制限で増え方が抑えられ、1 行は数十バイトなので容量（5GB）より書き込みの枠が先に効くため

影響:

- Rate Limiting バインディングはロケーション単位・結果整合なので上限は厳密ではなく、多数の IP を使えば発行は増やせる。書き込みの総量を 1 スペースの件数で抑える
- 同じ IP の後ろにいる複数の端末（携帯回線の CGNAT など）が同じ 1 分に 5 回を超えて新しい一覧を作ると `429` になる。発行は端末ごとに最初の 1 回だけなので許容する
