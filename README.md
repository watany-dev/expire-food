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

| コマンド             | 内容                                                           |
| -------------------- | -------------------------------------------------------------- |
| `bun run check`      | 整形 / lint / 型チェック（`vp check`、`--fix` で自動修正）     |
| `bun run test`       | テスト（`vp test`、CI では `vp test --coverage` で閾値を検査） |
| `bun run build`      | 本番ビルド                                                     |
| `bun run knip`       | 未使用のファイル / export / 依存の検出                         |
| `bun run lighthouse` | Lighthouse CI（`lighthouserc.json` の閾値。要 Chrome）         |
| `bun run semgrep`    | Semgrep（要 `semgrep` コマンド）                               |
| `bun run cf-typegen` | `wrangler.jsonc` から `worker-configuration.d.ts` を再生成     |

## CI で見ていること

`.github/workflows/` を参照。`vp check` / `vp test --coverage`（閾値付き）/ `vp build` とバンドルサイズ / `wrangler types --check` / D1 マイグレーション適用 / knip / Semgrep（独自ルールのテスト込み）/ Lighthouse CI / zghalint / CodeQL / OpenSSF Scorecard。GitHub の UI で行う設定は [docs/repository-settings.md](docs/repository-settings.md)。
