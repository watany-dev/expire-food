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
  it("result.response を返す（文字列でもオブジェクトでもそのまま）", () => {
    expect(parseRunResponse({ success: true, result: { response: '{"name":"牛乳"}' } })).toEqual({
      response: '{"name":"牛乳"}',
    });
    expect(parseRunResponse({ result: { response: { name: "牛乳" } } })).toEqual({
      response: { name: "牛乳" },
    });
  });

  it("トークン数があれば一緒に返し、形が違えば無視する", () => {
    const usage = { prompt_tokens: 1000, completion_tokens: 50, total_tokens: 1050 };
    expect(parseRunResponse({ result: { response: "{}", usage } })).toEqual({
      response: "{}",
      usage: { prompt_tokens: 1000, completion_tokens: 50 },
    });
    expect(parseRunResponse({ result: { response: "{}", usage: { prompt_tokens: "x" } } })).toEqual(
      { response: "{}", usage: undefined },
    );
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
  });
});

describe("formatEval", () => {
  it("全問正解なら集計の行だけ", () => {
    expect(formatEval("m", [hit("a.jpg", 1000), hit("b.jpg", 2001)])).toBe(
      [
        "m",
        "  name 2/2  date 2/2  kind 2/2  high-confidence wrong date 0  failed 0  avg 1501 ms  neurons -",
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
        "  name 2/5  date 2/5  kind 2/5  high-confidence wrong date 1  failed 1  avg 300 ms  neurons -",
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
        "  name 0/1  date 0/1  kind 0/1  high-confidence wrong date 0  failed 1  avg -  neurons -",
        "  a.jpg: boom",
      ].join("\n"),
    );
  });

  it("料金表にあるモデルはトークン数から 1 枚あたりの Neurons と無料枠で読める枚数を出す", () => {
    const usage = { prompt_tokens: 2000, completion_tokens: 100 };
    const results = [
      { ...hit("a.jpg", 1000), usage },
      { ...hit("b.jpg", 1000), usage: { prompt_tokens: 4000, completion_tokens: 100 } },
    ];
    // (3000 × 4410 + 100 × 61493) / 1,000,000 = 19.3749
    expect(formatEval("@cf/meta/llama-3.2-11b-vision-instruct", results)).toBe(
      [
        "@cf/meta/llama-3.2-11b-vision-instruct",
        "  name 2/2  date 2/2  kind 2/2  high-confidence wrong date 0  failed 0  avg 1000 ms  neurons 19.4/image (free 516/day)",
      ].join("\n"),
    );
  });

  it("トークン数が欠けた結果があれば Neurons は出さない", () => {
    const model = "@cf/meta/llama-3.2-11b-vision-instruct";
    const usage = { prompt_tokens: 2000, completion_tokens: 100 };
    expect(formatEval(model, [{ ...hit("a.jpg", 1000), usage }, hit("b.jpg", 1000)])).toContain(
      "neurons -",
    );
    expect(formatEval(model, [hit("a.jpg", 1000)])).toContain("neurons -");
  });
});
