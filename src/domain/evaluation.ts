import { z } from "zod/mini";

import type { Extraction } from "./extract";
import { itemInput } from "./schema";

export const evalCases = z.record(
  z.string(),
  z.pick(itemInput, { name: true, expires_on: true, kind: true }),
);

type EvalCase = z.output<typeof evalCases>[string];
type Actual = Pick<Extraction, "name" | "expires_on" | "kind" | "confidence">;

export type EvalResult = { file: string; expected: EvalCase } & (
  | { actual: Actual; ms: number }
  | { error: string }
);

// エラー時も result: null が付いてくる
const runResponse = z.object({ result: z.custom<unknown>((v) => v != null) });
const runErrors = z.object({
  errors: z.array(z.object({ message: z.string() })).check(z.minLength(1)),
});

export const parseRunResponse = (body: unknown): unknown => {
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

const score = (expected: EvalCase, actual: Actual) => ({
  name: sameName(expected.name, actual.name),
  date: actual.expires_on === expected.expires_on,
  kind: actual.kind === expected.kind,
  // 日付を誤ったうえ確信度が高いと、フォームで確認を促さないので一番危ない
  confidentMiss:
    actual.confidence === "high" &&
    actual.expires_on !== null &&
    actual.expires_on !== expected.expires_on,
});

const misses = (expected: EvalCase, actual: Actual) => {
  const s = score(expected, actual);
  return [
    s.name ? null : `name ${actual.name} ≠ ${expected.name}`,
    s.date ? null : `date ${actual.expires_on} ≠ ${expected.expires_on} (${actual.confidence})`,
    s.kind ? null : `kind ${actual.kind} ≠ ${expected.kind}`,
  ].filter((m) => m !== null);
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
    `  name ${count("name")}/${n}  date ${count("date")}/${n}  kind ${count("kind")}/${n}  high-confidence wrong date ${count("confidentMiss")}  failed ${n - ok.length}  avg ${avgMs}`,
    ...results.flatMap((r) => {
      const why = "error" in r ? [r.error] : misses(r.expected, r.actual);
      return why.length ? [`  ${r.file}: ${why.join(", ")}`] : [];
    }),
  ];
  return lines.join("\n");
};
