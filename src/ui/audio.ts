let ctx: AudioContext | null = null;

function ac() {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function beep(kind: "item" | "strike" | "hit" | "win" | "click", muted: boolean) {
  if (muted) return;
  try {
    const c = ac();
    const o = c.createOscillator();
    const g = c.createGain();
    o.connect(g);
    g.connect(c.destination);
    const now = c.currentTime;
    const map = {
      click: [440, 0.06],
      item: [660, 0.18],
      strike: [880, 0.28],
      hit: [220, 0.2],
      win: [523, 0.4],
    } as const;
    const [freq, dur] = map[kind];
    o.frequency.value = freq;
    o.type = kind === "hit" ? "sawtooth" : "square";
    g.gain.setValueAtTime(0.04, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.start(now);
    o.stop(now + dur);
  } catch {
    /* autoplay restrictions */
  }
}
