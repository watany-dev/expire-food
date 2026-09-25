import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import app from "../index";
import { createTestEnv, withRotatedAway } from "../test-env";

let env: Env;
let dispose: () => Promise<void>;

beforeAll(async () => {
  ({ env, dispose } = await createTestEnv());
});

afterAll(async () => {
  await dispose();
});

afterEach(() => {
  vi.useRealTimers();
});

const spaceCookie = (res: Response): string => {
  const match = /space_id=([^;]+)/.exec(res.headers.get("set-cookie") ?? "");
  if (!match?.[1]) throw new Error("space_id Cookie がありません");
  return match[1];
};

const newSpace = async (): Promise<string> => spaceCookie(await app.request("/api/space", {}, env));

const call = (spaceId: string, path: string, init: RequestInit = {}) =>
  app.request(
    path,
    {
      ...init,
      headers: { cookie: `space_id=${spaceId}`, "content-type": "application/json" },
    },
    env,
  );

const milk = { name: "牛乳", expires_on: "2026-10-05", kind: "use_by" };

const postItem = async (spaceId: string, body: object = milk) => {
  const res = await call(spaceId, "/api/items", { method: "POST", body: JSON.stringify(body) });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string };
};

describe("スペース解決", () => {
  it("Cookie が無ければスペースを発行し、堅牢な Cookie を 1 年で設定する", async () => {
    const res = await app.request("/api/space", {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ warn_days: 3 });
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^space_id=[0-9a-f-]{36};/);
    expect(cookie).toContain("Max-Age=31536000");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
  });

  it("既存の Cookie はそのまま使う", async () => {
    const id = await newSpace();
    expect(spaceCookie(await call(id, "/api/space"))).toBe(id);
  });

  it.each(["not-a-uuid", "00000000-0000-4000-8000-000000000000"])(
    "未知・不正な Cookie（%s）は採用せず新しいスペースを発行する",
    async (bogus) => {
      const id = spaceCookie(await call(bogus, "/api/space"));
      expect(id).not.toBe(bogus);
      expect(spaceCookie(await call(id, "/api/space"))).toBe(id);
    },
  );

  it("共有 URL を開くと Cookie がその ID に切り替わり、トップへ戻る", async () => {
    const shared = await newSpace();
    await postItem(shared);
    const res = await call(await newSpace(), `/s/${shared}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    expect(spaceCookie(res)).toBe(shared);
    expect(await (await call(shared, "/api/items")).json()).toHaveLength(1);
  });

  it.each([crypto.randomUUID(), "not-a-uuid"])(
    "存在しない共有 URL（%s）は 404 で、Cookie を変えない",
    async (bogus) => {
      const res = await call(await newSpace(), `/s/${bogus}`);
      expect(res.status).toBe(404);
      expect(res.headers.get("set-cookie")).toBeNull();
      expect(await res.text()).toContain("共有URLが使えません");
    },
  );

  it("/healthz と / ではスペースを発行しない", async () => {
    for (const path of ["/healthz", "/"]) {
      const res = await app.request(path, {}, env);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });
});

describe("/api/items", () => {
  it("登録した商品を期限日の昇順で残り日数（JST）付きで返す", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // JST では 2026-10-05 になった直後
    vi.setSystemTime(new Date("2026-10-04T15:00:00Z"));
    const id = await newSpace();
    const bread = await postItem(id, {
      name: "パン",
      expires_on: "2026-10-07",
      kind: "best_by",
      memo: "冷凍",
    });
    const egg = await postItem(id, { name: "卵", expires_on: "2026-10-01", kind: "best_by" });
    const milkItem = await postItem(id);

    const res = await call(id, "/api/items");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      expect.objectContaining({ id: egg.id, name: "卵", memo: null, days_left: -4 }),
      expect.objectContaining({ id: milkItem.id, kind: "use_by", days_left: 0 }),
      expect.objectContaining({ id: bread.id, memo: "冷凍", days_left: 2 }),
    ]);
  });

  it("POST は登録内容を返す", async () => {
    const item = await postItem(await newSpace(), { ...milk, name: " 牛乳 ", memo: "" });
    expect(item).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      ...milk,
      memo: null,
      created_at: expect.any(String),
    });
  });

  it.each([
    ["name が空", { ...milk, name: "" }],
    ["実在しない日付", { ...milk, expires_on: "2026-02-30" }],
    ["不正な kind", { ...milk, kind: "eaten" }],
  ])("POST: %s は 400", async (_, body) => {
    const id = await newSpace();
    const res = await call(id, "/api/items", { method: "POST", body: JSON.stringify(body) });
    expect(res.status).toBe(400);
    expect(await (await call(id, "/api/items")).json()).toEqual([]);
  });

  it("PATCH は指定した項目だけを更新する", async () => {
    const id = await newSpace();
    const item = await postItem(id, { ...milk, memo: "開封済み" });
    const res = await call(id, `/api/items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ expires_on: "2026-10-08", memo: null }),
    });
    expect(res.status).toBe(200);
    const expected = { ...item, expires_on: "2026-10-08", memo: null };
    expect(await res.json()).toEqual(expected);
    expect(await (await call(id, "/api/items")).json()).toEqual([
      { ...expected, days_left: expect.any(Number) },
    ]);
  });

  it("PATCH: 送らなかった memo は残る", async () => {
    const id = await newSpace();
    const item = await postItem(id, { ...milk, memo: "開封済み" });
    const res = await call(id, `/api/items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "低脂肪乳" }),
    });
    expect(await res.json()).toEqual({ ...item, name: "低脂肪乳", memo: "開封済み" });
  });

  it("PATCH: 空の更新は 400", async () => {
    const id = await newSpace();
    const item = await postItem(id);
    const res = await call(id, `/api/items/${item.id}`, { method: "PATCH", body: "{}" });
    expect(res.status).toBe(400);
  });

  it("DELETE は削除して 204、2 回目は 404", async () => {
    const id = await newSpace();
    const item = await postItem(id);
    expect((await call(id, `/api/items/${item.id}`, { method: "DELETE" })).status).toBe(204);
    expect(await (await call(id, "/api/items")).json()).toEqual([]);
    expect((await call(id, `/api/items/${item.id}`, { method: "DELETE" })).status).toBe(404);
  });
});

describe("スペース分離", () => {
  it("別スペースの商品は一覧に出ず、PATCH / DELETE もできない", async () => {
    const owner = await newSpace();
    const other = await newSpace();
    const item = await postItem(owner);

    expect(await (await call(other, "/api/items")).json()).toEqual([]);

    const patch = await call(other, `/api/items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "乗っ取り" }),
    });
    expect(patch.status).toBe(404);
    expect(await patch.json()).toEqual({ error: "not_found" });
    expect((await call(other, `/api/items/${item.id}`, { method: "DELETE" })).status).toBe(404);

    expect(await (await call(owner, "/api/items")).json()).toEqual([
      expect.objectContaining({ id: item.id, name: "牛乳" }),
    ]);
  });

  it("warn_days はスペースごとに保存される", async () => {
    const a = await newSpace();
    const b = await newSpace();
    const res = await call(a, "/api/space", {
      method: "PATCH",
      body: JSON.stringify({ warn_days: 7 }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ warn_days: 7 });
    expect(await (await call(a, "/api/space")).json()).toEqual({ warn_days: 7 });
    expect(await (await call(b, "/api/space")).json()).toEqual({ warn_days: 3 });
  });

  it.each([0, 31])("warn_days: %i は 400", async (warn_days) => {
    const res = await call(await newSpace(), "/api/space", {
      method: "PATCH",
      body: JSON.stringify({ warn_days }),
    });
    expect(res.status).toBe(400);
  });
});

