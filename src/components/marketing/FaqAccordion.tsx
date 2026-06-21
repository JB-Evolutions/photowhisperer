"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";

interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Does this work with my camera?",
    answer:
      "Yes — PhotoWhisperer gives you settings in standard terms (ISO, aperture, shutter speed, white balance) that apply to any camera with manual controls, mirrorless, DSLR, or otherwise. We don't connect to your camera directly; you read the values and dial them in yourself.",
  },
  {
    question: "Do I need to know exposure math?",
    answer:
      "No. Describe the scene in plain language and we handle the exposure math behind the scenes — you don't need to know stops, the exposure triangle, or any of the underlying calculations.",
  },
  {
    question: "What counts as one setting?",
    answer:
      "One setting is one scene description you submit that returns one set of camera values. Each request counts once toward your monthly limit, whether or not you end up using the result.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes. Cancel your subscription anytime from your billing page. You'll keep access through the end of your current billing period — no penalties, no retention calls.",
  },
  {
    question: "Do you store my data?",
    answer:
      "Your scene descriptions and the settings we return are stored so you can revisit your history — you control how much of that history you keep. Stripe handles payments, Supabase stores your account data, and Anthropic processes the scene description itself to generate your settings. We don't share any of it for model training.",
  },
  {
    question: "Do my unused requests roll over?",
    answer:
      "No — your monthly settings reset on the 1st of the month UTC and unused ones do not roll over. Extra credits you purchase work differently: they roll over and never expire.",
  },
];

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
      className={`shrink-0 transition-transform duration-[450ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
        open ? "rotate-180" : ""
      }`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export default function FaqAccordion() {
  const baseId = useId();
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function toggle(index: number) {
    setOpenIndex((current) => (current === index ? null : index));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      buttonRefs.current[(index + 1) % FAQ_ITEMS.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      buttonRefs.current[(index - 1 + FAQ_ITEMS.length) % FAQ_ITEMS.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      buttonRefs.current[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      buttonRefs.current[FAQ_ITEMS.length - 1]?.focus();
    }
  }

  return (
    <section id="faq" data-section="faq" className="py-24">
      <div className="mx-auto max-w-[720px] px-8">
        <h2 className="text-center font-display text-3xl text-text">
          Frequently asked questions
        </h2>

        <div className="mt-12 flex flex-col gap-4">
          {FAQ_ITEMS.map((item, index) => {
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
                  className={`overflow-hidden transition-[max-height] duration-[450ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    isOpen ? "max-h-[800px]" : "max-h-0"
                  }`}
                >
                  <div className="px-6 pb-5 text-sm leading-[1.65] text-text-muted">
                    {item.answer}
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
