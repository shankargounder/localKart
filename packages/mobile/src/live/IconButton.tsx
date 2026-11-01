import React from "react";
import { Pressable, Text } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "@localkart/design-tokens";
export function IconButton({
  icon,
  label,
  onPress,
  active = false,
  primary = false,
  disabled = false,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  active?: boolean;
  primary?: boolean;
  disabled?: boolean;
}) {
  const names: Record<string, any> = {
    scan: "barcode-outline",
    "‹": "chevron-back",
    "♥": "heart",
    "♡": "heart-outline",
    "↗": "navigate-outline",
    "↥": "share-outline",
    "ⓘ": "information-outline",
    "×": "close",
    "🛒": "cart-outline",
    "+": "add",
    "−": "remove",
    "⌫": "trash-outline",
    "✎": "create-outline",
    "▣": "archive-outline",
    "↶": "refresh-outline",
    "↑": "cloud-upload-outline",
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: primary
          ? colors.primary
          : active
            ? colors.light
            : colors.background,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.border,
        opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
      })}
    >
      {names[icon] ? (
        <Ionicons name={names[icon]} size={23} color={colors.text} />
      ) : (
        <Text style={{ fontSize: 25, color: colors.text }}>{icon}</Text>
      )}
    </Pressable>
  );
}