describe("/api/space/rotate", () => {
  it("新しい ID に商品と設定を移し、Cookie を更新する。旧 ID は使えなくなる", async () => {
    const old = await newSpace();
    await postItem(old);
    await call(old, "/api/space", { method: "PATCH", body: JSON.stringify({ warn_days: 7 }) });

    const res = await call(old, "/api/space/rotate", { method: "POST" });
    expect(res.status).toBe(200);
    const { space_id } = (await res.json()) as { space_id: string };
    expect(space_id).not.toBe(old);
    expect(spaceCookie(res)).toBe(space_id);
    expect(await (await call(space_id, "/api/items")).json()).toHaveLength(1);
    expect(await (await call(space_id, "/api/space")).json()).toEqual({ warn_days: 7 });

    expect((await call(space_id, `/s/${old}`)).status).toBe(404);
    const stale = await call(old, "/api/items");
    expect(spaceCookie(stale)).not.toBe(old);
    expect(await stale.json()).toEqual([]);
  });

  it.each([undefined, "00000000-0000-4000-8000-000000000000"])(
    "スペースが無い（Cookie: %s）なら新しく発行せず 404",
    async (cookie) => {
      const res = await app.request(
        "/api/space/rotate",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(cookie ? { cookie: `space_id=${cookie}` } : {}),
          },
        },
        env,
      );
      expect(res.status).toBe(404);
      expect(res.headers.get("set-cookie")).toBeNull();
    },
  );

  it("別の端末が先に作り直していたら 404 で、何も変えない", async () => {
    const old = await newSpace();
    await postItem(old);
    const res = await app.request(
      "/api/space/rotate",
      {
        method: "POST",
        headers: { cookie: `space_id=${old}`, "content-type": "application/json" },
      },
      withRotatedAway(env, old),
    );
    expect(res.status).toBe(404);
    expect(spaceCookie(res)).toBe(old);
  });
});

