# CLAUDE.md

- 仕様は `docs/requirements.md`、作業順は `docs/ROADMAP.md`。着手した Phase のチェックボックスを更新する。
- ツールは Vite+ の `vp` を使う（`vp check` / `vp test` / `vp build`）。パッケージ追加は `bun add`。
- 変更後は最低限 `vp check && vp test && bunx knip` を通す。
- `wrangler.jsonc` を変えたら `bun run cf-typegen` で `worker-configuration.d.ts` を再生成してコミット。
- スキーマ変更は `migrations/` に新しい連番ファイルを追加する（既存ファイルは編集しない）。
- `.semgrep/expire-food.yml` のルール（SQL は `.bind()`、`Math.random` 禁止、`raw()` 禁止、リクエスト本文をログに出さない、Cookie 属性必須）に従う。ルールを変えたら `.semgrep/expire-food.tsx` のフィクスチャも更新する。
- テストは `vite-plus/test` から import する。

## Agent Skills

- スキルは `.claude/skills/` に置き、`.agents/skills`（Codex / Cursor 用）はそこへのシンボリックリンク。[watany-dev/zghalint](https://github.com/watany-dev/zghalint) から移植。
- 作業完了時は `wrapup`（`/code-review` → `ponytail-review` → 取り込み → `cleanup-comments`）を通す。
- プランモードでは `update-plan` で要件・ROADMAP・ADR と照合してから `ExitPlanMode` する。設計の詰めは `grill-me`（決定は `docs/adr/` に ADR として残す）。
- `ponytail-review` / `ponytail-audit` は [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) (MIT) から vendoring したもの。
