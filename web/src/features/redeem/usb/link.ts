// The ReelMotor USB protocol, not the older SlottyUsbDemo/WiFi bridge protocol.
export interface SerialPortLike {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
}
export type BoardState = {
  energised: boolean; aligned: boolean; drivers: number; spinning: boolean; servoBoard: boolean;
  reels: { sector: number; moving: boolean; stepsPerTurn: number }[];
  drawers: { phase: number; calibrated: boolean }[];
};
export type BoardEvent = { kind: "state"; state: BoardState } | { kind: "line"; line: string } | { kind: "fault"; reason: string };
type Command = `DTIME ${number} 3000 3000` | `DCONF ${number} 1` | "PING" | "EN 0" | "EN 1" | "ALIGNED 1" | `DMARK ${number} closed` | "STOP" | `SPIN ${number} ${number} ${number}` | `DOPEN ${number}` | `DCLOSE ${number}`;

export function parseState(line: string): BoardState | null {
  const w = line.trim().split(/\s+/);
  if (w[0] !== "S" || w.length < 26 || !w.slice(1, 24).every(v => /^\d+$/.test(v))) return null;
  if (![1, 3, 4, 23].every(i => /^[01]$/.test(w[i])) || Number(w[2]) > 7 || !/^[0-5]{4}$/.test(w[24]) || !/^[01]{4}$/.test(w[25])) return null;
  const reels = [];
  for (let i = 0; i < 3; i++) {
    const b = 5 + i * 6;
    if (Number(w[b + 2]) > 7 || Number(w[b + 1]) >= 36000 || Number(w[b + 4]) < 16 || Number(w[b]) >= Number(w[b + 4]) || !/^[01]$/.test(w[b + 3]) || !/^[01]$/.test(w[b + 5])) return null;
    reels.push({ sector: Number(w[b + 2]), moving: w[b + 3] === "1", stepsPerTurn: Number(w[b + 4]) });
  }
  return { energised: w[1] === "1", aligned: w[3] === "1", drivers: Number(w[2]), spinning: w[4] === "1", servoBoard: w[23] === "1", reels,
    drawers: [...w[24]].map((phase, i) => ({ phase: Number(phase), calibrated: w[25][i] === "1" })) };
}

