import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowUpRight,
  Download,
  Eraser,
  Play,
  Maximize2,
  Minimize2,
  MousePointer2,
  Save,
  Smartphone,
  MoveUpRight,
  Spline,
  Trash2,
  Undo2,
  UserPlus,
  X,
} from "lucide-react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import {
  COURT_H,
  COURT_W,
  FORMATIONS,
  MARGIN,
  applyFormation,
  arrowPath,
  clampToBoard,
  emptyBoard,
  formationPlayers,
  isBoardState,
  isSavedLineupList,
  nextNumber,
  saveLineup,
  uid,
  type Arrow,
  type ArrowKind,
  type BoardState,
  type SavedLineup,
  type Team,
} from "@/lib/board";
import { FutsalCourt } from "./FutsalCourt";

type Tool = "select" | "home" | "away" | "ball" | ArrowKind | "erase";
type Selection = { type: "player" | "ball" | "arrow"; id: string } | null;
type Drag =
  | { kind: "move-player" | "move-ball"; id: string; dx: number; dy: number }
  | { kind: "move-arrow"; id: string; sx: number; sy: number; orig: Arrow }
  | { kind: "arrow-end"; id: string; end: 1 | 2 }
  | { kind: "draw-arrow"; id: string };

const STORAGE_KEY = "pizarra-futsal-v1";
const SAVED_KEY = "pizarra-futsal-guardadas-v1";
const VIEWBOX = `${-MARGIN} ${-MARGIN} ${COURT_W + MARGIN * 2} ${COURT_H + MARGIN * 2}`;

/** Compact tool buttons used in fullscreen so the court keeps most of the screen. */
const FS_TOOL_BTN =
  "min-w-[52px] shrink-0 gap-0.5 px-1 py-1.5 text-[9px] tracking-normal [&_svg]:size-4 lg:py-2 lg:text-[10px] lg:[&_svg]:size-5";

const TOOLS: { id: Tool; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: "select", label: "Mover", hint: "Selecciona y arrastra", icon: <MousePointer2 /> },
  { id: "home", label: "Local", hint: "Clic en el campo para añadir", icon: <UserPlus /> },
  { id: "away", label: "Rival", hint: "Clic en el campo para añadir", icon: <UserPlus /> },
  { id: "ball", label: "Balón", hint: "Clic para colocar un balón", icon: <BallIcon /> },
  { id: "pass", label: "Pase", hint: "Arrastra para dibujar", icon: <ArrowUpRight /> },
  { id: "run", label: "Desmarque", hint: "Arrastra para dibujar", icon: <MoveUpRight /> },
  { id: "dribble", label: "Conducción", hint: "Arrastra para dibujar", icon: <Spline /> },
  { id: "erase", label: "Borrar", hint: "Clic sobre un elemento", icon: <Eraser /> },
];

const ARROW_LABEL: Record<ArrowKind, string> = {
  pass: "Pase",
  run: "Desmarque",
  dribble: "Conducción",
};

function BallIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7l4 3-1.5 4.5h-5L8 10z" fill="currentColor" />
    </svg>
  );
}

function initialBoard(): BoardState {
  const [rombo, cuadrado] = FORMATIONS;
  return {
    players: [
      ...(rombo ? formationPlayers(rombo, "home") : []),
      ...(cuadrado ? formationPlayers(cuadrado, "away") : []),
    ].map((p) => ({ ...p, id: `init-${p.team}-${p.number}` })), // stable ids so SSR and browser match
    balls: [{ id: "init-ball", x: COURT_W / 2, y: COURT_H / 2 }],
    arrows: [],
  };
}

