"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { FormAlert, toFormErrors, type FieldErrors } from "@/components/form";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StarInput } from "@/components/ui/StarInput";
import { TextareaField } from "@/components/ui/Textarea";
import { TextLink } from "@/components/ui/TextLink";
import { useToast } from "@/components/ui/Toast";
import { ApiError, apiFetch } from "@/lib/api/client";
import { MAX_COMMENT_LENGTH, type PutReviewBody, type Review } from "@/lib/api/types";
import { withNext } from "@/lib/safe-next";

const FIELDS = ["rating", "comment"] as const;
type ReviewField = (typeof FIELDS)[number];

/**
 * Write, edit or delete the viewer's one review of an app (INV-2: the PUT is an upsert). Starts
 * from `mine` and follows it: after a save or delete, router.refresh() re-renders the page, and a
 * new `mine` (an edit resets `created_at`) resets the inputs. Shown only to a signed-in viewer who
 * isn't the app's developer; the backend still decides (401, 403).
 */
export function ReviewForm({ appId, mine }: { appId: number; mine: Review | null }) {
  const router = useRouter();
  const toast = useToast();
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const starsRef = useRef<HTMLDivElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);

  const [rating, setRating] = useState<number | null>(mine?.rating ?? null);
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [errors, setErrors] = useState<FieldErrors<ReviewField>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [pending, setPending] = useState<"save" | "delete" | null>(null);
  const [confirming, setConfirming] = useState(false);
  // `pending` lands a render later; this blocks a second request fired before it does.
  const inFlight = useRef(false);

  // The refreshed page brought a different review (or none): start from it.
  const version = mine?.created_at ?? null;
  const [shownVersion, setShownVersion] = useState(version);
  if (version !== shownVersion) {
    setShownVersion(version);
    setRating(mine?.rating ?? null);
    setComment(mine?.comment ?? "");
    setConfirming(false);
  }

  const self = `/apps/${appId}`;
  const ratingLabelId = `${id}-rating-label`;
  const ratingErrorId = `${id}-rating-error`;

  /** Shows a failure and moves focus to the first invalid control, or else to the alert. */
  function show(found: FieldErrors<ReviewField>, formMessage: string | null, needsSignIn = false) {
    // Commit first, so the control is already described by its error when focus lands on it.
    flushSync(() => {
      setErrors(found);
      setMessage(formMessage);
      setSignedOut(needsSignIn);
    });
    // Not form.elements.namedItem: for radios that's a RadioNodeList, not an element.
    const radios = starsRef.current?.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    const target = found.rating?.length
      ? (Array.from(radios ?? []).find((radio) => radio.checked) ?? radios?.[0])
      : found.comment?.length
        ? formRef.current?.querySelector("textarea")
        : formMessage && alertRef.current;
    if (target) target.focus();
  }

  /** 401: signed out since the page loaded, so say so and offer the way back. */
  function fail(err: unknown) {
    if (err instanceof ApiError && err.status === 401) return show({}, err.message, true);
    const mapped = toFormErrors(err, FIELDS);
    show(mapped.errors, mapped.message);
  }

  function start(kind: "save" | "delete") {
    inFlight.current = true;
    setPending(kind);
    setErrors({});
    setMessage(null);
    setSignedOut(false);
  }

  /** Done: re-enable the form, put focus back where the request left it, re-render the page. */
  function finish(toastMessage: string) {
    inFlight.current = false;
    flushSync(() => {
      setPending(null);
      setConfirming(false);
    });
    // The pressed button was disabled (or removed) meanwhile, which drops focus to the page.
    if (!document.activeElement || document.activeElement === document.body) {
      submitRef.current?.focus();
    }
    toast.show(toastMessage, "success");
    router.refresh();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    if (rating === null) return show({ rating: ["Choose a rating."] }, null);

    start("save");
    const body: PutReviewBody = { rating, comment: comment.trim() || null };
    try {
      await apiFetch<Review>(`/api/apps/${appId}/reviews`, { method: "PUT", body });
    } catch (err) {
      inFlight.current = false;
      setPending(null);
      return fail(err);
    }
    finish(mine ? "Review updated." : "Review posted.");
  }

  async function remove() {
    if (inFlight.current) return;
    start("delete");
    try {
      await apiFetch(`/api/apps/${appId}/reviews`, { method: "DELETE" });
    } catch (err) {
      // 404: already gone (deleted in another tab), which is what was asked for.
      if (!(err instanceof ApiError && err.status === 404)) {
        inFlight.current = false;
        setPending(null);
        setConfirming(false);
        return fail(err);
      }
    }
    finish("Review deleted.");
  }

  /** The inline confirm: focus goes to the safe choice, and back to Delete review if kept. */
  function confirmDelete(open: boolean) {
    flushSync(() => setConfirming(open));
    (open ? keepRef : deleteRef).current?.focus();
  }

  const busy = pending !== null;

  return (
    <Card className="sm:p-6">
      <h3 className="text-lg font-semibold">{mine ? "Edit your review" : "Write a review"}</h3>
      <form ref={formRef} method="post" noValidate onSubmit={save} className="mt-4">
        <FormAlert ref={alertRef} message={message} />
        {signedOut && (
          <p className="-mt-3 mb-5 text-sm">
            <TextLink href={withNext("/sign-in", self)}>Sign in again</TextLink> to keep your
            review.
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <span id={ratingLabelId} className="text-sm font-medium text-ink">
            Your rating
          </span>
          <StarInput
            ref={starsRef}
            name="rating"
            value={rating}
            onChange={(next) => {
              setRating(next);
              setErrors((all) => ({ ...all, rating: undefined }));
            }}
            labelledBy={ratingLabelId}
            describedBy={errors.rating?.length ? ratingErrorId : undefined}
            invalid={Boolean(errors.rating?.length)}
          />
          {errors.rating?.length ? (
            <p id={ratingErrorId} className="text-sm text-red-700">
              {errors.rating.join(" ")}
            </p>
          ) : null}
        </div>

        <div className="mt-5">
          <TextareaField
            label="Comment"
            name="comment"
            value={comment}
            onChange={(event) => {
              setComment(event.currentTarget.value);
              setErrors((all) => ({ ...all, comment: undefined }));
            }}
            maxLength={MAX_COMMENT_LENGTH}
            rows={4}
            hint="Optional, up to 2,000 characters"
            errors={errors.comment}
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button ref={submitRef} type="submit" disabled={busy}>
            {pending === "save" ? "Saving…" : mine ? "Update review" : "Post review"}
          </Button>
          {mine &&
            (confirming ? (
              <div
                role="group"
                aria-labelledby={`${id}-confirm`}
                className="flex items-center gap-2"
              >
                <span id={`${id}-confirm`} className="text-sm text-ink">
                  Delete your review?
                </span>
                <Button variant="secondary" size="sm" disabled={busy} onClick={remove}>
                  {pending === "delete" ? "Deleting…" : "Delete"}
                </Button>
                <Button
                  ref={keepRef}
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => confirmDelete(false)}
                >
                  Keep it
                </Button>
              </div>
            ) : (
              <Button
                ref={deleteRef}
                variant="ghost"
                disabled={busy}
                onClick={() => confirmDelete(true)}
              >
                Delete review
              </Button>
            ))}
        </div>
      </form>
    </Card>
  );
}
