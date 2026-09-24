# CLAUDE.md

- 仕様は `docs/requirements.md`、作業順は `docs/ROADMAP.md`。着手した Phase のチェックボックスを更新する。
- ツールは Vite+ の `vp` を使う（`vp check` / `vp test` / `vp build`）。パッケージ追加は `bun add`。
- 変更後は最低限 `vp check && vp test && bunx knip` を通す。
- `wrangler.jsonc` を変えたら `bun run cf-typegen` で `worker-configuration.d.ts` を再生成してコミット。
- スキーマ変更は `migrations/` に新しい連番ファイルを追加する（既存ファイルは編集しない）。
- `.semgrep/expire-food.yml` のルール（SQL は `.bind()`、`Math.random` 禁止、`raw()` 禁止、リクエスト本文をログに出さない、Cookie 属性必須）に従う。ルールを変えたら `.semgrep/expire-food.tsx` のフィクスチャも更新する。
- テストは `vite-plus/test` から import する。
