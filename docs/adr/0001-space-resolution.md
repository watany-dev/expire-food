# ADR 0001: スペースの解決と共有 URL の扱い

- 状態: 採用
- 日付: 2026-09-24

## 背景

要件 3.1 / 7 では `space_id` を Cookie と URL（`/s/{space_id}`）の 2 箇所で保持し、API は「Cookie または URL」でスペースを特定する。ログインが無いので、どの ID を採用し、いつ新しいスペースを発行するかを決める必要がある。

## 決定

- 解決順は URL → Cookie。どちらも UUID 形式かつ D1 の `spaces` に存在する場合だけ採用し、無ければ `crypto.randomUUID()` で新しいスペースを発行する
- 共有 URL は `GET /s/:spaceId` のみ。~~Cookie をその ID に書き換えて `/` へリダイレクトする~~ → [ADR 0004](./0004-share-rotation-and-pwa.md) の追記で、確認画面を出して `POST` で書き換えるようにした（開くだけで Cookie を差し替えられるため）。API のパスには `space_id` を含めず、Cookie で特定する（URL をブラウザ履歴やログに残す場所を増やさない）
- Cookie は `/s/:spaceId`・`/api/*`・画面（ADR 0002）へのリクエストのたびに書き直し、有効期限（1 年）を延ばす。使い続けている端末でスペースが消えないようにするため
- `/healthz` と `/` ではスペースを発行しない（死活監視・クローラー・Lighthouse で `spaces` が増えないようにする）。画面での扱いは [ADR 0002](./0002-server-rendered-forms.md) で決めた（閲覧系は発行せず、書き込み系で発行する）
- ~~存在しない共有 URL は Cookie のスペース（無ければ新規）にフォールバックする~~ → [ADR 0004](./0004-share-rotation-and-pwa.md) で `404` にした（作り直し後の旧 URL で別の一覧に入らないため）。Cookie の解決は `/s/:spaceId` 以外では Cookie だけを見る

## 影響

- Cookie の無い状態で API を叩くたびにスペースが 1 つ増える。curl で試すときは `-c` / `-b` で Cookie を保存する（[ADR 0002](./0002-server-rendered-forms.md) の追記で、`GET` の API では発行しないようにした）
- Cookie の無い状態で並列にリクエストすると、それぞれが別のスペースを発行し、最後に届いた Cookie だけが残る。Phase 2 の画面はフォーム送信（1 件ずつ）でスペースを発行するため起きない（ADR 0002）
