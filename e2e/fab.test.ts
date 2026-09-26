import { expect, test } from "@playwright/test";

test("追加ボタンは右下に固定し、一覧の最後の行を隠さない", async ({ page }) => {
  await page.goto("/");
  // 画面より長い一覧にする（同一オリジンの fetch なので Origin が付く）
  await page.evaluate(async () => {
    for (let i = 0; i < 20; i++) {
      await fetch("/items", {
        method: "POST",
        body: new URLSearchParams({ name: `商品${i}`, expires_on: "2099-01-01", kind: "best_by" }),
      });
    }
  });
  await page.reload();
  // 「それ以降」の畳まれた分も開いて、一覧を画面より長くする
  await page.getByText(/残り \d+ 件を表示/).click();

  const viewport = page.viewportSize()!;
  const fab = page.getByRole("link", { name: "＋ 追加" });
  const box = (await fab.boundingBox())!;
  // 片手の親指が届く右下
  expect(box.x + box.width / 2).toBeGreaterThan(viewport.width / 2);
  expect(box.y + box.height / 2).toBeGreaterThan(viewport.height * 0.75);

  // 一番下までスクロールしたとき、最後の行が追加ボタンより上に出る
  await page.mouse.wheel(0, 100_000);
  const last = page.locator("li.item").last();
  await expect
    .poll(async () => {
      const row = (await last.boundingBox())!;
      return row.y + row.height <= (await fab.boundingBox())!.y;
    })
    .toBe(true);

  await fab.click();
  await expect(page).toHaveURL(/\/items\/new$/);
});
