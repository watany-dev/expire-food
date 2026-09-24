import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import app from "../index";
import { createTestEnv } from "../platform/test-env";

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

/** 新しいスペースを発行して、その space_id を返す */
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

  it("存在しない共有 URL は Cookie のスペースを使う", async () => {
    const mine = await newSpace();
    const res = await call(mine, `/s/${crypto.randomUUID()}`);
    expect(spaceCookie(res)).toBe(mine);
  });

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
