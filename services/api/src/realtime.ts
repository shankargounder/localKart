import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { db } from "./db.js";
import { config, browserOrigins } from "./config.js";

export function attachRealtime(server: HttpServer) {
  const io = new Server(server, {
    cors: {
      origin: browserOrigins,
    },
    maxHttpBufferSize: 10000,
  });
  io.use(async (socket, next) => {
    try {
      const payload = jwt.verify(
        z.string().parse(socket.handshake.auth.token),
        config.JWT_SECRET,
        { algorithms: ["HS256"] },
      ) as jwt.JwtPayload;
      const user = await db.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.suspended || !payload.exp) throw new Error();
      socket.data.user = { id: user.id, role: user.role };
      socket.data.exp = payload.exp;
      next();
    } catch {
      next(new Error("Authentication required"));
    }
  });
  io.on("connection", (socket) => {
    const user = socket.data.user as { id: string; role: string };
    void socket.join("user:" + user.id);
    const expiration = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, socket.data.exp * 1000 - Date.now()),
    );
    socket.emit("session.ready", { serverTime: new Date().toISOString() });
    let subscriptionCount = 0;
    let subscriptionWindow = Date.now();
    const allowed = () => {
      if (Date.now() - subscriptionWindow > 60000) {
        subscriptionWindow = Date.now();
        subscriptionCount = 0;
      }
      return ++subscriptionCount <= 60 && socket.rooms.size <= 50;
    };
    socket.on("subscribe.order", async (value, callback) => {
      const ack = typeof callback === "function" ? callback : () => {};
      try {
        if (!allowed()) throw new Error();
        const orderId = z.string().uuid().parse(value);
        const order = await db.order.findUnique({
          where: { id: orderId },
          include: { shop: true },
        });
        const current = await db.user.findUnique({ where: { id: user.id } });
        if (
          !order ||
          !current ||
          current.suspended ||
          !(
            order.customerId === user.id ||
            order.shop.ownerId === user.id ||
            current.role === "ADMIN"
          )
        )
          throw new Error();
        await socket.join("order:" + orderId);
        ack({ ok: true });
      } catch {
        ack({ ok: false, message: "Access denied" });
      }
    });
    socket.on("subscribe.shop", async (value, callback) => {
      const ack = typeof callback === "function" ? callback : () => {};
      try {
        if (!allowed()) throw new Error();
        const shopId = z.string().uuid().parse(value);
        const shop = await db.shop.findFirst({
          where: { id: shopId, ownerId: user.id, owner: { suspended: false } },
        });
        if (!shop) throw new Error();
        await socket.join("shop:" + shopId);
        ack({ ok: true });
      } catch {
        ack({ ok: false, message: "Access denied" });
      }
    });
    socket.on("disconnect", () => clearTimeout(expiration));
  });
  let cursor = 0n;
  let running = false;
  const publish = async () => {
    if (running) return;
    running = true;
    try {
      const events = await db.realtimeEvent.findMany({
        where: { id: { gt: cursor } },
        orderBy: { id: "asc" },
        take: 100,
      });
      for (const event of events) {
        const order = await db.order.findUnique({
          where: { id: event.orderId },
          include: { shop: true },
        });
        if (order) {
          const users = await db.user.findMany({
            where: {
              id: { in: [order.customerId, order.shop.ownerId] },
              suspended: false,
            },
            select: { id: true },
          });
          const message = {
            eventId: event.eventId,
            orderId: event.orderId,
            type: event.type,
            version: event.version,
            serverTime: new Date().toISOString(),
          };
          for (const user of users)
            io.to("user:" + user.id).emit("order.event", message);
          const admins = await db.user.findMany({
            where: { role: "ADMIN", suspended: false },
            select: { id: true },
          });
          for (const admin of admins)
            io.to("user:" + admin.id).emit("order.event", message);
        }
        cursor = event.id;
      }
    } catch {
      console.error(
        "Realtime outbox poll failed; clients retain polling fallback",
      );
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void publish(), 1000);
  return {
    io,
    publish,
    close: async () => {
      clearInterval(timer);
      await io.close();
    },
  };
}
