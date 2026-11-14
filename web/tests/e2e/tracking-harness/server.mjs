// Test-only component host. No production routes, accounts, credentials or auth bypass.
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";
const harnessRoot = fileURLToPath(new URL(".", import.meta.url));
const webRoot = path.resolve(harnessRoot, "../../..");
const server = await createServer({
  root: harnessRoot,
  configFile: false,
  cacheDir: path.resolve(webRoot, "node_modules/.vite-tracking-tests"),
  resolve: { alias: [
    { find: "@", replacement: path.resolve(webRoot, "src") },
    { find: /^next\/link$/, replacement: path.join(harnessRoot, "Link.tsx") },
    { find: /^maplibre-gl$/, replacement: path.join(harnessRoot, "UnavailableMap.ts") },
  ] },
  optimizeDeps: { include: ["react", "react-dom/client"] },
  server: { host: "127.0.0.1", port: 3101, strictPort: true, fs: { allow: [webRoot] } },
});
await server.listen();
console.log("Tracking test harness: http://127.0.0.1:3101");
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { await server.close(); process.exit(0); });
