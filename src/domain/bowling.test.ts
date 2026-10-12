import { describe, expect, it } from "vitest";
import { applyRoll, scoreGame, validateRoll } from "./bowling";

function play(pins: number[]) {
  let rolls: number[] = [];
  for (const p of pins) rolls = applyRoll(rolls, p);
  return scoreGame(rolls);
}

describe("puntuación oficial ten-pin", () => {
  it("partida perfecta 300", () => {
    const g = play(Array(12).fill(10));
    expect(g.official).toBe(300);
    expect(g.complete).toBe(true);
    expect(g.frames.every((f) => f.confirmed)).toBe(true);
  });

  it("todo abierto 9-0", () => {
    const pins: number[] = [];
    for (let i = 0; i < 10; i++) pins.push(9, 0);
    expect(play(pins).official).toBe(90);
  });

  it("spares 5/5", () => {
    const pins: number[] = [];
    for (let i = 0; i < 10; i++) pins.push(5, 5);
    pins.push(5);
    expect(play(pins).official).toBe(150);
  });

  it("strike suma los dos siguientes", () => {
    expect(play([10, 3, 6, ...Array(16).fill(0)]).official).toBe(28);
  });

  it("spare suma el siguiente", () => {
    expect(play([7, 3, 4, 0, ...Array(16).fill(0)]).official).toBe(18);
  });

  it("décimo frame strike extra", () => {
    const pins = [...Array(18).fill(0), 10, 10, 10];
    expect(play(pins).official).toBe(30);
  });

  it("décimo frame spare extra", () => {
    const pins = [...Array(18).fill(0), 5, 5, 8];
    expect(play(pins).official).toBe(18);
  });

  it("no permite más bolos de los que quedan", () => {
    expect(validateRoll([9], 2)).toMatch(/máximo/);
  });

  it("frame pendiente de strike no está confirmado", () => {
    const g = scoreGame([10]);
    expect(g.frames[0].isPending).toBe(true);
    expect(g.frames[0].confirmed).toBe(false);
    expect(g.frames[0].runningOfficial).toBeNull();
  });

  it("rechaza partida completa", () => {
    const rolls = Array(12).fill(10);
    expect(validateRoll(rolls, 1)).toMatch(/completa/);
  });
});
