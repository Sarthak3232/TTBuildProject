/** Local session display only; never used to award tokens. */
export class StudyClock {
  elapsedMs = 0;
  running = false;
  private goodSince: number | null = null;
  private badSince: number | null = null;
  private lastObservation = -Infinity;
  private updatedAt = 0;

  snapshot(now: number) {
    const end = Math.min(now, this.lastObservation + 3000,
      this.badSince === null ? Infinity : this.badSince + 5000);
    if (this.running) this.elapsedMs += Math.max(0, end - this.updatedAt);
    if (now - this.lastObservation > 3000 || (this.badSince !== null && now - this.badSince >= 5000)) {
      this.running = false;
      this.goodSince = null;
    }
    this.updatedAt = now;
    return { elapsedMs: this.elapsedMs, running: this.running };
  }

  observe(state: "compatible" | "away" | "unknown", now: number) {
    this.snapshot(now);
    if (state === "compatible") {
      this.badSince = null;
      this.goodSince ??= now;
      if (now - this.goodSince >= 2000) this.running = true;
    } else {
      this.goodSince = null;
      this.badSince ??= now;
      if (now - this.badSince >= 5000) this.running = false;
    }
    this.lastObservation = now;
    return { elapsedMs: this.elapsedMs, running: this.running };
  }

  pause(now: number) {
    this.snapshot(now);
    this.running = false;
    this.goodSince = null;
    this.badSince = null;
    this.lastObservation = -Infinity;
  }
}

export function formatStudyTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 3600).toString().padStart(2, "0")}:${Math.floor(seconds / 60 % 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
