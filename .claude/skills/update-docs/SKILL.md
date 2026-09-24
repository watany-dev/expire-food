---
name: update-docs
description: Update expire-food documentation (docs/requirements.md, docs/ROADMAP.md, docs/adr/*.md, README.md, CLAUDE.md) to match current source code. Use when the user asks to update docs, refresh README, sync the roadmap with implementation, or check doc/code consistency. Trigger examples - "ドキュメントを最新化して", "ROADMAP を更新", "update docs", "README を直して", "docs と src の乖離を確認", "sync documentation".
---

# update-docs

ソースコードの現状に基づき、すべてのドキュメントを一括で最新化するスキル。

## Phase 1: ソースコードの現状把握

1. `src/` 配下を読む。ルート（Hono の `app.get` / `app.post` 等）、ミドルウェア、
   Zod スキーマ、リポジトリ層、純粋関数の一覧を把握する
2. `migrations/` を番号順に読み、現在のスキーマを組み立てる
3. `wrangler.jsonc` のバインディング（D1 / AI / Rate Limiting など）を確認する
4. `package.json` の scripts と依存、`vite.config.ts`、`.github/workflows/`、
   `.semgrep/expire-food.yml` を確認する

## Phase 2: 各ドキュメントの更新

### 2-1. `docs/requirements.md`

仕様の単一情報源。**実装に合わせて仕様を書き換えない。** 実装と食い違っていたら
どちらが正しいかをユーザーに確認し、レポートの「検出した不整合」に載せる。
DDL（6.3）と `migrations/` の差分、API 一覧とルートの差分は必ず照合する。

### 2-2. `docs/ROADMAP.md`

1. 実装済みの項目のチェックボックスを更新する（推測で付けない。コードとテストで確認できたものだけ）
2. 「前提と技術選定」「ガードレール」の表が `package.json` / CI / Semgrep ルールと一致しているか確認する
3. 完了した Phase の見出しに ✅ を付ける

### 2-3. ADR (`docs/adr/NNNN-*.md`)

技術選定や方針の判断がコードに現れているのに ADR が無ければ、新規作成を提案する。
既存 ADR のステータスは実装の実態に基づいて更新し、推測で変えない。

### 2-4. README.md / CLAUDE.md

1. セットアップ手順・コマンド表が `package.json` の scripts と一致しているか
2. 「CI で見ていること」が `.github/workflows/ci.yml` と一致しているか
3. CLAUDE.md の手順（`vp check && vp test && bunx knip` など）が現状と一致しているか

## Phase 3: 一貫性チェック

1. **コマンド参照の統一**: `vp` / `bun` / `wrangler` を使っているか。`npm` / `npx` / `yarn` / `pnpm` が残っていないか
2. **ファイルパス参照**: 存在しないファイルへの参照がないか
3. **バインディング名・テーブル名・カラム名**: ドキュメント・`wrangler.jsonc`・`migrations/`・`src/` で一致しているか
4. **Semgrep ルール**: ROADMAP のルール表と `.semgrep/expire-food.yml` の `id` が一致しているか

## Phase 4: 更新レポートの出力

```markdown
## ドキュメント更新レポート

### 更新したドキュメント

| ファイル        | 更新内容   |
| --------------- | ---------- |
| docs/ROADMAP.md | [変更概要] |
| README.md       | [変更概要] |

### 新規作成を提案するドキュメント

- [ファイル名]: [理由]

### 検出した不整合

- [不整合の詳細]
```

## 記述ルール

- ドキュメントは日本語で記述する
- コード例は TypeScript（Hono JSX）で記述する
- 変更後は `vp check` を通す（Markdown も Oxfmt の対象）
