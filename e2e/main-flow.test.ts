import { expect, test, type Page } from "@playwright/test";

/** サーバーは実時刻の JST で残り日数を出すので、テスト側も JST の今日から期限日を作る */
const jstDate = (offsetDays: number) =>
  new Date(Date.now() + 9 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

const addItem = async (page: Page, name: string, offsetDays: number) => {
  await page.getByRole("link", { name: "＋ 追加" }).click();
  await page.getByLabel("商品名").fill(name);
  await page.getByLabel("期限日").fill(jstDate(offsetDays));
  await page.getByRole("radio", { name: "消費期限" }).check();
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page).toHaveURL("/");
};

const item = (page: Page, name: string) =>
  page.locator("li.item").filter({ has: page.getByRole("link", { name, exact: true }) });

test("手入力で登録し、色分け・編集・削除をして、共有URLを別の端末で開く", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await expect(page.getByText("まだ登録がありません。")).toBeVisible();

  await addItem(page, "牛乳", -1);
  await addItem(page, "卵", 1);
  await addItem(page, "缶詰", 30);

  // 期限日の昇順・既定の warn_days（3 日）で色分けされる。途中で JST の日付が変わっても同じ色になる日数にしている
  await expect(page.locator("li.item .name")).toHaveText(["牛乳", "卵", "缶詰"]);
  await expect(item(page, "牛乳")).toHaveClass(/\bexpired\b/);
  await expect(item(page, "卵")).toHaveClass(/\bwarn\b/);
  await expect(item(page, "缶詰")).toHaveClass(/\bnormal\b/);

  await page.getByRole("link", { name: "卵", exact: true }).click();
  await expect(page.getByRole("radio", { name: "消費期限" })).toBeChecked();
  await page.getByLabel("商品名").fill("卵（10個入り）");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page).toHaveURL("/");
  await expect(item(page, "卵（10個入り）")).toContainText("消費期限");

  await item(page, "牛乳").getByRole("button", { name: "削除" }).click();
  await page.getByRole("button", { name: "削除する" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.locator("li.item .name")).toHaveText(["卵（10個入り）", "缶詰"]);

  await page.getByRole("link", { name: "設定" }).click();
  const shareUrl = await page.getByLabel("共有URL", { exact: true }).inputValue();

  // Cookie を持たない別の端末
  const other = await browser.newContext();
  try {
    const otherPage = await other.newPage();
    await otherPage.goto(shareUrl);
    await expect(otherPage.locator("li.item .name")).toHaveText(["卵（10個入り）", "缶詰"]);
  } finally {
    await other.close();
  }
});
