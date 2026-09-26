import { expect, test } from "@playwright/test";

test("端末がダークモードなら暗い配色で表示する", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(19, 19, 20)");
  await expect(page.locator("body")).toHaveCSS("color", "rgb(227, 227, 227)");

  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
});
