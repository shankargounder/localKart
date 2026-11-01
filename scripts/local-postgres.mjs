import EmbeddedPostgres from "embedded-postgres";
import { resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
const envPath = resolve(".env");
const databaseUrl =
  process.env.DATABASE_URL ||
  (existsSync(envPath)
    ? readFileSync(envPath, "utf8")
        .split(/\r?\n/)
        .find((l) => l.startsWith("DATABASE_URL="))
        ?.slice(13)
    : "");
if (!databaseUrl) throw new Error("Copy .env.example to .env first");
const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(url.hostname))
  throw new Error("db:local only supports loopback database URLs");
const directory = resolve(".local/postgres");
mkdirSync(directory, { recursive: true });
const pg = new EmbeddedPostgres({
  databaseDir: directory,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  port: Number(url.port) || 5432,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  postgresFlags: ["-h", "127.0.0.1", "-c", "timezone=UTC"],
  onLog: console.log,
  onError: console.error,
});
if (!existsSync(resolve(directory, "PG_VERSION"))) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase(url.pathname.slice(1));
} catch (e) {
  if (!String(e).includes("already exists")) throw e;
}
console.log(
  "Local PostgreSQL is ready. Keep this terminal open. Stop with Ctrl+C.",
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await pg.stop();
    process.exit(0);
  });
setInterval(() => {}, 60000);
