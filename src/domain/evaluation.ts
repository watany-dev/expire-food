import { z } from "zod";

import type { Extraction } from "./extract";
import { itemInput } from "./schema";

export const evalCases = z.record(
  z.string(),
  itemInput.pick({ name: true, expires_on: true, kind: true }),
);

type EvalCase = z.infer<typeof evalCases>[string];

const usage = z.object({ prompt_tokens: z.number(), completion_tokens: z.number() });

type Usage = z.infer<typeof usage>;

export type EvalResult = { file: string; expected: EvalCase } & (
  | { actual: Extraction; ms: number; usage?: Usage | undefined }
  | { error: string }
);

// Workers AI の料金表（入力・出力 100 万トークンあたりの Neurons）。無料枠は 1 日 10,000 Neurons
const NEURONS_PER_M: Record<string, [number, number]> = {
  "@cf/meta/llama-3.2-11b-vision-instruct": [4410, 61493],
  "@cf/meta/llama-4-scout-17b-16e-instruct": [24545, 77273],
  "@cf/google/gemma-3-12b-it": [31371, 50560],
  "@cf/mistralai/mistral-small-3.1-24b-instruct": [31876, 50488],
};

const FREE_NEURONS_PER_DAY = 10_000;

const runResponse = z.object({
  result: z.object({ response: z.unknown(), usage: usage.optional().catch(undefined) }),
});
const runErrors = z.object({ errors: z.array(z.object({ message: z.string() })).min(1) });

export const parseRunResponse = (
  body: unknown,
): { response: unknown; usage?: Usage | undefined } => {
  const parsed = runResponse.safeParse(body);
  if (parsed.success) return parsed.data.result;
  const errors = runErrors.safeParse(body);
  throw new Error(
    errors.success ? errors.data.errors.map((e) => e.message).join("\n") : "unexpected response",
  );
};

const loose = (s: string) => s.normalize("NFKC").replace(/\s/g, "").toLowerCase();

// パッケージの表記には揺れがある（「おいしい牛乳」と「牛乳」など）ので、どちらかがもう一方を含めば正解とする
const sameName = (expected: string, actual: string | null) =>
  actual !== null &&
  (loose(actual).includes(loose(expected)) || loose(expected).includes(loose(actual)));

const score = (expected: EvalCase, actual: Extraction) => ({
  name: sameName(expected.name, actual.name),
  date: actual.expires_on === expected.expires_on,
  kind: actual.kind === expected.kind,
  // 日付を誤ったうえ確信度が高いと、フォームで確認を促さないので一番危ない
  confidentMiss:
    actual.confidence === "high" &&
    actual.expires_on !== null &&
    actual.expires_on !== expected.expires_on,
});

const misses = (expected: EvalCase, actual: Extraction) => {
  const s = score(expected, actual);
  return [
    s.name ? null : `name ${actual.name} ≠ ${expected.name}`,
    s.date ? null : `date ${actual.expires_on} ≠ ${expected.expires_on} (${actual.confidence})`,
    s.kind ? null : `kind ${actual.kind} ≠ ${expected.kind}`,
  ].filter((m) => m !== null);
};

const neurons = (model: string, ok: { usage?: Usage | undefined }[]): string => {
  const rate = NEURONS_PER_M[model];
  const usages = ok.flatMap((r) => (r.usage ? [r.usage] : []));
  if (!rate || usages.length === 0 || usages.length < ok.length) return "neurons -";
  const [input, output] = rate;
  const avg =
    usages.reduce((sum, u) => sum + u.prompt_tokens * input + u.completion_tokens * output, 0) /
    1_000_000 /
    usages.length;
  return `neurons ${avg.toFixed(1)}/image (free ${Math.floor(FREE_NEURONS_PER_DAY / avg)}/day)`;
};

export const formatEval = (model: string, results: EvalResult[]): string => {
  const ok = results.filter((r) => "actual" in r);
  const scores = ok.map((r) => score(r.expected, r.actual));
  const count = (key: keyof ReturnType<typeof score>) => scores.filter((s) => s[key]).length;
  const avgMs = ok.length
    ? `${Math.round(ok.reduce((sum, r) => sum + r.ms, 0) / ok.length)} ms`
    : "-";
  const n = results.length;
  const lines = [
    model,
    `  name ${count("name")}/${n}  date ${count("date")}/${n}  kind ${count("kind")}/${n}  high-confidence wrong date ${count("confidentMiss")}  failed ${n - ok.length}  avg ${avgMs}  ${neurons(model, ok)}`,
    ...results.flatMap((r) => {
      const why = "error" in r ? [r.error] : misses(r.expected, r.actual);
      return why.length ? [`  ${r.file}: ${why.join(", ")}`] : [];
    }),
  ];
  return lines.join("\n");
};
