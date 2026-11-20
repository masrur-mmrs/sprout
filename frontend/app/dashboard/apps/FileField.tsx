"use client";

import { useId, useState, type ReactNode } from "react";
import { FormIcon } from "@/components/store/art";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { cx } from "@/lib/cx";
import { formatBytes } from "@/lib/format";

/**
 * One file's place in the app form. It holds the key the upload produced, never the signed URL
 * that produced it, so the URL can't reach the DOM.
 */
export interface UploadSlot {
  file: File | null;
  /** An object URL of a valid icon, for its preview. */
  preview: string | null;
  key: string | null;
  status: "idle" | "uploading" | "done" | "failed";
  /** 0–1. */
  progress: number;
}

export const EMPTY_SLOT: UploadSlot = {
  file: null,
  preview: null,
  key: null,
  status: "idle",
  progress: 0,
};

const STATUS = {
  uploading: { text: "Uploading", announce: "started", className: "text-muted" },
  done: { text: "Uploaded", announce: "finished", className: "text-green-700" },
  // red-700 is 6.2:1 on surface.
  failed: { text: "Failed", announce: "failed", className: "text-red-700" },
};

export interface FileFieldProps {
  name: string;
  label: string;
  /** The drop zone's headline, e.g. "Drop your build here". */
  prompt: string;
  /** A hint for the file picker only; the form validates the file itself. */
  accept: string;
  hint: string;
  /** The progress bar's accessible name, e.g. "Binary upload". */
  progressLabel: string;
  slot: UploadSlot;
  errors?: string[];
  /** Icons: show the chosen image, or `current` (the icon an edit starts from). */
  image?: boolean;
  current?: ReactNode;
  onChoose: (file: File | null) => void;
  onRetry: () => void;
}

/**
 * A drop zone, the chosen file's name and size, and once it uploads, its progress, then Uploaded,
 * or Failed with Retry. Controlled by the form, which owns the uploads. The zone is a native file
 * input stretched over it and made transparent: a click anywhere opens the platform's picker, a
 * file dropped on it lands in the input natively (the same change event as a pick, so the same
 * checks), and the keyboard works as the platform's does. The zone wears the input's focus ring,
 * presses in on pointer-down, and tints while a file is dragged over it. The file's card, its
 * status and an error fade in and settle as they appear, the way Field's messages do.
 */
export function FileField({
  name,
  label,
  prompt,
  accept,
  hint,
  progressLabel,
  slot,
  errors,
  image = false,
  current,
  onChoose,
  onRetry,
}: FileFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const invalid = errors !== undefined && errors.length > 0;
  const { file, preview, status, progress } = slot;
  const shown = status === "idle" ? null : STATUS[status];
  const [dragging, setDragging] = useState(false);

  // Icons show the chosen image, then the current one; binaries a package. All decorative.
  let thumb: ReactNode;
  if (image && preview) {
    thumb = (
      // A blob: URL of the chosen file. next/image can't take one.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={preview}
        alt=""
        width={56}
        height={56}
        className="size-14 shrink-0 rounded-[22.5%] bg-slate-100 object-cover ring-1 ring-ink/5"
      />
    );
  } else if (image && current) {
    thumb = current;
  } else {
    thumb = (
      <span
        aria-hidden="true"
        className={cx(
          "flex size-14 shrink-0 items-center justify-center",
          image
            ? "rounded-[22.5%] bg-cyan-100 text-cyan-800"
            : "rounded-2xl bg-green-100 text-green-800",
        )}
      >
        <FormIcon name={image ? "icon" : "binary"} className="size-6" />
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <div
        className={cx(
          "group relative flex items-center gap-4 rounded-2xl border-2 border-dashed p-4",
          "transition-[background-color,border-color,scale] duration-(--duration-press) ease-out",
          "has-[input:disabled]:opacity-50 motion-safe:has-[input:enabled:active]:scale-[0.99]",
          "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-green-700",
          dragging
            ? "border-green-600 bg-green-50"
            : invalid
              ? "border-red-700/50 bg-red-50/60"
              : "border-slate-300 bg-linear-to-br from-surface to-green-50 hover:border-green-500",
        )}
      >
        {thumb}
        {/* What the zone does, for the eye: the input itself is named by its label. */}
        <span aria-hidden="true" className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">{dragging ? "Drop it here" : prompt}</span>
          <span className="mt-0.5 block text-sm text-muted">
            {file ? "Or click to choose a different one." : "Or click to browse your files."}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="hidden h-9 shrink-0 items-center rounded-full bg-ink px-4 text-sm font-semibold text-surface group-hover:bg-slate-700 sm:inline-flex"
        >
          {file ? "Change" : "Browse"}
        </span>
        <input
          id={id}
          type="file"
          name={name}
          accept={accept}
          aria-invalid={invalid || undefined}
          aria-describedby={[hintId, invalid && errorId].filter(Boolean).join(" ")}
          onChange={(event) => onChoose(event.currentTarget.files?.[0] ?? null)}
          onDragEnter={(event) => setDragging(!event.currentTarget.disabled)}
          onDragLeave={() => setDragging(false)}
          onDrop={() => setDragging(false)}
          className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
      </div>
      <p id={hintId} className="text-sm text-muted">
        {hint}
      </p>

      {file && (
        <div
          className={cx(
            "mt-1 rounded-2xl bg-surface px-4 py-3 shadow-card ring-1 ring-ink/5",
            "transition-[opacity,translate] duration-(--duration-fast) ease-out",
            "starting:opacity-0 motion-safe:starting:-translate-y-1",
          )}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="min-w-0 text-sm font-medium text-ink wrap-anywhere">{file.name}</span>
            <span className="text-sm text-muted tabular-nums">{formatBytes(file.size)}</span>
          </div>
          {shown && (
            <div
              className={cx(
                "mt-2 flex items-center gap-3",
                "transition-[opacity,translate] duration-(--duration-fast) ease-out",
                "starting:opacity-0 motion-safe:starting:-translate-y-1",
              )}
            >
              <span className={cx("w-18 shrink-0 text-sm font-medium", shown.className)}>
                {shown.text}
              </span>
              <ProgressBar
                label={progressLabel}
                value={progress}
                tone={status === "failed" ? "error" : "default"}
                className="min-w-0 flex-1"
              />
              {status === "failed" && (
                <Button variant="secondary" size="sm" onClick={onRetry}>
                  Retry<span className="sr-only"> {progressLabel.toLowerCase()}</span>
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      {/* Always mounted, so a screen reader is already listening when the status changes. */}
      <span aria-live="polite" className="sr-only">
        {shown ? `${progressLabel} ${shown.announce}` : ""}
      </span>

      {invalid && (
        <p
          id={errorId}
          className={cx(
            "text-sm text-red-700",
            "transition-[opacity,translate] duration-(--duration-fast) ease-out",
            "starting:opacity-0 motion-safe:starting:-translate-y-1",
          )}
        >
          {errors.join(" ")}
        </p>
      )}
    </div>
  );
}
