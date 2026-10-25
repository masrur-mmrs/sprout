import { randomBytes, randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";

/**
 * Every seed account's password (backend/src/db/seed.ts, which refuses to run in production). It's
 * public dev data, not a secret; set E2E_SEED_PASSWORD if your seed differs.
 */
export const SEED_PASSWORD = process.env.E2E_SEED_PASSWORD ?? "sprout-dev-password";

export const SEED = {
  nova: "nova@sprout.test",
  riya: "riya@sprout.test",
};

export interface TestUser {
  username: string;
  email: string;
  password: string;
}

/** A user no run has made before, so the specs can be re-run on the same database. */
export function uniqueUser(): TestUser {
  const id = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  return { username: `e2e_${id}`, email: `e2e_${id}@example.test`, password: randomUUID() };
}

/** Loads a page and waits until it's interactive, so a click can't beat hydration. */
export async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

export async function signUp(page: Page, user: TestUser, path = "/sign-up") {
  await open(page, path);
  await page.getByLabel("Username").fill(user.username);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
}

/** Signs up a new developer ("I want to publish apps"). Sign-up signs them in: no sign-in needed. */
export async function signUpDeveloper(page: Page, user: TestUser = uniqueUser()) {
  await open(page, "/sign-up");
  await page.getByLabel("Username").fill(user.username);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByLabel("I want to publish apps").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(accountNav(page).getByRole("link", { name: "Dashboard" })).toBeVisible();
  return user;
}

export async function signIn(page: Page, email: string, password: string, path = "/sign-in") {
  await open(page, path);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

export function accountNav(page: Page) {
  return page.getByRole("navigation", { name: "Account" });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A result card for `title` (a card's link name starts with its category, then the title). */
export function appCard(page: Page, title: string) {
  return page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(`\\b${escapeRegExp(title)}\\b`) })
    .first();
}

/** Finds an app by title the way a person would, through search, and opens its page. */
export async function openApp(page: Page, title: string) {
  await open(page, `/search?${new URLSearchParams({ q: title })}`);
  await appCard(page, title).click();
  await expect(page.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/apps\/\d+$/);
  await page.waitForLoadState("networkidle");
  return new URL(page.url()).pathname;
}
