import { type Part, readingInput } from "../domain/extract";
import type { JudgeInput } from "../domain/judge";

// 比較は bun run extract-eval（README「読み取りモデルの比較」）
export const READ_MODEL = "@cf/google/gemma-4-26b-a4b-it";
// wrangler types が生成する AiModels にまだ無いので、run の型を外して呼ぶ
export const JUDGE_MODEL = "typesafe/jev";

// String.fromCharCode(...bytes) は 2MB だと引数が多すぎるので分けて渡す
const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

// 応答は未検証のまま返すので、必ず parseReading に通す
export const runReading = async (ai: Ai, image: File, part: Part): Promise<unknown> => {
  const url = `data:${image.type};base64,${toBase64(new Uint8Array(await image.arrayBuffer()))}`;
  return ai.run(READ_MODEL, readingInput(url, part));
};

// 応答は未検証のまま返すので、必ず parseJudgement に通す
export const runJudge = (ai: Ai, input: JudgeInput): Promise<unknown> =>
  (ai.run as unknown as (model: string, inputs: JudgeInput) => Promise<unknown>).call(
    ai,
    JUDGE_MODEL,
    input,
  );
