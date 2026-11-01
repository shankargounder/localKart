// Local-only, non-destructive encoding upgrade. Original database is retained.
import pg from "pg";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
pg.types.setTypeParser(1114, (value) => value); // Preserve timestamp-without-zone fields exactly.
const envText = readFileSync(".env", "utf8");
const sourceUrl = envText
  .split(/\r?\n/)
  .find((l) => l.startsWith("DATABASE_URL="))
  ?.slice(13);
if (!sourceUrl) throw new Error("DATABASE_URL is required");
const sourceAddress = new URL(sourceUrl);
if (!["localhost", "127.0.0.1"].includes(sourceAddress.hostname))
  throw new Error("This helper is restricted to the local demo database");
const source = new pg.Client({ connectionString: sourceUrl });
await source.connect();
try {
  const encoding = (await source.query("SHOW server_encoding")).rows[0]
    .server_encoding;
  if (encoding === "UTF8") {
    console.log("Local database already uses UTF-8; no copy needed.");
    process.exitCode = 0;
  } else {
    await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const names = (
      await source.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations' ORDER BY tablename",
      )
    ).rows.map((r) => r.tablename);
    const records = {};
    for (const name of names)
      records[name] = (
        await source.query('SELECT * FROM "' + name.replaceAll('"', '""') + '"')
      ).rows;
    await source.query("COMMIT");
    mkdirSync(".local/backups", { recursive: true });
    const stamp = Date.now();
    writeFileSync(
      `.local/backups/before-live-${stamp}.json`,
      JSON.stringify({ encoding, tables: records }, null, 2),
    );
    writeFileSync(`.local/backups/before-live-${stamp}.env`, envText);
    const targetName = "localkart_utf8_" + stamp;
    await source.query(
      `CREATE DATABASE "${targetName}" WITH TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
    );
    await source.query(`ALTER DATABASE "${targetName}" SET timezone='UTC'`);
    const targetUrl = new URL(sourceUrl);
    targetUrl.pathname = "/" + targetName;
    const migrated = spawnSync(
      process.execPath,
      ["scripts/prisma.mjs", "migrate", "deploy"],
      {
        env: { ...process.env, DATABASE_URL: targetUrl.toString() },
        stdio: "inherit",
      },
    );
    if (migrated.status !== 0)
      throw new Error(
        "UTF-8 target migration failed; original database remains untouched",
      );
    const target = new pg.Client({ connectionString: targetUrl.toString() });
    await target.connect();
    try {
      const order = [
        "User",
        "Category",
        "Shop",
        "ShopHour",
        "Product",
        "ProductImage",
        "Variant",
        "Inventory",
        "CartItem",
        "Session",
        "PasswordReset",
        "Order",
        "OrderItem",
        "OrderHistory",
        "InventoryMovement",
        "Reservation",
        "Payment",
        "PaymentEvent",
        "Notification",
        "DeviceToken",
        "AuditLog",
        "Address",
        "DeliveryQuote",
        "Delivery",
        "DeliveryEvent",
        "OfflineSale",
        "OfflineSaleItem",
        "CommissionRule",
        "Refund",
        "Favorite",
        "WishlistItem",
        "ShoppingList",
        "Review",
        "SupportTicket",
        "NotificationPreference",
        "NotificationOutbox",
        "NotificationDelivery",
        "NotificationDeliveryAttempt",
        "RealtimeEvent",
      ];
      if (names.some((name) => !order.includes(name)))
        throw new Error(
          "Source contains an unknown table; copy order must be reviewed",
        );
      await target.query("BEGIN");
      for (const name of order) {
        const rows = records[name];
        if (!rows?.length) continue;
        const columns = (
          await source.query(
            "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND is_generated='NEVER' ORDER BY ordinal_position",
            [name],
          )
        ).rows.map((r) => r.column_name);
        if (name === "DeviceToken") {
          for (const row of rows) {
            row.deviceId ||= row.id;
            row.updatedAt ||= new Date().toISOString();
          }
          if (!columns.includes("deviceId")) columns.push("deviceId");
          if (!columns.includes("updatedAt")) columns.push("updatedAt");
        }
        const escaped = columns
          .map((c) => '"' + c.replaceAll('"', '""') + '"')
          .join(",");
        await target.query(
          `INSERT INTO "${name}" (${escaped}) SELECT ${escaped} FROM json_populate_recordset(NULL::"${name}",$1::json)`,
          [JSON.stringify(rows)],
        );
      }
      await target.query(
        `INSERT INTO "NotificationPreference" ("userId","orderUpdates","lowStock","soundEnabled","updatedAt") SELECT id,coalesce(("notificationPreferences"->>'orderUpdates')::boolean,true),coalesce(("notificationPreferences"->>'lowStock')::boolean,true),true,CURRENT_TIMESTAMP FROM "User" ON CONFLICT DO NOTHING`,
      );
      for (const name of names) {
        const count = Number(
          (await target.query(`SELECT count(*) FROM "${name}"`)).rows[0].count,
        );
        if (name !== "NotificationPreference" && count !== records[name].length)
          throw new Error("Count verification failed for " + name);
      }
      for (const name of ["User", "Inventory", "Order"]) {
        const current = await target.query(`SELECT * FROM "${name}"`);
        const identity = name === "Inventory" ? "variantId" : "id";
        const indexed = new Map(
          current.rows.map((row) => [row[identity], row]),
        );
        for (const old of records[name] || []) {
          const row = indexed.get(old[identity]);
          for (const [key, value] of Object.entries(old))
            if (JSON.stringify(row?.[key]) !== JSON.stringify(value))
              throw new Error("Existing " + name + " field changed: " + key);
        }
      }
      if (records.RealtimeEvent?.length)
        await target.query(
          `SELECT setval(pg_get_serial_sequence('"RealtimeEvent"','id'),coalesce((SELECT max(id) FROM "RealtimeEvent"),1),true)`,
        );
      await target.query("COMMIT");
      writeFileSync(
        ".env",
        envText.replace(
          /^DATABASE_URL=.*$/m,
          "DATABASE_URL=" + targetUrl.toString(),
        ),
      );
      writeFileSync(
        ".local/backups/live-encoding-verification.json",
        JSON.stringify(
          {
            sourceEncoding: encoding,
            targetEncoding: "UTF8",
            originalRetained: true,
            targetDatabase: targetName,
            counts: Object.fromEntries(
              Object.entries(records).map(([k, v]) => [k, v.length]),
            ),
          },
          null,
          2,
        ),
      );
      console.log(
        "Verified UTF-8 copy complete. All prior counts and original user/inventory/order fields preserved. Original database retained. Local .env now points to " +
          targetName,
      );
    } catch (error) {
      await target.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      await target.end();
    }
  }
} finally {
  await source.end();
}
