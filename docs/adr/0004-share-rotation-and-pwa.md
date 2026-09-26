# ADR 0004: 共有 URL の作り直しと PWA

- 状態: 採用
- 日付: 2026-09-24

## 背景

Phase 4 で、設定画面に共有 URL を出してコピーできるようにし、URL が漏れたときのために作り直せるようにする（要件 3.2 / 4.5）。ADR 0001 で保留した「作り直した後の旧 URL・旧 Cookie をどう扱うか」もここで決める。あわせてホーム画面に追加できる PWA にする。

## 決定

- 共有 URL（`/s/{space_id}`）は設定画面に読み取り専用の入力欄で出す。スペースが無い（まだ登録していない）端末では出さない。コピーは Clipboard API で、使えるときだけ `/app.js` がボタンを表示する。使えなければ長押しでコピーする
- 作り直しは `POST /api/space/rotate` と、画面用の `POST /settings/rotate`（`popover` の確認ダイアログから送る）
  - 新しい ID のスペースを `warn_days`・`created_at` ごと作り、items を付け替え、旧 ID を消すまでを D1 の `batch()`（1 トランザクション）で行う
  - スペースは発行しない（`findSpace`）。旧 Cookie の端末が作り直すと、空の新しいスペースを作ってそれを作り直し、案内なしに別の一覧へ移ってしまうため。スペースが無い・別の端末が先に作り直して旧 ID が無いときは何も変えない（API は `404`、画面は一覧へ戻して下の案内を出す）。`/api/space/rotate` は `/api/*` の `resolveSpace` より先に登録する
  - 実行した端末の Cookie は新しい ID にする。`resolveSpace` / `findSpace` はハンドラーの後で `spaceId` を Cookie に書くので、ハンドラーは `spaceId` を差し替えるだけでよい
- 旧 URL・旧 Cookie（ADR 0001 の「存在しない共有 URL は Cookie のスペースにフォールバック」を変更）
  - D1 に無い `/s/:spaceId` は `404` で「共有URLが使えません」を出し、Cookie は変えない。フォールバックすると、旧 URL を開いた家族が気づかないまま別の一覧を使い続けるため
  - Cookie があるのに D1 に無い端末では、一覧に「新しい共有URLを受け取って開いてください」と出す。書き込めば従来どおり新しいスペースを発行する（ログインが無いので、作り直しと単なる不正な Cookie は区別しない。止めてしまうと端末が使えなくなる）
- PWA
  - `manifest.webmanifest`・アイコン（192 / 512 / maskable、iOS 用の `apple-touch-icon` 180）・`sw.js`・`offline.html` は `public/` に置き、Cloudflare の静的アセットとして Worker より先に配信する。Worker のルートを増やさず、`@cloudflare/vite-plugin` が `vp build` で `assets` を設定する
  - Service Worker はオフライン時に画面遷移の代わりに `offline.html` を返すだけ。一覧などのデータや画面はキャッシュしない（共有している端末の更新が見えなくなるため）
  - Service Worker の登録とコピーは全画面で読み込む `/app.js`（`src/client/app.js`、`/extract.js` と同じく `?raw` で取り込み `no-cache` で配信。ADR 0010 で ETag を付けた）。CSP に `manifest-src 'self'` と `worker-src 'self'` を足す

## 影響

- 作り直すと、共有していた他の端末は新しい URL を開き直すまで一覧が見られない。確認ダイアログでそう伝える
- 静的アセットには `secureHeaders` が掛からない。`offline.html` はスクリプトを含まない
- Lighthouse CI は Bun で Worker だけを配信するため、`/manifest.webmanifest` や `/sw.js` は 404 になる（Performance / Accessibility の計測には影響しない）
- iOS Safari / Android Chrome のホーム画面追加は実機で確かめる（ROADMAP Phase 4 の残タスク）

## 追記: 共有 URL は確認してから開く（2026-09-26、#20）

`GET /s/:spaceId` がスペースを見つけると確認なしに Cookie を書き換えていた。GET は `hono/csrf` の対象外で、トップレベルの遷移なので `SameSite=Lax` でも Cookie は付く。攻撃者が自分のスペースの共有 URL を踏ませると、被害者の端末は攻撃者の一覧に切り替わり、その後の登録は攻撃者に読まれる。控えていなければ元の一覧にも戻れない（セッション固定・ログイン CSRF）。

- `GET /s/:spaceId` は Cookie を変えず、「この一覧を開く」ボタンの確認画面を出す。切り替えは `POST /s/:spaceId`（`hono/csrf` で同一オリジンだけ）で行い、`303` で一覧へ戻す
  - この端末で別のスペースを使っていれば（Cookie のスペースが D1 にあれば）、今の一覧から切り替わること、戻るにはその共有 URL が要ることを警告し、設定画面へのリンクを出す
  - すでにそのスペースを使っている端末では、確認せずに一覧へ戻す（Cookie の有効期限は延ばす）
  - D1 に無い共有 URL は、GET・POST とも従来どおり `404`
- `Sec-Fetch-Site: cross-site` の遷移だけ確認を出す案は採らない。確認画面は同一オリジンからの遷移でも 1 回押すだけで、分岐を増やす利点が小さいため
- 共有 URL を開く端末は 1 回ボタンを押す手間が増える（機種変更・家族共有のたびに 1 回）
