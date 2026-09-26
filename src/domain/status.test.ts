import { describe, expect, it } from "vite-plus/test";

import { daysLeftLabel, groupByDeadline, itemStatus } from "./status";

describe("itemStatus", () => {
  it.each([
    [-1, 3, "use_by", "expired"],
    [-30, 1, "use_by", "expired"],
    [-1, 3, "best_by", "past_best"],
    [-30, 1, "best_by", "past_best"],
    [0, 3, "use_by", "warn"],
    [0, 3, "best_by", "warn"],
    [2, 3, "best_by", "warn"],
    [3, 3, "best_by", "normal"],
    [0, 1, "best_by", "warn"],
    [1, 1, "use_by", "normal"],
    [29, 30, "best_by", "warn"],
    [30, 30, "best_by", "normal"],
  ] as const)("残り %i 日・warn_days %i・%s は %s", (daysLeft, warnDays, kind, expected) => {
    expect(itemStatus(daysLeft, warnDays, kind)).toBe(expected);
  });
});

describe("daysLeftLabel", () => {
  it.each([
    [-2, "2日過ぎ"],
    [0, "今日まで"],
    [1, "あと1日"],
  ])("%i は %s", (daysLeft, expected) => {
    expect(daysLeftLabel(daysLeft)).toBe(expected);
  });
});

describe("groupByDeadline", () => {
  const items = [-3, 0, 14, 15, 40].map((days_left) => ({ days_left }));

  it("期限切れ・14 日以内・それ以降に分ける", () => {
    expect(groupByDeadline(items, 3)).toEqual([
      { key: "expired", label: "期限切れ", items: [{ days_left: -3 }] },
      { key: "soon", label: "14日以内", items: [{ days_left: 0 }, { days_left: 14 }] },
      { key: "later", label: "それ以降", items: [{ days_left: 15 }, { days_left: 40 }] },
    ]);
  });

  it("warn_days が長ければ、期限間近をすべて「もうすぐ」に含める", () => {
    const groups = groupByDeadline(items, 30);
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ["期限切れ", 1],
      ["29日以内", 3],
      ["それ以降", 1],
    ]);
  });

  it("空の区分は返さない", () => {
    expect(groupByDeadline([{ days_left: 20 }], 3).map((g) => g.key)).toEqual(["later"]);
    expect(groupByDeadline([], 3)).toEqual([]);
  });
});
