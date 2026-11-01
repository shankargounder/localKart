const projectId =
  process.env.EXPO_MERCHANT_PROJECT_ID ||
  "cc359856-a388-4c78-be2b-d96dab4a58be";
import demoConfig from "../../scripts/native-demo-config.cjs";
const { validateDemoBuild } = demoConfig;
validateDemoBuild("merchant", projectId, process.env.GOOGLE_SERVICES_JSON);
export default {
  expo: {
    name: "LocalKart Merchant",
    owner: "shankar33",
    slug: "localkart-merchant",
    scheme: "localkart-merchant",
    version: "0.1.0",
    extra: {
      ...(projectId ? { eas: { projectId } } : {}),
      notificationTestDevice: process.env.LOCALKART_TEST_DEVICE === "true",
    },
    orientation: "portrait",
    userInterfaceStyle: "light",
    android: {
      package: "in.localkart.merchant",
      ...(process.env.GOOGLE_SERVICES_JSON
        ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
        : {}),
    },
    ios: { bundleIdentifier: "in.localkart.merchant", supportsTablet: true },
    plugins: [
      "expo-router",
      "expo-secure-store",
      [
        "expo-build-properties",
        {
          android: {
            usesCleartextTraffic: process.env.LOCALKART_ALLOW_HTTP === "true",
          },
        },
      ],
      [
        "expo-camera",
        {
          cameraPermission:
            "Scan retail product barcodes to fill product details.",
          recordAudioAndroid: false,
          microphonePermission: false,
          barcodeScannerEnabled: true,
        },
      ],
      ["expo-notifications", { color: "#FFC400", defaultChannel: "orders" }],
      [
        "expo-image-picker",
        {
          photosPermission:
            "Choose a product photograph you have permission to use.",
          cameraPermission: false,
          microphonePermission: false,
        },
      ],
    ],
  },
};
