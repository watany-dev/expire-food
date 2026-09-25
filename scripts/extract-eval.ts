import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { todayJst } from "../src/domain/date";
import { type EvalResult, evalCases, formatEval, parseRunResponse } from "../src/domain/evaluation";
import { extractionInput, parseExtraction } from "../src/domain/extract";
import { extractForm } from "../src/domain/schema";
import { EXTRACT_MODEL } from "../src/platform/ai";

// 実物パッケージの写真で読み取りモデルを比べる（README「読み取りモデルの比較」）
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const [dir, ...args] = process.argv.slice(2);
if (!token || !account || !dir) {
  console.error(
    "usage: CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... bun run extract-eval <写真のディレクトリ> [モデル...]",
  );
  process.exit(2);
}
const models = args.length ? args : [EXTRACT_MODEL];

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

const today = todayJst();
for (const model of models) {
  const results: EvalResult[] = [];
  for (const { file, url } of images) {
    const expected = cases[file]!;
    const started = performance.now();
    let status = "network error";
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(extractionInput(url)),
        },
      );
      status = `HTTP ${res.status}`;
      const { response, usage } = parseRunResponse(await res.json().catch(() => null));
      const ms = performance.now() - started;
      results.push({ file, expected, actual: parseExtraction(response, today), ms, usage });
    } catch (error) {
      results.push({ file, expected, error: `${status}: ${(error as Error).message}` });
    }
  }
  console.info(`${formatEval(model, results)}\n`);
}
