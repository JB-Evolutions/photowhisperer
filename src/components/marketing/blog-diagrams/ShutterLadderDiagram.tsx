// Same viewBox-width / fontSize-attribute convention as EvScaleDiagram —
// see that file's header comment. Y coordinates are fixed across both
// variants (the ladder's height doesn't need to change); only X scales
// with each variant's width.

function stepX(width: number) {
  return {
    step1: { x0: width * 0.08, x1: width * 0.3 },
    step2: { x0: width * 0.38, x1: width * 0.62 },
    step3: { x0: width * 0.7, x1: width * 0.92 },
  };
}

function Ladder({ width, mobile }: { width: number; mobile: boolean }) {
  const { step1, step2, step3 } = stepX(width);
  const y1 = 209;
  const y2 = 133;
  const y3 = 58;
  const baselineX0 = width * 0.02;

  return (
    <svg
      className={
        mobile
          ? "mx-auto aspect-[240/290] w-full max-w-[320px] sm:hidden"
          : `hidden aspect-[500/290] w-full sm:block`
      }
      viewBox={`0 0 ${width} 290`}
      aria-hidden="true"
    >
      <g className="text-border-accent" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path
          d={`M${baselineX0},${y1} L${step1.x0},${y1} L${step1.x1},${y1} L${step1.x1},${y2} L${step2.x0},${y2} L${step2.x1},${y2} L${step2.x1},${y3} L${step3.x0},${y3} L${step3.x1},${y3}`}
        />
      </g>

      <g className="text-text-muted" fill="currentColor" stroke="currentColor" strokeWidth={1.5}>
        <circle cx={step2.x0} cy={y2} r={1.5} fill="currentColor" stroke="none" />
      </g>

      <text x={step1.x0} y={195} fontSize={14} textAnchor="start" className="font-mono text-text" fill="currentColor">1/125s</text>
      <text x={step1.x0} y={227} fontSize={12} textAnchor="start" className="font-body text-text-muted" fill="currentColor">walking</text>

      <text x={(step2.x0 + step2.x1) / 2} y={119} fontSize={14} textAnchor="middle" className="font-mono text-text" fill="currentColor">1/500s</text>
      <text x={(step2.x0 + step2.x1) / 2} y={151} fontSize={12} textAnchor="middle" className="font-body text-text-muted" fill="currentColor">
        <tspan x={(step2.x0 + step2.x1) / 2}>running kid or dog,</tspan>
        <tspan x={(step2.x0 + step2.x1) / 2} dy={14}>most youth &amp; rec sport</tspan>
      </text>

      <text x={step3.x1} y={44} fontSize={14} textAnchor="end" className="font-mono text-text" fill="currentColor">1/1000s+</text>
      <text x={step3.x1} y={76} fontSize={12} textAnchor="end" className="font-body text-text-muted" fill="currentColor">
        <tspan x={step3.x1}>fast sport, airborne ball,</tspan>
        <tspan x={step3.x1} dy={14}>varsity pace</tspan>
      </text>

      <rect
        x={width * 0.06}
        y={240}
        width={width * 0.88}
        height={40}
        rx={4}
        fill="none"
        className="text-accent"
        stroke="currentColor"
        strokeWidth={1.2}
      />
      <text x={width / 2} y={254} fontSize={12} textAnchor="middle" className="font-body text-accent" fill="currentColor">Crossing the frame:</text>
      <text x={width / 2} y={268} fontSize={12} textAnchor="middle" className="font-body text-accent" fill="currentColor">about 4&#215; the shutter speed</text>
    </svg>
  );
}

export default function ShutterLadderDiagram({ alt }: { alt: string }) {
  return (
    <div role="img" aria-label={alt}>
      <Ladder width={500} mobile={false} />
      <Ladder width={240} mobile={true} />
    </div>
  );
}
