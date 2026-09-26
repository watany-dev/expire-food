import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import app from "../index";
import { createTestEnv, fillSpace, withRotatedAway } from "../test-env";

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
    const html = await res.text();
    expect(html).toContain("まだ登録がありません");
    // 初めて開いた人に、撮る → 確認 → 保存の流れと追加・共有への導線を示す
    expect(html).toContain('<section class="welcome">');
    expect(html).toContain('<a class="button" href="/items/new">＋ 最初の商品を追加</a>');
    expect(html).toContain('<a href="/settings">設定</a>の共有URLを家族に送ると');
  });

  it("1 件でも登録があれば使い方の案内は出さない", async () => {
    const spaceId = await newSpaceWith();
    expect(await (await get("/", spaceId)).text()).not.toContain('class="welcome"');
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

  it("期限日の昇順に、消費期限切れ・賞味期限切れ・期限間近・通常を色分けして表示する", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // JST 2026-10-05 00:00
    vi.setSystemTime(new Date("2026-10-04T15:00:00Z"));
    const spaceId = await newSpaceWith({ ...milk, name: "パン", expires_on: "2026-10-08" });
    await post("/items", { ...milk, name: "卵", expires_on: "2026-10-07" }, spaceId);
    await post("/items", { ...milk, name: "豆腐", expires_on: "2026-10-04" }, spaceId);
    await post(
      "/items",
      { ...milk, name: "クッキー", expires_on: "2026-10-03", kind: "best_by" },
      spaceId,
    );

    const res = await get("/", spaceId);
    expect(spaceCookie(res)).toBe(spaceId);
    const html = await res.text();
    const rows = [
      ...html.matchAll(
        /<li id="item-[^"]+" class="item (\w+)">.*?class="name"[^>]*>([^<]+)<.*?class="days">([^<]+)</g,
      ),
    ];
    expect(rows.map((m) => m.slice(1))).toEqual([
      ["past_best", "クッキー", "2日過ぎ"],
      ["expired", "豆腐", "1日過ぎ"],
      ["warn", "卵", "あと2日"],
      ["normal", "パン", "あと3日"],
    ]);
    expect(html).toContain("賞味期限切れ 10/3");
    expect(html).toContain("消費期限切れ 10/4");
    expect(html).toContain("消費 10/7");
    expect(
      [...html.matchAll(/<h2 class="group"><span>([^<]+)<\/span><span>([^<]+)</g)].map((m) =>
        m.slice(1),
      ),
    ).toEqual([
      ["期限切れ", "2件"],
      ["14日以内", "2件"],
    ]);
  });

  it("期限の遠い商品は先頭の 2 件だけ出し、残りは details に畳む", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-04T15:00:00Z"));
    const spaceId = await newSpaceWith({ ...milk, name: "缶詰", expires_on: "2027-01-01" });
    for (const name of ["乾麺", "米"]) {
      await post("/items", { ...milk, name, expires_on: "2026-12-01" }, spaceId);
    }
    const html = await (await get("/", spaceId)).text();
    expect(html).toContain("<span>それ以降</span><span>3件</span>");
    expect(html).toContain("<summary>残り 1 件を表示</summary>");
    expect(html.slice(html.indexOf("<details>"))).toContain("缶詰");
    expect(html).toContain("27/1/1");
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

describe("スペースが無い端末の編集・削除", () => {
  it.each([
    ["/items/x", milk, 404],
    ["/items/x/delete", {}, 303],
    ["/tags/x/delete", {}, 303],
  ])("%s はスペースを発行しない", async (path, form, status) => {
    const res = await post(path, form);
    expect(res.status).toBe(status);
    expect(spaceCookie(res)).toBeUndefined();
  });
});

describe("追加", () => {
  it("500 件に達していれば 409 で案内する", async () => {
    const spaceId = await newSpaceWith();
    await fillSpace(env, "items", spaceId, 499);
    const res = await post("/items", milk, spaceId);
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("登録できる商品は500件までです");
  });

  it("フォームを表示する（種別の初期値は賞味期限）", async () => {
    const html = await (await app.request("/items/new")).text();
    expect(html).toContain('action="/items"');
    expect(html).toMatch(/value="best_by" required="" checked=""/);
  });

  it("保存すると追加した行へ移動し、行は :target で強調できるよう id を持つ", async () => {
    const res = await post("/items", milk);
    const spaceId = spaceCookie(res) ?? "";
    const [id] = await itemIds(spaceId);
    expect(res.headers.get("location")).toBe(`/#item-${id}`);
    expect(await (await get("/", spaceId)).text()).toContain(`<li id="item-${id}" class="item `);
  });

  it("「保存して次を追加」は追加フォームにだけ出し、Enter で送る既定のボタンは「保存」のまま", async () => {
    const html = await (await app.request("/items/new")).text();
    expect(html).toMatch(
      /<button>保存<\/button><button class="secondary" name="next" value="1">保存して次を追加<\/button>/,
    );
    const spaceId = await newSpaceWith();
    const [id] = await itemIds(spaceId);
    expect(await (await get(`/items/${id}/edit`, spaceId)).text()).not.toContain('name="next"');
  });

  it("「保存して次を追加」で保存すると、タグと種別を引き継いで追加フォームを開く", async () => {
    const spaceId = await newSpaceWith();
    const food = await addTag(spaceId, "食事");
    const res = await post("/items", { ...milk, tag_id: food, next: "1" }, spaceId);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`/items/new?kind=use_by&tag=${food}`);
    expect(await itemIds(spaceId)).toHaveLength(2);
    const html = await (await get(res.headers.get("location") ?? "", spaceId)).text();
    expect(html).toMatch(/value="use_by" required="" checked=""/);
    expect(html).toContain(`<option value="${food}" selected="">食事</option>`);
  });

  it("「保存して次を追加」でタグが無ければ種別だけを引き継ぐ。通常の保存は一覧の追加した行へ戻る", async () => {
    const spaceId = await newSpaceWith();
    const next = await post("/items", { ...milk, kind: "best_by", next: "1" }, spaceId);
    expect(next.headers.get("location")).toBe("/items/new?kind=best_by&tag=");
    expect((await post("/items", milk, spaceId)).headers.get("location")).toMatch(/^\/#item-/);
  });

  it("入力エラーで出し直した追加フォームにも「保存して次を追加」を出す", async () => {
    const html = await (await post("/items", { ...milk, name: "", next: "1" })).text();
    expect(html).toContain('name="next" value="1"');
  });

  it("登録済みの商品名（重複なし・自分のスペースだけ）を商品名の候補に出す", async () => {
    const spaceId = await newSpaceWith();
    await post("/items", { ...milk, name: "卵" }, spaceId);
    await post("/items", milk, spaceId);
    await newSpaceWith({ ...milk, name: "ビール" });
    const candidates = (html: string) =>
      /<datalist id="name-candidates">(.*?)<\/datalist>/.exec(html)?.[1];
    const form = await (await get("/items/new", spaceId)).text();
    expect(candidates(form)).toBe('<option value="卵"></option><option value="牛乳"></option>');
    // 入力エラーで出し直したフォームにも出す
    const invalid = await (await post("/items", { ...milk, name: "" }, spaceId)).text();
    expect(candidates(invalid)).toBe(candidates(form));
    expect(candidates(await (await app.request("/items/new")).text())).toBe("");
  });

  it("引き継ぐ種別が不正なら賞味期限を選んでおく", async () => {
    const html = await (await app.request("/items/new?kind=foo")).text();
    expect(html).toMatch(/value="best_by" required="" checked=""/);
  });

  it("種別の無い入力エラーで出し直したフォームも賞味期限を選んでおく", async () => {
    const { kind: _, ...noKind } = milk;
    const html = await (await post("/items", noKind)).text();
    expect(html).toMatch(/value="best_by" required="" checked=""/);
  });

  it("上限いっぱいの商品名・メモ（4 バイト文字）は本文の上限に収まる", async () => {
    const spaceId = await newSpaceWith({ ...milk, name: "𩸽".repeat(100), memo: "𩸽".repeat(500) });
    expect(await itemIds(spaceId)).toHaveLength(1);
  });

  it("本文が 16KB を超えたら 413", async () => {
    expect((await post("/items", { ...milk, memo: "a".repeat(16 * 1024) })).status).toBe(413);
  });

  it("写真の読み取りは JS が表示するまで隠し、同一オリジンのスクリプトだけを許可する", async () => {
    const res = await app.request("/items/new");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    const html = await res.text();
    expect(html).toContain('<p id="photo" hidden="">');
    // 期限を囲んで再読する欄と商品名の候補も JS が使う
    expect(html).toContain('<div id="crop" hidden="">');
    expect(html).toContain('list="name-candidates"');
    expect(html).toContain('accept="image/*" capture="environment"');
    // 入力は見た目だけ隠し、大きなラベルで起動する
    expect(html).toContain('<label for="photo-input" class="button">📷 撮影して読み取る</label>');
    expect(html).toContain('<canvas id="photo-thumb" aria-label="読み取り中の写真" hidden="">');
    expect(html).toContain('<script src="/extract.js" defer=""></script>');
    // 期限日のチップも /app.js が表示する
    expect(html).toMatch(/<span id="date-chips"[^>]* hidden="">/);
  });

  it.each([
    ["/extract.js", 'fetch("/api/extract"'],
    ["/app.js", 'register("/sw.js")'],
    ["/app.js", 'sendBeacon("/api/vitals"'],
    ["/app.js", 'getElementById("date-chips")'],
  ])("%s を毎回確認させて配信する", async (path, body) => {
    const res = await app.request(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(await res.text()).toContain(body);
  });

  it("/app.js と /extract.js はトップレベルの名前が重ならない（同じページで読むと SyntaxError になる）", async () => {
    const names = async (path: string) =>
      new Set(
        [...(await (await app.request(path)).text()).matchAll(/^(?:const|let|var) (\w+)/gm)].map(
          (m) => m[1],
        ),
      );
    const extract = await names("/extract.js");
    expect([...(await names("/app.js"))].filter((name) => extract.has(name))).toEqual([]);
  });

  it.each(["/app.js", "/extract.js"])(
    "%s が変わっていなければ 304 で本文を送らない",
    async (path) => {
      const etag = (await app.request(path)).headers.get("etag");
      expect(etag).toMatch(/^"[0-9a-f]+"$/);
      const res = await app.request(path, { headers: { "if-none-match": etag ?? "" } });
      expect(res.status).toBe(304);
      expect(res.headers.get("cache-control")).toBe("no-cache");
      expect(await res.text()).toBe("");
    },
  );

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
    // スワイプに気づかなくても削除できる（確認ダイアログはフォームの外）
    expect(html).toMatch(
      new RegExp(
        `</form>.*popovertarget="delete-item".*「牛乳」を削除しますか？.*action="/items/${id}/delete"`,
      ),
    );
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
    expect(res.headers.get("location")).toBe(`/#item-${id}`);
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
    const denied = await post(`/items/${id}/delete`, {}, other);
    expect(denied.status).toBe(303);
    expect(denied.headers.get("location")).toBe("/");
    expect(await itemIds(spaceId)).toEqual([id]);
    const res = await post(`/items/${id}/delete`, {}, spaceId);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`/?deleted=${encodeURIComponent("牛乳")}`);
    expect(await itemIds(spaceId)).toEqual([]);
  });

  it("削除した商品名を一覧の上に知らせる（エスケープして出す）", async () => {
    const spaceId = await newSpaceWith();
    const html = await (await get(`/?deleted=${encodeURIComponent("<牛乳>")}`, spaceId)).text();
    expect(html).toContain('<p class="notice" role="status">「&lt;牛乳&gt;」を削除しました。</p>');
    expect(await (await get("/", spaceId)).text()).not.toContain("を削除しました");
    const long = await (await get(`/?deleted=${"a".repeat(101)}`, spaceId)).text();
    expect(long).toContain(`「${"a".repeat(100)}」を削除しました。`);
  });
});

