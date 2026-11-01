import { useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import * as Crypto from "expo-crypto";
import Constants from "expo-constants";
import { io } from "socket.io-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clockOffset } from "@localkart/shared";
import { persisted } from "./persistence";

export function useLiveOrders({ session, api, base, onOpen }: any) {
  const qc = useQueryClient();
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  const seen = useRef(new Set<string>());
  const connectedAt = useRef(Date.now());
  const [banner, setBanner] = useState<any>(null);
  const [offset, setOffset] = useState(0);
  const [connection, setConnection] = useState("Polling");
  const [browserPushEnabled, setBrowserPushEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    if (Platform.OS === "web")
      void persisted.get("browser.push." + session.user.id).then((value) => {
        if (active) setBrowserPushEnabled(value === "true");
      });
    return () => {
      active = false;
    };
  }, [session.user.id]);
  const [pushStatus, setPushStatus] = useState(
    "Push is not enabled on this device.",
  );
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api("/notifications"),
    refetchInterval: 5000,
  });
  const counts = useQuery({
    queryKey: ["notification-counts"],
    queryFn: () => api("/notifications/unread-count"),
    refetchInterval: 5000,
  });
  const preferences = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => api("/notifications/preferences"),
  });
  const prefRef = useRef<any>(null);
  prefRef.current = preferences.data;
  const remember = (eventId: string) => {
    if (seen.current.has(eventId)) return false;
    seen.current.add(eventId);
    if (seen.current.size > 500)
      seen.current.delete(seen.current.values().next().value!);
    return true;
  };
  const resync = async () => {
    for (const key of [
      "orders",
      "notifications",
      "notification-counts",
      "dashboard",
      "inventory",
      "merchant-reports",
      "order-detail",
    ])
      void qc.invalidateQueries({ queryKey: [key] });
    try {
      const start = Date.now();
      const result = await api("/time");
      const value = clockOffset(result.serverTime, start, Date.now());
      setOffset(value);
      await persisted.set("localkart.clockOffset", String(value));
    } catch {
      /* Keep the last server offset and polling state. */
    }
  };
  const openNotification = async (n: any) => {
    if (n.id)
      try {
        await api("/notifications/" + n.id + "/read", "PATCH");
      } catch {
        /* Opening still rechecks order ownership on the server. */
      }
    setBanner(null);
    void qc.invalidateQueries({ queryKey: ["notifications"] });
    void qc.invalidateQueries({ queryKey: ["notification-counts"] });
    if (n.orderId) openRef.current(n.orderId);
  };
  const registerPush = async () => {
    if (Platform.OS === "web") {
      if (!("Notification" in globalThis)) {
        setPushStatus(
          "This browser does not support desktop notifications. Live in-app notifications remain available.",
        );
        return;
      }
      const permission = await globalThis.Notification.requestPermission();
      const enabled = permission === "granted";
      setBrowserPushEnabled(enabled);
      await persisted.set("browser.push." + session.user.id, String(enabled));
      setPushStatus(
        enabled
          ? "Browser notifications enabled while LocalKart is open. Closed-app push requires a configured Android/iOS build."
          : "Browser notification permission was not granted. Live in-app notifications remain available.",
      );
      return;
    }
    const projectId =
      Constants.easConfig?.projectId ||
      Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId || !Device.isDevice) {
      setPushStatus(
        "Link this app to an EAS project and use a physical device before enabling push.",
      );
      return;
    }
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("orders", {
        name: "Order updates",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
      });
      await Notifications.setNotificationChannelAsync("orders-silent", {
        name: "Silent order updates",
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: null,
      });
    }
    const existing = await Notifications.getPermissionsAsync();
    const permission =
      existing.status === "granted"
        ? existing
        : await Notifications.requestPermissionsAsync();
    if (permission.status !== "granted") {
      setPushStatus(
        "Push permission denied. Live orders and polling remain available.",
      );
      await disablePush();
      return;
    }
    let deviceId = await persisted.get("localkart.deviceId");
    if (!deviceId) {
      deviceId = Crypto.randomUUID();
      await persisted.set("localkart.deviceId", deviceId);
    }
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    await api("/devices/push-token", "POST", {
      deviceId,
      token: result.data,
      projectId,
      platform: Platform.OS,
      isTestDevice:
        Constants.expoConfig?.extra?.notificationTestDevice === true,
    });
    setPushStatus(
      "Device registered. Provider acceptance and OS delivery still depend on your build credentials and device settings.",
    );
  };
  const disablePush = async () => {
    if (Platform.OS === "web") {
      setBrowserPushEnabled(false);
      await persisted.set("browser.push." + session.user.id, "false");
      setPushStatus("Browser notifications disabled.");
      return;
    }
    const deviceId = await persisted.get("localkart.deviceId");
    if (deviceId) await api("/devices/push-token", "DELETE", { deviceId });
    setPushStatus("Device push registration disabled.");
  };
  useEffect(() => {
    void persisted.get("localkart.clockOffset").then((value) => {
      if (value) setOffset(Number(value) || 0);
    });
    void resync();
    const socket = io(base.replace(/\/api\/v1\/?$/, ""), {
      auth: { token: session.accessToken },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
    socket.on("connect", () => {
      setConnection("Live");
      void resync();
    });
    socket.on("disconnect", () => setConnection("Polling fallback"));
    socket.on("connect_error", () => setConnection("Polling fallback"));
    socket.on("order.event", (event: any) => {
      if (typeof event?.eventId === "string" && remember(event.eventId))
        void resync();
    });
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        socket.connect();
        void resync();
      }
    });
    return () => {
      socket.disconnect();
      app.remove();
    };
  }, [session.accessToken, session.user.id]);
  useEffect(() => {
    const fresh = (notifications.data || []).filter(
      (n: any) =>
        !n.read &&
        Date.parse(n.createdAt) >= connectedAt.current &&
        n.eventId &&
        !seen.current.has(n.eventId),
    );
    for (const n of fresh) {
      if (!remember(n.eventId)) continue;
      if (
        Platform.OS === "web" &&
        browserPushEnabled &&
        "Notification" in globalThis &&
        globalThis.Notification.permission === "granted" &&
        document.hidden &&
        prefRef.current?.orderUpdates !== false
      ) {
        try {
          const shown = new globalThis.Notification(n.title, {
            body: n.body,
            tag: n.eventId,
            silent: prefRef.current?.soundEnabled === false,
          });
          shown.onclick = () => {
            window.focus();
            void openNotification(n);
            shown.close();
          };
        } catch {
          setPushStatus(
            "This browser requires native push support. Live in-app notifications remain available.",
          );
        }
      }
    }
    if (fresh.length) setBanner(fresh[0]);
  }, [notifications.data, browserPushEnabled]);
  useEffect(() => {
    if (Platform.OS === "web") return;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: true,
        shouldPlaySound: prefRef.current?.soundEnabled !== false,
        shouldSetBadge: false,
      }),
    });
    const receive = Notifications.addNotificationReceivedListener(
      (notification) => {
        const data = notification.request.content.data;
        void resync();
        if (typeof data.eventId === "string" && remember(data.eventId))
          setBanner({
            id: data.notificationId,
            eventId: data.eventId,
            orderId: data.orderId,
            title: notification.request.content.title,
            body: notification.request.content.body,
          });
      },
    );
    const respond = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data;
      if (typeof data.orderId === "string")
        void openNotification({
          id: data.notificationId,
          orderId: data.orderId,
        });
    };
    const response =
      Notifications.addNotificationResponseReceivedListener(respond);
    void Notifications.getLastNotificationResponseAsync().then((value) => {
      if (value) respond(value);
    });
    const token = Notifications.addPushTokenListener(() => {
      void registerPush().catch(() =>
        setPushStatus(
          "Token refresh failed; in-app order updates remain active.",
        ),
      );
    });
    void Notifications.getPermissionsAsync()
      .then((p) => {
        if (p.status === "granted") return registerPush();
      })
      .catch(() =>
        setPushStatus(
          "Push registration is not configured; live order polling remains active.",
        ),
      );
    return () => {
      receive.remove();
      response.remove();
      token.remove();
    };
  }, [session.user.id]);
  return {
    notifications,
    counts,
    preferences,
    banner,
    offset,
    connection,
    pushStatus,
    registerPush,
    disablePush,
    openNotification,
    dismiss: () => setBanner(null),
    resync,
  };
}
