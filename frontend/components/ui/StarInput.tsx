"use client";

import { useState, type Ref } from "react";
import { cx } from "@/lib/cx";

const STAR_PATH =
  "M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55L2.48 9.42l6.58-.96z";

const RATINGS = [1, 2, 3, 4, 5];

export interface StarInputProps {
  name: string;
  value: number | null;
  onChange: (value: number) => void;
  /** The id of the visible label ("Your rating"), which names the group. */
  labelledBy: string;
  describedBy?: string;
  invalid?: boolean;
  /** The group's element, e.g. to find its radios. */
  ref?: Ref<HTMLDivElement>;
}

/**
 * A 1–5 star rating input. Five native radios, visually hidden, each labelled "1 star" … "5 stars"
 * by its star: the browser supplies one tab stop, arrow keys, Space and form data, with no key
 * handling here. The focused star gets the focus ring. A mouse previews a rating on hover (not
 * touch, where hover would stick); filled stars are green-600 (3.1:1), empty ones a muted outline
 * (4.6:1), so both states pass the 3:1 non-text minimum.
 */
export function StarInput({
  name,
  value,
  onChange,
  labelledBy,
  describedBy,
  invalid,
  ref,
}: StarInputProps) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      aria-required="true"
      className="-ml-1 flex"
      onPointerLeave={() => setHover(null)}
    >
      {RATINGS.map((rating) => (
        <label
          key={rating}
          onPointerEnter={(event) => setHover(event.pointerType === "mouse" ? rating : null)}
          className={cx(
            "group relative cursor-pointer rounded-control p-1",
            "has-focus-visible:outline-2 has-focus-visible:outline-offset-0 has-focus-visible:outline-green-700",
          )}
        >
          <input
            type="radio"
            name={name}
            value={rating}
            checked={value === rating}
            onChange={() => onChange(rating)}
            className="sr-only"
          />
          <span className="sr-only">{rating === 1 ? "1 star" : `${rating} stars`}</span>
          {/* Feedback on pointer-down: a small press, where motion is welcome. */}
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={cx(
              "size-9 stroke-[1.5] transition-[color,fill,scale] duration-(--duration-fast) ease-out motion-safe:group-active:scale-90",
              rating <= shown
                ? "fill-current stroke-current text-green-600"
                : "fill-transparent stroke-current text-muted",
            )}
            strokeLinejoin="round"
          >
            <path d={STAR_PATH} />
          </svg>
        </label>
      ))}
    </div>
  );
}
