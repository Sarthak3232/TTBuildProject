import type { SerialPortLike } from "../../src/features/redeem/usb/link";

export function fakeReelMotor(options: { wrongLanding?: boolean; dropSpinReply?: boolean; dropDrawerReply?: boolean; refuseSpin?: boolean; drivers?: number; calibrated?: boolean; drawerCalibration?: string } = {}) {
  const commands: string[] = [];
  const commandTimes: { command: string; at: number }[] = [];
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let interval: ReturnType<typeof setInterval>;
  let aligned = options.calibrated ?? false; let spinning = false; let energised = true;
  let sectors = [0, 0, 0]; let phases = [0, 0, 0, 0];
  let active = true;
  const emit = (line: string) => { if (active) controller.enqueue(new TextEncoder().encode(`${line}\r\n`)); };
  const heartbeat = () => emit(`S ${Number(energised)} ${options.drivers ?? 7} ${Number(aligned)} ${Number(spinning)} ${sectors.map(s => `${s * 200 + 100} ${s * 4500 + 2250} ${s} ${Number(spinning)} 1600 0`).join(" ")} 1 ${phases.join("")} ${options.drawerCalibration ?? "1111"}`);
  const port: SerialPortLike = {
    readable: new ReadableStream<Uint8Array>({ start(c) { controller = c; }, cancel() { active = false; clearInterval(interval); } }),
    writable: new WritableStream<Uint8Array>({ write(value) {
      if (!new TextDecoder().decode(value).trim()) return;
      const [seq, verb, ...args] = new TextDecoder().decode(value).trim().split(" ");
      const command = [verb, ...args].join(" "); commands.push(command);
      commandTimes.push({ command, at: Date.now() });
      const reply = (ok = true, text = "ok") => emit(`R ${seq} ${Number(ok)} ${text}`);
      if (verb === "PING") { reply(true, "pong"); heartbeat(); }
      else if (verb === "EN") { energised = args[0] === "1"; reply(); heartbeat(); }
      else if (verb === "ALIGNED") { aligned = true; reply(); heartbeat(); }
      else if (verb === "DMARK") { const drawer = Number(args[0]); phases = phases.map((p, i) => drawer === 4 || drawer === i ? 1 : p); reply(); heartbeat(); }
      else if (verb === "STOP") { spinning = false; aligned = false; energised = false; reply(); emit("E STOPPED"); heartbeat(); }
      else if (verb === "SPIN") {
        if (options.refuseSpin) { reply(false, "busy"); return; }
        spinning = true; energised = true;
        if (!options.dropSpinReply) reply(); heartbeat();
        setTimeout(() => {
          sectors = args.map(n => Math.floor(Number(n) / 4500));
          if (options.wrongLanding) sectors[0] = (sectors[0] + 1) % 8;
          spinning = false; emit(`E LANDED ${sectors.join(" ")}`); heartbeat();
        }, 25);
      } else if (verb === "DOPEN") {
        const drawer = Number(args[0]); phases[drawer] = 2;
        if (!options.dropDrawerReply) reply(); heartbeat();
        setTimeout(() => { phases[drawer] = 3; emit(`E DRAWER ${phases.join("")}`); heartbeat(); }, 25);
      } else if (verb === "DCLOSE") {
        const drawer = Number(args[0]); phases[drawer] = 4; reply(); heartbeat();
        setTimeout(() => { phases[drawer] = 1; emit(`E DRAWER ${phases.join("")}`); heartbeat(); }, 25);
      } else reply(false, "unknown command");
    } }),
    async open() { interval = setInterval(heartbeat, 25); },
    async close() { active = false; clearInterval(interval); },
  };
  return { port, commands, commandTimes, emit, heartbeat, setPhases: (value: number[]) => { phases = value; heartbeat(); } };
}
