import EmbeddedPostgres from "embedded-postgres";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
const directory = resolve(".local", `integration-${Date.now()}`);
mkdirSync(directory, { recursive: true });
const password = randomBytes(24).toString("hex");
const probe = createServer();
await new Promise((resolve, reject) => {
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", resolve);
});
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
let started = false;
let failed = false;
let postgresLog = "";
const pg = new EmbeddedPostgres({
  databaseDir: directory,
  user: "localkart",
  password,
  port,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  postgresFlags: ["-h", "127.0.0.1", "-c", "timezone=UTC"],
  onLog: (message) => {
    postgresLog = (postgresLog + message).slice(-4000);
  },
  onError: () => {},
});
const env = {
  ...process.env,
  DATABASE_URL: `postgresql://localkart:${password}@127.0.0.1:${port}/localkart_test`,
};
env.TEST_DATABASE_URL = env.DATABASE_URL;
const run = (args) =>
  new Promise((yes, no) => {
    const child = spawn(process.execPath, args, { env, stdio: "inherit" });
    child.on("error", no);
    child.on("exit", (code) =>
      code === 0
        ? yes()
        : no(new Error("Command failed with exit code " + code)),
    );
  });
try {
  console.log("Starting disposable local PostgreSQL on loopback port " + port);
  await pg.initialise();
  await pg.start();
  started = true;
  await pg.createDatabase("localkart_test");
  await run(["scripts/prisma.mjs", "migrate", "deploy"]);
  await run([
    "node_modules/vitest/vitest.mjs",
    "run",
    "--root",
    "services/api",
  ]);
} catch (e) {
  failed = true;
  console.error(
    e || new Error("Local PostgreSQL failed to start: " + postgresLog),
  );
} finally {
  // The Windows runner can retain child stdio handles after taskkill. Exit explicitly
  // once the database stop has completed instead of waiting on unrelated handles.
  if (started) await pg.stop();
  process.exit(failed ? 1 : 0);
}
