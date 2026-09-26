import { expect, test } from "@playwright/test";

// /api/extract は Workers AI を呼ぶので応答を差し替え、段階処理の結果ごとの画面の動きだけを見る（ADR 0007）
const reading = (result: object) => ({
  name: null,
  expires_on: null,
  kind: null,
  confidence: "low",
  next: "confirm",
  name_candidates: [],
  date_candidates: [],
  ...result,
});

// 1x1 の PNG（縮小・切り出しの Canvas が扱える実画像）
const photo = {
  name: "photo.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
};

test("期限が読めなければ期限の部分を囲んで再読し、候補の商品名を出す", async ({ page }) => {
  const parts: string[] = [];
  await page.route("/api/extract", async (route) => {
    const part = /name="part"\r\n\r\n(\w+)/.exec(route.request().postData() ?? "")?.[1] ?? "";
    parts.push(part);
    await route.fulfill({
      json:
        part === "all"
          ? reading({ next: "reread", name_candidates: ["明治", "おいしい牛乳"] })
          : reading({ expires_on: "2026-10-05", kind: "use_by", confidence: "high" }),
    });
  });
  await page.goto("/items/new");
  await page.getByLabel("撮影して読み取る").setInputFiles(photo);

  await expect(page.getByRole("status")).toContainText("期限の部分を指でなぞって囲み");
  await expect(page.locator("#name-candidates option")).toHaveCount(2);
  const read = page.getByRole("button", { name: "囲んだ部分を読み取る" });
  await expect(read).toBeDisabled();

  const box = (await page.locator("#crop-canvas").boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 5, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await read.click();

  await expect(page.getByLabel("期限日")).toHaveValue("2026-10-05");
  await expect(page.getByRole("radio", { name: "消費期限" })).toBeChecked();
  await expect(page.locator("#crop")).toBeHidden();
  await expect(page.getByRole("status")).toContainText("商品名を候補から選ぶか入力してください。");
  expect(parts).toEqual(["all", "date"]);
});

test("写真の問題で読めなければ撮り直しを促す", async ({ page }) => {
  await page.route("/api/extract", (route) =>
    route.fulfill({ json: reading({ name: "牛乳", next: "retake" }) }),
  );
  await page.goto("/items/new");
  await page.getByLabel("撮影して読み取る").setInputFiles(photo);

  await expect(page.getByRole("status")).toContainText("撮り直す");
  await expect(page.getByLabel("商品名")).toHaveValue("牛乳");
  await expect(page.locator("#crop")).toBeHidden();
});

test("本文の上限（413）で断られたら手入力を促す。読み取り中は撮影ボタンを押せない", async ({
  page,
}) => {
  let respond = () => {};
  const responded = new Promise<void>((resolve) => (respond = resolve));
  await page.route("/api/extract", async (route) => {
    await responded;
    await route.fulfill({ status: 413 });
  });
  await page.goto("/items/new");
  const camera = page.getByLabel("撮影して読み取る");
  // フォームの先頭に、押しやすい大きさのボタンとして出す
  const button = (await page.locator("label[for=photo-input]").boundingBox())!;
  expect(button.height).toBeGreaterThanOrEqual(44);
  await camera.setInputFiles(photo);

  await expect(page.getByRole("status")).toHaveText("読み取り中…");
  await expect(camera).toBeDisabled();
  // どの写真を読んでいるかと、止まっていないことが分かる
  await expect(page.getByLabel("読み取り中の写真")).toBeVisible();
  await expect(page.locator("#photo .spinner")).toBeVisible();
  respond();
  await expect(page.getByRole("status")).toHaveText("読み取れませんでした。手入力してください。");
  await expect(camera).toBeEnabled();
  await expect(page.getByLabel("読み取り中の写真")).toBeHidden();
  await expect(page.locator("#photo .spinner")).toBeHidden();
  await expect(page.getByLabel("商品名")).toBeEditable();
});

test("動きを減らす設定ではスピナーを回さない", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("/api/extract", () => {});
  await page.goto("/items/new");
  await page.getByLabel("撮影して読み取る").setInputFiles(photo);
  const spinner = page.locator("#photo .spinner");
  await expect(spinner).toBeVisible();
  await expect(spinner).toHaveCSS("animation-name", "none");
});

test("登録済みの商品名を候補に出し、読み取りの候補はその前に足す", async ({ page }) => {
  await page.goto("/items/new");
  await page.getByLabel("商品名").fill("牛乳");
  await page.getByLabel("期限日").fill("2099-01-01");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page).toHaveURL(/\/#item-/);

  const candidates = page.locator("#name-candidates option");
  let names: string[] = [];
  await page.route("/api/extract", (route) =>
    route.fulfill({
      json: reading({
        expires_on: "2099-01-02",
        kind: "use_by",
        confidence: "high",
        name_candidates: names,
      }),
    }),
  );
  await page.goto("/items/new");
  await expect(candidates).toHaveCount(1);
  await expect(candidates).toHaveAttribute("value", "牛乳");

  // 登録済みの商品名しか無ければ「候補から選ぶ」とは言わない
  await page.getByLabel("撮影して読み取る").setInputFiles(photo);
  await expect(page.getByRole("status")).toHaveText("商品名を入力してください。");
  await expect(candidates).toHaveCount(1);

  // 登録済みと同じ名前は重ねて出さない
  names = ["明治", "牛乳"];
  await page.getByLabel("撮影して読み取る").setInputFiles(photo);
  await expect(page.getByRole("status")).toHaveText("商品名を候補から選ぶか入力してください。");
  expect(
    await candidates.evaluateAll((options) => options.map((o) => o.getAttribute("value"))),
  ).toEqual(["明治", "牛乳"]);
});

test("高補正モードは既定で off、選ぶと judge=on で送り、次に開いても覚えている", async ({
  page,
}) => {
  const judges: string[] = [];
  await page.route("/api/extract", async (route) => {
    judges.push(/name="judge"\r\n\r\n(\w+)/.exec(route.request().postData() ?? "")?.[1] ?? "");
    await route.fulfill({ json: reading({ expires_on: "2026-10-05", confidence: "high" }) });
  });
  await page.goto("/items/new");
  const mode = page.getByLabel("高補正モード");
  await expect(mode).not.toBeChecked();
  await page.getByLabel("撮影して読み取る").setInputFiles(photo);
  await expect(page.getByLabel("期限日")).toHaveValue("2026-10-05");

  await mode.check();
  await page.reload();
  await expect(mode).toBeChecked();
  await page.getByLabel("撮影して読み取る").setInputFiles(photo);
  await expect.poll(() => judges).toEqual(["off", "on"]);
});
