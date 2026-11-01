import React, { useState } from "react";
import { View, Text, TextInput } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { colors } from "@localkart/design-tokens";
import { IconButton } from "./IconButton";
export function AddToCartControl({
  variant,
  api,
  unit,
}: {
  variant: any;
  api: any;
  unit: string;
}) {
  const qc = useQueryClient();
  const [quantity, setQuantity] = useState("1");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const unavailable = variant.availability === "OUT_OF_STOCK";
  const add = async () => {
    const milli = Number(quantity) * 1000;
    if (
      !Number.isFinite(milli) ||
      milli <= 0 ||
      Math.abs(milli - Math.round(milli)) > 0.00001
    ) {
      setFailed(true);
      setMessage("Enter a valid quantity.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await api("/cart/items", "POST", {
        variantId: variant.id,
        quantity: Math.round(milli),
      });
      await qc.invalidateQueries({ queryKey: ["cart"] });
      setFailed(false);
      setMessage("Added to cart");
    } catch (e) {
      setFailed(true);
      setMessage((e as Error).message || "Could not add item. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 4 }}>
      <View
        testID={"quantity-cart-" + variant.id}
        style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
      >
        <TextInput
          accessibilityLabel={
            "Quantity for " + variant.label + " in " + unit.toLowerCase()
          }
          placeholder="Qty"
          keyboardType="decimal-pad"
          value={quantity}
          editable={!busy && !unavailable}
          onChangeText={(value) => {
            setQuantity(value);
            setMessage("");
          }}
          style={{
            flex: 1,
            minWidth: 0,
            height: 48,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.background,
            paddingHorizontal: 10,
            color: colors.text,
          }}
        />
        <IconButton
          primary
          icon="🛒"
          label="Add to cart"
          disabled={busy || unavailable}
          onPress={() => void add()}
        />
      </View>
      {message && (
        <Text
          accessibilityRole={failed ? "alert" : undefined}
          accessibilityLiveRegion="polite"
          style={{
            fontSize: 12,
            color: failed ? colors.error : colors.successText,
          }}
        >
          {message}
        </Text>
      )}
    </View>
  );
}
