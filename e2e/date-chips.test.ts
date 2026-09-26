import { expect, test } from "@playwright/test";

test("期限日のチップは JST の今日を基準に入れ、月末は次の月の末日に丸める", async ({ page }) => {
  // UTC では 1/30 だが JST では 1/31
  await page.clock.setFixedTime(new Date("2027-01-30T16:00:00Z"));
  await page.goto("/items/new");
  const expiresOn = page.getByLabel("期限日");
  for (const [chip, date] of [
    ["今日", "2027-01-31"],
    ["+3日", "2027-02-03"],
    ["+1週", "2027-02-07"],
    ["+1か月", "2027-02-28"],
  ] as const) {
    await page.getByRole("button", { name: chip }).click();
    await expect(expiresOn).toHaveValue(date);
  }
});

test("JS が無ければチップを出さず、ピッカーだけで入れる", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/items/new");
    await expect(page.getByRole("button", { name: "今日" })).toBeHidden();
    await expect(page.getByLabel("期限日")).toBeVisible();
  } finally {
    await context.close();
  }
});
