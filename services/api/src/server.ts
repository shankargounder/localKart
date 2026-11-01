import { app } from "./app.js";
import { createServer } from "node:http";
import { attachRealtime } from "./realtime.js";
import {
  expandNotificationOutbox,
  processPushJob,
  ExpoProvider,
} from "./push-worker.js";
import { db } from "./db.js";
import { config } from "./config.js";
import { transitionOrder } from "./orders.js";
const server = createServer(app);
const realtime = attachRealtime(server);
server.listen(config.PORT, () =>
  console.log(`LocalKart API on port ${config.PORT}`),
);
let working = false;
let dispatching = false;
const provider = new ExpoProvider();
const pushTimer = setInterval(async () => {
  if (config.ENABLE_EXPO_PUSH !== "true" || dispatching) return;
  dispatching = true;
  try {
    await expandNotificationOutbox();
    for (let i = 0; i < 20; i++) if (!(await processPushJob(provider))) break;
  } catch {
    console.error("Push queue processing failed; durable jobs remain queued");
  } finally {
    dispatching = false;
  }
}, 5000);
const timer = setInterval(async () => {
  if (working) return;
  working = true;
  try {
    const expired = await db.order.findMany({
      where: {
        status: {
          in: [
            "PENDING_ACCEPTANCE",
            "ACCEPTED",
            "PREPARING",
            "READY_FOR_PICKUP",
            "AWAITING_RIDER",
            "RIDER_ASSIGNED",
          ],
        },
        expiresAt: { lt: new Date() },
      },
      take: 100,
    });
    for (const order of expired) {
      try {
        await transitionOrder(
          order.id,
          { id: order.customerId, role: "SYSTEM" },
          "EXPIRED",
          { reason: "Fulfillment window expired before handover" },
        );
      } catch (e) {
        console.error("Expiration failed", order.id, e);
      }
    }
  } catch (e) {
    console.error("Expiration worker failed", e);
  } finally {
    working = false;
  }
}, 60000);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(timer);
    clearInterval(pushTimer);
    void realtime.close();
    server.close(() => void db.$disconnect());
  });
