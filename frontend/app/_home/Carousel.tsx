"use client";

import { Children, useRef, useState, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { ArrowIcon } from "@/components/store/art";

const CONTROL =
  "focus-ring flex size-9 items-center justify-center rounded-full bg-surface/80 text-ink shadow-card transition-[background-color,scale] duration-(--duration-press) ease-out hover:bg-surface motion-safe:active:scale-95 disabled:opacity-40";

/**
 * The featured banner: slides side by side in a scroll-snap track, so a swipe, a trackpad or the
 * keyboard moves them natively and the browser owns the momentum. Without JavaScript it is still a
 * swipeable row. The dots follow the scroll position and jump to a slide.
 */
export function Carousel({ labels, children }: { labels: string[]; children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const slides = Children.toArray(children);

  function go(index: number) {
    const el = track.current;
    if (!el) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: index * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <section aria-roledescription="carousel" aria-label="Featured apps" className="relative">
      <div
        ref={track}
        onScroll={(event) => {
          const el = event.currentTarget;
          setActive(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-[2rem] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, i) => (
          <div
            key={labels[i]}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${slides.length}: ${labels[i]}`}
            className="w-full shrink-0 snap-start"
          >
            {slide}
          </div>
        ))}
      </div>

      {slides.length > 1 && (
        <div className="absolute bottom-5 left-6 flex items-center gap-2 sm:bottom-6 sm:left-10">
          <button
            type="button"
            aria-label="Previous slide"
            disabled={active === 0}
            onClick={() => go(active - 1)}
            className={cx(CONTROL, "hidden sm:flex")}
          >
            <ArrowIcon direction="left" />
          </button>
          <div className="flex items-center gap-1.5 rounded-full bg-surface/60 px-2.5 py-2">
            {labels.map((label, i) => (
              <button
                key={label}
                type="button"
                aria-label={`Show slide ${i + 1}: ${label}`}
                aria-current={i === active ? "true" : undefined}
                onClick={() => go(i)}
                className={cx(
                  "focus-ring h-2 rounded-full transition-[width,background-color] duration-(--duration-spring) ease-(--ease-spring)",
                  i === active ? "w-6 bg-ink" : "w-2 bg-ink/30 hover:bg-ink/50",
                )}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Next slide"
            disabled={active === slides.length - 1}
            onClick={() => go(active + 1)}
            className={cx(CONTROL, "hidden sm:flex")}
          >
            <ArrowIcon direction="right" />
          </button>
        </div>
      )}
    </section>
  );
}
