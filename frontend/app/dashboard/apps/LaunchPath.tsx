"use client";

import Image from "next/image";
import { useRef, type ReactNode, type RefObject } from "react";
import { Confetti, FormIcon } from "@/components/store/art";
import { AnimatedBeam } from "@/components/ui/animated-beam";
import type { UploadKind } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import type { UploadSlot } from "./FileField";

/** One leg of the path: nothing yet, in place, carrying data, arrived, or stopped. */
type Leg = "idle" | "ready" | "flowing" | "done" | "failed";

/** Where the form is: filling in, uploading, saving, or saved with the dashboard on its way. */
export type LaunchStage = "upload" | "save" | "published" | null;

export interface LaunchPathProps {
  slots: Record<UploadKind, UploadSlot>;
  /** What's in place: the details pass, and each file is valid (or, in an edit, kept). */
  ready: { details: boolean; binary: boolean; icon: boolean };
  stage: LaunchStage;
  /** An edit: no file is required and the last step saves. */
  editing: boolean;
  /** The app as the store will show it, at the end of the path. */
  listing: ReactNode;
}

// The node behind each leg. Done fills with brand (ink on it is 7.8:1); red-700 is the one error red.
const NODE: Record<Leg, string> = {
  idle: "border-dashed border-slate-300 bg-surface text-slate-500",
  ready: "border-green-300 bg-green-50 text-green-700",
  flowing: "border-slate-200 bg-surface text-green-700",
  done: "border-brand bg-brand text-ink",
  failed: "border-red-700 bg-red-50 text-red-700",
};

// The beam's own path. It's a faint track while the beam travels it, and solid once it's arrived.
const PATH: Record<Leg, { color: string; opacity: number }> = {
  idle: { color: "var(--color-muted)", opacity: 0.35 },
  ready: { color: "var(--color-brand)", opacity: 0.5 },
  flowing: { color: "var(--color-muted)", opacity: 0.2 },
  done: { color: "var(--color-brand)", opacity: 1 },
  failed: { color: "var(--color-red-700)", opacity: 0.6 },
};

function fileLeg({ status }: UploadSlot, ready: boolean): Leg {
  if (status === "uploading") return "flowing";
  if (status === "done") return "done";
  if (status === "failed") return "failed";
  return ready ? "ready" : "idle";
}

/** The share of the batch's bytes that have gone out, weighted by each file's size. */
function sent(slots: UploadSlot[]): number {
  const moving = slots.filter((slot) => slot.file && slot.status !== "idle");
  const total = moving.reduce((sum, slot) => sum + slot.file!.size, 0);
  if (total === 0) return 0;
  return moving.reduce((sum, slot) => sum + slot.file!.size * slot.progress, 0) / total;
}

/**
 * One leg. Every beam sweeps the whole drawing on the same clock, at an even pace, and the legs
 * that carry data together start together (both uploads; then the details and the listing), so
 * they read as one wave: into Sprout while the files go up, and on through it to the store while
 * the app is listed.
 */
function Beam({
  leg,
  container,
  from,
  to,
}: {
  leg: Leg;
  container: RefObject<HTMLDivElement | null>;
  from: RefObject<HTMLSpanElement | null>;
  to: RefObject<HTMLSpanElement | null>;
}) {
  const { color, opacity } = PATH[leg];
  return (
    <AnimatedBeam
      containerRef={container}
      fromRef={from}
      toRef={to}
      flowing={leg === "flowing"}
      pathColor={color}
      pathOpacity={opacity}
      pathWidth={leg === "done" || leg === "flowing" ? 3 : 2}
      gradientStartColor="var(--color-brand)"
      gradientStopColor="var(--color-accent)"
      duration={1.8}
      ease="linear"
      // Not yet in place: a dashed line, like the empty drop zones it leads from.
      className={cx(leg === "idle" && "[&_path:first-child]:[stroke-dasharray:4_7]")}
    />
  );
}

