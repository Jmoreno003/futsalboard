import { describe, expect, it } from "vitest";
import { FORMATIONS, applyFormation, emptyBoard, nextNumber, saveLineup, type Player } from "./board";

const p = (team: "home" | "away", number: number): Player => ({
  id: `${team}-${number}`,
  team,
  number,
  x: 0,
  y: 0,
  name: "",
  goalkeeper: false,
});

describe("board rules", () => {
  it("gives a new player the lowest free shirt number for their team", () => {
    expect(nextNumber([p("home", 1), p("home", 2), p("home", 4), p("away", 3)], "home")).toBe(3);
  });

  it("a formation places 5 players, one goalkeeper", () => {
    const four = FORMATIONS[0];
    if (!four) throw new Error("missing formation");
    const state = applyFormation(emptyBoard, four, "home");
    expect(state.players).toHaveLength(5);
    expect(state.players.filter((x) => x.goalkeeper)).toHaveLength(1);
  });

  it("loading a formation for one team leaves the other team in place", () => {
    const f = FORMATIONS[1];
    if (!f) throw new Error("missing formation");
    const start = { ...emptyBoard, players: [p("away", 7)] };
    const state = applyFormation(start, f, "home");
    expect(state.players.filter((x) => x.team === "away").map((x) => x.number)).toEqual([7]);
  });

  it("away formation sits in the right half of the court", () => {
    const f = FORMATIONS[0];
    if (!f) throw new Error("missing formation");
    const state = applyFormation(emptyBoard, f, "away");
    expect(state.players.every((x) => x.x >= 200)).toBe(true);
  });
});

describe("saved lineups", () => {
  const names = { home: "Local", away: "Rival" };

  it("saving under a new name adds a lineup", () => {
    const one = saveLineup([], "Presión alta", emptyBoard, names, 1);
    const two = saveLineup(one, "Salida de balón", emptyBoard, names, 2);
    expect(two.map((l) => l.name)).toEqual(["Salida de balón", "Presión alta"]);
  });

  it("saving under an existing name overwrites it instead of duplicating", () => {
    const one = saveLineup([], "Presión alta", emptyBoard, names, 1);
    const withPlayer = { ...emptyBoard, players: [p("home", 9)] };
    const two = saveLineup(one, "presión alta", withPlayer, names, 2);
    expect(two).toHaveLength(1);
    expect(two[0]?.board.players).toHaveLength(1);
  });

  it("an empty name gets a numbered default", () => {
    const one = saveLineup([], "  ", emptyBoard, names, 1);
    expect(one[0]?.name).toBe("Alineación 1");
  });
});
