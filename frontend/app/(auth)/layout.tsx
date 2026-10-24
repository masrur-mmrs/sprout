import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

/** The auth pages share one narrow, centered column; each page brings its own h1. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-12 sm:py-20">
      <Card className="mx-auto max-w-sm sm:p-8">{children}</Card>
    </div>
  );
}
