import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

/**
 * `appUrl` is passed in rather than read from `src/config/env.ts`: `npm run email:dev` loads this
 * file without the backend env, and env.ts exits the process when variables are missing. Keep
 * this file free of relative imports for the same reason.
 */
export interface PasswordResetEmailProps {
  username: string;
  /** `${APP_URL}/reset-password?token=…`. It carries the raw token. */
  resetUrl: string;
  /** Frontend origin, for the logo at `${appUrl}/sprout.png`. */
  appUrl: string;
}

// §0 Brand identity as inline hex: email clients ignore CSS variables.
const brand = "#22C55E";
const ink = "#0F172A";
const muted = "#64748B";
const surface = "#F8FAFC";
const green700 = "#15803D"; // link text: brand itself is too light for text on surface
const slate200 = "#E2E8F0"; // hairline, same hue as muted

const fontFamily =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export default function PasswordResetEmail({
  username,
  resetUrl,
  appUrl,
}: PasswordResetEmailProps) {
  return (
    <Html lang="en" dir="ltr">
      <Head>
        {/* Opt out of forced dark mode: the palette's contrast is only checked on a light surface. */}
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>Choose a new password. This link expires in 15 minutes.</Preview>
      <Body style={body}>
        <Container style={container}>
          <Img src={`${appUrl}/sprout.png`} width={48} height={48} alt="Sprout" style={logo} />
          <Heading as="h1" style={heading}>
            Reset your password
          </Heading>
          {/* One text node: `Hi {username},` would render as three, split by <!-- --> comments. */}
          <Text style={paragraph}>{`Hi ${username},`}</Text>
          <Text style={paragraph}>
            We received a request to reset the password for your Sprout account. Choose a new one
            with the button below.
          </Text>
          <Section style={buttonRow}>
            <Button href={resetUrl} style={button}>
              Reset password
            </Button>
          </Section>
          <Text style={secondary}>This link expires in 15 minutes and can only be used once.</Text>
          <Text style={secondary}>
            Button not working? Paste this link into your browser:
            <br />
            <Link href={resetUrl} style={fallbackLink}>
              {resetUrl}
            </Link>
          </Text>
          <Hr style={divider} />
          <Text style={footnote}>
            If you didn’t request a password reset, you can ignore this email. Your password won’t
            change.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

PasswordResetEmail.PreviewProps = {
  username: "alex",
  resetUrl:
    "http://localhost:3000/reset-password?token=9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  appUrl: "http://localhost:3000",
} satisfies PasswordResetEmailProps;

const body = {
  backgroundColor: surface,
  color: ink,
  fontFamily,
  margin: "0",
  padding: "0",
};

const container = {
  maxWidth: "480px",
  margin: "0 auto",
  padding: "48px 24px",
};

const logo = {
  display: "block",
  margin: "0 0 32px",
};

const heading = {
  color: ink,
  fontSize: "24px",
  fontWeight: "600",
  letterSpacing: "-0.01em",
  lineHeight: "32px",
  margin: "0 0 24px",
};

const paragraph = {
  color: ink,
  fontSize: "16px",
  lineHeight: "26px",
  margin: "0 0 16px",
};

const buttonRow = {
  margin: "8px 0 32px",
};

// 48px tall: a comfortable tap target. Ink on brand is 7.8:1; white on brand would be 2.3:1.
const button = {
  backgroundColor: brand,
  borderRadius: "8px",
  color: ink,
  display: "inline-block",
  fontSize: "16px",
  fontWeight: "600",
  lineHeight: "24px",
  padding: "12px 24px",
  textDecoration: "none",
};

const secondary = {
  color: muted,
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 16px",
};

// The 64-character token has no break points: let it wrap instead of widening the email.
const fallbackLink = {
  color: green700,
  overflowWrap: "anywhere" as const,
  textDecoration: "underline",
  wordBreak: "break-all" as const,
};

const divider = {
  border: "none",
  borderTop: `1px solid ${slate200}`,
  margin: "32px 0 24px",
};

const footnote = {
  color: muted,
  fontSize: "13px",
  lineHeight: "20px",
  margin: "0",
};