export function TacticalBoard() {
  const svgRef = useRef<SVGSVGElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [board, setBoard] = useState<BoardState>(initialBoard);
  const [teamNames, setTeamNames] = useState({ home: "Local", away: "Rival" });
  const [tool, setTool] = useState<Tool>("select");
  const [selection, setSelection] = useState<Selection>(null);
  const [past, setPast] = useState<BoardState[]>([]);
  const [formation, setFormation] = useState<Record<Team, string>>({ home: "1-2-1", away: "2-2" });
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<SavedLineup[]>([]);
  const [lineupName, setLineupName] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  const boardRef = useRef(board);
  boardRef.current = board;
  const dragRef = useRef<Drag | null>(null);
  const snapshotRef = useRef<BoardState | null>(null);

  // Load saved board after hydration.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { board?: unknown; teamNames?: typeof teamNames };
        if (isBoardState(parsed.board)) setBoard(parsed.board);
        if (parsed.teamNames) setTeamNames(parsed.teamNames);
      }
      const rawSaved = localStorage.getItem(SAVED_KEY);
      if (rawSaved) {
        const list: unknown = JSON.parse(rawSaved);
        if (isSavedLineupList(list)) setSaved(list);
      }
    } catch {
      /* ignore corrupt storage */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ board, teamNames }));
  }, [board, teamNames, loaded]);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  }, [saved, loaded]);

  // Keep our fullscreen flag in sync when the browser exits fullscreen on its own (Esc).
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const orientation = (typeof screen !== "undefined" ? screen.orientation : undefined) as
      | (ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void })
      | undefined;
    if (fullscreen) {
      setFullscreen(false);
      orientation?.unlock?.();
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      return;
    }
    setFullscreen(true);
    // Real fullscreen where supported; otherwise the stage still fills the window.
    await stageRef.current?.requestFullscreen?.().catch(() => {});
    // On phones/tablets, try to lay the court sideways (works on Android; iOS ignores it).
    if (window.matchMedia("(pointer: coarse)").matches) {
      await orientation?.lock?.("landscape")?.catch(() => {});
    }
  }, [fullscreen]);

  const commit = useCallback((next: BoardState) => {
    setPast((p) => [...p.slice(-49), boardRef.current]);
    setBoard(next);
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      const prev = p[p.length - 1];
      if (!prev) return p;
      setBoard(prev);
      setSelection(null);
      return p.slice(0, -1);
    });
  }, []);

  const removeItem = useCallback(
    (sel: NonNullable<Selection>) => {
      const b = boardRef.current;
      commit({
        players: sel.type === "player" ? b.players.filter((p) => p.id !== sel.id) : b.players,
        balls: sel.type === "ball" ? b.balls.filter((p) => p.id !== sel.id) : b.balls,
        arrows: sel.type === "arrow" ? b.arrows.filter((p) => p.id !== sel.id) : b.arrows,
      });
      setSelection(null);
    },
    [commit],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selection) {
        e.preventDefault();
        removeItem(selection);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      } else if (e.key === "Escape") {
        if (fullscreen) setFullscreen(false);
        setSelection(null);
        setTool("select");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, removeItem, undo, fullscreen]);

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const r = pt.matrixTransform(m.inverse());
    return { x: r.x, y: r.y };
  };

  const startDrag = (e: ReactPointerEvent, drag: Drag) => {
    svgRef.current?.setPointerCapture(e.pointerId);
    snapshotRef.current = boardRef.current;
    dragRef.current = drag;
  };

  // Right-click menu: remembers where and on what the user clicked.
  const ctxRef = useRef<{ x: number; y: number; target: NonNullable<Selection> | null }>({
    x: COURT_W / 2,
    y: COURT_H / 2,
    target: null,
  });
  const [ctxTarget, setCtxTarget] = useState<NonNullable<Selection> | null>(null);
  const onBoardContextMenu = (e: React.MouseEvent<SVGSVGElement>) => {
    const raw = toSvg(e);
    const { x, y } = clampToBoard(raw.x, raw.y);
    const el = (e.target as Element).closest("[data-item-type]");
    const target = el
      ? ({ type: el.getAttribute("data-item-type"), id: el.getAttribute("data-item-id") } as NonNullable<Selection>)
      : null;
    ctxRef.current = { x, y, target };
    setCtxTarget(target);
    if (target) setSelection(target);
  };
  const ctxAddPlayer = (team: Team) => {
    const { x, y } = ctxRef.current;
    const b = boardRef.current;
    const id = uid();
    commit({
      ...b,
      players: [...b.players, { id, team, x, y, number: nextNumber(b.players, team), name: "", goalkeeper: false }],
    });
    setSelection({ type: "player", id });
  };
  const ctxAddBall = () => {
    const { x, y } = ctxRef.current;
    const b = boardRef.current;
    const id = uid();
    commit({ ...b, balls: [...b.balls, { id, x, y }] });
    setSelection({ type: "ball", id });
  };
  const ctxAddArrow = (kind: ArrowKind) => {
    const b = boardRef.current;
    const t = ctxRef.current.target;
    const from = t?.type === "player" ? b.players.find((p) => p.id === t.id) : undefined;
    const { x, y } = from ?? ctxRef.current;
    const id = uid();
    const dir = x > COURT_W / 2 ? -1 : 1;
    const end = clampToBoard(x + dir * 60, y);
    commit({ ...b, arrows: [...b.arrows, { id, kind, x1: x, y1: y, x2: end.x, y2: end.y }] });
    setSelection({ type: "arrow", id });
  };

  const ctxSetArrowKind = (id: string, kind: ArrowKind) => {
    const b = boardRef.current;
    commit({ ...b, arrows: b.arrows.map((a) => (a.id === id ? { ...a, kind } : a)) });
  };

  const isArrowTool = tool === "pass" || tool === "run" || tool === "dribble";

  // Background (court) pointer down
  const onBoardPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const raw = toSvg(e);
    const { x, y } = clampToBoard(raw.x, raw.y);
    const b = boardRef.current;
    if (tool === "home" || tool === "away") {
      const id = uid();
      commit({
        ...b,
        players: [
          ...b.players,
          { id, team: tool, x, y, number: nextNumber(b.players, tool), name: "", goalkeeper: false },
        ],
      });
      setSelection({ type: "player", id });
    } else if (tool === "ball") {
      const id = uid();
      commit({ ...b, balls: [...b.balls, { id, x, y }] });
      setSelection({ type: "ball", id });
    } else if (isArrowTool) {
      const id = uid();
      startDrag(e, { kind: "draw-arrow", id });
      setBoard({ ...b, arrows: [...b.arrows, { id, kind: tool, x1: x, y1: y, x2: x, y2: y }] });
      setSelection({ type: "arrow", id });
    } else if (tool === "select") {
      setSelection(null);
    }
  };

  const onItemPointerDown = (
    e: ReactPointerEvent,
    type: "player" | "ball" | "arrow",
    id: string,
  ) => {
    if (e.button !== 0 || isArrowTool) return; // arrows can start on top of players/balls
    e.stopPropagation();
    if (tool === "erase") {
      removeItem({ type, id });
      return;
    }
    setSelection({ type, id });
    const pt = toSvg(e);
    const b = boardRef.current;
    if (type === "player") {
      const p = b.players.find((x) => x.id === id);
      if (p) startDrag(e, { kind: "move-player", id, dx: pt.x - p.x, dy: pt.y - p.y });
    } else if (type === "ball") {
      const p = b.balls.find((x) => x.id === id);
      if (p) startDrag(e, { kind: "move-ball", id, dx: pt.x - p.x, dy: pt.y - p.y });
    } else {
      const a = b.arrows.find((x) => x.id === id);
      if (a) startDrag(e, { kind: "move-arrow", id, sx: pt.x, sy: pt.y, orig: a });
    }
  };

  const onHandlePointerDown = (e: ReactPointerEvent, id: string, end: 1 | 2) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    startDrag(e, { kind: "arrow-end", id, end });
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const raw = toSvg(e);
    const b = boardRef.current;
    if (drag.kind === "move-player") {
      const { x, y } = clampToBoard(raw.x - drag.dx, raw.y - drag.dy);
      setBoard({ ...b, players: b.players.map((p) => (p.id === drag.id ? { ...p, x, y } : p)) });
    } else if (drag.kind === "move-ball") {
      const { x, y } = clampToBoard(raw.x - drag.dx, raw.y - drag.dy);
      setBoard({ ...b, balls: b.balls.map((p) => (p.id === drag.id ? { ...p, x, y } : p)) });
    } else if (drag.kind === "move-arrow") {
      const dx = raw.x - drag.sx;
      const dy = raw.y - drag.sy;
      const o = drag.orig;
      setBoard({
        ...b,
        arrows: b.arrows.map((a) =>
          a.id === drag.id
            ? { ...a, x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy }
            : a,
        ),
      });
    } else if (drag.kind === "draw-arrow" || drag.kind === "arrow-end") {
      const { x, y } = clampToBoard(raw.x, raw.y);
      const end = drag.kind === "draw-arrow" ? 2 : drag.end;
      setBoard({
        ...b,
        arrows: b.arrows.map((a) =>
          a.id === drag.id ? (end === 1 ? { ...a, x1: x, y1: y } : { ...a, x2: x, y2: y }) : a,
        ),
      });
    }
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    const snap = snapshotRef.current;
    dragRef.current = null;
    snapshotRef.current = null;
    if (!drag || !snap) return;
    const b = boardRef.current;
    if (drag.kind === "draw-arrow") {
      const a = b.arrows.find((x) => x.id === drag.id);
      if (!a || Math.hypot(a.x2 - a.x1, a.y2 - a.y1) < 10) {
        setBoard(snap);
        setSelection(null);
        return;
      }
    }
    if (b !== snap) setPast((p) => [...p.slice(-49), snap]);
  };

  const updatePlayer = (id: string, patch: Partial<BoardState["players"][number]>) => {
    const b = boardRef.current;
    commit({ ...b, players: b.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  };

  const placeFormation = (team: Team) => {
    const f = FORMATIONS.find((x) => x.id === formation[team]);
    if (!f) return;
    commit(applyFormation(boardRef.current, f, team));
    setSelection(null);
  };

  const clearTeam = (team: Team) => {
    const b = boardRef.current;
    if (!b.players.some((p) => p.team === team)) return;
    commit({ ...b, players: b.players.filter((p) => p.team !== team) });
    setSelection(null);
  };

  const saveCurrent = () => {
    const next = saveLineup(saved, lineupName, boardRef.current, teamNames);
    const entry = next[0];
    setSaved(next);
    if (entry) {
      setLineupName(entry.name);
      toast.success(`«${entry.name}» guardada`);
    }
  };

  const loadLineup = (l: SavedLineup) => {
    commit(l.board);
    setTeamNames(l.teamNames);
    setLineupName(l.name);
    setSelection(null);
    toast(`«${l.name}» cargada`);
  };

  const deleteLineup = (l: SavedLineup) => {
    if (!window.confirm(`¿Borrar la alineación «${l.name}»?`)) return;
    setSaved((list) => list.filter((x) => x.id !== l.id));
  };

  const exportPng = async () => {
    const svg = svgRef.current;
    if (!svg) return;
    const prevSel = selection;
    setSelection(null);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const url = await svgToPng(svg);
    setSelection(prevSel);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pizarra-futsal.png";
    a.click();
  };

  const selectedPlayer =
    selection?.type === "player" ? board.players.find((p) => p.id === selection.id) : undefined;
  const selectedArrow =
    selection?.type === "arrow" ? board.arrows.find((a) => a.id === selection.id) : undefined;

  const activeHint = TOOLS.find((t) => t.id === tool)?.hint;

  return (
    <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col gap-4 px-3 py-4 md:px-6 md:py-6">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
            Pizarra táctica
          </p>
          <h1 className="font-display text-5xl leading-none tracking-wide md:text-6xl">
            Alineaciones de Futsal
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={undo} disabled={past.length === 0}>
            <Undo2 /> Deshacer
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => commit({ ...board, arrows: [] })}
            disabled={board.arrows.length === 0}
          >
            <Spline /> Quitar flechas
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              commit(emptyBoard);
              setSelection(null);
            }}
          >
            <Trash2 /> Vaciar
          </Button>
          <Button variant="secondary" size="sm" onClick={toggleFullscreen}>
            <Maximize2 /> Pantalla completa
          </Button>
          <Button size="sm" onClick={exportPng}>
            <Download /> Descargar imagen
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-4">
        <div
          ref={stageRef}
          className={cn(
            "flex min-w-0 flex-1 flex-col gap-4",
            fullscreen &&
              "fixed inset-0 z-50 gap-2 bg-background p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] landscape:flex-row",
          )}
        >
        {/* Toolbar */}
        <nav
          aria-label="Herramientas"
          className={cn(
            "flex shrink-0 flex-wrap gap-1 rounded-xl border border-border bg-card p-1.5",
            fullscreen &&
              "flex-nowrap overflow-x-auto p-1 landscape:grid landscape:w-[7.5rem] landscape:grid-cols-2 landscape:content-start landscape:overflow-y-auto landscape:overflow-x-hidden lg:landscape:w-40",
          )}
        >
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tool === t.id}
              onClick={() => setTool(t.id)}
              title={t.label}
              className={cn(
                "flex min-w-[68px] flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&_svg]:size-5",
                fullscreen && FS_TOOL_BTN,
                tool === t.id && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center",
                  t.id === "home" && tool !== t.id && "text-team-home",
                  t.id === "away" && tool !== t.id && "text-team-away",
                )}
              >
                {t.icon}
              </span>
              {t.label}
            </button>
          ))}
          {fullscreen && (
            <button
              type="button"
              onClick={undo}
              disabled={past.length === 0}
              title="Deshacer"
              className={cn(
                "flex min-w-[68px] flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40 [&_svg]:size-5",
                FS_TOOL_BTN,
              )}
            >
              <Undo2 />
              Deshacer
            </button>
          )}
          {fullscreen && (
          <button
            type="button"
            onClick={toggleFullscreen}
            className={cn(
              "flex min-w-[68px] flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&_svg]:size-5",
              fullscreen && cn(FS_TOOL_BTN, "portrait:ml-auto"),
            )}
          >
            <Minimize2 />
            Salir
          </button>
          )}
        </nav>

        {/* Court */}
        <div className={cn("flex min-w-0 flex-1 flex-col gap-2", fullscreen && "relative min-h-0")}>
          {fullscreen && (
            <p className="pointer-events-none absolute inset-x-0 top-2 z-10 mx-auto hidden w-fit items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-board max-sm:portrait:flex">
              <Smartphone className="size-4 rotate-90 text-primary" /> Gira el móvil para ver el campo más grande
            </p>
          )}
          <div
            className={cn(
              "overflow-hidden rounded-2xl shadow-board",
              fullscreen && "flex min-h-0 flex-1 items-center justify-center rounded-none shadow-none",
            )}
          >
            <ContextMenu>
            <ContextMenuTrigger asChild>
            <svg
              ref={svgRef}
              onContextMenu={onBoardContextMenu}
              viewBox={VIEWBOX}
              className={cn(
                "block h-auto w-full touch-none select-none",
                fullscreen && "h-full max-h-full",
                tool === "select" ? "cursor-default" : tool === "erase" ? "cursor-not-allowed" : "cursor-crosshair",
              )}
              onPointerDown={onBoardPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              role="application"
              aria-label="Campo de futsal"
            >
              <defs>
                <marker
                  id="arrowhead"
                  viewBox="0 0 10 10"
                  refX="7"
                  refY="5"
                  markerWidth="4"
                  markerHeight="4"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L10,5 L0,10 z" className="fill-arrow" />
                </marker>
                <marker
                  id="arrowhead-selected"
                  viewBox="0 0 10 10"
                  refX="7"
                  refY="5"
                  markerWidth="4"
                  markerHeight="4"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L10,5 L0,10 z" className="fill-primary" />
                </marker>
              </defs>

              <FutsalCourt />

              {/* Arrows */}
              {board.arrows.map((a) => {
                const sel = selection?.type === "arrow" && selection.id === a.id;
                const d = arrowPath(a);
                return (
                  <g key={a.id}>
                    <path
                      d={d}
                      className={cn("fill-none", sel ? "stroke-primary" : "stroke-arrow")}
                      strokeWidth={2.2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={a.kind === "run" ? "6 5" : undefined}
                      markerEnd={`url(#${sel ? "arrowhead-selected" : "arrowhead"})`}
                    />
                    <path
                      d={`M${a.x1},${a.y1} L${a.x2},${a.y2}`}
                      className="fill-none stroke-transparent"
                      strokeWidth={12}
                      style={{ cursor: tool === "select" ? "move" : undefined }}
                      data-item-type="arrow"
                      data-item-id={a.id}
                      onPointerDown={(e) => onItemPointerDown(e, "arrow", a.id)}
                    />
                  </g>
                );
              })}

              {/* Players */}
              {board.players.map((p) => {
                const sel = selection?.type === "player" && selection.id === p.id;
                const home = p.team === "home";
                return (
                  <g
                    key={p.id}
                    transform={`translate(${p.x} ${p.y})`}
                    style={{ cursor: tool === "select" ? "grab" : undefined }}
                    data-item-type="player"
                    data-item-id={p.id}
                    onPointerDown={(e) => onItemPointerDown(e, "player", p.id)}
                    onDoubleClick={() => {
                      setSelection({ type: "player", id: p.id });
                      setTimeout(() => nameInputRef.current?.focus(), 0);
                    }}
                  >
                    {sel && (
                      <circle r={13.5} className="fill-none stroke-primary" strokeWidth={1.6} strokeDasharray="3 2.5" data-export-ignore />
                    )}
                    <circle
                      r={9.5}
                      className={cn(
                        home ? "fill-team-home" : "fill-team-away",
                        p.goalkeeper ? "stroke-goalkeeper" : "stroke-court-line",
                      )}
                      strokeWidth={p.goalkeeper ? 2.4 : 1.4}
                    />
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      y={0.6}
                      className={cn(
                        "font-display",
                        home ? "fill-team-home-foreground" : "fill-team-away-foreground",
                      )}
                      fontSize={12}
                    >
                      {p.number}
                    </text>
                    {p.name && (
                      <text
                        y={19}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="player-label fill-court-line font-sans font-semibold"
                        fontSize={7}
                      >
                        {p.name}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Balls */}
              {board.balls.map((b) => {
                const sel = selection?.type === "ball" && selection.id === b.id;
                return (
                  <g
                    key={b.id}
                    transform={`translate(${b.x} ${b.y})`}
                    style={{ cursor: tool === "select" ? "grab" : undefined }}
                    data-item-type="ball"
                    data-item-id={b.id}
                    onPointerDown={(e) => onItemPointerDown(e, "ball", b.id)}
                  >
                    {sel && (
                      <circle r={8} className="fill-none stroke-primary" strokeWidth={1.4} strokeDasharray="2.5 2" data-export-ignore />
                    )}
                    <circle r={4.6} className="fill-ball stroke-ball-foreground" strokeWidth={0.8} />
                    <path d="M0,-2.2 L2.1,-0.7 L1.3,1.8 L-1.3,1.8 L-2.1,-0.7 Z" className="fill-ball-foreground" />
                  </g>
                );
              })}

              {/* Arrow handles */}
              {selectedArrow && (
                <g data-export-ignore>
                  {([1, 2] as const).map((end) => (
                    <circle
                      key={end}
                      cx={end === 1 ? selectedArrow.x1 : selectedArrow.x2}
                      cy={end === 1 ? selectedArrow.y1 : selectedArrow.y2}
                      r={4}
                      className="fill-primary stroke-primary-foreground"
                      strokeWidth={1}
                      style={{ cursor: "pointer" }}
                      onPointerDown={(e) => onHandlePointerDown(e, selectedArrow.id, end)}
                    />
                  ))}
                </g>
              )}
            </svg>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-52" container={fullscreen ? stageRef.current : null}>
              {ctxTarget?.type === "arrow" ? (
                <>
                  <ContextMenuLabel>Tipo de flecha</ContextMenuLabel>
                  {(Object.keys(ARROW_LABEL) as ArrowKind[]).map((k) => (
                    <ContextMenuItem key={k} onSelect={() => ctxSetArrowKind(ctxTarget.id, k)}>
                      {ARROW_LABEL[k]}
                    </ContextMenuItem>
                  ))}
                </>
              ) : ctxTarget?.type === "player" ? (
                <>
                  <ContextMenuLabel>Añadir flecha</ContextMenuLabel>
                  {(Object.keys(ARROW_LABEL) as ArrowKind[]).map((k) => (
                    <ContextMenuItem key={k} onSelect={() => ctxAddArrow(k)}>
                      {ARROW_LABEL[k]}
                    </ContextMenuItem>
                  ))}
                </>
              ) : ctxTarget?.type === "ball" ? null : (
                <>
                  <ContextMenuLabel>Añadir aquí</ContextMenuLabel>
                  <ContextMenuItem onSelect={() => ctxAddPlayer("home")}>Jugador {teamNames.home}</ContextMenuItem>
                  <ContextMenuItem onSelect={() => ctxAddPlayer("away")}>Jugador {teamNames.away}</ContextMenuItem>
                  <ContextMenuItem onSelect={ctxAddBall}>Balón</ContextMenuItem>
                  <ContextMenuSub>
                    <ContextMenuSubTrigger>Flecha</ContextMenuSubTrigger>
                    <ContextMenuSubContent>
                      {(Object.keys(ARROW_LABEL) as ArrowKind[]).map((k) => (
                        <ContextMenuItem key={k} onSelect={() => ctxAddArrow(k)}>
                          {ARROW_LABEL[k]}
                        </ContextMenuItem>
                      ))}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                </>
              )}
              {ctxTarget && (
                <>
                  {ctxTarget.type !== "ball" && <ContextMenuSeparator />}
                  <ContextMenuItem className="text-destructive" onSelect={() => removeItem(ctxTarget)}>
                    <Trash2 />
                    Eliminar {ctxTarget.type === "player" ? "jugador" : ctxTarget.type === "ball" ? "balón" : "flecha"}
                  </ContextMenuItem>
                </>
              )}
            </ContextMenuContent>
            </ContextMenu>
          </div>
          {/* Selection bar: fixed height so nothing below moves when selecting */}
          <div
            aria-live="polite"
            className={cn(
              "flex min-h-[60px] shrink-0 flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border bg-card px-4 py-2.5",
              // Fullscreen: float over the court only while something is selected, so the court keeps all the space.
              fullscreen &&
                "absolute inset-x-0 bottom-1 z-10 mx-auto min-h-0 w-fit max-w-[calc(100%-1rem)] gap-x-3 gap-y-1.5 bg-card/95 px-3 py-2 shadow-board backdrop-blur",
              fullscreen && !selection && "hidden",
            )}
          >
            {selectedPlayer ? (
              <>
                <span className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full font-display text-lg leading-none",
                      selectedPlayer.team === "home"
                        ? "bg-team-home text-team-home-foreground"
                        : "bg-team-away text-team-away-foreground",
                      selectedPlayer.goalkeeper && "ring-2 ring-goalkeeper",
                    )}
                  >
                    {selectedPlayer.number}
                  </span>
                  <span className={cn("font-display text-xl leading-none tracking-wide", fullscreen && "sr-only")}>Jugador</span>
                </span>
                <div className="flex items-center gap-2">
                  <Label htmlFor="pname" className={cn("text-xs text-muted-foreground", fullscreen && "sr-only")}>
                    Nombre
                  </Label>
                  <Input
                    id="pname"
                    ref={nameInputRef}
                    value={selectedPlayer.name}
                    placeholder="Ej. Ricardinho"
                    maxLength={18}
                    className={cn("h-8 w-44", fullscreen && "w-28 md:w-36")}
                    onChange={(e) => {
                      const v = e.target.value;
                      setBoard((b) => ({
                        ...b,
                        players: b.players.map((p) => (p.id === selectedPlayer.id ? { ...p, name: v } : p)),
                      }));
                    }}
                    onFocus={() => setPast((p) => [...p.slice(-49), boardRef.current])}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="pnum" className={cn("text-xs text-muted-foreground", fullscreen && "sr-only")}>
                    Dorsal
                  </Label>
                  <Input
                    id="pnum"
                    type="number"
                    min={1}
                    max={99}
                    value={selectedPlayer.number}
                    className={cn("h-8 w-16", fullscreen && "w-14")}
                    onChange={(e) => {
                      const n = Math.max(0, Math.min(99, Number(e.target.value) || 0));
                      setBoard((b) => ({
                        ...b,
                        players: b.players.map((p) => (p.id === selectedPlayer.id ? { ...p, number: n } : p)),
                      }));
                    }}
                    onFocus={() => setPast((p) => [...p.slice(-49), boardRef.current])}
                  />
                </div>
                <div className="flex gap-1.5" role="group" aria-label="Equipo">
                  {(["home", "away"] as const).map((t) => (
                    <Button
                      key={t}
                      size="sm"
                      className="h-8"
                      variant={selectedPlayer.team === t ? "default" : "secondary"}
                      onClick={() => updatePlayer(selectedPlayer.id, { team: t })}
                    >
                      <span className={cn("size-2.5 rounded-full", t === "home" ? "bg-team-home" : "bg-team-away")} />
                      <span className={cn(fullscreen && "max-md:sr-only")}>{teamNames[t]}</span>
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="pgk"
                    checked={selectedPlayer.goalkeeper}
                    onCheckedChange={(v) => updatePlayer(selectedPlayer.id, { goalkeeper: v })}
                  />
                  <Label htmlFor="pgk" className={cn(fullscreen && "text-xs")}>Portero</Label>
                </div>
                <div className={cn("ml-auto flex items-center gap-1.5", fullscreen && "ml-0")}>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8"
                    onClick={() => removeItem({ type: "player", id: selectedPlayer.id })}
                  >
                    <Trash2 /> <span className={cn(fullscreen && "max-md:sr-only")}>Quitar</span>
                  </Button>
                  <DeselectButton onClick={() => setSelection(null)} />
                </div>
              </>
            ) : selectedArrow ? (
              <>
                <span className={cn("font-display text-xl leading-none tracking-wide", fullscreen && "sr-only")}>Flecha</span>
                <div className="flex gap-1.5" role="group" aria-label="Tipo de flecha">
                  {(Object.keys(ARROW_LABEL) as ArrowKind[]).map((k) => (
                    <Button
                      key={k}
                      size="sm"
                      className="h-8"
                      variant={selectedArrow.kind === k ? "default" : "secondary"}
                      onClick={() => {
                        const b = boardRef.current;
                        commit({
                          ...b,
                          arrows: b.arrows.map((a) => (a.id === selectedArrow.id ? { ...a, kind: k } : a)),
                        });
                      }}
                    >
                      {ARROW_LABEL[k]}
                    </Button>
                  ))}
                </div>
                <p className={cn("text-xs text-muted-foreground", fullscreen && "hidden")}>Arrastra los extremos para ajustarla.</p>
                <div className={cn("ml-auto flex items-center gap-1.5", fullscreen && "ml-0")}>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8"
                    onClick={() => removeItem({ type: "arrow", id: selectedArrow.id })}
                  >
                    <Trash2 /> Quitar
                  </Button>
                  <DeselectButton onClick={() => setSelection(null)} />
                </div>
              </>
            ) : selection?.type === "ball" ? (
              <>
                <span className="font-display text-xl leading-none tracking-wide">Balón</span>
                <p className={cn("text-xs text-muted-foreground", fullscreen && "hidden")}>Arrástralo para moverlo.</p>
                <div className={cn("ml-auto flex items-center gap-1.5", fullscreen && "ml-0")}>
                  <Button variant="destructive" size="sm" className="h-8" onClick={() => removeItem(selection)}>
                    <Trash2 /> Quitar
                  </Button>
                  <DeselectButton onClick={() => setSelection(null)} />
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{TOOLS.find((t) => t.id === tool)?.label}:</span>{" "}
                {activeHint}. Selecciona un jugador, balón o flecha para editarlo aquí · Supr para borrar ·
                Ctrl+Z para deshacer.
              </p>
            )}
          </div>
        </div>
        </div>

        {/* Panels below the court: fixed three columns */}
        <aside className="grid w-full shrink-0 items-start gap-4 md:grid-cols-3">


          {(["home", "away"] as const).map((team) => {
            const players = board.players
              .filter((p) => p.team === team)
              .sort((a, b) => Number(b.goalkeeper) - Number(a.goalkeeper) || a.number - b.number);
            return (
              <Panel
                key={team}
                title={
                  <span className="flex items-center gap-2">
                    <span className={cn("size-3 rounded-full", team === "home" ? "bg-team-home" : "bg-team-away")} />
                    <input
                      aria-label="Nombre del equipo"
                      value={teamNames[team]}
                      maxLength={20}
                      onChange={(e) => setTeamNames((n) => ({ ...n, [team]: e.target.value }))}
                      className="w-full min-w-0 bg-transparent font-display text-2xl leading-none tracking-wide outline-none focus:text-primary"
                    />
                  </span>
                }
              >
                <div className="flex gap-2">
                  <select
                    aria-label="Formación"
                    value={formation[team]}
                    onChange={(e) => setFormation((f) => ({ ...f, [team]: e.target.value }))}
                    className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {FORMATIONS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="secondary" onClick={() => placeFormation(team)}>
                    Colocar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Eliminar equipo ${teamNames[team]}`}
                    onClick={() => clearTeam(team)}
                  >
                    <Trash2 />
                    Eliminar
                  </Button>
                </div>
                {players.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Sin jugadores. Elige una formación o usa la herramienta «{team === "home" ? "Local" : "Rival"}».
                  </p>
                ) : (
                  <ul className="flex flex-col gap-0.5">
                    {players.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setSelection({ type: "player", id: p.id })}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-md px-2 py-1 text-left text-sm hover:bg-accent",
                            selection?.id === p.id && "bg-accent",
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-6 items-center justify-center rounded-full font-display text-sm",
                              team === "home"
                                ? "bg-team-home text-team-home-foreground"
                                : "bg-team-away text-team-away-foreground",
                              p.goalkeeper && "ring-2 ring-goalkeeper",
                            )}
                          >
                            {p.number}
                          </span>
                          <span className="truncate">{p.name || <em className="text-muted-foreground">Sin nombre</em>}</span>
                          {p.goalkeeper && (
                            <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-goalkeeper">
                              Portero
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            );
          })}

          <Panel title="Mis alineaciones">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                saveCurrent();
              }}
            >
              <Input
                aria-label="Nombre de la alineación"
                value={lineupName}
                onChange={(e) => setLineupName(e.target.value)}
                placeholder={`Alineación ${saved.length + 1}`}
                maxLength={40}
                className="h-8"
              />
              <Button type="submit" size="sm">
                <Save /> Guardar
              </Button>
            </form>
            {saved.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Ponle un nombre y guárdala. Si usas un nombre que ya existe, se actualiza.
              </p>
            ) : (
              <ul className="flex max-h-60 flex-col gap-0.5 overflow-y-auto">
                {saved.map((l) => (
                  <li
                    key={l.id}
                    className={cn(
                      "group flex items-center gap-1 rounded-md pl-2 hover:bg-accent",
                      l.name === lineupName.trim() && "bg-accent",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => loadLineup(l)}
                      className="flex min-w-0 flex-1 flex-col py-1.5 text-left"
                      title="Cargar en la pizarra"
                    >
                      <span className="truncate text-sm font-medium">{l.name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {l.board.players.length} jugadores · {l.board.arrows.length} flechas ·{" "}
                        {new Date(l.savedAt).toLocaleDateString("es-ES", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 px-2.5"
                      aria-label={`Usar ${l.name} en el campo`}
                      title="Poner esta alineación en el campo"
                      onClick={() => loadLineup(l)}
                    >
                      <Play />
                      Usar
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      aria-label={`Borrar ${l.name}`}
                      onClick={() => deleteLineup(l)}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function DeselectButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-8 text-muted-foreground"
      aria-label="Quitar selección"
      title="Quitar selección"
      onClick={onClick}
    >
      <X />
    </Button>
  );
}

function Panel({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      {typeof title === "string" ? (
        <h2 className="font-display text-2xl leading-none tracking-wide">{title}</h2>
      ) : (
        <h2>{title}</h2>
      )}
      {children}
    </section>
  );
}

const STYLE_PROPS = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "paint-order",
];

function inlineStyles(src: Element, dst: Element) {
  const cs = getComputedStyle(src);
  dst.setAttribute("style", STYLE_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(";"));
  for (let i = 0; i < src.children.length; i++) {
    const s = src.children[i];
    const d = dst.children[i];
    if (s && d) inlineStyles(s, d);
  }
}

async function svgToPng(svg: SVGSVGElement): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, clone);
  clone.querySelectorAll("[data-export-ignore]").forEach((n) => n.remove());
  const vb = svg.viewBox.baseVal;
  const scale = 4;
  clone.setAttribute("width", String(vb.width * scale));
  clone.setAttribute("height", String(vb.height * scale));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const xml = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = src;
  });
  const canvas = document.createElement("canvas");
  canvas.width = vb.width * scale;
  canvas.height = vb.height * scale;
  const ctx = canvas.getContext("2d");
  ctx?.drawImage(img, 0, 0);
  return canvas.toDataURL("image/png");
}
