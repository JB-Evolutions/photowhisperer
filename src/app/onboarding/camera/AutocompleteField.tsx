"use client";

import { useRef, useState } from "react";

interface AutocompleteFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  pool: string[];
  placeholder: string;
  sheetTitle: string;
}

type Option = { type: "suggestion" | "custom"; label: string };

// Single text input with a merged suggestions/free-text option list. The
// same list panel repositions itself via responsive classes — a dropdown
// under the input on sm+, a bottom sheet on mobile — so there is exactly one
// set of option elements/ids (no JS media query, no duplicate a11y tree).
export default function AutocompleteField({
  id,
  value,
  onChange,
  onCommit,
  pool,
  placeholder,
  sheetTitle,
}: AutocompleteFieldProps) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const query = value.trim().toLowerCase();
  const filtered =
    query.length === 0
      ? pool
      : pool.filter((item) => item.toLowerCase().includes(query));
  const hasExactMatch = pool.some((item) => item.toLowerCase() === query);

  const options: Option[] = filtered.map((label) => ({
    type: "suggestion",
    label,
  }));
  if (query.length > 0 && !hasExactMatch) {
    options.push({ type: "custom", label: value.trim() });
  }

  function commit(text: string) {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    onCommit(trimmed);
    setOpen(false);
    setHighlightedIndex(-1);
  }

  function dismiss() {
    setOpen(false);
    setHighlightedIndex(-1);
  }

  function handleBlur() {
    window.setTimeout(() => {
      if (
        containerRef.current &&
        !containerRef.current.contains(document.activeElement)
      ) {
        if (value.trim().length > 0) commit(value);
        else dismiss();
      }
    }, 0);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlightedIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, -1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (highlightedIndex >= 0 && options[highlightedIndex]) {
        commit(options[highlightedIndex].label);
      } else if (value.trim().length > 0) {
        commit(value);
      }
    } else if (event.key === "Escape") {
      dismiss();
    }
  }

  const listboxId = `${id}-listbox`;
  const activeOptionId =
    highlightedIndex >= 0 ? `${id}-option-${highlightedIndex}` : undefined;

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        type="text"
        value={value}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setHighlightedIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        className="min-h-[52px] w-full rounded-[10px] border border-border-strong bg-surface px-4 text-base text-text outline-none transition-colors focus:border-accent"
      />

      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={dismiss}
            className="fixed inset-0 z-30 bg-black/40 transition-opacity duration-[250ms] sm:hidden"
          />
          <div
            className="fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-t-[20px] border-t border-border bg-surface-2 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg transition-transform duration-[300ms] ease-[cubic-bezier(0.16,1,0.3,1)] sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:z-20 sm:mt-1.5 sm:max-h-60 sm:w-full sm:rounded-[10px] sm:border sm:border-t sm:border-border sm:pb-1 sm:shadow-lg"
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-surface-2 px-4 py-3 sm:hidden">
              <span className="text-sm font-medium text-text-muted">{sheetTitle}</span>
              <button
                type="button"
                onClick={dismiss}
                className="flex min-h-[44px] items-center px-2 text-sm text-text-muted"
              >
                Close
              </button>
            </div>

            {options.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-text-dim">
                No more suggestions. Type to add your own.
              </p>
            ) : (
              <ul id={listboxId} role="listbox">
                {options.map((option, index) => (
                  <li key={`${option.type}-${option.label}`} role="presentation">
                    <button
                      id={`${id}-option-${index}`}
                      type="button"
                      role="option"
                      aria-selected={index === highlightedIndex}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onClick={() => commit(option.label)}
                      className={`flex min-h-[44px] w-full items-center px-4 text-left text-[15px] transition-colors sm:text-sm ${
                        index === highlightedIndex
                          ? "bg-surface-3 text-text"
                          : "text-text-muted hover:bg-surface-3 hover:text-text"
                      }`}
                    >
                      {option.type === "custom" ? (
                        <span>
                          <span className="text-text-dim">Use </span>
                          <span className="text-text">&ldquo;{option.label}&rdquo;</span>
                        </span>
                      ) : (
                        option.label
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
