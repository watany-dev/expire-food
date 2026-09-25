import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { todayJst } from "../src/domain/date";
import { type EvalResult, evalCases, formatEval, parseRunResponse } from "../src/domain/evaluation";
import { readingInput } from "../src/domain/extract";
import { extractItem } from "../src/domain/pipeline";
import { extractForm } from "../src/domain/schema";
import { JUDGE_MODEL, READ_MODEL } from "../src/platform/ai";

// 実物パッケージの写真で読み取りモデルを比べる（README「読み取りモデルの比較」）。
// 本番と同じ段階処理を通すので、曖昧な候補が残った写真では判定モデル（JUDGE_MODEL）も呼ぶ
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const [dir, ...args] = process.argv.slice(2);
if (!token || !account || !dir) {
  console.error(
    "usage: CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... bun run extract-eval <写真のディレクトリ> [モデル...]",
  );
  process.exit(2);
}
const models = args.length ? args : [READ_MODEL];

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const cases = evalCases.parse(JSON.parse(await readFile(join(dir, "expected.json"), "utf8")));
const images = await Promise.all(
  Object.keys(cases).map(async (file) => {
    const image = new File([await readFile(join(dir, file))], file, {
      type: MIME[extname(file).toLowerCase()] ?? "",
    });
    // 本番の /api/extract が受け付けない写真は比べても意味がない
    if (!extractForm.safeParse({ image }).success) {
      throw new Error(`${file}: JPEG / PNG / WebP の 2MB 以下にしてください`);
    }
    return {
      file,
      url: `data:${image.type};base64,${Buffer.from(await image.arrayBuffer()).toString("base64")}`,
    };
  }),
);

const run = async (model: string, input: unknown): Promise<unknown> => {
  let status = "network error";
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    status = `HTTP ${res.status}`;
    return parseRunResponse(await res.json().catch(() => null));
  } catch (error) {
    throw new Error(`${model} ${status}: ${(error as Error).message}`, { cause: error });
  }
};

const today = todayJst();
for (const model of models) {
  const results: EvalResult[] = [];
  for (const { file, url } of images) {
    const expected = cases[file]!;
    const started = performance.now();
    try {
      const actual = await extractItem({
        part: "all",
        today,
        read: () => run(model, readingInput(url, "all")),
        // 本番と同じく、判定モデルの失敗は候補を返すだけにする
        judge: (input) =>
          run(JUDGE_MODEL, input).catch((error: unknown) => {
            console.error(`${file}: ${(error as Error).message}`);
            return null;
          }),
        knownNames: async () => [],
      });
      results.push({ file, expected, actual, ms: performance.now() - started });
    } catch (error) {
      results.push({ file, expected, error: (error as Error).message });
    }
  }
  console.info(`${formatEval(model, results)}\n`);
}
