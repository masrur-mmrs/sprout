import { expect, test, type Page } from "@playwright/test";
import { open, openApp, SEED, SEED_PASSWORD, signIn, signUp, uniqueUser } from "./helpers";

/** The review summary in "Ratings & reviews": "Rated 4.5 out of 5, 2 reviews". */
async function reviewSummary(page: Page) {
  const label = await page
    .locator("#reviews")
    .getByRole("img", { name: /out of 5, \d+ reviews?$/ })
    .getAttribute("aria-label");
  const match = /^Rated ([\d.]+) out of 5, (\d+) reviews?$/.exec(label ?? "");
  if (!match) throw new Error(`Unexpected rating label: ${label}`);
  return { average: Number(match[1]), count: Number(match[2]) };
}

async function downloadCount(page: Page) {
  const text = await page
    .locator("dt", { hasText: "Downloads" })
    .locator("xpath=following-sibling::dd[1]")
    .textContent();
  return Number((text ?? "").replaceAll(",", ""));
}

/** Set before an action, read after: still there means the page didn't reload. */
async function markPage(page: Page) {
  await page.evaluate(() => Object.assign(window, { __e2eMark: true }));
}

async function expectSamePage(page: Page) {
  expect(await page.evaluate(() => "__e2eMark" in window)).toBe(true);
}

test("signed out, an app offers sign-in that comes back to it", async ({ page }) => {
  const path = await openApp(page, "Spotlify");
  await expect(page.getByRole("link", { name: "Sign in to review" })).toHaveAttribute(
    "href",
    `/sign-in?${new URLSearchParams({ next: path })}`,
  );
  await expect(page.getByRole("radiogroup")).toHaveCount(0);
});

test("a new user reviews with the keyboard alone, then edits and deletes", async ({ page }) => {
  const user = uniqueUser();
  await signUp(page, user);
  await expect(page.getByRole("navigation", { name: "Account" })).toContainText(user.username);
  await openApp(page, "Spotlify");
  const before = await reviewSummary(page);
  const comment = `Keyboard-only review ${user.username}`;
  const list = page.locator("#reviews ul").first();
  const mine = list.getByRole("listitem").filter({ hasText: user.username });

  await test.step("post: Tab to the stars, arrows to 4, Tab to the comment, submit", async () => {
    await page.getByRole("link", { name: "Download", exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("radio", { name: "1 star", exact: true })).toBeFocused();
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: "4 stars" })).toBeChecked();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Comment")).toBeFocused();
    await page.keyboard.type(comment);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Post review" })).toBeFocused();
    await markPage(page);
    await page.keyboard.press("Enter");

    await expect(page.getByText("Review posted.")).toBeVisible();
    await expect(mine).toContainText("Your review");
    await expect(mine).toContainText(comment);
    await expect.poll(async () => (await reviewSummary(page)).count).toBe(before.count + 1);
    const expected = (before.average * before.count + 4) / (before.count + 1);
    // The label rounds to one decimal, before and after.
    expect(Math.abs((await reviewSummary(page)).average - expected)).toBeLessThan(0.11);
    await expectSamePage(page);
  });

  await test.step("edit: the form starts from the review, and saves over it", async () => {
    await expect(page.getByRole("heading", { name: "Edit your review" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "4 stars" })).toBeChecked();
    await expect(page.getByLabel("Comment")).toHaveValue(comment);

    await page.getByRole("radio", { name: "2 stars" }).check({ force: true });
    await page.getByLabel("Comment").fill(`${comment}, edited`);
    await page.getByRole("button", { name: "Update review" }).click();

    await expect(page.getByText("Review updated.")).toBeVisible();
    await expect(mine).toContainText(`${comment}, edited`);
    await expect(mine.getByRole("img", { name: "Rated 2.0 out of 5" })).toBeVisible();
    expect((await reviewSummary(page)).count).toBe(before.count + 1);
    await expectSamePage(page);
  });

  await test.step("delete: through the inline confirm, and the count drops back", async () => {
    await page.getByRole("button", { name: "Delete review" }).click();
    await expect(page.getByText("Delete your review?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Keep it" })).toBeFocused();
    await page.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(page.getByText("Review deleted.")).toBeVisible();
    await expect(mine).toHaveCount(0);
    await expect.poll(async () => (await reviewSummary(page)).count).toBe(before.count);
    await expect(page.getByRole("heading", { name: "Write a review" })).toBeVisible();
    await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
    await expect(page.getByLabel("Comment")).toHaveValue("");
    await expectSamePage(page);
  });
});

test("an app's developer sees no review form for it", async ({ page }) => {
  await signIn(page, SEED.nova, SEED_PASSWORD);
  await expect(page.getByRole("navigation", { name: "Account" })).toContainText("nova_studio");
  await openApp(page, "Spotlify");
  await expect(page.getByText("You published this app, so you can’t review it.")).toBeVisible();
  await expect(page.getByRole("radiogroup")).toHaveCount(0);
});

test("Download is a plain link; only requesting it counts a download", async ({ page }) => {
  const path = await openApp(page, "Spotlify");
  const download = page.getByRole("link", { name: "Download", exact: true });
  const href = `${path}/download`.replace(/^\/apps\//, "/api/apps/");
  await expect(download).toHaveAttribute("href", href);
  expect(await download.evaluate((el) => el.tagName)).toBe("A");
  const start = await downloadCount(page);

  // Loading and hovering never request it.
  await download.hover();
  await page.reload();
  await page.waitForLoadState("networkidle");
  expect(await downloadCount(page)).toBe(start);

  // One request counts one download. Locally the backend can't sign the GCS URL (no service
  // account), so it answers 500 after counting; deployed, it's a 302 to the signed URL.
  const res = await page.request.get(href, { maxRedirects: 0 });
  expect([302, 500]).toContain(res.status());

  await page.reload();
  expect(await downloadCount(page)).toBe(start + 1);
});

test("reviews of an app with none say so", async ({ page }) => {
  await open(page, "/search?q=recipe");
  await page
    .getByRole("main")
    .getByRole("link", { name: /Recipe Box/ })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Recipe Box" })).toBeVisible();
  await expect(page.getByText("No reviews yet.")).toBeVisible();
  await expect(page.locator("dd").getByText("No ratings yet")).toBeVisible();
});
