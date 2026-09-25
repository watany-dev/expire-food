import { describe, expect, it } from "vite-plus/test";

import type { Reading, Resolution } from "./extract";
import { judgeInput, parseJudgement } from "./judge";

const milk = { text: "賞味期限 26.10.05", expires_on: "2026-10-05", kind: "best_by" as const };
const campaign = { text: "応募締切 26.12.31", expires_on: "2026-12-31", kind: null };
const reading: Reading = {
  names: ["明治", "おいしい牛乳"],
  dates: [
    { text: "26.10.05", label: "賞味期限" },
    { text: "26.12.31", label: "応募締切" },
  ],
  issue: null,
};
const ambiguous: Resolution = {
  name: null,
  names: ["明治", "おいしい牛乳"],
  date: null,
  dates: [milk, campaign],
};

describe("judgeInput", () => {
  it("候補が複数残った項目を、候補をそのまま選択肢にした Choice にする", () => {
    const input = judgeInput(reading, ambiguous);
    expect(input).toEqual({
      state: reading,
      questions: {
        name: {
          type: "choice",
          instructions: expect.stringContaining("product name"),
          criteria: { 明治: null, おいしい牛乳: null },
        },
        date: {
          type: "choice",
          instructions: expect.stringContaining("expiry date"),
          criteria: { "賞味期限 26.10.05": null, "応募締切 26.12.31": null },
        },
      },
    });
  });

  it("決まった項目は聞かない", () => {
    const input = judgeInput(reading, { ...ambiguous, date: milk });
    expect(Object.keys(input?.questions ?? {})).toEqual(["name"]);
  });

  it.each([
    ["すべて決まっている", { ...ambiguous, name: "牛乳", date: milk }],
    // 候補が 0 か 1 なら判定モデルに聞いても選べない
    ["候補が足りない", { name: null, names: ["牛乳"], date: null, dates: [] }],
  ])("%s なら判定モデルを呼ばない", (_, resolution) => {
    expect(judgeInput(reading, resolution)).toBeNull();
  });
});

describe("parseJudgement", () => {
  const answers = {
    name: { choice: "おいしい牛乳", confidence: 0.92, probabilities: {} },
    date: { choice: "賞味期限 26.10.05", confidence: 0.7 },
  };

  it.each([
    ["answers の中", { answers }],
    ["result.answers の中", { result: { answers } }],
    ["外側なし", answers],
  ])("%s の選択を候補に戻す", (_, output) => {
    expect(parseJudgement(output, ambiguous)).toEqual({ name: "おいしい牛乳", date: milk });
  });

  it("確信度が低い選択は採らない", () => {
    const output = {
      answers: { ...answers, date: { choice: "賞味期限 26.10.05", confidence: 0.69 } },
    };
    expect(parseJudgement(output, ambiguous)).toEqual({ name: "おいしい牛乳" });
  });

  it("候補に無い選択や形の違う答えは採らない", () => {
    const output = {
      answers: { name: { choice: "牛乳", confidence: 1 }, date: "賞味期限 26.10.05" },
    };
    expect(parseJudgement(output, ambiguous)).toEqual({});
  });

  it.each([[null], ["error"], [{ answers: "x" }]])("読めない応答（%j）は何も選ばない", (output) => {
    expect(parseJudgement(output, ambiguous)).toEqual({});
  });
});
