# ADR 0006: 実ユーザーの Core Web Vitals の計測

- 状態: 採用
- 日付: 2026-09-24

## 背景

Lighthouse CI はラボの値で、INP は TBT で代替している。スマホの実機でも LCP ≤ 2.5s / INP ≤ 200ms / CLS ≤ 0.1 を満たしているかを見る手段を Phase 5 で決める。

候補は次の 2 つ。

- Cloudflare Web Analytics の JS ビーコン: 設定だけで済むが、`static.cloudflareinsights.com` のスクリプトを読むために CSP（`script-src 'self'`）を緩めることになり、サイトトークンの発行も Cloudflare 側の手作業になる
- 自前のビーコン: `/app.js` で `PerformanceObserver` から値を取り、同一オリジンの Worker に送ってログに残す

## 決定

- 自前のビーコンにする。CSP と依存を増やさず、既に有効な Workers Observability（Workers Logs）で集計できる
- クライアント（`src/client/app.js`）
  - LCP は最後の `largest-contentful-paint`、CLS は `layout-shift` のセッションウィンドウ（1 秒間隔・最長 5 秒）の最大、INP は `event`（`durationThreshold: 16`。指定できる最小値）のうち最も遅い操作。1 画面の操作が少ないので 98 パーセンタイルは取らない
  - 画面が最初に `hidden` になったときに 1 回だけ `navigator.sendBeacon("/api/vitals")` で送る（`text/plain` の JSON。1 ページビューで Worker へのリクエストは 1 回増える）
  - 対応していない指標は送らない（Safari の INP など）
- サーバー（`POST /api/vitals`、`src/routes/vitals.ts`）
  - スペースは解決も発行もしない。本文は 1KB まで、`hono/csrf` で同一オリジンに限る
  - `src/domain/vitals.ts` で検証し、パスは画面の種類（`/` / `/items/new` / `/items/:id/edit` / `/settings` / `other`）に置き換える。商品 ID などは残さない
  - `console.info({ message: "web-vitals", path, lcp, inp, cls })` で出し、Workers Logs の Query Builder で `message = web-vitals` を画面ごとに集計する

## 影響

- 集計は Workers Logs の保持期間（無料プランは 3 日）の範囲だけ。長期の推移が要るようになったら Workers Analytics Engine への書き込みに切り替える
- 誰でも値を送れるので、改ざんされた値が混ざりうる。範囲外の値はその指標だけ捨てるが、偏らせることはできる。目安として使う
- ログの件数はページビューとほぼ同じだけ増える。無料枠（Workers Logs の 1 日あたりのイベント数）はリクエスト数から見積もる（README「無料枠の確認」）
