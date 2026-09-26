import { expect, test } from "@playwright/test";

test("左上のメニューからタグを作り、タグを付けて登録して絞り込む", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "タグで絞り込む" }).click();
  await page.getByRole("link", { name: "タグを編集" }).click();
  for (const name of ["食事", "酒"]) {
    await page.getByLabel("新しいタグ").fill(name);
    await page.getByRole("button", { name: "追加" }).click();
  }
  await expect(page.locator(".tags li > span")).toHaveText(["食事", "酒"]);

  for (const [name, tag] of [
    ["パン", "食事"],
    ["ビール", "酒"],
  ] as const) {
    await page.goto("/items/new");
    await page.getByLabel("商品名").fill(name);
    await page.getByLabel("期限日").fill("2099-01-01");
    await page.getByLabel("タグ").selectOption({ label: tag });
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page).toHaveURL(/\/#item-/);
  }
  await expect(page.locator("li.item .name")).toHaveText(["パン", "ビール"]);

  await page.getByRole("button", { name: "タグで絞り込む" }).click();
  await page.locator("#tag-menu").getByRole("link", { name: "酒" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("酒");
  await expect(page.locator("li.item .name")).toHaveText(["ビール"]);
});
