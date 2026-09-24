---
description: Validate and improve an implementation plan in plan mode by cross-checking with docs/requirements.md, docs/ROADMAP.md, docs/adr/*.md, migrations/, and src/. Use in plan mode whenever the user requests an implementation plan for expire-food - invoke at the start of plan mode so the verification runs before finalizing the plan file, and re-invoke just before ExitPlanMode if the plan has materially changed. Trigger examples - entering plan mode for any expire-food feature work, "プランを作成", "実装計画", "plan this feature", "validate the plan", "整合性チェック".
---

# update-plan

プランモードで実装計画を完成させた直後、ユーザーに提示する直前に発動する統合検証・改善スキル。
要件・ロードマップ・ADR との横断的整合性チェックと、プラン自体の改善を行う。

## 発動タイミング

**プランモードでプラン完了と判断した直後、`ExitPlanMode` を呼ぶ直前**に本スキルを実行する。

1. ユーザーが実装タスクを依頼する
2. Claude がプランモードで調査・計画を作成する
3. プランが完成した時点で **本スキルを発動**
4. 本スキルの検証結果に基づきプランを改善する
5. 改善済みプランで `ExitPlanMode` を呼ぶ

## Phase 1: コンテキスト収集

1. 作成中のプランの対象（ROADMAP の Phase・項目、要件の節番号）を特定する
2. `docs/requirements.md` の該当節、`docs/ROADMAP.md` の該当 Phase、関連する `docs/adr/*.md` を読む
3. プランが触る `src/`・`migrations/`・`wrangler.jsonc`・`.semgrep/` を読む

## Phase 2: プラン品質評価

各カテゴリを 100 点満点で評価する。**合格ライン: 90 点以上**。

1. **ルーティング・モジュール設計**
   - Hono のルート / ミドルウェア / リポジトリ層 / 純粋関数の責務分離が明確か
   - ランタイム依存（D1・AI・Rate Limiting）を薄く保ち、純粋関数に寄せているか
2. **データ・スキーマ**
   - スキーマ変更は新しい連番マイグレーションで行うか（既存ファイルを編集しないか）
   - すべてのクエリに `space_id` 条件があり、値は `.bind()` で渡すか
   - D1 の `batch()` が必要な一括更新を見落としていないか
3. **入力検証・エラー処理**
   - Zod スキーマが要件の上限・形式と一致しているか
   - AI 応答・外部入力の失敗時のフォールバック（全項目 `null`、手入力）が定義されているか
   - HTTP ステータス（400 / 404 / 413 / 429）の使い分けが明確か
4. **セキュリティ・プライバシー**
   - `.semgrep/expire-food.yml` のルール（`.bind()`、`Math.random` 禁止、`raw()` 禁止、本文をログに出さない、Cookie 属性）に抵触しないか
   - CSRF / CSP / 画像を保存・ログしない方針（要件 8）を守っているか
5. **テスト戦略**
   - 境界値・JST 日付境界・スペース分離のテストが計画されているか
   - テストは `vite-plus/test` から import し、Node 上で `app.request()` を叩く前提と矛盾しないか

| スコア | 意味                                       |
| ------ | ------------------------------------------ |
| 90-100 | 実装に即座に移れる。補足不要               |
| 70-89  | 実装に移れるが、軽微な補足があるとなお良い |
| 50-69  | 理解可能だが、補足・明確化が望ましい       |
| 30-49  | 不明確で、実装前に修正が必要               |
| 1-29   | 該当観点が欠落、または根本的な設計ミス     |

## Phase 3: 整合性チェック

### 3-1. 要件 ↔ プラン ↔ ソースコード

1. プランが要件の該当節（API 仕様、DDL、制約値）と一致しているか
2. 要件にあるがプランで扱っていない項目、プランにあるが要件に無い項目（=スコープ外の追加）を特定する
3. `docs/requirements.md` の「対象外」に踏み込んでいないか

### 3-2. ROADMAP ↔ ADR ↔ プラン

1. プランの範囲が ROADMAP の Phase の区切りと一致しているか（先の Phase を先取りしていないか）
2. ADR の決定とプランが矛盾していないか。新しい技術判断を含むなら ADR 追加をプランに入れる
3. 依存追加が knip で落ちない（使う Phase で入れる）か

## Phase 4: プラン改善と出力

### 4-1. プランの検証

1. **Tidy First?**: 構造的変更と機能的変更が分離されているか
2. **イテレーション単位**: 各ステップが「動くものを main に入れる」最小単位か
3. **影響範囲**: `wrangler.jsonc` 変更時の `bun run cf-typegen`、Semgrep ルール変更時のフィクスチャ更新が入っているか
4. **完了条件**: 各ステップが `vp check && vp test --coverage && bunx knip` を通す前提になっているか

### 4-2. フィードバック反映

- **P0（必須修正）**: スコア 50 未満のカテゴリ、要件・ADR との矛盾、Semgrep ルール違反
- **P1（推奨修正）**: スコア 50-69 のカテゴリ、イテレーション分割の改善、影響範囲の追加記載
- **P2（情報提供）**: スコア 70-89 のカテゴリ、将来 Phase への影響（90 以上は指摘なし）

### 4-3. 検証サマリの出力

プランの末尾に以下を追記する:

```markdown
## update-plan 検証結果

| ルーティング | データ | 入力検証 | セキュリティ | テスト | 平均 |
| ------------ | ------ | -------- | ------------ | ------ | ---- |
| XX/100       | XX/100 | XX/100   | XX/100       | XX/100 | XX.X |

**総合判定**: 🟢/🟡/🟠/🔴 [判定テキスト]
（🟢 平均 90 以上 / 🟡 70-89 / 🟠 50-69 / 🔴 50 未満）

### 整合性チェック

| チェック項目           | スコア | 詳細   |
| ---------------------- | ------ | ------ |
| 要件 ↔ プラン ↔ ソース | XX/100 | [詳細] |
| ROADMAP ↔ ADR ↔ プラン | XX/100 | [詳細] |

### 修正事項

- **P0**: ...
- **P1**: ...
- **P2**: ...
```

### 4-4. 完了アクション

1. P0・P1 の修正をプランに反映する
2. 検証サマリを付加した状態で `ExitPlanMode` を実行する

## 記述ルール

- プラン・レポートは日本語で記述する
- コード例は TypeScript（Hono JSX）で記述する
- ROADMAP のチェックボックス・ADR のステータスは実装の実態に基づき、推測で変更しない
- プランの修正は根拠（要件の節番号・ROADMAP・ADR・CLAUDE.md の該当箇所）を明示する
