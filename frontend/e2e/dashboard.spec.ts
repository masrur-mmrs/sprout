import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { accountNav, appCard, open, signUpDeveloper } from "./helpers";

// Phase 11: the developer dashboard. Uploads go from the browser straight to storage, so these
// specs need a backend whose StorageService answers them: locally, a harness that runs
// createApp({ db, email, storage }) with a fake GCS on localhost (the real entry, src/index.ts,
// needs GCS credentials). Auth budget per run: 1 sign-up and 0 sign-ins, all steps on one session.

// A 1×1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/** A few hundred KB that start like a zip. The backend never looks inside. */
function zipBytes(): Buffer {
  return Buffer.concat([Buffer.from("PK\u0003\u0004"), randomBytes(300 * 1024)]);
}

/** Counts the page's requests for upload URLs. */
function countUploadRequests(page: Page) {
  const counter = { count: 0 };
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/apps/uploads") counter.count++;
  });
  return counter;
}

async function fillDetails(page: Page, title: string) {
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Tagline").fill("Made by the dashboard spec");
  await page.getByLabel("Description").fill("An app the end-to-end tests publish.\nThen delete.");
  await page.getByLabel("Category").selectOption("Utilities");
  await page.getByLabel("Version").fill("1.0");
}

test("signed out, the dashboard sends you to sign-in and back", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fdashboard$/);
});