describe("/api/extract", () => {
  const jpeg = (size = 1024, type = "image/jpeg") =>
    new File([new Uint8Array(size)], "p.jpg", { type });
  const chat = (reading: unknown) => ({
    choices: [{ message: { content: JSON.stringify(reading) } }],
  });
  const milkReading = {
    names: ["牛乳"],
    dates: [{ text: "10.5", label: "消費期限" }],
    issue: null,
  };

  // expect(ai.run) だと unbound-method になるので、モックは run のまま扱う
  const aiRun = (impl: (model: string) => Promise<unknown> = async () => chat(milkReading)) =>
    vi.fn(impl);
  const asAi = (run: ReturnType<typeof aiRun>) => ({ run }) as unknown as Ai;
  const allow = { limit: vi.fn(async () => ({ success: true })) };

  const extract = async (
    image: File | string,
    {
      run = aiRun(),
      limiter = allow,
      headers = {} as Record<string, string>,
      part = undefined as string | undefined,
      spaceId = undefined as string | undefined,
    } = {},
  ) => {
    const body = new FormData();
    body.append("image", image);
    if (part !== undefined) body.append("part", part);
    return app.request(
      "/api/extract",
      {
        method: "POST",
        body,
        headers: {
          cookie: `space_id=${spaceId ?? (await newSpace())}`,
          origin: "http://localhost",
          ...headers,
        },
      },
      { ...env, AI: asAi(run), EXTRACT_RATE_LIMITER: limiter },
    );
  };

  it("画像を data URL で読み取りモデルに渡し、コードで決まれば判定モデルを呼ばない", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-24T03:00:00Z"));
    const run = aiRun();
    const res = await extract(jpeg(3), { run });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      name: "牛乳",
      expires_on: "2026-10-05",
      kind: "use_by",
      confidence: "high",
      next: "confirm",
      name_candidates: [],
      date_candidates: [],
    });
    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith(
      "@cf/google/gemma-4-26b-a4b-it",
      expect.objectContaining({
        messages: [
          expect.objectContaining({ role: "system" }),
          {
            role: "user",
            content: [{ type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAA" } }],
          },
        ],
      }),
    );
  });

  it("期限の部分の再読（part=date）は再読用の指示で読み、読めなければ再撮影", async () => {
    const run = aiRun(async () => chat({ names: [], dates: [], issue: null }));
    const res = await extract(jpeg(), { run, part: "date" });
    expect(await res.json()).toMatchObject({ expires_on: null, next: "retake" });
    expect(run).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining("close-up of the date area"),
          }),
        ]),
      }),
    );
  });

  it("商品名の候補が複数なら、そのスペースに登録済みの商品名と照らし合わせる", async () => {
    const spaceId = await newSpace();
    await postItem(spaceId, { ...milk, name: "おいしい牛乳" });
    const run = aiRun(async () => chat({ ...milkReading, names: ["明治", "おいしい 牛乳"] }));
    const res = await extract(jpeg(), { run, spaceId });
    expect(await res.json()).toMatchObject({ name: "おいしい牛乳", name_candidates: [] });
    expect(run).toHaveBeenCalledOnce();
  });

  it("コードで決まらなければ判定モデル（Jev）に候補から選ばせる", async () => {
    const run = aiRun(async (model) =>
      model === "typesafe/jev"
        ? { answers: { name: { choice: "おいしい牛乳", confidence: 0.9 } } }
        : chat({ ...milkReading, names: ["明治", "おいしい牛乳"] }),
    );
    const res = await extract(jpeg(), { run });
    expect(await res.json()).toMatchObject({ name: "おいしい牛乳", next: "confirm" });
    expect(run).toHaveBeenLastCalledWith(
      "typesafe/jev",
      expect.objectContaining({ questions: { name: expect.anything() } }),
    );
  });

  it("判定モデルが失敗しても候補を返す", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const run = aiRun(async (model) => {
      if (model === "typesafe/jev") throw new Error("judge unavailable");
      return chat({ ...milkReading, names: ["明治", "おいしい牛乳"] });
    });
    const res = await extract(jpeg(), { run, headers: { cookie: "" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      name: null,
      name_candidates: ["明治", "おいしい牛乳"],
    });
    expect(error).toHaveBeenCalledWith("judge failed", new Error("judge unavailable"));
    error.mockRestore();
  });

  it("2MB ちょうどの画像は受け付ける", async () => {
    expect((await extract(jpeg(2 * 1024 * 1024))).status).toBe(200);
  });

  it.each([
    ["2MB を超える画像", jpeg(2 * 1024 * 1024 + 1), undefined],
    ["画像でないファイル", jpeg(10, "text/plain"), undefined],
    ["ファイルでない値", "not a file", undefined],
    ["知らない part", jpeg(), "name"],
  ])("%s は 400 で AI を呼ばない", async (_, image, part) => {
    const run = aiRun();
    expect((await extract(image, { run, part })).status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });

  it("レート制限を超えたら 429 で AI を呼ばない。キーは space_id", async () => {
    const run = aiRun();
    const limiter = { limit: vi.fn(async () => ({ success: false })) };
    const res = await extract(jpeg(), { run, limiter });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate_limited" });
    expect(run).not.toHaveBeenCalled();
    expect(limiter.limit).toHaveBeenCalledWith({ key: spaceCookie(res) });
  });

  it.each([
    [{ "cf-connecting-ip": "203.0.113.1" }, "ip:203.0.113.1"],
    [{}, "ip:"],
  ])("スペースが無ければ発行せず、IP（%j）ごとに数える", async (ip, key) => {
    const limiter = { limit: vi.fn(async () => ({ success: true })) };
    const res = await extract(jpeg(), { limiter, headers: { cookie: "", ...ip } });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(limiter.limit).toHaveBeenCalledWith({ key });
  });

  it("読み取りモデルが失敗したら 502（画像はログに出さない）", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await extract(jpeg(), {
      run: aiRun(async () => {
        throw new Error("model unavailable");
      }),
    });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "extract_failed" });
    expect(error).toHaveBeenCalledWith("extract failed", new Error("model unavailable"));
    error.mockRestore();
  });
});
