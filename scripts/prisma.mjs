import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Load local defaults without overriding externally managed deployment secrets.
const path = resolve(root, process.env.LOCALKART_ENV_FILE || ".env");
if (existsSync(path))
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (match && !process.env[match[1]])
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
// Migrations can use a direct/session connection independently of runtime pooling.
if (process.argv.includes("migrate") && process.env.MIGRATION_DATABASE_URL)
  process.env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL;
const result = spawnSync(
  process.execPath,
  [
    resolve(root, "node_modules/prisma/build/index.js"),
    ...process.argv.slice(2),
  ],
  { cwd: resolve(root, "services/api"), stdio: "inherit", env: process.env },
);
process.exit(result.status ?? 1);
