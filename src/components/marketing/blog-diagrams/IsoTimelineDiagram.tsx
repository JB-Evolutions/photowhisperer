// Same viewBox-width / fontSize-attribute convention as EvScaleDiagram —
// see that file's header comment.
//
// The post only gives hard numbers for two of five stages (dinner service,
// dance floor). The line is a monotonic step: flat across each stage,
// stepping up only, never down — it never asserts a value we don't have.
//
// Marker convention: a filled circle ON the line means "measured" — only
// dinner service and dance floor get one. The other three stages
// (cocktail hour, first dance, exit) get a small tick crossing the line
// instead of a circle, same visual language as the unlabeled minor ticks
// in EvScaleDiagram — a positional marker, not a second data point. This
// matters at exit specifically: it holds at the same height as dance
// floor (no higher number is given), so a second circle on that same
// flat run would read as a duplicate measurement rather than a held
// level.

function DesktopTimeline() {
  const y1 = 208; // cocktail hour — no data
  const y2 = 151; // dinner service — ISO 2000
  const y3 = 99; // first dance — no data
  const y4 = 42; // dance floor — ISO 8000+
  const y5 = 42; // exit — no ISO given, holds at dance-floor level

  const cx = { seg1: 74, seg2: 162, seg3: 250, seg4: 338, seg5: 426 };

  return (
    <svg
      className="hidden aspect-[500/270] w-full sm:block"
      viewBox="0 0 500 270"
      aria-hidden="true"
    >
      <path
        d={`M30,${y1} L118,${y1} L118,${y2} L206,${y2} L206,${y3} L294,${y3} L294,${y4} L470,${y4}`}
        fill="none"
        className="text-border-accent"
        stroke="currentColor"
        strokeWidth={1.5}
      />

      <g className="text-text-muted" stroke="currentColor" strokeWidth={1.5}>
        <line x1={cx.seg1} y1={y1 - 5} x2={cx.seg1} y2={y1 + 5} />
        <line x1={cx.seg3} y1={y3 - 5} x2={cx.seg3} y2={y3 + 5} />
        <line x1={cx.seg5} y1={y5 - 5} x2={cx.seg5} y2={y5 + 5} />
      </g>
      <circle cx={cx.seg2} cy={y2} r={4} className="text-text" fill="currentColor" />
      <circle cx={cx.seg4} cy={y4} r={4} className="text-accent" fill="currentColor" />

      <g textAnchor="middle">
        <text x={cx.seg1} y={226} fontSize={12} className="font-body text-text-muted" fill="currentColor">cocktail hour</text>
        <text x={cx.seg1} y={242} fontSize={11} className="font-body text-text-dim" fill="currentColor">natural light</text>

        <text x={cx.seg2} y={169} fontSize={14} className="font-mono text-text" fill="currentColor">ISO 2000</text>
        <text x={cx.seg2} y={185} fontSize={12} className="font-body text-text-muted" fill="currentColor">dinner service</text>

        <text x={cx.seg3} y={117} fontSize={12} className="font-body text-text-muted" fill="currentColor">first dance</text>
        <text x={cx.seg3} y={133} fontSize={11} className="font-body text-text-dim" fill="currentColor">lights down</text>

        <text x={cx.seg4} y={60} fontSize={14} className="font-mono text-accent" fill="currentColor">ISO 8000+</text>
        <text x={cx.seg4} y={76} fontSize={12} className="font-body text-text-muted" fill="currentColor">dance floor</text>

        <text x={cx.seg5} y={60} fontSize={12} className="font-body text-text-muted" fill="currentColor">exit</text>
        <text x={cx.seg5} y={76} fontSize={12} className="font-mono text-text-muted" fill="currentColor">1/500s+</text>
      </g>
    </svg>
  );
}

function MobileTimeline() {
  // Rotated 90° from the desktop layout: the vertical axis is chronological
  // (top to bottom), and how far right the line sits at each row encodes
  // ISO — same idea as EvScaleDiagram's mobile rotation. Labels sit in a
  // fixed right-hand column, independent of the line's x position, so
  // adjacent rows never compete for horizontal space (unlike a shrunk
  // clone of the desktop layout, which five side-by-side labels can't fit
  // inside a 240-unit-wide viewBox without colliding).
  const x1 = 45; // cocktail hour
  const x2 = 65; // dinner service — ISO 2000
  const x3 = 85; // first dance
  const x4 = 105; // dance floor — ISO 8000+
  const x5 = 105; // exit — holds at dance-floor level

  const cy = { row1: 85, row2: 175, row3: 265, row4: 355, row5: 445 };
  const labelX = 125;

  return (
    <svg
      className="mx-auto aspect-[240/520] w-full max-w-[320px] sm:hidden"
      viewBox="0 0 240 520"
      aria-hidden="true"
    >
      <path
        d={`M${x1},40 L${x1},130 L${x2},130 L${x2},220 L${x3},220 L${x3},310 L${x4},310 L${x4},490`}
        fill="none"
        className="text-border-accent"
        stroke="currentColor"
        strokeWidth={1.5}
      />

      <g className="text-text-muted" stroke="currentColor" strokeWidth={1.5}>
        <line x1={x1 - 5} y1={cy.row1} x2={x1 + 5} y2={cy.row1} />
        <line x1={x3 - 5} y1={cy.row3} x2={x3 + 5} y2={cy.row3} />
        <line x1={x5 - 5} y1={cy.row5} x2={x5 + 5} y2={cy.row5} />
      </g>
      <circle cx={x2} cy={cy.row2} r={4} className="text-text" fill="currentColor" />
      <circle cx={x4} cy={cy.row4} r={4} className="text-accent" fill="currentColor" />

      <g textAnchor="start">
        <text x={labelX} y={103} fontSize={12} className="font-body text-text-muted" fill="currentColor">cocktail hour</text>
        <text x={labelX} y={119} fontSize={11} className="font-body text-text-dim" fill="currentColor">natural light</text>

        <text x={labelX} y={193} fontSize={14} className="font-mono text-text" fill="currentColor">ISO 2000</text>
        <text x={labelX} y={209} fontSize={12} className="font-body text-text-muted" fill="currentColor">dinner service</text>

        <text x={labelX} y={283} fontSize={12} className="font-body text-text-muted" fill="currentColor">first dance</text>
        <text x={labelX} y={299} fontSize={11} className="font-body text-text-dim" fill="currentColor">lights down</text>

        <text x={labelX} y={373} fontSize={14} className="font-mono text-accent" fill="currentColor">ISO 8000+</text>
        <text x={labelX} y={389} fontSize={12} className="font-body text-text-muted" fill="currentColor">dance floor</text>

        <text x={labelX} y={463} fontSize={12} className="font-body text-text-muted" fill="currentColor">exit</text>
        <text x={labelX} y={479} fontSize={12} className="font-mono text-text-muted" fill="currentColor">1/500s+</text>
      </g>
    </svg>
  );
}

export default function IsoTimelineDiagram({ alt }: { alt: string }) {
  return (
    <div role="img" aria-label={alt}>
      <DesktopTimeline />
      <MobileTimeline />
    </div>
  );
}
