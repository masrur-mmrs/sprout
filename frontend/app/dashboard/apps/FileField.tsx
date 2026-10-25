"use client";

import { useId, type ReactNode } from "react";
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
 * A native file input (no drag-and-drop), the chosen file's name and size, and once it uploads,
 * its progress, then Uploaded, or Failed with Retry. Controlled by the form, which owns the
 * uploads. The input keeps the platform's own picker and keyboard behavior; `file:` styles its
 * button like a secondary Button.
 */
export function FileField({
  name,
  label,
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

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <div className="flex items-center gap-4">
        {image &&
          (preview ? (
            // A blob: URL of the chosen file. next/image can't take one.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt=""
              width={56}
              height={56}
              className="size-14 shrink-0 rounded-[22.5%] bg-slate-100 object-cover ring-1 ring-ink/5"
            />
          ) : (
            (current ?? (
              <span
                aria-hidden="true"
                className="size-14 shrink-0 rounded-[22.5%] border border-dashed border-slate-300"
              />
            ))
          ))}
        <input
          id={id}
          type="file"
          name={name}
          accept={accept}
          aria-invalid={invalid || undefined}
          aria-describedby={[hintId, invalid && errorId].filter(Boolean).join(" ")}
          onChange={(event) => onChoose(event.currentTarget.files?.[0] ?? null)}
          className={cx(
            "focus-ring block w-full min-w-0 rounded-control text-sm text-muted",
            "file:mr-3 file:h-9 file:cursor-pointer file:rounded-control file:border file:border-slate-300 file:bg-surface file:px-3.5 file:text-sm file:font-semibold file:text-ink",
            "file:transition-colors file:duration-(--duration-fast) hover:file:bg-slate-100 aria-invalid:file:border-red-700",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:file:cursor-not-allowed",
          )}
        />
      </div>
      <p id={hintId} className="text-sm text-muted">
        {hint}
      </p>

      {file && (
        <div className="mt-1 rounded-control border border-slate-200 px-3.5 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="min-w-0 text-sm font-medium text-ink wrap-anywhere">{file.name}</span>
            <span className="text-sm text-muted tabular-nums">{formatBytes(file.size)}</span>
          </div>
          {shown && (
            <div className="mt-2 flex items-center gap-3">
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
        <p id={errorId} className="text-sm text-red-700">
          {errors.join(" ")}
        </p>
      )}
    </div>
  );
}
