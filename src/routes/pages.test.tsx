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

const ORIGIN = "http://localhost";

const spaceCookie = (res: Response): string | undefined =>
  /space_id=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1];

const get = (path: string, spaceId?: string) =>
  app.request(path, { headers: spaceId ? { cookie: `space_id=${spaceId}` } : {} }, env);

const post = (path: string, form: Record<string, string>, spaceId?: string) =>
  app.request(
    path,
    {
      method: "POST",
      body: new URLSearchParams(form),
      headers: { origin: ORIGIN, ...(spaceId ? { cookie: `space_id=${spaceId}` } : {}) },
    },
    env,
  );

const milk = { name: "牛乳", expires_on: "2026-10-05", kind: "use_by", memo: "" };

/** フォームから 1 件登録し、発行されたスペースを返す */
const newSpaceWith = async (form: Record<string, string> = milk): Promise<string> => {
  const res = await post("/items", form);
  expect(res.status).toBe(303);
  const id = spaceCookie(res);
  if (!id) throw new Error("space_id Cookie がありません");
  return id;
};

const itemIds = async (spaceId: string): Promise<string[]> =>
  (
    (await (
      await app.request("/api/items", { headers: { cookie: `space_id=${spaceId}` } }, env)
    ).json()) as { id: string }[]
  ).map((item) => item.id);

describe("一覧", () => {
  it("Cookie が無ければスペースを発行せず、D1 にも触れずに空の一覧を返す", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await res.text()).toContain("まだ登録がありません");
  });

  it("スタイルは nonce 付きで CSP に許可され、エスケープされずに埋め込まれる", async () => {
    const res = await app.request("/");
    const csp = res.headers.get("content-security-policy") ?? "";
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("form-action 'self'");
    const html = await res.text();
    expect(html).toContain(`<style nonce="${nonce}">`);
    expect(html).not.toMatch(/&(gt|lt|quot|#39|amp);/);
  });

  it("期限日の昇順に、期限切れ・期限間近・通常を色分けして表示する", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // JST 2026-10-05 00:00
    vi.setSystemTime(new Date("2026-10-04T15:00:00Z"));
    const spaceId = await newSpaceWith({ ...milk, name: "パン", expires_on: "2026-10-08" });
    await post("/items", { ...milk, name: "卵", expires_on: "2026-10-07" }, spaceId);
    await post("/items", { ...milk, name: "豆腐", expires_on: "2026-10-04" }, spaceId);

    const res = await get("/", spaceId);
    expect(spaceCookie(res)).toBe(spaceId);
    const html = await res.text();
    const rows = [
      ...html.matchAll(
        /<li class="item (\w+)">.*?class="name"[^>]*>([^<]+)<.*?class="days">([^<]+)</g,
      ),
    ];
    expect(rows.map((m) => m.slice(1))).toEqual([
      ["expired", "豆腐", "1日過ぎ"],
      ["warn", "卵", "あと2日"],
      ["normal", "パン", "あと3日"],
    ]);
    expect(html).toContain("消費期限 2026-10-04");
  });

  it("warn_days の設定で期限間近の範囲が変わる", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-04T15:00:00Z"));
    const spaceId = await newSpaceWith({ ...milk, expires_on: "2026-10-10" });
    expect(await (await get("/", spaceId)).text()).toContain('class="item normal"');
    expect((await post("/settings", { warn_days: "7" }, spaceId)).status).toBe(303);
    expect(await (await get("/", spaceId)).text()).toContain('class="item warn"');
  });

  it("商品名・メモはエスケープして表示する", async () => {
    const spaceId = await newSpaceWith({ ...milk, name: "<script>alert(1)</script>" });
    const html = await (await get("/", spaceId)).text();
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});

