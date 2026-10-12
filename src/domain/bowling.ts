export interface FrameView {
  index: number;
  rolls: number[];
  isStrike: boolean;
  isSpare: boolean;
  isComplete: boolean;
  isPending: boolean;
  display: string;
  runningOfficial: number | null;
  frameValue: number | null;
  confirmed: boolean;
}

export interface GameScore {
  rolls: number[];
  official: number;
  complete: boolean;
  frames: FrameView[];
  currentFrame: number;
  nextRollMax: number;
  waitingFuture: boolean;
}

function isStrike(rolls: number[], i: number) {
  return rolls[i] === 10;
}

function isSpare(rolls: number[], i: number) {
  return (rolls[i] ?? 0) + (rolls[i + 1] ?? 0) === 10 && rolls[i] !== 10;
}

function sum(rolls: number[], start: number, n: number): number | null {
  let total = 0;
  for (let k = 0; k < n; k++) {
    if (rolls[start + k] === undefined) return null;
    total += rolls[start + k];
  }
  return total;
}

export function validateRoll(rolls: number[], pins: number): string | null {
  if (!Number.isInteger(pins) || pins < 0 || pins > 10) {
    return "Cada lanzamiento debe derribar entre 0 y 10 bolos.";
  }
  const game = scoreGame(rolls);
  if (game.complete) return "La partida ya está completa.";
  if (pins > game.nextRollMax) {
    return `En este lanzamiento como máximo puedes derribar ${game.nextRollMax} bolos.`;
  }
  return null;
}

export function applyRoll(rolls: number[], pins: number): number[] {
  const error = validateRoll(rolls, pins);
  if (error) throw new Error(error);
  return [...rolls, pins];
}

export function scoreGame(rolls: number[]): GameScore {
  const frames: FrameView[] = [];
  let i = 0;
  let official = 0;
  let complete = true;
  let waitingFuture = false;

  for (let f = 1; f <= 10; f++) {
    if (f < 10) {
      const first = rolls[i];
      if (first === undefined) {
        complete = false;
        frames.push(emptyFrame(f, official));
        for (let k = f + 1; k <= 10; k++) frames.push(emptyFrame(k, null));
        break;
      }
      if (first === 10) {
        const bonus = sum(rolls, i + 1, 2);
        const pending = bonus === null;
        const value = pending ? null : 10 + bonus;
        if (!pending) official += value!;
        else {
          complete = false;
          waitingFuture = true;
        }
        frames.push({
          index: f,
          rolls: [10],
          isStrike: true,
          isSpare: false,
          isComplete: true,
          isPending: pending,
          display: "X",
          runningOfficial: pending ? null : official,
          frameValue: value,
          confirmed: !pending,
        });
        i += 1;
      } else {
        const second = rolls[i + 1];
        if (second === undefined) {
          complete = false;
          frames.push({
            index: f,
            rolls: [first],
            isStrike: false,
            isSpare: false,
            isComplete: false,
            isPending: true,
            display: String(first),
            runningOfficial: null,
            frameValue: null,
            confirmed: false,
          });
          for (let k = f + 1; k <= 10; k++) frames.push(emptyFrame(k, null));
          break;
        }
        const spare = first + second === 10;
        const open = first + second;
        if (spare) {
          const bonus = rolls[i + 2];
          const pending = bonus === undefined;
          const value = pending ? null : 10 + bonus;
          if (!pending) official += value!;
          else {
            complete = false;
            waitingFuture = true;
          }
          frames.push({
            index: f,
            rolls: [first, second],
            isStrike: false,
            isSpare: true,
            isComplete: true,
            isPending: pending,
            display: `${first} /`,
            runningOfficial: pending ? null : official,
            frameValue: value,
            confirmed: !pending,
          });
        } else {
          official += open;
          frames.push({
            index: f,
            rolls: [first, second],
            isStrike: false,
            isSpare: false,
            isComplete: true,
            isPending: false,
            display: `${first} ${second}`,
            runningOfficial: official,
            frameValue: open,
            confirmed: true,
          });
        }
        i += 2;
      }
    } else {
      const first = rolls[i];
      if (first === undefined) {
        complete = false;
        frames.push(emptyFrame(10, official));
        break;
      }
      const have = rolls.slice(i);
      const got = have.slice(0, Math.min(have.length, 3));
      const ready = got.length >= (first === 10 ? 3 : got[1] !== undefined && first + got[1] === 10 ? 3 : 2);
      if (!ready) {
        complete = false;
        frames.push({
          index: 10,
          rolls: got,
          isStrike: first === 10,
          isSpare: got.length >= 2 && first !== 10 && first + got[1] === 10,
          isComplete: false,
          isPending: true,
          display: formatTenth(got),
          runningOfficial: null,
          frameValue: null,
          confirmed: false,
        });
        break;
      }
      const value = got.reduce((a, b) => a + b, 0);
      official += value;
      frames.push({
        index: 10,
        rolls: got,
        isStrike: first === 10,
        isSpare: first !== 10 && got.length >= 2 && first + got[1] === 10,
        isComplete: true,
        isPending: false,
        display: formatTenth(got),
        runningOfficial: official,
        frameValue: value,
        confirmed: true,
      });
    }
  }

  return {
    rolls,
    official,
    complete,
    frames,
    currentFrame: complete ? 10 : currentUnfinishedFrame(frames),
    nextRollMax: nextMax(rolls),
    waitingFuture,
  };
}

