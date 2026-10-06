import { expect, test } from "@playwright/test";

test("клиент записывается, а владелец видит запись", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/s/graphite/services");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("listitem").filter({ hasText: "Детейлинг-мойка" }).getByRole("button", { name: "Выбрать" }).click();

  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const nativeDate = page.locator('input[type="date"]');
  if (await nativeDate.count()) await nativeDate.fill(tomorrow);
  const availableSlot = page.locator(".slot-grid button:not([disabled])").first();
  await expect(availableSlot).toBeVisible();
  await availableSlot.click();
  await page.getByRole("button", { name: "Продолжить" }).click();

  await page.getByRole("textbox", { name: /Имя/ }).fill("Иван Петров");
  await page.getByRole("textbox", { name: /Телефон/ }).fill("+7 999 123-45-67");
  await page.getByRole("textbox", { name: /Автомобиль/ }).fill("BMW X5");
  await page.getByRole("button", { name: "Проверить" }).click();
  await page.getByRole("button", { name: "Подтвердить запись" }).click();

  await expect(page).toHaveURL(/\/s\/graphite\/my-booking$/);
  await expect(page.getByRole("heading", { name: "Моя запись" })).toBeVisible();
  await expect(page.getByText("BMW X5")).toBeVisible();

  await page.goto("/s/graphite/owner/");
  await page.getByRole("button", { name: "7 дней" }).click();
  await expect(page.getByRole("heading", { name: "BMW X5" })).toBeVisible();
  await expect(page.getByText(/Иван Петров/)).toBeVisible();
  await page.close();
});
