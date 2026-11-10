import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// These helpers always target a local development database. Hosted SQL is
// applied separately after checking the intended project and migration history.
const root = fileURLToPath(new URL("../", import.meta.url));
const cli = path.join(root, "node_modules", ".bin", "supabase");
const commands = {
  start: ["start"],
  stop: ["stop"],
  migrate: ["migration", "up", "--local"],
  check: ["db", "query", "--local", "--file", "supabase/tests/schema_validation.sql"],
  types: ["gen", "types", "--local", "--lang", "typescript", "--schema", "public,graphql_public"],
};
const action = process.argv[2];
if (!Object.hasOwn(commands, action) || process.argv.length !== 3) {
  console.error("Usage: node scripts/supabase.mjs start|stop|migrate|check|types");
  process.exit(1);
}
const result = spawnSync(cli, commands[action], {
  cwd: root,
  encoding: "utf8",
  stdio: action === "types" ? ["inherit", "pipe", "inherit"] : "inherit",
});
if (result.error) {
  console.error("Supabase CLI could not start. Run npm ci first.");
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);
if (action === "types") {
  if (!result.stdout.includes("export type Database")) {
    console.error("No database types returned; the existing artifact was preserved.");
    process.exit(1);
  }
  const target = path.join(root, "web/src/server/supabase/database.types.ts");
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, result.stdout);
  console.log("Updated web/src/server/supabase/database.types.ts");
}