export class UsbReelLink {
  state: BoardState | null = null;
  private heardAt = 0;
  private port: SerialPortLike | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readTask: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private seq = 100_000_000 + Math.floor(Math.random() * 100_000_000);
  private pending = new Map<number, { resolve: (reply: { ok: boolean; text: string }) => void; reject: (error: Error) => void }>();
  private listeners = new Set<(event: BoardEvent) => void>();
  get fresh() { return Boolean(this.writer && this.state && Date.now() - this.heardAt < 1500); }
  get attached() { return Boolean(this.port); }
  subscribe(listener: (event: BoardEvent) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private emit(event: BoardEvent) { this.listeners.forEach(listener => listener(event)); }
  private fault(reason: string) {
    this.heardAt = 0;
    for (const request of this.pending.values()) request.reject(new Error(reason));
    this.pending.clear();
    this.emit({ kind: "fault", reason });
  }
  private handle(line: string) {
    const state = parseState(line);
    if (state) { this.state = state; this.heardAt = Date.now(); this.emit({ kind: "state", state }); return; }
    const reply = /^R (\d+) ([01])(?: (.*))?$/.exec(line);
    if (reply) this.pending.get(Number(reply[1]))?.resolve({ ok: reply[2] === "1", text: reply[3] ?? "" });
    if (/^E (BOOT|STOPPED|LINKLOST|UNCONFIRMED)( |$)/.test(line)) this.fault(`Board interrupted: ${line}`);
    this.emit({ kind: "line", line });
  }
  async connect(port: SerialPortLike) {
    if (this.port) throw new Error("Disconnect the current board first.");
    this.port = port;
    try {
      await port.open({ baudRate: 115200 });
      if (!port.readable || !port.writable) throw new Error("This port has no serial streams.");
      this.reader = port.readable.getReader(); this.writer = port.writable.getWriter();
      this.readTask = this.readLoop(this.reader);
      // Clear a partial line left by a previous serial client. ReelMotor ignores empty lines.
      await this.writer.write(new TextEncoder().encode("\n"));
      const heartbeat = this.waitFor(event => event.kind === "state", 5000);
      try {
        // Some USB adapters lose the first probe while the board starts up.
        // Only the read-only handshake is retried, never motion commands.
        let reply: { ok: boolean; text: string } | undefined;
        for (let attempt = 0; attempt < 2; attempt++) {
          try { reply = await this.send("PING"); break; }
          catch (error) { if (attempt === 1) throw error; }
        }
        if (!reply?.ok || reply.text !== "pong") throw new Error("Select the ReelMotor ESP32 running reel-engine firmware.");
        await heartbeat.promise;
      } finally { heartbeat.cancel(); }
      // Operator preference: trust saved reel positions on each new USB session.
      // ALIGNED records that assumption; it does not home or move the reels.
      const alignment = this.waitFor(event => event.kind === "state" && event.state.aligned, 3000);
      try {
        const reply = await this.send("ALIGNED 1");
        if (!reply.ok) throw new Error(reply.text);
        await alignment.promise;
      } finally { alignment.cancel(); }
      this.timer = setInterval(() => {
        if (!this.fresh) { this.fault("USB heartbeat lost. Inspect the machine before continuing."); return; }
        void this.send("PING").catch(() => this.fault("USB keepalive failed."));
      }, 700);
    } catch (error) { await this.disconnect(); throw error; }
  }
  private async readLoop(reader: ReadableStreamDefaultReader<Uint8Array>) {
    const decoder = new TextDecoder(); let buffer = ""; let overflow = false;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        for (const ch of decoder.decode(value, { stream: true })) {
          if (ch === "\r") continue;
          if (ch === "\n") { if (!overflow) this.handle(buffer.trim()); buffer = ""; overflow = false; }
          else if (buffer.length < 512) buffer += ch;
          else overflow = true;
        }
      }
    } catch { /* Removal and stream errors both invalidate the active operation. */ }
    finally { reader.releaseLock(); this.fault("USB connection closed. Inspect any interrupted delivery."); }
  }
  async send(command: Command): Promise<{ ok: boolean; text: string }> {
    if (!this.writer) throw new Error("Connect the USB motor board first.");
    const seq = ++this.seq;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reply = new Promise<{ ok: boolean; text: string }>((resolve, reject) => {
      this.pending.set(seq, { resolve, reject });
      timer = setTimeout(() => reject(new Error(`No USB reply to ${command.split(" ")[0]}. Do not retry motion; inspect the machine.`)), 2000);
    });
    // Attach rejection handling before starting the write (the device can disappear during it).
    const write = this.writer.write(new TextEncoder().encode(`${seq} ${command}\n`)).catch(error => this.pending.get(seq)?.reject(error));
    try { const result = await reply; await write; return result; }
    finally { clearTimeout(timer); this.pending.delete(seq); }
  }
  async setReelPower(energised: boolean) {
    if (!this.fresh || !this.state) throw new Error("Wait for a fresh USB connection before changing reel power.");
    if (this.state.spinning || this.state.reels.some(reel => reel.moving) || this.state.drawers.some(drawer => [2, 4, 5].includes(drawer.phase))) {
      throw new Error("Wait for the machine to finish before changing reel power.");
    }
    const updated = this.waitFor(event => event.kind === "state" && event.state.energised === energised, 3000);
    try {
      const reply = await this.send(energised ? "EN 1" : "EN 0");
      if (!reply.ok) throw new Error(reply.text);
      await updated.promise;
    } finally { updated.cancel(); }
  }
  waitFor(predicate: (event: BoardEvent) => boolean, timeoutMs = 120_000) {
    let unsubscribe = () => {}; let timer: ReturnType<typeof setTimeout> | undefined;
    const promise = new Promise<BoardEvent>((resolve, reject) => {
      unsubscribe = this.subscribe(event => {
        if (event.kind === "fault") reject(new Error(event.reason));
        else if (predicate(event)) resolve(event);
      });
      timer = setTimeout(() => reject(new Error("Machine completion timed out. Inspect before continuing.")), timeoutMs);
    });
    const cancel = () => { unsubscribe(); clearTimeout(timer); };
    void promise.then(cancel, cancel);
    return { promise, cancel };
  }
  async disconnect() {
    clearInterval(this.timer); this.timer = undefined;
    const port = this.port; this.port = null;
    if (this.reader) { try { await this.reader.cancel(); } catch {} this.reader = null; }
    await this.readTask; this.readTask = null;
    this.writer?.releaseLock(); this.writer = null;
    if (port) { try { await port.close(); } catch {} }
    this.state = null; this.fault("USB disconnected.");
  }
}
