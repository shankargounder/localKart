import React, { useRef, useState, useEffect } from "react";
import { View, Text, AppState } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { AppButton } from "../v2/Components";
export default function BarcodeCamera({ onScan }: any) {
  const [permission, request] = useCameraPermissions();
  const scanned = useRef(false);
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => sub.remove();
  }, []);
  if (!permission) return <Text>Checking camera permission…</Text>;
  if (!permission.granted)
    return (
      <View>
        <Text>Camera access is needed to scan. Manual entry also works.</Text>
        <AppButton title="Allow camera" onPress={() => void request()} />
      </View>
    );
  return active ? (
    <CameraView
      style={{ height: 230, borderRadius: 16 }}
      facing="back"
      barcodeScannerSettings={{
        barcodeTypes: ["ean13", "ean8", "upc_a", "itf14"],
      }}
      onBarcodeScanned={(result) => {
        if (scanned.current) return;
        scanned.current = true;
        onScan(result.data);
      }}
    />
  ) : (
    <Text>Return to the app to resume scanning.</Text>
  );
}
