import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { accountNav, open, SEED, SEED_PASSWORD, signIn, signUp, uniqueUser } from "./helpers";

// Phase 9's flows. Budget per run, so two runs back to back stay under the backend's limits (10 a
// minute per IP for each of signup and signin, 3 forgot-password requests per 15 minutes): 2
// sign-ups and 3 sign-ins here (plus 1 and 1 in review.spec.ts), and 1 forgot request.

test("sign up, see yourself in the header, sign out, sign back in", async ({ page }) => {
  const user = uniqueUser();
  await open(page, "/");
  await page.evaluate(() => Object.assign(window, { __e2eMark: true }));
  // Through the header, so the sign-up is a client navigation from a loaded page.
  await accountNav(page).getByRole("link", { name: "Sign up" }).click();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Username").fill(user.username);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(accountNav(page)).toContainText(user.username);
  // No reload: the header re-rendered in place.
  expect(await page.evaluate(() => "__e2eMark" in window)).toBe(true);

  await accountNav(page).getByRole("button", { name: "Sign out" }).click();
  await expect(accountNav(page).getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(accountNav(page)).not.toContainText(user.username);

  await signIn(page, user.email, user.password);
  await expect(page).toHaveURL(/\/$/);
  await expect(accountNav(page)).toContainText(user.username);
});

test("a wrong password shows the generic alert and keeps the email", async ({ page }) => {
  await signIn(page, SEED.riya, `wrong-${randomBytes(6).toString("hex")}`);
  // In main: Next's route announcer is an alert too.
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Incorrect email or password.",
  );
  await expect(page.getByLabel("Email")).toHaveValue(SEED.riya);
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("?next= returns to the app page it names", async ({ page }) => {
  await open(page, "/");
  // An app page's path, read from the first card in the grid.
  const href = await page
    .getByRole("main")
    .getByRole("link", { name: /downloads/ })
    .first()
    .getAttribute("href");
  expect(href).toMatch(/^\/apps\/\d+$/);

  await signIn(page, SEED.riya, SEED_PASSWORD, `/sign-in?${new URLSearchParams({ next: href! })}`);
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(accountNav(page)).toContainText("riya");
});

test("?next= pointing at another site lands on the home page", async ({ page, baseURL }) => {
  await signUp(page, uniqueUser(), `/sign-up?${new URLSearchParams({ next: "https://evil.com" })}`);
  await expect(page).toHaveURL(`${baseURL}/`);
});

test("forgot password confirms without saying whether the account exists", async ({ page }) => {
  // An address no account has, so nothing is emailed. The one forgot request of the run.
  const { email } = uniqueUser();
  await open(page, "/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("If an account exists, a reset link has been sent.")).toBeVisible();
});

test("a malformed reset link shows the invalid-link state", async ({ page }) => {
  await page.goto("/reset-password?token=abc");
  await expect(page.getByText("This reset link isn’t valid.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
  await expect(page.getByLabel("New password")).toHaveCount(0);
});
