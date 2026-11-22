import { describe, expect, it } from "vitest";
import { FORMATIONS, applyFormation, emptyBoard, nextNumber, type Player } from "./board";

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