/** A glyph in a circle: a file's ring fills as it uploads, then the glyph swaps for a check. */
function Node({
  ref,
  leg,
  glyph,
  name,
  note,
  progress,
}: {
  ref: RefObject<HTMLSpanElement | null>;
  leg: Leg;
  glyph: "details" | "binary" | "icon";
  name: string;
  note: string;
  progress?: number;
}) {
  const ring = progress !== undefined && (leg === "flowing" || leg === "failed");
  const shown = leg === "done" ? "check" : leg === "failed" ? "alert" : glyph;
  return (
    <div className="flex flex-col items-center gap-1 sm:flex-row-reverse sm:gap-3">
      <span
        ref={ref}
        className={cx(
          "relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full border-2",
          "transition-[background-color,border-color,color] duration-(--duration-fast) ease-out",
          // Sending without a ring (the details) keeps its green edge; the ring's track is gray.
          NODE[leg === "flowing" && !ring ? "ready" : leg],
        )}
      >
        {ring && (
          <svg viewBox="0 0 44 44" className="absolute -inset-0.5 -rotate-90">
            <circle
              cx="22"
              cy="22"
              r="20"
              pathLength={100}
              strokeDasharray="100"
              strokeDashoffset={100 - Math.round(progress * 100)}
              strokeWidth="3"
              strokeLinecap="round"
              className={cx(
                "fill-none",
                leg === "failed" ? "stroke-red-700" : "stroke-green-600",
                "motion-safe:transition-[stroke-dashoffset] motion-safe:duration-(--duration-fast) motion-safe:ease-out",
              )}
            />
          </svg>
        )}
        {/* Keyed, so arriving at a check or an alert pops it in, from the node's center. */}
        <span
          key={shown}
          className={cx(
            "flex transition-[opacity,scale] duration-(--duration-spring) ease-(--ease-spring)",
            "starting:opacity-0 motion-safe:starting:scale-50",
          )}
        >
          <FormIcon name={shown} />
        </span>
      </span>
      <span className="text-center sm:w-20 sm:text-right">
        <span className="block text-xs font-semibold text-ink sm:text-sm">{name}</span>
        <span className="hidden text-xs text-slate-600 tabular-nums sm:block">{note}</span>
      </span>
    </div>
  );
}

/**
 * The publish, drawn as a path: the details, the binary and the icon feed into Sprout, which lists
 * the app in the store. Each leg lights up as its piece is in place, a beam travels it while that
 * piece is on its way (an upload, or the save), and it turns solid green when it gets there. A
 * failed upload turns its leg red.
 *
 * The drawing is decorative: each file's field already announces its upload, and the button says
 * what's happening. The line under it says the same thing in words for sighted users, who can
 * see it, so it isn't a live region. Under reduced motion no beam travels; the colors still change.
 */
