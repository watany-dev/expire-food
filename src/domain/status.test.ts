import { describe, expect, it } from "vite-plus/test";

import { daysLeftLabel, itemStatus } from "./status";

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
