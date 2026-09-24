# リポジトリ設定（GitHub の UI で行うもの）

ファイルで管理できない設定の手順と、その理由。ファイルで管理できるもの（CI・CodeQL・Scorecard・Dependabot・カバレッジ閾値・Lighthouse の閾値）はそれぞれの設定ファイルを参照。

## ブランチ保護（Rulesets）

`.github/rulesets/main.json` を Settings → Rules → Rulesets → New ruleset → **Import a ruleset** で取り込む。

- 対象: デフォルトブランチ（`main`）
- PR 必須、承認 1 名、**承認後に push されたら承認を外す**（`dismiss_stale_reviews_on_push`）、レビューコメントの解決必須
- 必須チェック: `check / test / build`、`knip`、`semgrep (SAST)`、`lighthouse`、`zghalint`、`analyze (javascript-typescript)`、`analyze (actions)`
- force push とブランチ削除を禁止
- Admin ロールは **PR 経由に限り**バイパス可（`bypass_mode: pull_request`）。個人開発では自分の PR を自分で承認できないため。2 人目のレビュアーが入ったら `bypass_actors` を空にする（Scorecard の Branch-Protection も上がる）

ジョブ名を変えたら `main.json` の `required_status_checks` も揃えて取り込み直す。

## Code security（Settings → Code security）

- **Secret scanning**: 有効
- **Push protection**: 有効（秘密情報を含む push をサーバー側で拒否する）
- **Dependabot alerts / security updates**: 有効
- **CodeQL**: `.github/workflows/codeql.yml`（advanced setup）で動かしているので、**default setup は有効にしない**（併用するとエラーになる）
- **Private vulnerability reporting**: 有効

## Actions（Settings → Actions → General）

- Workflow permissions: **Read repository contents**（既定の `GITHUB_TOKEN` を読み取り専用にする。各ワークフローは必要な権限だけを job 単位で足している）
- 「Allow GitHub Actions to create and approve pull requests」: 無効

## デプロイ（Phase 5）

- Settings → Environments に `production` を作る
  - **Required reviewers**: 自分（将来は 2 人目）
  - **Deployment branches**: `main` のみ
  - Secret `CLOUDFLARE_API_TOKEN` は Environment 側に置く（リポジトリ secret にしない）
- Cloudflare の API トークンはカスタムトークンで、対象アカウントに限定し次の権限だけ付ける
  - Account / Workers Scripts: Edit
  - Account / D1: Edit
  - Account / Workers AI: Edit（Read で足りるならそちら）
- SLSA provenance（署名付きビルド来歴）は配布物のある CLI 向けのため入れない

## 目標値

| 指標                    | 目標                                 | どこで見るか                                                                     |
| ----------------------- | ------------------------------------ | -------------------------------------------------------------------------------- |
| OpenSSF Scorecard       | 7.0 以上                             | `scorecard.yml` の結果（Security → Code scanning）                               |
| カバレッジ              | 全体 100%（branches 95%）            | `vite.config.ts` の `test.coverage.thresholds`                                   |
| `src/domain/`           | ファイル単位で 100%（branches 含む） | 同上                                                                             |
| Lighthouse（モバイル）  | Performance / Accessibility 90 以上  | `lighthouserc.json`                                                              |
| Core Web Vitals         | LCP ≤ 2.5s、CLS ≤ 0.1、INP ≤ 200ms   | ラボは `lighthouserc.json`（INP は TBT で代替）、実測は Phase 5 の Observability |
| Worker バンドル（gzip） | 3 MiB 未満（2/3 超で警告）           | CI の `Worker bundle size`                                                       |
| PR のフィードバック時間 | 10 分以内                            | 各ジョブの `timeout-minutes: 10`                                                 |
