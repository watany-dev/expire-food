import { describe, expect, it } from "vite-plus/test";

import { itemInput, itemPatch, spaceId, spacePatch, tagInput } from "./schema";

const valid = { name: "牛乳", expires_on: "2026-10-05", kind: "use_by" };

describe("itemInput", () => {
  it("メモを省略すると null になり、前後の空白は落とす", () => {
    expect(itemInput.parse({ ...valid, name: "  牛乳 " })).toEqual({
      ...valid,
      memo: null,
      tag_id: null,
    });
  });

  it.each([
    ["空文字", ""],
    ["空白だけ", "  "],
    ["101 文字", "あ".repeat(101)],
  ])("name: %s は不可", (_, name) => {
    expect(itemInput.safeParse({ ...valid, name }).success).toBe(false);
  });

  it("name は 100 文字まで", () => {
    expect(itemInput.safeParse({ ...valid, name: "あ".repeat(100) }).success).toBe(true);
  });

  it.each(["2028-02-29", "2026-12-31", "2026-01-01"])("expires_on: %s は可", (d) => {
    expect(itemInput.safeParse({ ...valid, expires_on: d }).success).toBe(true);
  });

  it.each(["2026-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "2026-1-5", "2026/10/05", ""])(
    "expires_on: %s は不可",
    (d) => {
      expect(itemInput.safeParse({ ...valid, expires_on: d }).success).toBe(false);
    },
  );

  it.each(["best_by", "use_by"])("kind: %s は可", (kind) => {
    expect(itemInput.safeParse({ ...valid, kind }).success).toBe(true);
  });

  it.each(["consumed", "", null])("kind: %s は不可", (kind) => {
    expect(itemInput.safeParse({ ...valid, kind }).success).toBe(false);
  });

  it.each([
    ["", null],
    ["   ", null],
    [null, null],
    [" 冷蔵庫の奥 ", "冷蔵庫の奥"],
    ["あ".repeat(500), "あ".repeat(500)],
  ])("memo: %j は %j", (memo, expected) => {
    expect(itemInput.parse({ ...valid, memo }).memo).toBe(expected);
  });

  it("memo は 500 文字まで", () => {
    expect(itemInput.safeParse({ ...valid, memo: "あ".repeat(501) }).success).toBe(false);
  });

  it.each([
    ["", null],
    [null, null],
    ["6f1c2b1e-3a4d-4e5f-8a9b-0c1d2e3f4a5b", "6f1c2b1e-3a4d-4e5f-8a9b-0c1d2e3f4a5b"],
  ])("tag_id: %j は %j", (tag_id, expected) => {
    expect(itemInput.parse({ ...valid, tag_id }).tag_id).toBe(expected);
  });

  it("tag_id は UUID か空文字だけ", () => {
    expect(itemInput.safeParse({ ...valid, tag_id: "食事" }).success).toBe(false);
  });
});

describe("itemPatch", () => {
  it("指定した項目だけを返す", () => {
    expect(itemPatch.parse({ name: "卵" })).toEqual({ name: "卵" });
  });

  it("memo は null で消せる", () => {
    expect(itemPatch.parse({ memo: "" })).toEqual({ memo: null });
  });

  it("tag_id は null で外せる", () => {
    expect(itemPatch.parse({ tag_id: "" })).toEqual({ tag_id: null });
  });

  it.each([{}, { expires_on: "2026-02-30" }, { memo: "あ".repeat(501) }])("%j は不可", (v) => {
    expect(itemPatch.safeParse(v).success).toBe(false);
  });
});

describe("tagInput", () => {
  it("前後の空白は落とし、20 文字まで", () => {
    expect(tagInput.parse({ name: " 菓子 " })).toEqual({ name: "菓子" });
    expect(tagInput.safeParse({ name: "あ".repeat(20) }).success).toBe(true);
  });

  it.each(["", "  ", "あ".repeat(21)])("name: %j は不可", (name) => {
    expect(tagInput.safeParse({ name }).success).toBe(false);
  });
});

describe("spacePatch", () => {
  it.each([1, 30])("warn_days: %i は可", (warn_days) => {
    expect(spacePatch.safeParse({ warn_days }).success).toBe(true);
  });

  it.each([0, 31, 1.5, "3", null])("warn_days: %j は不可", (warn_days) => {
    expect(spacePatch.safeParse({ warn_days }).success).toBe(false);
  });
});

describe("spaceId", () => {
  it("crypto.randomUUID() の値は通す", () => {
    expect(spaceId.safeParse(crypto.randomUUID()).success).toBe(true);
  });

  it.each(["1", "../etc", "", undefined])("%j は不可", (v) => {
    expect(spaceId.safeParse(v).success).toBe(false);
  });
});
