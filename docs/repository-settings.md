# リポジトリ設定（GitHub の UI で行うもの）

ファイルで管理できない設定の手順と、その理由。ファイルで管理できるもの（CI・CodeQL・Scorecard・Dependabot・カバレッジ閾値・Lighthouse の閾値）はそれぞれの設定ファイルを参照。

## ブランチ保護（Rulesets）

`infra/github.tf` の `github_repository_ruleset.main` で管理する（手順は README「初回（Terraform）」）。

- 対象: デフォルトブランチ（`main`）
- PR 必須、承認 1 名、**承認後に push されたら承認を外す**（`dismiss_stale_reviews_on_push`）、レビューコメントの解決必須
- 必須チェック: CI の各ジョブと CodeQL。ジョブ名を変えたら `required_check` も揃えて apply する
- force push とブランチ削除を禁止
- Admin ロールは **PR 経由に限り**バイパス可。個人開発では自分の PR を自分で承認できないため。2 人目のレビュアーが入ったら `bypass_actors` を消す（Scorecard の Branch-Protection も上がる）

UI で先に作った Ruleset が残っている場合は、apply の前に `terraform -chdir=infra import github_repository_ruleset.main expire-food:<ruleset ID>` で取り込む（ID は Settings → Rules → Rulesets で開いた URL の末尾）。名前が同じ Ruleset は作れないため。

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

`production` Environment・`CLOUDFLARE_API_TOKEN`・リポジトリ変数 `CLOUDFLARE_ACCOUNT_ID`・デプロイ用トークンは `infra/` の Terraform で作る（手順は README「初回（Terraform）」、決定は [ADR 0005](./adr/0005-deploy-and-e2e.md) と [ADR 0008](./adr/0008-terraform-infra.md)）。

- 無料枠の確認（`bun run usage`）には、これとは別に Account / Account Analytics: Read だけのトークンを手元で使う（GitHub には置かない）
- SLSA provenance（署名付きビルド来歴）は配布物のある CLI 向けのため入れない

## 目標値

| 指標                    | 目標                                                      | どこで見るか                                                                             |
| ----------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| OpenSSF Scorecard       | 7.0 以上                                                  | `scorecard.yml` の結果（Security → Code scanning）                                       |
| カバレッジ              | 全体 100%（branches 95%）                                 | `vite.config.ts` の `test.coverage.thresholds`                                           |
| `src/domain/`           | ファイル単位で 100%（branches 含む）                      | 同上                                                                                     |
| Lighthouse（モバイル）  | Performance / Accessibility 90 以上（Speed Index は除外） | `lighthouserc.json`                                                                      |
| Core Web Vitals         | LCP ≤ 2.5s、CLS ≤ 0.1、INP ≤ 200ms                        | ラボは `lighthouserc.json`（INP は TBT で代替）、実測は `/api/vitals` のログ（ADR 0006） |
| Worker バンドル（gzip） | 3 MiB 未満（2/3 超で警告）                                | CI の `Worker bundle size`                                                               |
| PR のフィードバック時間 | 10 分以内                                                 | 各ジョブの `timeout-minutes: 10`                                                         |
