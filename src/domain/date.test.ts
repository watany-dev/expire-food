import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { daysUntil, shortDate, todayJst } from "./date";

describe("todayJst", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["2026-10-04T14:59:59.999Z", "2026-10-04"],
    ["2026-10-04T15:00:00.000Z", "2026-10-05"],
    ["2026-12-31T15:00:00.000Z", "2027-01-01"],
  ])("UTC %s は JST で %s", (utc, jst) => {
    expect(todayJst(new Date(utc))).toBe(jst);
  });

  it("引数を省略すると現在時刻で判定する", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-02-28T15:00:00Z"));
    expect(todayJst()).toBe("2026-03-01");
  });
});

describe("daysUntil", () => {
  it.each([
    ["2026-10-05", "2026-10-05", 0],
    ["2026-10-06", "2026-10-05", 1],
    ["2026-10-04", "2026-10-05", -1],
    ["2028-03-01", "2028-02-28", 2],
    ["2027-01-01", "2026-12-31", 1],
  ])("%s は %s から %i 日", (expiresOn, today, expected) => {
    expect(daysUntil(expiresOn, today)).toBe(expected);
  });
});

describe("shortDate", () => {
  it.each([
    ["2026-09-28", "2026-09-26", "9/28"],
    ["2026-12-01", "2026-09-26", "12/1"],
    ["2027-03-19", "2026-09-26", "27/3/19"],
    ["2025-12-31", "2026-01-01", "25/12/31"],
  ])("%s は今日が %s なら %s", (date, today, expected) => {
    expect(shortDate(date, today)).toBe(expected);
  });
});