describe("追加", () => {
  it("フォームを表示する（種別の初期値は賞味期限）", async () => {
    const html = await (await app.request("/items/new")).text();
    expect(html).toContain('action="/items"');
    expect(html).toMatch(/value="best_by" required="" checked=""/);
  });

  it("写真の読み取りは JS が表示するまで隠し、同一オリジンのスクリプトだけを許可する", async () => {
    const res = await app.request("/items/new");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    const html = await res.text();
    expect(html).toContain('<p id="photo" hidden="">');
    expect(html).toContain('accept="image/*" capture="environment"');
    expect(html).toContain('<script src="/extract.js" defer=""></script>');
  });

  it.each([
    ["/extract.js", 'fetch("/api/extract"'],
    ["/app.js", 'register("/sw.js")'],
    ["/app.js", 'sendBeacon("/api/vitals"'],
  ])("%s を毎回確認させて配信する", async (path, body) => {
    const res = await app.request(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(await res.text()).toContain(body);
  });

  it("Origin の無いフォーム送信は 403", async () => {
    const res = await app.request(
      "/items",
      { method: "POST", body: new URLSearchParams(milk) },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("別オリジンからのフォーム送信は 403", async () => {
    const res = await app.request(
      "/items",
      {
        method: "POST",
        body: new URLSearchParams(milk),
        headers: { origin: "https://evil.example" },
      },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("不正な入力は 400 で、入力値を残してエラーを表示する", async () => {
    const res = await post("/items", {
      name: " ",
      expires_on: "2026-02-30",
      kind: "x",
      memo: "冷蔵",
    });
    expect(res.status).toBe(400);
    expect(spaceCookie(res)).toBeDefined();
    const html = await res.text();
    for (const field of ["name", "expires_on", "kind"]) {
      expect(html).toContain(`id="${field}-error"`);
    }
    expect(html).not.toContain('id="memo-error"');
    expect(html).toContain('value="2026-02-30"');
    expect(html).toContain("冷蔵</textarea>");
    expect(html).toContain('aria-invalid="true"');
  });

  it("文字列以外（ファイル）の値は未入力として扱う", async () => {
    const body = new FormData();
    body.set("name", new File(["x"], "a.txt"));
    body.set("expires_on", "2026-10-05");
    body.set("kind", "best_by");
    const res = await app.request(
      "/items",
      { method: "POST", body, headers: { origin: ORIGIN } },
      env,
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('id="name-error"');
  });
});

describe("編集", () => {
  it("自分のスペースの商品はフォームに現在の値を出す", async () => {
    const spaceId = await newSpaceWith({ ...milk, memo: "開封済み" });
    const [id] = await itemIds(spaceId);
    const res = await get(`/items/${id}/edit`, spaceId);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`action="/items/${id}"`);
    expect(html).toContain('value="牛乳"');
    expect(html).toMatch(/value="use_by" required="" checked=""/);
    expect(html).toContain("開封済み</textarea>");
  });

  it("メモが無ければ空のテキストエリアを出す", async () => {
    const spaceId = await newSpaceWith();
    const [id] = await itemIds(spaceId);
    expect(await (await get(`/items/${id}/edit`, spaceId)).text()).toContain("></textarea>");
  });

  it("Cookie が無い・別スペースの商品は 404", async () => {
    const spaceId = await newSpaceWith();
    const [id] = await itemIds(spaceId);
    const other = await newSpaceWith();
    expect((await get(`/items/${id}/edit`)).status).toBe(404);
    expect((await get(`/items/${id}/edit`, other)).status).toBe(404);
  });

  it("保存すると一覧に戻り、メモを空にすると消える", async () => {
    const spaceId = await newSpaceWith({ ...milk, memo: "開封済み" });
    const [id] = await itemIds(spaceId);
    const res = await post(
      `/items/${id}`,
      { name: "低脂肪乳", expires_on: "2026-10-06", kind: "best_by", memo: "" },
      spaceId,
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    const items = await (
      await app.request("/api/items", { headers: { cookie: `space_id=${spaceId}` } }, env)
    ).json();
    expect(items).toEqual([
      expect.objectContaining({
        name: "低脂肪乳",
        expires_on: "2026-10-06",
        kind: "best_by",
        memo: null,
      }),
    ]);
  });

  it("不正な入力は 400 でフォームを出し直す", async () => {
    const spaceId = await newSpaceWith();
    const [id] = await itemIds(spaceId);
    const res = await post(`/items/${id}`, { ...milk, memo: "あ".repeat(501) }, spaceId);
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('id="memo-error"');
    expect(html).toContain(`action="/items/${id}"`);
  });

  it("別スペースの商品は更新できず 404", async () => {
    const spaceId = await newSpaceWith();
    const [id] = await itemIds(spaceId);
    const other = await newSpaceWith();
    expect((await post(`/items/${id}`, { ...milk, name: "乗っ取り" }, other)).status).toBe(404);
    expect(await (await get("/", spaceId)).text()).toContain("牛乳");
  });
});

describe("削除", () => {
  it("確認ダイアログは popover で出し、承認のフォームだけが削除する", async () => {
    const spaceId = await newSpaceWith();
    const [id] = await itemIds(spaceId);
    const html = await (await get("/", spaceId)).text();
    expect(html).toContain(`popovertarget="delete-${id}"`);
    expect(html).toContain(`<div popover="auto" id="delete-${id}">`);
    expect(html).toContain(`action="/items/${id}/delete"`);
  });

  it("削除して一覧に戻る。別スペースからは消せない", async () => {
    const spaceId = await newSpaceWith();
    const [id] = await itemIds(spaceId);
    const other = await newSpaceWith();
    expect((await post(`/items/${id}/delete`, {}, other)).status).toBe(303);
    expect(await itemIds(spaceId)).toEqual([id]);
    const res = await post(`/items/${id}/delete`, {}, spaceId);
    expect(res.status).toBe(303);
    expect(await itemIds(spaceId)).toEqual([]);
  });
});

describe("設定", () => {
  it("Cookie が無ければ既定の 3 日を表示し、スペースは発行しない", async () => {
    const res = await get("/settings");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await res.text()).toContain('value="3"');
  });

  it("保存した値を表示する", async () => {
    const spaceId = await newSpaceWith();
    await post("/settings", { warn_days: "10" }, spaceId);
    expect(await (await get("/settings", spaceId)).text()).toContain('value="10"');
  });

  it.each([["0"], ["31"], ["1.5"], [""]])("warn_days: %j は 400", async (warn_days) => {
    const spaceId = await newSpaceWith();
    const res = await post("/settings", { warn_days }, spaceId);
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('id="warn_days-error"');
    expect(html).toContain(`value="${warn_days}"`);
  });

  it("warn_days が送られなければ 400", async () => {
    expect((await post("/settings", {}, await newSpaceWith())).status).toBe(400);
  });
});

describe("共有 URL", () => {
  it("Cookie が無ければ共有 URL を出さない", async () => {
    const html = await (await get("/settings")).text();
    expect(html).toContain("商品を登録すると共有URLが表示されます");
    expect(html).not.toContain('id="share-url"');
  });

  it("自分のスペースの共有 URL を出し、コピーボタンは JS が表示するまで隠す", async () => {
    const spaceId = await newSpaceWith();
    const html = await (await get("/settings", spaceId)).text();
    expect(html).toContain(`<input id="share-url" readonly="" value="${ORIGIN}/s/${spaceId}"/>`);
    expect(html).toContain('<button id="share-copy" type="button" hidden="">');
    expect(html).toContain('<button class="secondary" type="button" popovertarget="rotate">');
    expect(html).toContain('<form class="actions" method="post" action="/settings/rotate">');
  });

  it("入力エラーで出し直した設定画面にも共有 URL を出す", async () => {
    const spaceId = await newSpaceWith();
    const html = await (await post("/settings", { warn_days: "0" }, spaceId)).text();
    expect(html).toContain(`value="${ORIGIN}/s/${spaceId}"`);
  });

  it("作り直すと商品を新しい ID に移して設定画面に戻る。旧 URL は 404、旧 Cookie の一覧は案内を出す", async () => {
    const old = await newSpaceWith();
    const res = await post("/settings/rotate", {}, old);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/settings");
    const fresh = spaceCookie(res);
    expect(res.headers.get("set-cookie")?.match(/space_id=/g)).toHaveLength(1);
    if (!fresh) throw new Error("space_id Cookie がありません");
    expect(fresh).not.toBe(old);
    expect(await itemIds(fresh)).toHaveLength(1);
    expect(await (await get("/settings", fresh)).text()).toContain(`/s/${fresh}`);

    expect((await get(`/s/${old}`)).status).toBe(404);
    const stale = await get("/", old);
    expect(stale.headers.get("set-cookie")).toBeNull();
    expect(await stale.text()).toContain('<p class="notice" role="alert">');
  });

  it("作り直し済みの旧 Cookie で送っても新しいスペースを作らず一覧に戻す", async () => {
    const old = await newSpaceWith();
    await post("/settings/rotate", {}, old);
    const res = await post("/settings/rotate", {}, old);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("別の端末が先に作り直していたら一覧に戻す", async () => {
    const old = await newSpaceWith();
    const res = await app.request(
      "/settings/rotate",
      { method: "POST", headers: { origin: ORIGIN, cookie: `space_id=${old}` } },
      withRotatedAway(env, old),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
  });

  it("自分のスペースがあれば一覧に案内を出さない", async () => {
    const html = await (await get("/", await newSpaceWith())).text();
    expect(html).not.toContain('class="notice"');
  });
});

describe("PWA", () => {
  it("マニフェスト・アイコン・スクリプトを読み込み、CSP で同一オリジンだけを許可する", async () => {
    const res = await app.request("/");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("manifest-src 'self'");
    expect(csp).toContain("worker-src 'self'");
    const html = await res.text();
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest"/>');
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"/>');
    expect(html).toContain('<script src="/app.js" defer=""></script>');
  });
});
