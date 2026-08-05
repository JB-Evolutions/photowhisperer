// Both SVGs use a viewBox width chosen to sit at (or slightly below) the
// smallest container width they'll ever render at, so fontSize (set as a
// literal SVG user-unit attribute, matching the desired rendered px) never
// scales down below the 11px floor. See PostFigure.tsx for the shared
// convention. Tailwind classes below are colour-only (they set `color`,
// picked up by fill/stroke="currentColor"); never used for sizing.

// EV runs from 15 (direct sun) down to 4 (lit city street), the last hard
// anchor the night-street post actually gives. Below EV 4 the scale trails
// off unbounded — "dim side streets fall lower still" has no EV number in
// the post, so none is drawn.
const EV_MAX = 15;
const EV_MIN = 4;
const TICKS = Array.from(
  { length: EV_MAX - EV_MIN + 1 },
  (_, i) => EV_MAX - i,
);

function frac(ev: number) {
  return (EV_MAX - ev) / (EV_MAX - EV_MIN);
}

function DesktopScale() {
  const axisX0 = 44;
  const axisX1 = 380;
  const axisY = 100;
  const tailX1 = 410;
  const chevronTipX = 422;

  const x = (ev: number) => axisX0 + frac(ev) * (axisX1 - axisX0);
  const bandA = { x0: x(7), x1: x(5) }; // EV 5-7, lit indoor room
  const bandB = { x0: x(6), x1: x(4) }; // EV 4-6, lit city street

  return (
    <svg
      className="hidden aspect-[500/240] w-full sm:block"
      viewBox="0 0 500 240"
      aria-hidden="true"
    >
      <g className="text-border">
        <line x1={axisX0} y1={axisY} x2={axisX1} y2={axisY} stroke="currentColor" strokeWidth={1.5} />
        <line
          x1={axisX1}
          y1={axisY}
          x2={tailX1}
          y2={axisY}
          stroke="currentColor"
          strokeWidth={1.5}
          strokeDasharray="4 5"
        />
        <path
          d={`M${chevronTipX - 10},${axisY - 6} L${chevronTipX},${axisY} L${chevronTipX - 10},${axisY + 6}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {TICKS.filter((ev) => ev !== 15 && ev !== 12).map((ev) => (
          <line key={ev} x1={x(ev)} y1={axisY - 4} x2={x(ev)} y2={axisY + 4} stroke="currentColor" strokeWidth={1} />
        ))}
      </g>

      {/* Daylight anchors carry the same weight as the night-side bands
          below — the gap between them is carried by axis distance, not
          by muting one end of the scale. */}
      <g className="text-border-accent">
        {[15, 12].map((ev) => (
          <line key={ev} x1={x(ev)} y1={axisY - 6} x2={x(ev)} y2={axisY + 6} stroke="currentColor" strokeWidth={1.5} />
        ))}
        <line x1={bandA.x0} y1={125} x2={bandA.x1} y2={125} stroke="currentColor" strokeWidth={1.5} />
        <line x1={bandA.x0} y1={121} x2={bandA.x0} y2={129} stroke="currentColor" strokeWidth={1.5} />
        <line x1={bandA.x1} y1={121} x2={bandA.x1} y2={129} stroke="currentColor" strokeWidth={1.5} />
        <line x1={bandB.x0} y1={175} x2={bandB.x1} y2={175} stroke="currentColor" strokeWidth={1.5} />
        <line x1={bandB.x0} y1={171} x2={bandB.x0} y2={179} stroke="currentColor" strokeWidth={1.5} />
        <line x1={bandB.x1} y1={171} x2={bandB.x1} y2={179} stroke="currentColor" strokeWidth={1.5} />
      </g>

      <g textAnchor="start">
        <text x={axisX0} y={52} fontSize={14} className="font-mono text-text" fill="currentColor">EV 15</text>
        <text x={axisX0} y={68} fontSize={12} className="font-body text-text-muted" fill="currentColor">direct sun</text>
        <text x={axisX0} y={83} fontSize={11} className="font-body text-text-dim" fill="currentColor">sunny-16: f/16 at 1/ISO</text>

        <text x={x(12)} y={52} fontSize={14} className="font-mono text-text" fill="currentColor">EV 12</text>
        <text x={x(12)} y={68} fontSize={12} className="font-body text-text-muted" fill="currentColor">open shade</text>

        <text x={tailX1 - 24} y={64} fontSize={12} className="font-body text-text-muted" fill="currentColor">dim side street</text>
        <text x={tailX1 - 24} y={80} fontSize={11} className="font-body text-text-dim" fill="currentColor">lower still</text>
      </g>

      <g textAnchor="middle">
        <text x={(bandA.x0 + bandA.x1) / 2} y={145} fontSize={14} className="font-mono text-text" fill="currentColor">EV 5-7</text>
        <text x={(bandA.x0 + bandA.x1) / 2} y={161} fontSize={12} className="font-body text-text-muted" fill="currentColor">lit indoor room</text>

        <text x={(bandB.x0 + bandB.x1) / 2} y={195} fontSize={14} className="font-mono text-text" fill="currentColor">EV 4-6</text>
        <text x={(bandB.x0 + bandB.x1) / 2} y={211} fontSize={12} className="font-body text-text-muted" fill="currentColor">lit city street</text>
      </g>
    </svg>
  );
}

function MobileScale() {
  const axisX = 70;
  const axisY0 = 50;
  const axisY1 = 430;
  const tailY1 = 460;
  const chevronTipY = 474;

  const y = (ev: number) => axisY0 + frac(ev) * (axisY1 - axisY0);
  const bandA = { y0: y(7), y1: y(5) }; // EV 5-7
  const bandB = { y0: y(6), y1: y(4) }; // EV 4-6
  const bracketA = 50;
  const bracketB = 30;
  const labelX = 85;

  return (
    <svg
      className="mx-auto aspect-[240/500] w-full max-w-[320px] sm:hidden"
      viewBox="0 0 240 500"
      aria-hidden="true"
    >
      <g className="text-border">
        <line x1={axisX} y1={axisY0} x2={axisX} y2={axisY1} stroke="currentColor" strokeWidth={1.5} />
        <line
          x1={axisX}
          y1={axisY1}
          x2={axisX}
          y2={tailY1}
          stroke="currentColor"
          strokeWidth={1.5}
          strokeDasharray="4 5"
        />
        <path
          d={`M${axisX - 6},${chevronTipY - 10} L${axisX},${chevronTipY} L${axisX + 6},${chevronTipY - 10}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {TICKS.filter((ev) => ev !== 15 && ev !== 12).map((ev) => (
          <line key={ev} x1={axisX - 4} y1={y(ev)} x2={axisX + 4} y2={y(ev)} stroke="currentColor" strokeWidth={1} />
        ))}
      </g>

      <g className="text-border-accent">
        {[15, 12].map((ev) => (
          <line key={ev} x1={axisX - 6} y1={y(ev)} x2={axisX + 6} y2={y(ev)} stroke="currentColor" strokeWidth={1.5} />
        ))}
        <line x1={bracketA} y1={bandA.y0} x2={bracketA} y2={bandA.y1} stroke="currentColor" strokeWidth={1.5} />
        <line x1={bracketA - 4} y1={bandA.y0} x2={bracketA + 4} y2={bandA.y0} stroke="currentColor" strokeWidth={1.5} />
        <line x1={bracketA - 4} y1={bandA.y1} x2={bracketA + 4} y2={bandA.y1} stroke="currentColor" strokeWidth={1.5} />
        <line x1={bracketB} y1={bandB.y0} x2={bracketB} y2={bandB.y1} stroke="currentColor" strokeWidth={1.5} />
        <line x1={bracketB - 4} y1={bandB.y0} x2={bracketB + 4} y2={bandB.y0} stroke="currentColor" strokeWidth={1.5} />
        <line x1={bracketB - 4} y1={bandB.y1} x2={bracketB + 4} y2={bandB.y1} stroke="currentColor" strokeWidth={1.5} />
      </g>

      <g textAnchor="start">
        <text x={labelX} y={y(15) + 18} fontSize={14} className="font-mono text-text" fill="currentColor">EV 15</text>
        <text x={labelX} y={y(15) + 34} fontSize={12} className="font-body text-text-muted" fill="currentColor">direct sun</text>
        <text x={labelX} y={y(15) + 50} fontSize={11} className="font-body text-text-dim" fill="currentColor">sunny-16: f/16 at 1/ISO</text>

        <text x={labelX} y={y(12) + 18} fontSize={14} className="font-mono text-text" fill="currentColor">EV 12</text>
        <text x={labelX} y={y(12) + 34} fontSize={12} className="font-body text-text-muted" fill="currentColor">open shade</text>

        <text x={labelX} y={bandA.y0 + 18} fontSize={14} className="font-mono text-text" fill="currentColor">EV 5-7</text>
        <text x={labelX} y={bandA.y0 + 34} fontSize={12} className="font-body text-text-muted" fill="currentColor">lit indoor room</text>

        <text x={labelX} y={bandB.y0 + 18} fontSize={14} className="font-mono text-text" fill="currentColor">EV 4-6</text>
        <text x={labelX} y={bandB.y0 + 34} fontSize={12} className="font-body text-text-muted" fill="currentColor">lit city street</text>

        <text x={labelX} y={axisY1 + 24} fontSize={12} className="font-body text-text-muted" fill="currentColor">dim side street</text>
        <text x={labelX} y={axisY1 + 40} fontSize={11} className="font-body text-text-dim" fill="currentColor">lower still</text>
      </g>
    </svg>
  );
}

export default function EvScaleDiagram({ alt }: { alt: string }) {
  return (
    <div role="img" aria-label={alt}>
      <DesktopScale />
      <MobileScale />
    </div>
  );
}
