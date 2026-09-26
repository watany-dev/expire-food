import { describe, expect, it } from "vite-plus/test";

import { daysLeftLabel, groupByDeadline, itemStatus } from "./status";

describe("itemStatus", () => {
  it.each([
    [-1, 3, "expired"],
    [-30, 1, "expired"],
    [0, 3, "warn"],
    [2, 3, "warn"],
    [3, 3, "normal"],
    [0, 1, "warn"],
    [1, 1, "normal"],
    [29, 30, "warn"],
    [30, 30, "normal"],
  ])("残り %i 日・warn_days %i は %s", (daysLeft, warnDays, expected) => {
    expect(itemStatus(daysLeft, warnDays)).toBe(expected);
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
