import React from "react";
import { View, Text, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "@localkart/design-tokens";
import { money } from "@localkart/shared";
const panel = {
  backgroundColor: colors.background,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 20,
  overflow: "hidden" as const,
};
export function MerchantDashboardCards({ data, onSelect }: any) {
  const count = (key: string) => (data ? String(data[key] ?? 0) : "—");
  const statuses = [
    {
      key: "pending",
      label: "New orders",
      icon: "notifications-outline",
      color: "#92400E",
      bg: colors.light,
    },
    {
      key: "preparing",
      label: "Preparing",
      icon: "time-outline",
      color: colors.text,
      bg: colors.surface,
    },
    {
      key: "ready",
      label: "Ready for pickup",
      icon: "checkmark-circle-outline",
      color: colors.successText,
      bg: "#F0FDF4",
    },
  ];
  return (
    <View testID="merchant-dashboard-counts" style={{ gap: 16 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View Today's sales"
        onPress={() => onSelect("salesPaise")}
        style={({ pressed }) => ({
          backgroundColor: pressed ? "#334155" : colors.text,
          borderRadius: 20,
          padding: 20,
          gap: 12,
        })}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="wallet-outline" size={18} color={colors.primary} />
            <Text style={{ fontSize: 13, color: "#E2E8F0", fontWeight: "600" }}>
              Today's sales
            </Text>
          </View>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="arrow-forward" size={18} color={colors.text} />
          </View>
        </View>
        <Text
          style={{ fontSize: 32, fontWeight: "800", color: colors.background }}
        >
          {data ? money(data.salesPaise || 0) : "—"}
        </Text>
        <Text style={{ fontSize: 12, color: "#CBD5E1" }}>
          Online orders + in-store sales
        </Text>
      </Pressable>
      <View style={panel}>
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ fontSize: 17, fontWeight: "800", color: colors.text }}>
            Orders
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>Today</Text>
        </View>
        <View
          testID="merchant-order-statuses"
          style={{
            flexDirection: "row",
            paddingHorizontal: 8,
            paddingBottom: 12,
          }}
        >
          {statuses.map((status, index) => (
            <Pressable
              key={status.key}
              accessibilityRole="button"
              accessibilityLabel={"View " + status.label}
              onPress={() => onSelect(status.key)}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 100,
                padding: 8,
                alignItems: "center",
                gap: 8,
                borderRightWidth: index < 2 ? 1 : 0,
                borderRightColor: colors.border,
                borderRadius: 8,
                backgroundColor: pressed ? colors.light : colors.background,
              })}
            >
              <View
                style={{
                  height: 28,
                  width: 28,
                  borderRadius: 9,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: status.bg,
                }}
              >
                <Ionicons
                  name={status.icon as any}
                  size={17}
                  color={status.color}
                />
              </View>
              <Text
                style={{ fontSize: 25, fontWeight: "800", color: status.color }}
              >
                {count(status.key)}
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  textAlign: "center",
                  color: colors.muted,
                }}
              >
                {status.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View
          style={{
            borderTopWidth: 1,
            borderColor: colors.border,
            flexDirection: "row",
          }}
        >
          {[
            { key: "todayOrders", label: "Today's orders" },
            { key: "cancelled", label: "Cancelled" },
          ].map((item, index) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={"View " + item.label}
              onPress={() => onSelect(item.key)}
              style={({ pressed }) => ({
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                minHeight: 52,
                paddingHorizontal: 16,
                borderRightWidth: index === 0 ? 1 : 0,
                borderRightColor: colors.border,
                backgroundColor: pressed ? colors.light : colors.surface,
              })}
            >
              <Text style={{ flex: 1, fontSize: 12, color: colors.muted }}>
                {item.label}
              </Text>
              <Text
                style={{ fontSize: 15, fontWeight: "800", color: colors.text }}
              >
                {count(item.key)}
              </Text>
              <Ionicons name="chevron-forward" size={13} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      </View>
      <View style={panel}>
        {[
          {
            key: "totalProducts",
            label: "Products",
            hint: "Manage your catalogue",
            icon: "cube-outline",
          },
          {
            key: "lowStock",
            label: "Low stock",
            hint: "Review items to restock",
            icon: "layers-outline",
          },
        ].map((item, index) => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={"View " + item.label}
            onPress={() => onSelect(item.key)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              padding: 16,
              minHeight: 72,
              borderTopWidth: index ? 1 : 0,
              borderTopColor: colors.border,
              backgroundColor: pressed ? colors.light : colors.background,
            })}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.light,
              }}
            >
              <Ionicons name={item.icon as any} size={20} color={colors.text} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text
                style={{ fontSize: 14, fontWeight: "700", color: colors.text }}
              >
                {item.label}
              </Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>
                {item.hint}
              </Text>
            </View>
            <Text
              style={{
                fontSize: 22,
                fontWeight: "800",
                color:
                  item.key === "lowStock" && data?.lowStock > 0
                    ? "#92400E"
                    : colors.text,
              }}
            >
              {count(item.key)}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
