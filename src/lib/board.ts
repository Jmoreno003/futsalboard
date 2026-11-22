// Pure model + helpers for the futsal tactical board.
// Court coordinates: 1 unit = 10 cm. A 40 x 20 m court is 400 x 200 units.

export const COURT_W = 400;
export const COURT_H = 200;
export const MARGIN = 18;

export type Team = "home" | "away";
export type ArrowKind = "pass" | "run" | "dribble";

export interface Player {
  id: string;
  team: Team;
  x: number;
  y: number;
  number: number;
  name: string;
  goalkeeper: boolean;
}

export interface Ball {
  id: string;
  x: number;
  y: number;
}

export interface Arrow {
  id: string;
  kind: ArrowKind;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface BoardState {
  players: Player[];
  balls: Ball[];
  arrows: Arrow[];
}

export const emptyBoard: BoardState = { players: [], balls: [], arrows: [] };

export const uid = () => Math.random().toString(36).slice(2, 10);

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Keep a point inside the court plus its outer margin. */
export const clampToBoard = (x: number, y: number) => ({
  x: clamp(x, -MARGIN + 6, COURT_W + MARGIN - 6),
  y: clamp(y, -MARGIN + 6, COURT_H + MARGIN - 6),
});

/** Lowest shirt number (1-99) not yet used by that team. */
export function nextNumber(players: Player[], team: Team): number {
  const used = new Set(players.filter((p) => p.team === team).map((p) => p.number));
  for (let n = 1; n < 100; n++) if (!used.has(n)) return n;
  return 99;
}

export interface Formation {
  id: string;
  label: string;
  /** Positions for a team attacking to the right (home side). GK first. */
  spots: { x: number; y: number; role: string }[];
}

export const FORMATIONS: Formation[] = [
  {
    id: "1-2-1",
    label: "Rombo 1-2-1",
    spots: [
      { x: 18, y: 100, role: "Portero" },
      { x: 70, y: 100, role: "Cierre" },
      { x: 125, y: 45, role: "Ala" },
      { x: 125, y: 155, role: "Ala" },
      { x: 180, y: 100, role: "Pívot" },
    ],
  },
  {
    id: "2-2",
    label: "Cuadrado 2-2",
    spots: [
      { x: 18, y: 100, role: "Portero" },
      { x: 80, y: 60, role: "Cierre" },
      { x: 80, y: 140, role: "Cierre" },
      { x: 165, y: 60, role: "Ala" },
      { x: 165, y: 140, role: "Ala" },
    ],
  },
  {
    id: "3-1",
    label: "3-1",
    spots: [
      { x: 18, y: 100, role: "Portero" },
      { x: 90, y: 45, role: "Ala" },
      { x: 75, y: 100, role: "Cierre" },
      { x: 90, y: 155, role: "Ala" },
      { x: 175, y: 100, role: "Pívot" },
    ],
  },
  {
    id: "4-0",
    label: "4-0",
    spots: [
      { x: 18, y: 100, role: "Portero" },
      { x: 120, y: 30, role: "Ala" },
      { x: 95, y: 80, role: "Cierre" },
      { x: 95, y: 120, role: "Cierre" },
      { x: 120, y: 170, role: "Ala" },
    ],
  },
];

/** Build a team's five players for a formation. Away team is mirrored to the right half. */
export function formationPlayers(formation: Formation, team: Team): Player[] {
  return formation.spots.map((s, i) => ({
    id: uid(),
    team,
    x: team === "home" ? s.x : COURT_W - s.x,
    y: s.y,
    number: i + 1,
    name: s.role,
    goalkeeper: i === 0,
  }));
}

/** Replace one team's players with a formation, keeping the other team untouched. */
export function applyFormation(state: BoardState, formation: Formation, team: Team): BoardState {
  return {
    ...state,
    players: [...state.players.filter((p) => p.team !== team), ...formationPlayers(formation, team)],
  };
}

/** SVG path for an arrow body. Dribbles are wavy; the last stretch stays straight for the head. */
export function arrowPath(a: Pick<Arrow, "kind" | "x1" | "y1" | "x2" | "y2">): string {
  const { x1, y1, x2, y2 } = a;
  if (a.kind !== "dribble") return `M${x1},${y1} L${x2},${y2}`;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 20) return `M${x1},${y1} L${x2},${y2}`;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const waveLen = len - 12;
  const amp = 4;
  const period = 14;
  const steps = Math.max(8, Math.round(waveLen / 2));
  let d = `M${x1},${y1}`;
  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * waveLen;
    const off = Math.sin((t / period) * Math.PI * 2) * amp;
    d += ` L${(x1 + ux * t + nx * off).toFixed(1)},${(y1 + uy * t + ny * off).toFixed(1)}`;
  }
  d += ` L${x2},${y2}`;
  return d;
}

export function isBoardState(v: unknown): v is BoardState {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return Array.isArray(o["players"]) && Array.isArray(o["balls"]) && Array.isArray(o["arrows"]);
}