export function LaunchPath({ slots, ready, stage, editing, listing }: LaunchPathProps) {
  const container = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLSpanElement>(null);
  const binaryRef = useRef<HTMLSpanElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const hubRef = useRef<HTMLSpanElement>(null);
  const storeRef = useRef<HTMLSpanElement>(null);

  const binary = fileLeg(slots.binary, ready.binary);
  const icon = fileLeg(slots.icon, ready.icon);
  const details: Leg =
    stage === "published"
      ? "done"
      : stage === "save"
        ? "flowing"
        : ready.details
          ? "ready"
          : "idle";
  const failed = binary === "failed" || icon === "failed";
  // A chosen icon that's invalid holds the publish back, like a missing binary.
  const iconOk = !slots.icon.file || ready.icon;
  const publish: Leg =
    stage === "published"
      ? "done"
      : stage === "save"
        ? "flowing"
        : ready.details && ready.binary && iconOk && !failed
          ? "ready"
          : "idle";

  const fileNote = (leg: Leg, slot: UploadSlot, required: boolean) => {
    if (leg === "flowing") return `${Math.round(slot.progress * 100)}%`;
    if (leg === "done") return "Done";
    if (leg === "failed") return "Stopped";
    if (leg === "ready") return slot.file ? "Ready" : "Current";
    return required ? "Needed" : "Optional";
  };

  const verb = editing ? "save" : "publish";
  let status: string;
  if (stage === "published") {
    status = editing
      ? "Saved. Taking you to your dashboard…"
      : "Planted! Taking you to your dashboard…";
  } else if (stage === "save") {
    status = editing ? "Saving your changes…" : "Listing your app on Sprout…";
  } else if (binary === "flowing" || icon === "flowing") {
    status = `Uploading your files… ${Math.round(sent([slots.binary, slots.icon]) * 100)}%`;
  } else if (failed) {
    status = `An upload stopped. Retry it, then ${verb} again.`;
  } else if (publish === "ready") {
    status = editing ? "Ready when you are." : "All set. Publish when you’re ready.";
  } else if (!ready.details && !ready.binary) {
    status = "Fill in the details and add your binary to get going.";
  } else if (!ready.details) {
    status = `Finish the details to ${verb}.`;
  } else if (!ready.binary) {
    status = "Add your binary to publish.";
  } else {
    status = `Swap the icon for a valid image, or leave it out, to ${verb}.`;
  }

  return (
    <div>
      <div
        ref={container}
        aria-hidden="true"
        className="relative flex items-center justify-between gap-4 pb-6"
      >
        <div className="flex flex-col gap-3 sm:gap-4">
          <Node
            ref={detailsRef}
            leg={details}
            glyph="details"
            name="Details"
            note={
              details === "done"
                ? "Done"
                : details === "flowing"
                  ? "Sending"
                  : details === "ready"
                    ? "Ready"
                    : "To do"
            }
          />
          <Node
            ref={binaryRef}
            leg={binary}
            glyph="binary"
            name="Binary"
            note={fileNote(binary, slots.binary, !editing)}
            progress={slots.binary.progress}
          />
          <Node
            ref={iconRef}
            leg={icon}
            glyph="icon"
            name="Icon"
            note={fileNote(icon, slots.icon, false)}
            progress={slots.icon.progress}
          />
        </div>

        {/* Sprout, where every piece lands. It rings green while something is on its way. */}
        <span className="relative">
          <span
            ref={hubRef}
            className={cx(
              "relative z-10 flex size-16 items-center justify-center rounded-full shadow-card",
              "transition-[box-shadow,background-color] duration-(--duration-fast) ease-out",
              binary === "flowing" || icon === "flowing" || stage === "save"
                ? "ring-4 ring-green-200"
                : "ring-1 ring-ink/5",
              stage === "published" ? "bg-green-100" : "bg-surface",
            )}
          >
            <Image src="/sprout.png" alt="" width={36} height={36} />
          </span>
          <span className="absolute top-full left-1/2 mt-1.5 -translate-x-1/2 text-xs font-semibold text-ink sm:text-sm">
            Sprout
          </span>
        </span>

        {/* The store: the listing waits in gray, and comes alive with confetti once it's live. */}
        <span className="relative">
          {stage === "published" && (
            <Confetti
              className={cx(
                "absolute -inset-8 h-[calc(100%+4rem)] w-[calc(100%+4rem)]",
                "transition-[opacity,scale] duration-(--duration-spring) ease-(--ease-spring)",
                "starting:opacity-0 motion-safe:starting:scale-50",
              )}
            />
          )}
          <span
            ref={storeRef}
            className={cx(
              "relative z-10 flex rounded-[26%] bg-surface p-1 shadow-card ring-1 ring-ink/5",
              "transition-[filter,opacity,scale] duration-(--duration-spring) ease-(--ease-spring)",
              stage === "published"
                ? "motion-safe:scale-110"
                : publish === "ready" || publish === "flowing"
                  ? "opacity-90"
                  : "opacity-60 grayscale",
            )}
          >
            {listing}
          </span>
          <span className="absolute top-full left-1/2 mt-1.5 -translate-x-1/2 text-xs font-semibold whitespace-nowrap text-ink sm:text-sm">
            {stage === "published" ? (editing ? "Updated" : "Live!") : "Store"}
          </span>
        </span>

        <Beam leg={details} container={container} from={detailsRef} to={hubRef} />
        <Beam leg={binary} container={container} from={binaryRef} to={hubRef} />
        <Beam leg={icon} container={container} from={iconRef} to={hubRef} />
        <Beam leg={publish} container={container} from={hubRef} to={storeRef} />
      </div>
      <p className="mt-4 text-sm text-slate-700 tabular-nums">{status}</p>
    </div>
  );
}
