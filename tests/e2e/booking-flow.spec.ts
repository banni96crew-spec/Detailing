import { expect, test } from "@playwright/test";

test("чистое или повреждённое хранилище всегда открывает витринную запись", async ({ page, context }) => {
  await page.goto("/s/graphite/services");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/s/graphite/my-booking");
  await expect(page.getByRole("heading", { name: "Моя запись" })).toBeVisible();
  await expect(page.getByText("Демонстрационная запись")).toBeVisible();
  await expect(page.getByText("Демонстрационный автомобиль")).toBeVisible();

  await page.evaluate(() => localStorage.setItem("tenant-booking-token:graphite", "missing-token"));
  await page.reload();
  await expect(page.getByText("Демонстрационная запись")).toBeVisible();

  await page.evaluate(() => localStorage.setItem("demo-bookings:graphite", "broken-json"));
  await page.reload();
  await expect(page.getByText("Демонстрационная запись")).toBeVisible();

  const secondPage = await context.newPage();
  await secondPage.goto("/s/graphite/owner/");
  await expect(secondPage.getByText("Демонстрационная запись")).toBeVisible();
  await secondPage.close();

  await page.getByRole("button", { name: "Сбросить демонстрацию" }).click();
  await expect(page.getByText("Демонстрационная запись")).toBeVisible();
  await page.close();
});

test("клиент записывается, а владелец видит запись", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/s/graphite/services");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("link", { name: /Детейлинг-мойка/ }).click();
  const availableSlot = page.locator(".booking-slot:not([disabled])").first();
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
