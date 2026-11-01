import React from "react";
import { View, Text, Pressable, Platform } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "@localkart/design-tokens";
const icons: Record<string, [any, any]> = {
  Home: ["home-outline", "home"],
  Explore: ["compass-outline", "compass"],
  Orders: ["receipt-outline", "receipt"],
  Cart: ["bag-outline", "bag"],
  Profile: ["person-outline", "person"],
  Dashboard: ["grid-outline", "grid"],
  Products: ["cube-outline", "cube"],
  Inventory: ["layers-outline", "layers"],
  Shop: ["storefront-outline", "storefront"],
};
export function BottomNavigation({
  tabs,
  selected,
  onSelect,
  cartCount = 0,
  orderCount = 0,
}: any) {
  return (
    <View
      testID="bottom-navigation"
      accessibilityRole="tablist"
      style={{
        backgroundColor: colors.background,
        borderTopWidth: 1,
        borderColor: colors.border,
        paddingTop: 8,
        paddingBottom: Platform.OS === "ios" ? 24 : 10,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          maxWidth: 760,
          width: "100%",
          alignSelf: "center",
        }}
      >
        {tabs.map((tab: string) => {
          const active = selected === tab;
          const count =
            tab === "Cart" ? cartCount : tab === "Orders" ? orderCount : 0;
          return (
            <Pressable
              key={tab}
              accessibilityRole="tab"
              accessibilityLabel={tab}
              accessibilityState={{ selected: active }}
              aria-selected={active}
              onPress={() => onSelect(tab)}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                minHeight: 56,
              }}
            >
              <View
                style={{
                  width: 52,
                  height: 30,
                  borderRadius: 18,
                  backgroundColor: active ? colors.light : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons
                  name={icons[tab]?.[active ? 1 : 0] || "ellipse-outline"}
                  size={23}
                  color={active ? colors.text : colors.muted}
                />
                {count > 0 && (
                  <View
                    style={{
                      position: "absolute",
                      top: -4,
                      right: 0,
                      minWidth: 17,
                      height: 17,
                      paddingHorizontal: 3,
                      borderRadius: 9,
                      backgroundColor: colors.primary,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: "800" }}>
                      {count > 99 ? "99+" : count}
                    </Text>
                  </View>
                )}
              </View>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: active ? "800" : "500",
                  color: active ? colors.text : colors.muted,
                }}
              >
                {tab}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
