"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { FormAlert, toFormErrors } from "@/components/form";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ApiError, apiFetch } from "@/lib/api/client";

/**
 * Deletes an app through an inline two-step confirm: no modal, no `window.confirm`. Focus goes to
 * Keep it, the safe choice, and back to Delete app if the app is kept. Button has no danger
 * variant, so the red is on the label: red-700 is 6.2:1 on surface.
 */
export function DeleteApp({ appId, title }: { appId: number; title: string }) {
  const router = useRouter();
  const toast = useToast();
  const id = useId();
  const alertRef = useRef<HTMLDivElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // `pending` lands a render later; this blocks a second request fired before it does.
  const inFlight = useRef(false);

  function confirmDelete(open: boolean) {
    flushSync(() => setConfirming(open));
    (open ? keepRef : deleteRef).current?.focus();
  }

  async function remove() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setMessage(null);
    try {
      await apiFetch(`/api/apps/${appId}`, { method: "DELETE" });
    } catch (err) {
      // 404: already gone (deleted in another tab), which is what was asked for.
      if (!(err instanceof ApiError && err.status === 404)) {
        inFlight.current = false;
        flushSync(() => {
          setPending(false);
          setConfirming(false);
          setMessage(toFormErrors(err, []).message);
        });
        alertRef.current?.focus();
        return;
      }
    }
    // Stays locked until the dashboard replaces this page.
    toast.show("App deleted.", "success");
    router.push("/dashboard");
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="mt-12 border-t border-slate-200 pt-8">
      <h2 id={`${id}-heading`} className="text-xl font-semibold">
        Delete app
      </h2>
      <p className="mt-1 text-muted">
        It leaves the store at once, with its reviews and files. This can’t be undone.
      </p>
      <div className="mt-5">
        <FormAlert ref={alertRef} message={message} />
        {confirming ? (
          <div
            role="group"
            aria-labelledby={`${id}-confirm`}
            className="flex flex-col items-start gap-3 sm:flex-row sm:items-center"
          >
            <span id={`${id}-confirm`} className="text-ink wrap-anywhere">
              Delete {title}? Its reviews and files go too.
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={pending} onClick={remove}>
                <span className="text-red-700">{pending ? "Deleting…" : "Delete"}</span>
              </Button>
              <Button
                ref={keepRef}
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => confirmDelete(false)}
              >
                Keep it
              </Button>
            </div>
          </div>
        ) : (
          <Button ref={deleteRef} variant="secondary" onClick={() => confirmDelete(true)}>
            <span className="text-red-700">Delete app</span>
          </Button>
        )}
      </div>
    </section>
  );
}
