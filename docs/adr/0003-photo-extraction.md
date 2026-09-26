# ADR 0003: 写真からの読み取り（`/api/extract`）

- 状態: 採用（モデル選定とプロンプトの形は [ADR 0007](./0007-staged-extraction.md) で置き換え）
- 日付: 2026-09-24

## 背景

Phase 3 で、撮影した写真から商品名・期限日・種別を読み取ってフォームに入れる（要件 4.1 / 8.1）。AI の応答は信用できないので必ず検証し、失敗しても手入力で登録できる状態を保つ。ADR 0002 で JS なしにした画面にクライアント JS を足す方法も決める。

## 決定

- モデルは `@cf/meta/llama-4-scout-17b-16e-instruct`（画像入力と JSON モードに対応し、利用規約への同意リクエストが要らない）。ただし暫定で、実物パッケージでの精度と Neurons 消費を比べて決め直す（ROADMAP Phase 3 の残タスク）。モデル名は `src/platform/ai.ts` の 1 か所だけ
  - 比較は `bun run extract-eval`（`scripts/extract-eval.ts`）で行う。モデルへの入力は `extractionInput`（`src/domain/extract.ts`）を本番と共有し、プロンプトを変えたときも同じスクリプトで比べ直せるようにする
- モデルには日付を正規化させず、印字どおりの文字列（`date`）と近くの文言（`label`）を JSON で返させる。正規化・種別判定・検証は `src/domain/extract.ts` の純粋関数で行い、fast-check のプロパティテストで固める
  - JSON として読めない・型が違う項目は `null`。応答は文字列（前後に文章や ``` が付くことがある）とオブジェクトの両方を受ける
  - 日付は `YYYY.MM.DD` / `YY.MM.DD` / 令和 / `YYYY.MM`（月末）/ 年省略（今日（JST）以降で最も近い日）を読み、実在しない日付は `null`
  - `kind` が読めなければ `null` を返し、クライアントは種別の選択を変えずに確認を促す（追加フォームの初期値は `best_by`、編集フォームは登録済みの値）
- `POST /api/extract` は multipart の `image`（JPEG / PNG / WebP、2MB 以下）を受ける。順序はレート制限（本文を読む前）→ 本文の上限（`bodyLimit`。画像の上限 + 16KB。multipart を読み切る前に `413` で止める）→ 検証 → AI。レート制限超過は `429`、本文の上限超過は `413`、AI の失敗は `502`。いずれもクライアントは手入力へフォールバックする
  - 読み取りは書き込みではないのでスペースを発行しない（ADR 0002 の閲覧系と同じ扱い）。発行すると Cookie を付けないだけで毎回新しいレート制限の枠が得られてしまう
  - レート制限のキーは既存のスペースなら space_id、無ければ `cf-connecting-ip`
- クライアント JS は `src/client/extract.js` を `?raw` で取り込み、`GET /extract.js` で配信する。CSP は `script-src 'self'` と `connect-src 'self'` を足す
  - ADR 0002 では nonce を足す想定だったが、Hono JSX は `<script>` の中身もエスケープするため、インラインではなく同一オリジンのファイルにした（`raw()` は Semgrep で禁止）
  - URL にバージョンを含めないので `Cache-Control: no-cache`（ADR 0010 で ETag を付け、変わっていなければ `304`）
  - 写真の入力欄は `hidden` で出力し、スクリプトが表示する。JS が無い・失敗した場合もフォームは手入力で使える

## 影響

- `src/client/extract.js` は Node の `vp test` では動かず、カバレッジの対象外。ロジックは縮小・送信・フォームへの反映だけにし、判定は `/api/extract`（`src/domain/`）に寄せる
- 事前に作った複数のスペースの Cookie を使い回せばレート制限の枠は増やせる。無料プランの Workers AI は 1 日の上限で止まる（課金は増えない）ので、読み取りが使えなくなるだけとして許容する
- ~~`/api/extract` は `/api/*` の `resolveSpace` より先に登録する（`src/index.tsx`）~~ → [ADR 0002](./0002-server-rendered-forms.md) の追記で `/api/*` 全体の `resolveSpace` をやめたので不要
