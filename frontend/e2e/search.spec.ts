import { expect, test } from "@playwright/test";
import { appCard, open } from "./helpers";

// The seed's typo fixtures (backend/src/db/seed.ts). Focus Timer matches "pomodoro" only through
// its description.
const FIXTURES = [
  { q: "spotfy", title: "Spotlify" },
  { q: "phto editr", title: "Photo Editor" },
  { q: "pomodoro", title: "Focus Timer" },
];

for (const { q, title } of FIXTURES) {
  test(`a search for "${q}" finds ${title}`, async ({ page }) => {
    await page.goto(`/search?${new URLSearchParams({ q })}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Results for “${q}”`);
    await expect(appCard(page, title)).toBeVisible();
  });
}

test("typing in the header shows live results, and Back returns to where it started", async ({
  page,
}) => {
  await open(page, "/category/productivity");
  const search = page.getByRole("searchbox", { name: "Search apps" });
  // Keystroke by keystroke, without Enter: the pause after the last one navigates.
  await search.pressSequentially("spotfy", { delay: 40 });

  await expect(page).toHaveURL(/\/search\?q=spotfy$/);
  await expect(appCard(page, "Spotlify")).toBeVisible();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("spotfy");

  await page.goBack();
  await expect(page).toHaveURL(/\/category\/productivity$/);
  await expect(page.getByRole("heading", { level: 1, name: "Productivity" })).toBeVisible();
});

test("a query that matches nothing says so and suggests popular apps", async ({ page }) => {
  await page.goto("/search?q=zzqqxxyyzz");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("No results for “zzqqxxyyzz”");
  await expect(page.getByText("Searches under 3 characters only match")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Popular right now" })).toBeVisible();
  await expect(appCard(page, "Spotlify")).toBeVisible();
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the header form submits to server-rendered results", async ({ page }) => {
    await page.goto("/");
    const search = page.getByRole("searchbox", { name: "Search apps" });
    await search.fill("pomodoro");
    await search.press("Enter");

    await expect(page).toHaveURL(/\/search\?q=pomodoro$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Results for “pomodoro”");
    await expect(appCard(page, "Focus Timer")).toBeVisible();
  });
});
