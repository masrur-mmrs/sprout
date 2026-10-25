"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/lib/cx";

/** Long enough to cover the signed-URL redirect, short enough to be over before the next click. */
const HOLD_MS = 1200;

/**
 * Downloads an app. A plain link, never next/link: a prefetch would count a download (INV-3), so
 * nothing but the click may request it. The click only sets state, so the browser's own navigation
 * runs untouched; meanwhile the link dims, on its own transition, to say the download is starting.
 */
export function DownloadLink({
  appId,
  className,
  children,
}: {
  appId: number;
  className: string;
  children: ReactNode;
}) {
  const [starting, setStarting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function onClick() {
    setStarting(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStarting(false), HOLD_MS);
  }

  return (
    <a
      href={`/api/apps/${appId}/download`}
      rel="nofollow"
      data-starting={starting || undefined}
      onClick={onClick}
      className={cx(className, "data-starting:opacity-70")}
    >
      {children}
    </a>
  );
}
