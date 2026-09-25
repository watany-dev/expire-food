import { describe, expect, it } from "vite-plus/test";

import { FREE_TIER, formatUsage, parseUsage, usageWindow } from "./usage";

const day = (date: string, usage: Partial<Record<keyof typeof FREE_TIER, number>> = {}) => ({
  date,
  requests: 0,
  neurons: 0,
  rowsRead: 0,
  rowsWritten: 0,
  ...usage,
});

const body = (account: object) => ({
  data: { viewer: { accounts: [{ workers: [], ai: [], d1: [], ...account }] } },
});

describe("usageWindow", () => {
  it("今日（UTC）を含む直近 7 日を対象にする", () => {
    const { dates, variables } = usageWindow("acc", new Date("2026-09-25T14:59:00Z"));
    expect(dates).toEqual([
      "2026-09-19",
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
    ]);
    expect(variables).toEqual({
      accountTag: "acc",
      since: "2026-09-19",
      until: "2026-09-25",
      sinceTime: "2026-09-19T00:00:00Z",
      untilTime: "2026-09-25T14:59:00.000Z",
    });
  });

  it("JST で日付が変わっても UTC の日付で数える（無料枠のリセットは UTC 0 時）", () => {
    const { variables } = usageWindow("acc", new Date("2026-09-25T15:00:00Z"));
    expect(variables.until).toBe("2026-09-25");
  });
});

describe("parseUsage", () => {
  it("日付ごとに合計し、データの無い日は 0 にする", () => {
    const parsed = parseUsage(
      body({
        workers: [
          { dimensions: { date: "2026-09-25" }, sum: { requests: 10 } },
          { dimensions: { date: "2026-09-25" }, sum: { requests: 5 } },
        ],
        ai: [{ dimensions: { date: "2026-09-24" }, sum: { totalNeurons: 1.5 } }],
        d1: [{ dimensions: { date: "2026-09-25" }, sum: { rowsRead: 300, rowsWritten: 4 } }],
      }),
      ["2026-09-24", "2026-09-25"],
    );
    expect(parsed).toEqual([
      day("2026-09-24", { neurons: 1.5 }),
      day("2026-09-25", { requests: 15, rowsRead: 300, rowsWritten: 4 }),
    ]);
  });

  it("GraphQL のエラーはメッセージを返す", () => {
    const errors = { data: null, errors: [{ message: "not authorized" }, { message: "bad" }] };
    expect(() => parseUsage(errors, [])).toThrow("not authorized\nbad");
  });

  it.each([
    ["想定外の形", { data: { viewer: { accounts: [] } } }],
    ["エラーが空", { data: null, errors: [] }],
    ["JSON でない", null],
  ])("%s は失敗にする", (_, value) => {
    expect(() => parseUsage(value, [])).toThrow("unexpected GraphQL response");
  });
});

describe("formatUsage", () => {
  it("上限と割合を表にする", () => {
    const { text, warn } = formatUsage([day("2026-09-25", { requests: 1234, neurons: 50 })]);
    expect(text.split("\n")).toEqual([
      "date (UTC)   requests    neurons  rowsRead   rowsWritten",
      "limit / day  100,000     10,000   5,000,000  100,000",
      "2026-09-25   1,234 (1%)  50 (1%)  0 (0%)     0 (0%)",
    ]);
    expect(warn).toBe(false);
  });

  it.each([
    ["8 割未満", 7_999, "7,999 (80%)", false],
    ["8 割", 8_000, "8,000 (80%) !", true],
    ["上限", 10_000, "10,000 (100%) ✗", true],
  ])("%s", (_, neurons, shown, warn) => {
    const result = formatUsage([day("2026-09-25", { neurons })]);
    expect(result.text).toContain(shown);
    expect(result.warn).toBe(warn);
  });
});
