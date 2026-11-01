import React from "react";
import { Text } from "react-native";
export default function BarcodeCamera(_props: {
  onScan: (code: string) => void;
}) {
  return (
    <Text>
      Enter the barcode below, or use a USB/Bluetooth scanner. Camera scanning
      is available in the merchant Android/iOS build.
    </Text>
  );
}
