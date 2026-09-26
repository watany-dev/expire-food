import { describe, expect, it, vi } from "vite-plus/test";

import { extractItem } from "./pipeline";

const today = "2026-09-24";
const chat = (reading: unknown) => ({
  choices: [{ message: { content: JSON.stringify(reading) } }],
});

const run = (reading: unknown, judgement: unknown = null, known: string[] = []) => {
  const read = vi.fn(async () => chat(reading));
  const judge = vi.fn(async () => judgement);
  const knownNames = vi.fn(async () => known);
  return {
    read,
    judge,
    knownNames,
    result: extractItem({ part: "all", today, read, judge, knownNames }),
  };
};

describe("extractItem", () => {
  it("コードだけで決まれば判定モデルも登録済みの商品名も使わない", async () => {
    const r = run({ names: ["牛乳"], dates: [{ text: "10.5", label: "消費期限" }], issue: null });
    expect(await r.result).toMatchObject({
      name: "牛乳",
      expires_on: "2026-10-05",
      kind: "use_by",
      confidence: "high",
      next: "confirm",
    });
    expect(r.judge).not.toHaveBeenCalled();
    expect(r.knownNames).not.toHaveBeenCalled();
  });

  it("登録済みの商品名で決まれば判定モデルを呼ばない", async () => {
    const r = run(
      {
        names: ["明治", "おいしい牛乳"],
        dates: [{ text: "10.5", label: "賞味期限" }],
        issue: null,
      },
      null,
      ["おいしい牛乳"],
    );
    expect(await r.result).toMatchObject({ name: "おいしい牛乳", next: "confirm" });
    expect(r.judge).not.toHaveBeenCalled();
  });

  it("曖昧な項目だけ判定モデルに聞き、その選択を使う", async () => {
    const r = run(
      {
        names: ["牛乳"],
        dates: [
          { text: "10.5", label: "賞味期限" },
          { text: "12.31", label: "消費期限" },
        ],
        issue: null,
      },
      { answers: { date: { choice: "賞味期限 10.5", confidence: 0.9 } } },
    );
    expect(await r.result).toMatchObject({
      name: "牛乳",
      expires_on: "2026-10-05",
      kind: "best_by",
      confidence: "medium",
    });
    expect(r.judge).toHaveBeenCalledWith(
      expect.objectContaining({ questions: { date: expect.anything() } }),
    );
  });

  it("判定モデルが答えなければ候補を返してユーザーに選ばせる", async () => {
    const r = run({
      names: ["牛乳"],
      dates: [
        { text: "10.5", label: "賞味期限" },
        { text: "12.31", label: "消費期限" },
      ],
      issue: null,
    });
    expect(await r.result).toMatchObject({
      expires_on: null,
      next: "confirm",
      date_candidates: ["2026-10-05", "2026-12-31"],
    });
  });

  it("判定モデルを渡さなければ（既定）候補を返してユーザーに選ばせる", async () => {
    const read = vi.fn(async () =>
      chat({
        names: ["明治", "おいしい牛乳"],
        dates: [{ text: "10.5", label: "賞味期限" }],
        issue: null,
      }),
    );
    expect(
      await extractItem({ part: "all", today, read, knownNames: async () => [] }),
    ).toMatchObject({ name: null, name_candidates: ["明治", "おいしい牛乳"], next: "confirm" });
  });

  it("写真の問題で期限が読めなければ再撮影", async () => {
    const r = run({ names: ["牛乳"], dates: [], issue: "blur" });
    expect(await r.result).toMatchObject({ name: "牛乳", expires_on: null, next: "retake" });
  });

  it("読み取りモデルの失敗はそのまま投げる", async () => {
    const read = async () => {
      throw new Error("model unavailable");
    };
    await expect(
      extractItem({ part: "all", today, read, judge: vi.fn(), knownNames: vi.fn() }),
    ).rejects.toThrow("model unavailable");
  });
});
