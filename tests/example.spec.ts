import { test, expect } from "@playwright/test";

test("login", async ({ page }) => {
  await page.goto("/");

  // Click the get started link.
  await page.getByRole("button", { name: "Login" }).click();

  // Expects page to have a heading with the name of Installation.
  await expect(page.getByText("Alex Morgan")).toBeVisible();
});
