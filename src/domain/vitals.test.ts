import { describe, expect, it } from "vite-plus/test";

import { parseVitals } from "./vitals";

const beacon = (body: object) => JSON.stringify({ path: "/", ...body });

describe("parseVitals", () => {
  it.each([
    ["/", "/"],
    ["/items/new", "/items/new"],
    ["/items/0b0e7c1e-0000-4000-8000-000000000000/edit", "/items/:id/edit"],
    ["/settings", "/settings"],
    ["/items", "other"],
    ["/s/0b0e7c1e-0000-4000-8000-000000000000", "other"],
    ["/items/a/b/edit", "other"],
  ])("パス %s は画面 %s として記録する", (path, page) => {
    expect(parseVitals(JSON.stringify({ path }))).toEqual({ path: page });
  });

  it("計測値をそのまま返す", () => {
    expect(parseVitals(beacon({ lcp: 1234, inp: 56, cls: 0.05 }))).toEqual({
      path: "/",
      lcp: 1234,
      inp: 56,
      cls: 0.05,
    });
  });

  it.each([
    ["負の値", { lcp: -1, inp: 10 }, { inp: 10 }],
    ["60 秒を超える LCP", { lcp: 60_001, cls: 0 }, { cls: 0 }],
    ["60 秒を超える INP", { inp: 60_001, lcp: 10 }, { lcp: 10 }],
    ["大きすぎる CLS", { cls: 101, lcp: 10 }, { lcp: 10 }],
    ["数値でない", { cls: "0.1", inp: 10 }, { inp: 10 }],
  ])("%s はその指標だけ捨てる", (_, body, kept) => {
    expect(parseVitals(beacon(body))).toEqual({ path: "/", ...kept });
  });

  it.each([
    ["JSON でない", "lcp=1"],
    ["オブジェクトでない", "[]"],
    ["path が無い", JSON.stringify({ lcp: 1 })],
    ["path が長すぎる", JSON.stringify({ path: `/${"a".repeat(200)}` })],
  ])("%s ものは null", (_, text) => {
    expect(parseVitals(text)).toBeNull();
  });
});