test("a new developer publishes, edits and deletes an app", async ({ page }) => {
  test.setTimeout(120_000);
  const user = await signUpDeveloper(page);
  const title = `Pebble ${user.username.slice(4)}`;
  const uploads = countUploadRequests(page);
  const binaryField = page.getByLabel("Binary", { exact: true });
  const iconField = page.getByLabel("Icon", { exact: true });
  const main = page.getByRole("main");

  await test.step("a developer with no apps sees the empty state", async () => {
    await accountNav(page).getByRole("link", { name: "Dashboard" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("You haven’t published an app yet.")).toBeVisible();
    await page.getByRole("link", { name: "Publish an app" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Publish an app" })).toBeVisible();
    await page.waitForLoadState("networkidle");
  });

  await test.step("files the backend would refuse are rejected before any upload", async () => {
    await fillDetails(page, title);
    await binaryField.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: PNG });
    await expect(main).toContainText(
      "Choose a .zip, .dmg, .apk, .exe, .msi, .pkg, .deb or .AppImage file.",
    );
    await iconField.setInputFiles({ name: "icon.svg", mimeType: "image/svg+xml", buffer: PNG });
    await expect(main).toContainText("Choose a PNG, WebP or JPEG image.");
    await page.getByRole("button", { name: "Publish app" }).click();
    await expect(binaryField).toBeFocused();

    await iconField.setInputFiles({ name: "icon.jpg", mimeType: "image/png", buffer: PNG });
    await expect(main).toContainText("Rename the image to end in .png to match its type.");
    await binaryField.setInputFiles({
      name: "empty.zip",
      mimeType: "application/zip",
      buffer: Buffer.alloc(0),
    });
    await expect(main).toContainText("The file is empty.");
    await page.getByRole("button", { name: "Publish app" }).click();
    await expect(binaryField).toBeFocused();
    expect(uploads.count).toBe(0);
  });

  await test.step("a failed upload retries alone, then the app publishes", async () => {
    // Abort the first PUT to storage (its path has /uploads/; the API's ends in /uploads). While
    // a route is active Playwright answers CORS preflights itself, so it's removed right after.
    const toStorage = (url: URL) => url.pathname.includes("/uploads/");
    let aborted = false;
    await page.route(toStorage, (route) => {
      if (!aborted && route.request().method() === "PUT") {
        aborted = true;
        return route.abort();
      }
      return route.fallback();
    });
    await iconField.setInputFiles({ name: "icon.png", mimeType: "image/png", buffer: PNG });
    await binaryField.setInputFiles({
      name: "pebble.zip",
      mimeType: "application/zip",
      buffer: zipBytes(),
    });
    await expect(main).not.toContainText("The file is empty.");
    await page.getByRole("button", { name: "Publish app" }).click();

    const retry = page.getByRole("button", { name: /^Retry/ });
    await expect(retry).toHaveCount(1);
    await expect(main.getByText("Failed", { exact: true })).toBeVisible();
    await expect(main.getByText("Uploaded", { exact: true })).toHaveCount(1);
    expect(uploads.count).toBe(2);

    await retry.click();
    await expect(main.getByText("Uploaded", { exact: true })).toHaveCount(2);
    await expect(retry).toHaveCount(0);
    for (const name of ["Binary upload", "Icon upload"]) {
      await expect(page.getByRole("progressbar", { name })).toHaveAttribute("aria-valuenow", "100");
    }
    expect(uploads.count).toBe(3);
    await page.unroute(toStorage);

    await page.getByRole("button", { name: "Publish app" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("App published.")).toBeVisible();
    // Both files already had keys, so publishing uploaded nothing again.
    expect(uploads.count).toBe(3);
  });

  await test.step("the new app is listed, newest first, and found by search", async () => {
    await expect(main.getByRole("heading", { level: 2 }).first()).toHaveText(title);
    await open(page, "/?sort=new");
    const newest = page
      .getByRole("region", { name: "New releases" })
      .getByRole("link", { name: /downloads/ })
      .first();
    await expect(newest).toContainText(title);
    await open(page, `/search?${new URLSearchParams({ q: title })}`);
    await expect(appCard(page, title)).toBeVisible();
  });

  let appPath = "";
  let downloadHref = "";
  let firstLocation = "";

  await test.step("the detail page's download serves the uploaded binary", async () => {
    await open(page, "/dashboard");
    await page.getByRole("link", { name: `View ${title}` }).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    appPath = new URL(page.url()).pathname;
    downloadHref = (await page
      .getByRole("link", { name: "Download", exact: true })
      .getAttribute("href"))!;
    const res = await page.request.get(downloadHref, { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    firstLocation = res.headers().location;
    expect(firstLocation).toBeTruthy();
  });

  await test.step("edit: tagline, a version bump and a new binary", async () => {
    await open(page, "/dashboard");
    await page.getByRole("link", { name: `Edit ${title}` }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Edit app" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByLabel("Title")).toHaveValue(title);
    await expect(page.getByLabel("Version")).toHaveValue("1.0");

    const replacement = zipBytes();
    await page.getByLabel("Tagline").fill("Edited by the dashboard spec");
    await page.getByLabel("Version").fill("1.1");
    await page.getByLabel("Replace binary").setInputFiles({
      name: "pebble-1.1.zip",
      mimeType: "application/zip",
      buffer: replacement,
    });
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("Changes saved.")).toBeVisible();
    expect(uploads.count).toBe(4);

    await open(page, appPath);
    await expect(page.getByText("Edited by the dashboard spec")).toBeVisible();
    await expect(
      page.locator("dt", { hasText: "Version" }).locator("xpath=following-sibling::dd[1]"),
    ).toHaveText("1.1");
    const res = await page.request.get(downloadHref, { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    const location = res.headers().location;
    expect(location).not.toBe(firstLocation);
    const file = await page.request.get(location);
    expect(file.ok()).toBe(true);
    expect(Buffer.compare(await file.body(), replacement)).toBe(0);
  });

  await test.step("delete through the inline confirm", async () => {
    await open(page, `/dashboard${appPath}/edit`);
    await page.getByRole("button", { name: "Delete app" }).click();
    await expect(page.getByText(`Delete ${title}? Its reviews and files go too.`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Keep it" })).toBeFocused();
    await page.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("App deleted.")).toBeVisible();
    await expect(page.getByText("You haven’t published an app yet.")).toBeVisible();
    await page.goto(appPath);
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  });
});