function currentUnfinishedFrame(frames: FrameView[]): number {
  const open = frames.find((f) => !f.isComplete);
  if (open) return open.index;
  const tenth = frames.find((f) => f.index === 10);
  if (tenth && !tenth.isComplete) return 10;
  const lastFilled = [...frames].reverse().find((f) => f.rolls.length > 0);
  return lastFilled?.index ?? 1;
}

function emptyFrame(index: number, running: number | null): FrameView {
  return {
    index,
    rolls: [],
    isStrike: false,
    isSpare: false,
    isComplete: false,
    isPending: false,
    display: "",
    runningOfficial: running,
    frameValue: null,
    confirmed: false,
  };
}

function formatTenth(rolls: number[]): string {
  return rolls
    .map((r, idx) => {
      if (r === 10) return "X";
      if (idx > 0 && rolls[idx - 1] !== 10 && rolls[idx - 1] + r === 10) return "/";
      return String(r);
    })
    .join(" ");
}

function nextMax(rolls: number[]): number {
  let i = 0;
  for (let f = 1; f <= 9; f++) {
    if (rolls[i] === undefined) return 10;
    if (rolls[i] === 10) {
      i += 1;
      continue;
    }
    if (rolls[i + 1] === undefined) return 10 - rolls[i];
    i += 2;
  }
  const first = rolls[i];
  if (first === undefined) return 10;
  const second = rolls[i + 1];
  if (second === undefined) {
    if (first === 10) return 10;
    return 10 - first;
  }
  const third = rolls[i + 2];
  if (third !== undefined) return 0;
  if (first === 10) {
    if (second === 10) return 10;
    return 10 - second;
  }
  if (first + second === 10) return 10;
  return 0;
}

export function frameJustCompleted(previous: number[], next: number[]): number | null {
  const before = scoreGame(previous);
  const after = scoreGame(next);
  if (after.frames.filter((f) => f.isComplete).length > before.frames.filter((f) => f.isComplete).length) {
    const done = after.frames.filter((f) => f.isComplete);
    return done[done.length - 1]?.index ?? null;
  }
  return null;
}

export function lastRollWasStrike(rolls: number[]): boolean {
  if (!rolls.length) return false;
  const g = scoreGame(rolls.slice(0, -1));
  const last = rolls[rolls.length - 1];
  return last === 10 && g.currentFrame <= 10;
}

export function lastCompletedFrameIsStrike(rolls: number[]): boolean {
  const g = scoreGame(rolls);
  const completed = [...g.frames].reverse().find((f) => f.isComplete);
  return Boolean(completed?.isStrike);
}

export function lastCompletedFrameIsSpare(rolls: number[]): boolean {
  const g = scoreGame(rolls);
  const completed = [...g.frames].reverse().find((f) => f.isComplete);
  return Boolean(completed?.isSpare);
}

export function pinsOnLastThrow(rolls: number[]): number {
  return rolls[rolls.length - 1] ?? 0;
}

export { isStrike, isSpare };
