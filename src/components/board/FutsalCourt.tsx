import { COURT_H, COURT_W, MARGIN } from "@/lib/board";

/** Static futsal court markings (40 x 20 m, 1 unit = 10 cm). */
export function FutsalCourt() {
  const cy = COURT_H / 2;
  const line = "fill-none stroke-court-line";
  return (
    <g>
      <rect
        x={-MARGIN}
        y={-MARGIN}
        width={COURT_W + MARGIN * 2}
        height={COURT_H + MARGIN * 2}
        className="fill-court-outer"
      />
      <rect x={0} y={0} width={COURT_W} height={COURT_H} className="fill-court" />

      {/* Penalty areas (6 m quarter circles from each post) */}
      <path
        d={`M0,${cy - 75} A60,60 0 0 1 60,${cy - 15} L60,${cy + 15} A60,60 0 0 1 0,${cy + 75} Z`}
        className="fill-court-area stroke-court-line"
        strokeWidth={1}
      />
      <path
        d={`M${COURT_W},${cy - 75} A60,60 0 0 0 ${COURT_W - 60},${cy - 15} L${COURT_W - 60},${cy + 15} A60,60 0 0 0 ${COURT_W},${cy + 75} Z`}
        className="fill-court-area stroke-court-line"
        strokeWidth={1}
      />

      <rect x={0} y={0} width={COURT_W} height={COURT_H} className={line} strokeWidth={1.2} />
      <line x1={COURT_W / 2} y1={0} x2={COURT_W / 2} y2={COURT_H} className={line} strokeWidth={1} />
      <circle cx={COURT_W / 2} cy={cy} r={30} className={line} strokeWidth={1} />
      <circle cx={COURT_W / 2} cy={cy} r={1.6} className="fill-court-line" />

      {/* Penalty marks (6 m) and second penalty marks (10 m) */}
      {[60, 100, COURT_W - 60, COURT_W - 100].map((x) => (
        <circle key={x} cx={x} cy={cy} r={1.4} className="fill-court-line" />
      ))}

      {/* Corner arcs */}
      <path d="M0,6 A6,6 0 0 0 6,0" className={line} strokeWidth={1} />
      <path d={`M${COURT_W - 6},0 A6,6 0 0 0 ${COURT_W},6`} className={line} strokeWidth={1} />
      <path d={`M0,${COURT_H - 6} A6,6 0 0 1 6,${COURT_H}`} className={line} strokeWidth={1} />
      <path
        d={`M${COURT_W - 6},${COURT_H} A6,6 0 0 1 ${COURT_W},${COURT_H - 6}`}
        className={line}
        strokeWidth={1}
      />

      {/* Substitution zones */}
      {[100, 150, 250, 300].map((x) => (
        <line key={x} x1={x} y1={COURT_H} x2={x} y2={COURT_H + 8} className={line} strokeWidth={1} />
      ))}

      {/* Goals (3 x 2 m) */}
      <rect x={-10} y={cy - 15} width={10} height={30} className="fill-goal stroke-court-line" strokeWidth={1} />
      <rect
        x={COURT_W}
        y={cy - 15}
        width={10}
        height={30}
        className="fill-goal stroke-court-line"
        strokeWidth={1}
      />
    </g>
  );
}