/** タグを作り、その ID を返す */
const addTag = async (spaceId: string, name: string): Promise<string> => {
  expect((await post("/tags", { name }, spaceId)).status).toBe(303);
  const html = await (await get("/tags", spaceId)).text();
  const id = new RegExp(`<span>${name}</span><button[^>]*popovertarget="delete-tag-([^"]+)"`).exec(
    html,
  )?.[1];
  if (!id) throw new Error(`タグ ${name} がありません`);
  return id;
};

describe("タグ", () => {
  it("100 個に達していれば 409 で案内する", async () => {
    const spaceId = await newSpaceWith();
    await fillSpace(env, "tags", spaceId, 100);
    const res = await post("/tags", { name: "もう1つ" }, spaceId);
    expect(res.status).toBe(409);
    const html = await res.text();
    expect(html).toContain("タグは100個までです");
    expect(html).toContain('<a href="/tags">戻る</a>');
  });

  it("Cookie が無ければ空のタグ画面を出し、スペースは発行しない", async () => {
    const res = await app.request("/tags");
    expect(res.headers.get("set-cookie")).toBeNull();
    const html = await res.text();
    expect(html).toContain("まだタグがありません");
    expect(html).toContain('action="/tags"');
  });

  it("一覧の左上のメニューから絞り込み、タグ画面へ行ける", async () => {
    const spaceId = await newSpaceWith();
    const food = await addTag(spaceId, "食事");
    const html = await (await get("/", spaceId)).text();
    expect(html).toContain('popovertarget="tag-menu" aria-label="タグで絞り込む"');
    expect(html).toContain('<a href="/" aria-current="page">すべて</a>');
    expect(html).toContain(`<a href="/?tag=${food}">食事</a>`);
    expect(html).toContain('href="/tags"');
  });

  it("タグを付けて登録すると一覧に出し、タグで絞り込める", async () => {
    const spaceId = await newSpaceWith({ ...milk, name: "牛乳" });
    const food = await addTag(spaceId, "食事");
    const drink = await addTag(spaceId, "酒");
    await post("/items", { ...milk, name: "ビール", tag_id: drink }, spaceId);
    await post("/items", { ...milk, name: "パン", tag_id: food }, spaceId);

    const all = await (await get("/", spaceId)).text();
    expect(all).toContain('<span class="tag">酒</span>');
    expect(all).toContain('<span class="tag">食事</span>');

    const res = await get(`/?tag=${drink}`, spaceId);
    const html = await res.text();
    expect(html).toContain("<title>酒 - 期限メモ</title>");
    expect(html).toContain("<h1>酒</h1>");
    expect([...html.matchAll(/class="name">([^<]+)</g)].map((m) => m[1])).toEqual(["ビール"]);
    expect(html).not.toContain('<span class="tag">');
    expect(html).toContain(`<a href="/?tag=${drink}" aria-current="page">酒</a>`);
    expect(html).toContain(`href="/items/new?tag=${drink}"`);
    const form = await (await get(`/items/new?tag=${drink}`, spaceId)).text();
    expect(form).toContain(`<option value="${drink}" selected="">酒</option>`);
    expect(form).toContain('<option value="">なし</option>');
  });

  it("商品の無いタグ・消えたタグで開いたとき", async () => {
    const spaceId = await newSpaceWith();
    const empty = await addTag(spaceId, "菓子");
    const filtered = await (await get(`/?tag=${empty}`, spaceId)).text();
    expect(filtered).toContain("「菓子」の商品はありません。");
    // 絞り込み中の空表示は案内を出さない
    expect(filtered).not.toContain('class="welcome"');
    const html = await (await get(`/?tag=${crypto.randomUUID()}`, spaceId)).text();
    expect(html).toContain("<h1>期限メモ</h1>");
    expect(html).toContain('class="name">牛乳<');
  });

  it("タグが無ければフォームにタグの欄を出さない", async () => {
    const html = await (await get("/items/new", await newSpaceWith())).text();
    expect(html).not.toContain('name="tag_id"');
  });

  it("編集でタグを付け替え・外せる", async () => {
    const spaceId = await newSpaceWith();
    const food = await addTag(spaceId, "食事");
    const [id] = await itemIds(spaceId);
    await post(`/items/${id}`, { ...milk, tag_id: food }, spaceId);
    expect(await (await get(`/items/${id}/edit`, spaceId)).text()).toContain(
      `<option value="${food}" selected="">食事</option>`,
    );
    await post(`/items/${id}`, { ...milk, tag_id: "" }, spaceId);
    const html = await (await get(`/items/${id}/edit`, spaceId)).text();
    expect(html).toContain(`<option value="${food}">食事</option>`);
  });

  it("不正なタグは 400 でフォームを出し直す", async () => {
    const spaceId = await newSpaceWith();
    await addTag(spaceId, "食事");
    const [id] = await itemIds(spaceId);
    for (const path of ["/items", `/items/${id}`]) {
      const res = await post(path, { ...milk, tag_id: "食事" }, spaceId);
      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain('id="tag_id-error"');
      expect(html).toContain('<option value="">なし</option>');
    }
  });

  it("空・長すぎる名前は 400 で入力値を残す", async () => {
    const spaceId = await newSpaceWith();
    const res = await post("/tags", { name: "あ".repeat(21) }, spaceId);
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('id="tag-name-error"');
    expect(html).toContain(`value="${"あ".repeat(21)}"`);
    expect((await post("/tags", {}, spaceId)).status).toBe(400);
  });

  it("削除すると付いていた商品はタグなしに戻る。別スペースからは消せない", async () => {
    const spaceId = await newSpaceWith();
    const food = await addTag(spaceId, "食事");
    const [id] = await itemIds(spaceId);
    await post(`/items/${id}`, { ...milk, tag_id: food }, spaceId);

    await post(`/tags/${food}/delete`, {}, await newSpaceWith());
    expect(await (await get("/tags", spaceId)).text()).toContain("<span>食事</span>");

    const res = await post(`/tags/${food}/delete`, {}, spaceId);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/tags");
    expect(await (await get("/tags", spaceId)).text()).toContain("まだタグがありません");
    expect(await (await get("/", spaceId)).text()).not.toContain('class="tag"');
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
  it("開いただけでは Cookie を変えず、確認画面の POST で切り替えて一覧へ戻る", async () => {
    const shared = await newSpaceWith();
    const confirm = await get(`/s/${shared}`);
    expect(confirm.status).toBe(200);
    expect(confirm.headers.get("set-cookie")).toBeNull();
    const html = await confirm.text();
    expect(html).toContain(`<form class="actions" method="post" action="/s/${shared}">`);
    expect(html).not.toContain('class="notice"');

    const res = await post(`/s/${shared}`, {});
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    expect(spaceCookie(res)).toBe(shared);
    expect(await itemIds(shared)).toHaveLength(1);
  });

  it("この端末で別の一覧を使っていれば、切り替わることを警告する", async () => {
    const shared = await newSpaceWith();
    const mine = await newSpaceWith();
    const res = await get(`/s/${shared}`, mine);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await res.text()).toContain('<p class="notice" role="alert">');
  });

  it("今の Cookie のスペースが無くなっていれば警告しない", async () => {
    const shared = await newSpaceWith();
    const res = await get(`/s/${shared}`, crypto.randomUUID());
    expect(await res.text()).not.toContain('class="notice"');
  });

  it("すでにその一覧を使っていれば確認せずに一覧へ戻る", async () => {
    const shared = await newSpaceWith();
    const res = await get(`/s/${shared}`, shared);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    expect(spaceCookie(res)).toBe(shared);
  });

  it("別のサイトからの POST では切り替えない", async () => {
    const shared = await newSpaceWith();
    const res = await app.request(
      `/s/${shared}`,
      {
        method: "POST",
        body: new URLSearchParams(),
        headers: { origin: "https://evil.example", cookie: `space_id=${await newSpaceWith()}` },
      },
      env,
    );
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it.each([crypto.randomUUID(), "not-a-uuid"])(
    "存在しない共有 URL（%s）は 404 で、Cookie を変えない",
    async (bogus) => {
      for (const res of [await get(`/s/${bogus}`), await post(`/s/${bogus}`, {})]) {
        expect(res.status).toBe(404);
        expect(res.headers.get("set-cookie")).toBeNull();
        expect(await res.text()).toContain("共有URLが使えません");
      }
    },
  );

  it("space_id や商品を含む応答はキャッシュさせない", async () => {
    const spaceId = await newSpaceWith();
    const responses = await Promise.all([
      get("/", spaceId),
      get("/settings", spaceId),
      get(`/s/${spaceId}`),
      post(`/s/${spaceId}`, {}),
      get("/s/00000000-0000-4000-8000-000000000000"),
      get("/api/items", spaceId),
      post("/items", milk, spaceId),
    ]);
    for (const res of responses) expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("Cookie が無ければ共有 URL を出さない", async () => {
    const html = await (await get("/settings")).text();
    expect(html).toContain("商品を登録すると共有URLが表示されます");
    expect(html).not.toContain('id="share-url"');
  });

  it("自分のスペースの共有 URL を出し、コピー・送るボタンは JS が表示するまで隠す", async () => {
    const spaceId = await newSpaceWith();
    const html = await (await get("/settings", spaceId)).text();
    expect(html).toContain(`<input id="share-url" readonly="" value="${ORIGIN}/s/${spaceId}"/>`);
    expect(html).toContain('<button id="share-copy" type="button" hidden="">');
    expect(html).toContain('<button id="share-send" type="button" hidden="">');
    expect(html).toContain('<button class="secondary" type="button" popovertarget="rotate">');
    expect(html).toContain('<form class="actions" method="post" action="/settings/rotate">');
  });

  it("共有 URL の QR コードはサーバーで SVG にし、既定は畳んでおく", async () => {
    const spaceId = await newSpaceWith();
    const html = await (await get("/settings", spaceId)).text();
    expect(html).toContain('<details class="qr"><summary>QRコードを表示</summary><svg role="img"');
    const svg = /<svg[^>]*viewBox="0 0 (\d+) \1"[^>]*>.*?<path d="([^"]+)"/.exec(html);
    // 36 文字の ID を含む URL が収まる大きさ（余白 4 モジュールずつ）で、暗いモジュールがある
    expect(Number(svg?.[1])).toBeGreaterThanOrEqual(33 + 8);
    expect(svg?.[2]).toMatch(/^(M\d+ \d+h1v1h-1z)+$/);
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
