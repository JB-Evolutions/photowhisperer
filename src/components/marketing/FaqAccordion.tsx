"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { FaqItem } from "@/content/faq";
import "@/components/marketing/marketing.css";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-open={open}
      className="pw-faq-chevron shrink-0"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// `items` is required by design — a default here would let a page silently
// render FAQ copy that its FAQPage JSON-LD was not built from.
export default function FaqAccordion({ items }: { items: FaqItem[] }) {
  const baseId = useId();
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function toggle(index: number) {
    setOpenIndex((current) => (current === index ? null : index));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      buttonRefs.current[(index + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      buttonRefs.current[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      buttonRefs.current[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      buttonRefs.current[items.length - 1]?.focus();
    }
  }

  return (
    <section id="faq" data-section="faq" className="pt-16 md:pt-20">
      <div className="mx-auto max-w-[720px] px-8">
        <h2 className="text-center font-display text-3xl text-text">
          Frequently asked questions
        </h2>

        <div className="mt-12 flex flex-col gap-4">
          {items.map((item, index) => {
            const isOpen = openIndex === index;
            const questionId = `${baseId}-question-${index}`;
            const panelId = `${baseId}-panel-${index}`;

            return (
              <div
                key={item.question}
                className="rounded-[14px] border border-border bg-surface"
              >
                <h3>
                  <button
                    ref={(el) => {
                      buttonRefs.current[index] = el;
                    }}
                    id={questionId}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggle(index)}
                    onKeyDown={(event) => handleKeyDown(event, index)}
                    className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left font-body text-base text-text transition-colors duration-200 hover:text-accent"
                  >
                    {item.question}
                    <ChevronIcon open={isOpen} />
                  </button>
                </h3>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={questionId}
                  data-open={isOpen}
                  className="pw-faq-panel"
                >
                  <div>
                    <div className="pw-faq-answer px-6 pb-5 text-sm leading-[1.65] text-text-muted">
                      {item.answer}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
