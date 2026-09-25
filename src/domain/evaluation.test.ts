import { describe, expect, it } from "vite-plus/test";

import { type EvalResult, evalCases, formatEval, parseRunResponse } from "./evaluation";

const milk = { name: "牛乳", expires_on: "2026-10-05", kind: "use_by" } as const;

const hit = (file: string, ms: number): EvalResult => ({
  file,
  expected: milk,
  actual: { ...milk, confidence: "high" },
  ms,
});

describe("evalCases", () => {
  it("正解は実在する日付と種別で書く", () => {
    expect(evalCases.safeParse({ "milk.jpg": milk }).success).toBe(true);
    expect(evalCases.safeParse({ "milk.jpg": { ...milk, expires_on: "2026-02-30" } }).success).toBe(
      false,
    );
    expect(evalCases.safeParse({ "milk.jpg": { ...milk, kind: "unknown" } }).success).toBe(false);
  });
});

describe("parseRunResponse", () => {
  it("result をそのまま返す（中身の形は parseReading / parseJudgement が見る）", () => {
    expect(parseRunResponse({ success: true, result: { response: '{"name":"牛乳"}' } })).toEqual({
      response: '{"name":"牛乳"}',
    });
    expect(parseRunResponse({ result: { choices: [] } })).toEqual({ choices: [] });
  });

  it("API のエラーはメッセージを投げる", () => {
    expect(() =>
      parseRunResponse({
        success: false,
        errors: [{ message: "No such model" }, { message: "try again" }],
      }),
    ).toThrow("No such model\ntry again");
  });

  it("形の違う応答は unexpected response", () => {
    expect(() => parseRunResponse(null)).toThrow("unexpected response");
    expect(() => parseRunResponse({ errors: [] })).toThrow("unexpected response");
    expect(() => parseRunResponse({ result: null, errors: [] })).toThrow("unexpected response");
  });
});

describe("formatEval", () => {
  it("全問正解なら集計の行だけ", () => {
    expect(formatEval("m", [hit("a.jpg", 1000), hit("b.jpg", 2001)])).toBe(
      [
        "m",
        "  name 2/2  date 2/2  kind 2/2  high-confidence wrong date 0  failed 0  avg 1501 ms",
      ].join("\n"),
    );
  });

  it("商品名は表記揺れを許し、外れた項目と失敗をファイルごとに出す", () => {
    const results: EvalResult[] = [
      {
        file: "long.jpg",
        expected: milk,
        actual: { ...milk, name: "おいしい 牛乳", confidence: "low" },
        ms: 100,
      },
      {
        file: "short.jpg",
        expected: { ...milk, name: "ＡＢＣ牛乳" },
        actual: { ...milk, name: "abc", confidence: "low" },
        ms: 300,
      },
      {
        file: "wrong.jpg",
        expected: milk,
        actual: { name: "パン", expires_on: "2026-10-06", kind: "best_by", confidence: "high" },
        ms: 200,
      },
      {
        file: "blank.jpg",
        expected: milk,
        actual: { name: null, expires_on: null, kind: null, confidence: "high" },
        ms: 600,
      },
      { file: "error.jpg", expected: milk, error: "HTTP 500" },
    ];
    expect(formatEval("m", results)).toBe(
      [
        "m",
        "  name 2/5  date 2/5  kind 2/5  high-confidence wrong date 1  failed 1  avg 300 ms",
        "  wrong.jpg: name パン ≠ 牛乳, date 2026-10-06 ≠ 2026-10-05 (high), kind best_by ≠ use_by",
        "  blank.jpg: name null ≠ 牛乳, date null ≠ 2026-10-05 (high), kind null ≠ use_by",
        "  error.jpg: HTTP 500",
      ].join("\n"),
    );
  });

  it("全部失敗したら平均は出さない", () => {
    expect(formatEval("m", [{ file: "a.jpg", expected: milk, error: "boom" }])).toBe(
      [
        "m",
        "  name 0/1  date 0/1  kind 0/1  high-confidence wrong date 0  failed 1  avg -",
        "  a.jpg: boom",
      ].join("\n"),
    );
  });
});
