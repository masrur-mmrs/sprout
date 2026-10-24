import { render } from "@react-email/render";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PasswordResetEmail from "../src/emails/PasswordResetEmail.js";
import { createResendSender } from "../src/services/email/resendSender.js";

// The real client would call the Resend API. This one records what it was given.
const resend = vi.hoisted(() => ({ apiKeys: [] as string[], send: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resend.send };
    constructor(apiKey: string) {
      resend.apiKeys.push(apiKey);
    }
  },
}));

const PROPS = {
  username: "alex",
  resetUrl: `http://localhost:3000/reset-password?token=${"ab".repeat(32)}`,
  appUrl: "http://localhost:3000",
};
const CONFIG = {
  apiKey: "re_test_key",
  from: "Sprout <no-reply@sprout.test>",
  appUrl: PROPS.appUrl,
};
const MESSAGE = { to: "alex@sprout.test", username: PROPS.username, resetUrl: PROPS.resetUrl };

const renderEmail = (options?: { plainText: true }) =>
  render(createElement(PasswordResetEmail, PROPS), options);

beforeEach(() => {
  resend.apiKeys.length = 0;
  resend.send.mockReset();
});

describe("PasswordResetEmail", () => {
  it("renders the reset link as the button and the fallback, with the greeting and expiry", async () => {
    const html = await renderEmail();

    expect(html).toContain(PROPS.resetUrl);
    expect(html.split(`href="${PROPS.resetUrl}"`)).toHaveLength(3); // button + fallback link
    expect(html).toContain("Hi alex,");
    expect(html).toContain("15 minutes");
    expect(html).toContain("ignore this email");
    expect(html).toContain('src="http://localhost:3000/sprout.png"');
    // Ink label on brand green (7.8:1), never white (§0 Brand identity).
    expect(html).toContain("background-color:#22C55E");
    expect(html).not.toMatch(/color:#(fff|ffffff)\b/i);
  });

  it("matches the snapshot", async () => {
    expect(await renderEmail()).toMatchSnapshot();
  });

  it("has a plain-text version with the link", async () => {
    const text = await renderEmail({ plainText: true });

    expect(text).toContain(PROPS.resetUrl);
    expect(text).toContain("15 minutes");
    expect(text).not.toContain("<");
  });
});

describe("createResendSender", () => {
  it("sends the rendered HTML and text with the blueprint subject", async () => {
    resend.send.mockResolvedValue({ data: { id: "email_1" }, error: null, headers: null });

    await createResendSender(CONFIG).sendPasswordReset(MESSAGE);

    expect(resend.apiKeys).toEqual(["re_test_key"]);
    expect(resend.send).toHaveBeenCalledOnce();
    expect(resend.send).toHaveBeenCalledWith({
      from: CONFIG.from,
      to: MESSAGE.to,
      subject: "Reset your Sprout password",
      html: await renderEmail(),
      text: await renderEmail({ plainText: true }),
    });
  });

  it("throws when Resend returns an error, without the address or link in the message", async () => {
    resend.send.mockResolvedValue({
      data: null,
      error: {
        name: "validation_error",
        statusCode: 403,
        message: "You can only send testing emails to your own email address (alex@sprout.test).",
      },
      headers: null,
    });

    const error = await createResendSender(CONFIG)
      .sendPasswordReset(MESSAGE)
      .then(
        () => null,
        (err: unknown) => err,
      );

    expect(error).toBeInstanceOf(Error);
    // Exactly this: nothing from Resend's message, which quotes an address.
    expect((error as Error).message).toBe(
      "Resend rejected the password reset email: validation_error (status 403)",
    );
  });
});
