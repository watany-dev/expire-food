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
