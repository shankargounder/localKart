import { normalizeBarcode } from "@localkart/shared";
import React, { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import BarcodeCamera from "./BarcodeCamera";
import { colors } from "@localkart/design-tokens";
import { IconButton } from "./IconButton";
export function BarcodeLookup({ api, shopId, onResult }: any) {
  const [value, setValue] = useState("");
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const lookup = async (code = value) => {
    if (busy) return;
    let canonical: string;
    try {
      canonical = normalizeBarcode(code);
    } catch (e) {
      setMessage((e as Error).message);
      onResult({ pending: true });
      return;
    }
    onResult({ pending: true });
    setBusy(true);
    setMessage("");
    setCamera(false);
    setValue(code);
    try {
      const result = await api(
        "/merchant/shops/" + shopId + "/barcodes/" + encodeURIComponent(code),
      );
      if (result.existing) {
        onResult(result);
        setMessage(
          "Already in your shop: " +
            result.product.name +
            ". Edit the existing product or its stock.",
        );
        return;
      }
      onResult(result);
      setMessage(
        result.product
          ? "Suggested details loaded. Check the product, price and stock before saving. " +
              result.product.license
          : result.message,
      );
    } catch (e) {
      onResult({ barcode: canonical, found: false });
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View
      style={{
        gap: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 14,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ fontWeight: "700" }}>Scan or enter a barcode</Text>
        <IconButton
          icon={camera ? "×" : "scan"}
          label={camera ? "Close barcode camera" : "Scan product barcode"}
          disabled={busy}
          onPress={() => setCamera(!camera)}
        />
      </View>
      {camera && <BarcodeCamera onScan={(code: string) => void lookup(code)} />}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <TextInput
          accessibilityLabel="Product barcode"
          placeholder="EAN / UPC barcode"
          value={value}
          editable={!busy}
          onChangeText={(value) => {
            setValue(value);
            setMessage("");
            onResult(value ? { pending: true } : null);
          }}
          keyboardType="number-pad"
          onSubmitEditing={() => void lookup()}
          style={{
            flex: 1,
            minWidth: 0,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            height: 48,
            paddingHorizontal: 10,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Look up barcode"
          disabled={busy || !value.trim()}
          onPress={() => void lookup()}
          style={{
            minHeight: 48,
            padding: 12,
            borderRadius: 12,
            backgroundColor: colors.light,
            justifyContent: "center",
            opacity: busy ? 0.5 : 1,
          }}
        >
          <Text style={{ fontWeight: "700" }}>
            {busy ? "Looking…" : "Look up"}
          </Text>
        </Pressable>
      </View>
      {!!message && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}
        >
          {message}
        </Text>
      )}
      <Text style={{ fontSize: 11, color: colors.muted }}>
        A barcode identifies a product; your selling price and stock must be
        entered separately.
      </Text>
    </View>
  );
}
