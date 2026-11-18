import type { SerialPortLike } from "../../src/features/redeem/usb/link";

export function fakeReelMotor(options: { wrongLanding?: boolean; dropSpinReply?: boolean; dropDrawerReply?: boolean; refuseSpin?: boolean; drivers?: number; calibrated?: boolean } = {}) {
  const commands: string[] = [];
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let interval: ReturnType<typeof setInterval>;
  let aligned = options.calibrated ?? false; let spinning = false;
  let sectors = [0, 0, 0]; let phases = [0, 0, 0, 0];
  let active = true;
  const emit = (line: string) => { if (active) controller.enqueue(new TextEncoder().encode(`${line}\r\n`)); };
  const heartbeat = () => emit(`S 1 ${options.drivers ?? 7} ${Number(aligned)} ${Number(spinning)} ${sectors.map(s => `${s * 200 + 100} ${s * 4500 + 2250} ${s} ${Number(spinning)} 1600 0`).join(" ")} 1 ${phases.join("")} 1111`);
  const port: SerialPortLike = {
    readable: new ReadableStream<Uint8Array>({ start(c) { controller = c; }, cancel() { active = false; clearInterval(interval); } }),
    writable: new WritableStream<Uint8Array>({ write(value) {
      const [seq, verb, ...args] = new TextDecoder().decode(value).trim().split(" ");
      const command = [verb, ...args].join(" "); commands.push(command);
      const reply = (ok = true, text = "ok") => emit(`R ${seq} ${Number(ok)} ${text}`);
      if (verb === "PING") { reply(true, "pong"); heartbeat(); }
      else if (verb === "ALIGNED") { aligned = true; reply(); heartbeat(); }
      else if (verb === "DMARK") { phases = [1, 1, 1, 1]; reply(); heartbeat(); }
      else if (verb === "STOP") { spinning = false; aligned = false; reply(); emit("E STOPPED"); heartbeat(); }
      else if (verb === "SPIN") {
        if (options.refuseSpin) { reply(false, "busy"); return; }
        spinning = true;
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
      } else reply(false, "unknown command");
    } }),
    async open() { interval = setInterval(heartbeat, 25); },
    async close() { active = false; clearInterval(interval); },
  };
  return { port, commands, emit, heartbeat, setPhases: (value: number[]) => { phases = value; heartbeat(); } };
}
