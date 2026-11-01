import React, { useEffect, useRef, useState } from "react";
import {
  Text,
  View,
  Modal,
  Pressable,
  ScrollView,
  Animated,
  useWindowDimensions,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { colors } from "@localkart/design-tokens";
import { AppButton, Section, QueryState, styles } from "../v2/Components";
export function NotificationCenter({
  live,
  api,
  mutate,
  customer = false,
}: any) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const prefs = live.preferences.data;
  const qc = useQueryClient();
  const [readBusy, setReadBusy] = useState(false);
  const [readError, setReadError] = useState("");
  const markRead = async (path: string) => {
    if (readBusy) return;
    setReadBusy(true);
    setReadError("");
    try {
      await api(path, "PATCH");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["notifications"] }),
        qc.invalidateQueries({ queryKey: ["notification-counts"] }),
      ]);
    } catch {
      setReadError(
        "Could not mark notifications as read. Check your connection and try again.",
      );
    } finally {
      setReadBusy(false);
    }
  };
  return (
    <Section
      title={
        customer
          ? undefined
          : "Notifications · " + (live.counts.data?.unread || 0) + " unread"
      }
    >
      <AppButton
        secondary
        title={readBusy ? "Marking as read…" : "Mark all as read"}
        disabled={readBusy || !live.counts.data?.unread}
        onPress={() => void markRead("/notifications/read-all")}
      />
      {readError && (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.error, paddingVertical: 8 }}
        >
          {readError}
        </Text>
      )}
      <AppButton
        secondary
        title={
          settingsOpen ? "Hide notification settings" : "Notification settings"
        }
        onPress={() => setSettingsOpen(!settingsOpen)}
      />
      {settingsOpen && (
        <View>
          <AppButton
            title="Enable device push notifications"
            onPress={() => mutate(live.registerPush)}
          />
          <Text style={styles.muted}>{live.pushStatus}</Text>
          {prefs && (
            <View>
              {(customer
                ? ["orderUpdates", "soundEnabled"]
                : ["orderUpdates", "lowStock", "soundEnabled"]
              ).map((key) => (
                <AppButton
                  secondary
                  key={key}
                  title={
                    (prefs[key] ? "☑ " : "☐ ") +
                    {
                      orderUpdates: "Order push updates",
                      lowStock: "Low-stock push alerts",
                      soundEnabled: "Notification sound",
                    }[key]
                  }
                  onPress={() =>
                    mutate(() =>
                      api("/notifications/preferences", "PATCH", {
                        ...prefs,
                        [key]: !prefs[key],
                      }),
                    )
                  }
                />
              ))}
            </View>
          )}
        </View>
      )}
      <QueryState
        query={live.notifications}
        empty="You have no notifications yet."
      />
      {live.notifications.data?.map((n: any) => (
        <Pressable
          key={n.id}
          accessibilityRole={n.orderId ? "link" : "button"}
          accessibilityLabel={n.title}
          accessibilityHint={
            n.orderId ? "Open the related order" : "Mark notification as read"
          }
          onPress={() =>
            n.orderId
              ? void live.openNotification(n)
              : void markRead("/notifications/" + n.id + "/read")
          }
          style={({ pressed }) => ({
            padding: 16,
            borderBottomWidth: 1,
            borderColor: colors.border,
            backgroundColor: pressed
              ? colors.light
              : n.read
                ? colors.background
                : colors.surface,
            borderRadius: 12,
            gap: 8,
          })}
        >
          <Text
            style={{
              fontSize: 16,
              fontWeight: n.read ? "600" : "800",
              color: colors.text,
            }}
          >
            {n.read ? "" : "● "}
            {n.title}
          </Text>
          <Text style={{ color: colors.text, lineHeight: 21 }}>{n.body}</Text>
          <Text style={styles.muted}>
            {new Date(n.createdAt).toLocaleString()}
          </Text>
        </Pressable>
      ))}
    </Section>
  );
}
export function IncomingBanner({ live }: any) {
  return live.banner ? (
    <Section>
      <Pressable
        accessibilityRole={live.banner.orderId ? "link" : "text"}
        accessibilityLabel={live.banner.title}
        disabled={!live.banner.orderId}
        onPress={() => void live.openNotification(live.banner)}
        style={{ gap: 8 }}
      >
        <Text style={styles.heading}>{live.banner.title}</Text>
        <Text>{live.banner.body}</Text>
      </Pressable>
      <AppButton secondary title="Dismiss" onPress={live.dismiss} />
    </Section>
  ) : null;
}

export function NotificationDrawer({
  merchant = false,
  visible,
  onClose,
  live,
  api,
  mutate,
}: any) {
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(420, Math.max(280, width - 24));
  const slide = useRef(new Animated.Value(drawerWidth)).current;
  useEffect(() => {
    if (visible) {
      slide.setValue(drawerWidth);
      Animated.timing(slide, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, drawerWidth]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          justifyContent: "flex-end",
          backgroundColor: "#10182866",
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close notification backdrop"
          onPress={onClose}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel="Notification drawer"
          style={{
            width: drawerWidth,
            backgroundColor: colors.surface,
            transform: [{ translateX: slide }],
            borderLeftWidth: 1,
            borderColor: colors.border,
            paddingTop: 32,
            flex: 1,
            maxWidth: drawerWidth,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 20,
              backgroundColor: "white",
              borderBottomWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View>
              <Text
                style={{ fontSize: 22, fontWeight: "800", color: colors.text }}
              >
                Notifications
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>
                {live.connection} · {live.counts.data?.unread || 0} unread
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close notifications"
              onPress={onClose}
              style={{
                padding: 12,
                borderRadius: 24,
                backgroundColor: colors.light,
              }}
            >
              <Text style={{ fontSize: 20, color: colors.text }}>×</Text>
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          >
            <NotificationCenter
              customer={!merchant}
              live={live}
              api={api}
              mutate={mutate}
            />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
