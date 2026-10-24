import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { SessionProvider } from "@/components/SessionProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { getCurrentUser } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Sprout", template: "%s · Sprout" },
  description:
    "Sprout is an indie app store: discover, download and review apps from independent developers.",
  icons: { icon: "/sprout.png", apple: "/sprout.png" },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reads the session cookie, so every page renders per request (Cache Components is off).
  const user = await getCurrentUser();
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-surface text-ink">
        <SessionProvider user={user}>
          <ToastProvider>
            <Header user={user} />
            <main className="flex-1">{children}</main>
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
