"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { Button } from "./ui/Button";
import { useToast } from "./ui/Toast";

/**
 * Ends the session, then loads `/` as a full page rather than a client navigation: that drops the
 * client router cache and every RSC payload that still holds the signed-in user. The label stays
 * put while pending so the header doesn't shift.
 */
export function SignOutButton() {
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      await apiFetch("/api/auth/signout", { method: "POST" });
    } catch {
      toast.show("Couldn't sign out. Please try again.", "error");
      setPending(false);
      return;
    }
    // Deliberately not router.push: a client navigation would keep the cached signed-in payloads.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
  }

  return (
    <Button variant="ghost" size="sm" className="rounded-full" disabled={pending} onClick={signOut}>
      Sign out
    </Button>
  );
}
